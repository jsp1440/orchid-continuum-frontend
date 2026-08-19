/**
 * ATLAS-NEXT — "What is not known here?"
 *
 * The Continuum's most defensible claim is not about orchids. It is about the
 * archive: which places have been visited, and which of those visits left
 * anything behind beyond a coordinate.
 *
 * The single rule this module exists to enforce:
 *
 *     MISSING FROM THE ARCHIVE IS NOT ABSENT FROM THE WORLD.
 *
 * Every state below describes a RECORD, never an orchid. "No fungal partner
 * linked" is a fact about the literature the Continuum has ingested. It is not
 * a claim that the orchid has no fungal partner — every orchid has one; that is
 * how orchids work. The copy in the interface has to carry that distinction,
 * and the type names here are chosen so it is awkward to write it any other way.
 */

import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';
import { recencyOf, type Recency } from './time';
import { resolveLocation, sensitivityResolution, type SensitivityResolution } from './sensitivity';
import type { AtlasAccessLevel } from './types';

/** How much is attached to one record, dimension by dimension. */
export interface RecordEvidence {
  /** A study names a partner for this exact species. */
  fungalPartnerLinked: boolean;
  /** A pollinator is named for this species. */
  pollinatorLinked: boolean;
  habitatRecorded: boolean;
  elevationRecorded: boolean;
  yearRecorded: boolean;
  recency: Recency;
  /** Source dataset AND a record id in it, so the record can be traced back. */
  provenanceComplete: boolean;
  /** Marked verified by the source dataset. */
  verified: boolean;
  /** The coordinate is as precise as it looks. */
  coordinatePrecise: boolean;
  /** Whether a conservation assessment could be reached at all. */
  assessment: SensitivityResolution;
}

export function recordEvidence(
  p: AtlasOccurrencePoint,
  access: AtlasAccessLevel = 'public',
): RecordEvidence {
  const loc = resolveLocation(p, access);
  return {
    fungalPartnerLinked: !!p.mycorrhizal?.taxon,
    pollinatorLinked: p.pollinators.some((x) => x.taxon || x.name),
    habitatRecorded: !!p.habitat?.trim(),
    elevationRecorded: typeof p.elevation_m === 'number',
    yearRecorded: typeof p.year === 'number',
    recency: recencyOf(p.year),
    provenanceComplete: !!p.dataset && !!p.sourceRecordId,
    verified: !!p.verified,
    coordinatePrecise: !loc.policy.generalised,
    assessment: sensitivityResolution(p),
  };
}

/**
 * The five ecological dimensions the gap view scores.
 *
 * Deliberately NOT a score out of ten. A single number would let a viewer read
 * "0.7 known" as if knowledge were a quantity, and would let two very different
 * gaps — no fungal evidence versus no elevation — cancel each other out.
 */
const ECOLOGICAL_DIMENSIONS = [
  'fungalPartnerLinked',
  'pollinatorLinked',
  'habitatRecorded',
  'elevationRecorded',
] as const;

export type CompletenessTier =
  /** Occurrence coordinates and essentially nothing else. */
  | 'occurrence-only'
  /** Some environmental context, but no documented biological relationship. */
  | 'context-no-relationship'
  /** At least one documented biological relationship reaches this record. */
  | 'relationship-documented';

export interface GapProfile {
  tier: CompletenessTier;
  /** Counts across the records summarised, never a ratio presented as a score. */
  records: number;
  withFungalPartner: number;
  withPollinator: number;
  withHabitat: number;
  withElevation: number;
  withYear: number;
  historicalOnly: boolean;
  /** Most recent collection year among these records, when any is dated. */
  mostRecentYear: number | null;
  undated: number;
  weakProvenance: number;
  imprecise: number;
  unassessed: number;
  species: number;
}

export function tierOf(e: RecordEvidence): CompletenessTier {
  if (e.fungalPartnerLinked || e.pollinatorLinked) return 'relationship-documented';
  if (e.habitatRecorded || e.elevationRecorded) return 'context-no-relationship';
  return 'occurrence-only';
}

export function profileOf(
  points: AtlasOccurrencePoint[],
  access: AtlasAccessLevel = 'public',
): GapProfile {
  const species = new Set<string>();
  let withFungalPartner = 0;
  let withPollinator = 0;
  let withHabitat = 0;
  let withElevation = 0;
  let withYear = 0;
  let undated = 0;
  let weakProvenance = 0;
  let imprecise = 0;
  let unassessed = 0;
  let recent = 0;
  let mostRecentYear: number | null = null;

  for (const p of points) {
    const e = recordEvidence(p, access);
    if (p.canonicalName) species.add(p.canonicalName);
    if (e.fungalPartnerLinked) withFungalPartner += 1;
    if (e.pollinatorLinked) withPollinator += 1;
    if (e.habitatRecorded) withHabitat += 1;
    if (e.elevationRecorded) withElevation += 1;
    if (e.yearRecorded) withYear += 1;
    else undated += 1;
    if (!e.provenanceComplete) weakProvenance += 1;
    if (!e.coordinatePrecise) imprecise += 1;
    if (e.assessment === 'unresolved') unassessed += 1;
    if (e.recency === 'recent') recent += 1;
    if (typeof p.year === 'number' && (mostRecentYear === null || p.year > mostRecentYear)) {
      mostRecentYear = p.year;
    }
  }

  const tier: CompletenessTier =
    withFungalPartner + withPollinator > 0
      ? 'relationship-documented'
      : withHabitat + withElevation > 0
        ? 'context-no-relationship'
        : 'occurrence-only';

  return {
    tier,
    records: points.length,
    withFungalPartner,
    withPollinator,
    withHabitat,
    withElevation,
    withYear,
    // "Historical only" requires that something IS dated. A pile of undated
    // records is not old; it is undated, and those are different claims.
    historicalOnly: withYear > 0 && recent === 0,
    mostRecentYear,
    undated,
    weakProvenance,
    imprecise,
    unassessed,
    species: species.size,
  };
}

// ---------------------------------------------------------------------------
// Public language
// ---------------------------------------------------------------------------
//
// Each tier gets a two-part label: what IS known, then what is NOT — in that
// order, so the sentence can never be read as an absence claim on its own.

export interface TierCopy {
  tier: CompletenessTier;
  known: string;
  missing: string;
  /** One line the interface can show under the legend. */
  caution: string;
  tone: string;
}

export const TIER_COPY: Record<CompletenessTier, TierCopy> = {
  'relationship-documented': {
    tier: 'relationship-documented',
    known: 'Observed here, with a documented relationship',
    missing: 'A published study links a pollinator or a fungal partner to this species',
    caution: 'The relationship is documented for the species, not measured at this exact site.',
    tone: '#8fd0a8',
  },
  'context-no-relationship': {
    tier: 'context-no-relationship',
    known: 'Observed here, with habitat or elevation recorded',
    missing: 'No pollinator and no fungal partner linked in the Continuum',
    caution:
      'Every orchid depends on a fungus. Nothing is linked here yet — that is a gap in the literature we hold, not a gap in the orchid.',
    tone: '#d8b24c',
  },
  'occurrence-only': {
    tier: 'occurrence-only',
    known: 'Observed here',
    missing: 'Coordinates and a name, and little else',
    caution:
      'Somebody recorded an orchid at this place. What it depends on, and what it grows in, is not recorded here.',
    tone: '#9ba6c9',
  },
};

/**
 * Sentences describing a set of records. Each one is a statement about the
 * ARCHIVE. None of them may be phrased as a statement about the orchids.
 */
export function gapSentences(g: GapProfile): string[] {
  if (g.records === 0) return [];
  const out: string[] = [];
  const n = (x: number) => x.toLocaleString();

  if (g.withFungalPartner === 0) {
    out.push(
      `No fungal partner is linked for any of these ${n(g.records)} records. Every orchid has one; nobody has published one into the Continuum for these.`,
    );
  } else {
    out.push(`${n(g.withFungalPartner)} of ${n(g.records)} records reach a documented fungal partner.`);
  }

  if (g.withPollinator === 0) {
    out.push('No pollinator is named for any of these records.');
  } else {
    out.push(`${n(g.withPollinator)} of ${n(g.records)} records name a pollinator.`);
  }

  if (g.withHabitat === 0) out.push('Habitat was not recorded for any of them.');
  if (g.withElevation === 0) out.push('Elevation was not recorded for any of them.');

  if (g.undated === g.records) {
    out.push('None of these records carries a collection year.');
  } else if (g.historicalOnly && g.mostRecentYear !== null) {
    out.push(
      `The most recent collection here was ${g.mostRecentYear}. Nobody has recorded since — which measures collecting effort, not whether the orchid is still there.`,
    );
  }

  if (g.imprecise > 0) {
    out.push(`${n(g.imprecise)} are drawn as areas rather than points.`);
  }
  if (g.unassessed > 0) {
    out.push(
      `${n(g.unassessed)} belong to names the Continuum holds no conservation assessment for.`,
    );
  }
  if (g.weakProvenance > 0) {
    out.push(`${n(g.weakProvenance)} cannot be traced back to an identifier in their source dataset.`);
  }
  return out;
}
