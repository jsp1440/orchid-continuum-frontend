/**
 * ATLAS-NEXT — the context Calyx will read.
 *
 * Slice 1 does NOT wire a chat interface. What it does is guarantee that the
 * Atlas can always describe, in plain serialisable terms, what the viewer is
 * currently looking at and what is known about it — so that when Calyx is
 * connected it receives grounded state rather than being asked to guess from a
 * screenshot or invent a narrative.
 *
 * Three properties matter for that later integration:
 *
 *   - It carries evidence states, not just values. A guide that cannot tell
 *     "not recorded" from "unavailable" will fabricate to fill the gap.
 *   - It carries the locality policy in force. A guide must not narrate a
 *     precise site the interface deliberately withheld.
 *   - It names the unimplemented modes and why. The honest answer to "show me
 *     the pollinators" is currently "that mode is not built yet, and here is
 *     what is blocking it" — not an improvised map.
 */

import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';
import type { AtlasAccessLevel, EvidenceState, ScaleLevel } from './types';
import { coverage, displayName, resolveOccurrenceEvidence } from './evidence';
import { resolveLocation, sensitivityResolution } from './sensitivity';
import { profileOf, recordEvidence, type GapProfile } from './knowledgeGap';
import { QUESTIONS, QUESTION_ORDER, resolveAvailability, type QuestionId } from './questions';
import { describeTime, type AtlasTimeState } from './time';

export interface AtlasSelectionContext {
  occurrenceId: string;
  name: string;
  /** Field name -> evidence state. Values are deliberately excluded for
   *  protected fields; the state is always safe to share. */
  evidence: Record<string, EvidenceState>;
  recordedFields: number;
  totalFields: number;
  localityGeneralised: boolean;
  localityNotice: string;
}

/** Which rendering engine is currently showing the Atlas. */
export type AtlasMapMode = 'globe' | 'regional';

/** Rolled-up evidence states for the guide, per dimension. */
export interface VisibleEvidenceStates {
  occurrence: EvidenceState;
  pollinator: EvidenceState;
  mycorrhizal: EvidenceState;
  environmental: EvidenceState;
  conservation: EvidenceState;
}

export interface AtlasContext {
  version: 2;
  route: string;
  accessLevel: AtlasAccessLevel;
  scale: ScaleLevel;
  mapMode: AtlasMapMode;
  activeQuestion: QuestionId;
  question: string;
  /** Where the camera is pointing, rounded — not a claim about any record. */
  view: { lat: number; lng: number; distance: number };
  /** Bounding box of the records in view, when there are any. */
  bounds: { north: number; south: number; east: number; west: number } | null;
  /** Time filter in force, and what it does and does not mean. */
  timeState: AtlasTimeState & { description: string };
  /** Counts describing the current selection, all derived from real records. */
  visible: {
    records: number;
    species: number;
    countries: number;
    /** Records whose site was coarsened because the species is assessed as threatened. */
    protectedRecords: number;
    /**
     * Records drawn as an area because the SOURCE states a large coordinate
     * uncertainty. A different fact from protection, and it must not be
     * reported as one: the record was never precise to begin with.
     */
    impreciseRecords: number;
  };
  filters: { genus: string | null; country: string | null };
  selection: AtlasSelectionContext | null;
  /** Per-dimension evidence states across everything in view. */
  visibleEvidence: VisibleEvidenceStates;
  /** What the archive holds and does not hold here. Counts, never scores. */
  knowledgeGap: GapProfile;
  /** Source datasets behind the records in view, so a claim can be traced. */
  provenanceRefs: string[];
  /** How locality protection is operating right now. */
  localitySensitivity: {
    withheldThreatened: number;
    withheldUnresolved: number;
    impreciseAtSource: number;
    policy: string;
  };
  /** Stated coordinate uncertainty across the records in view. */
  coordinateUncertainty: { stated: number; notStated: number; maxMetres: number | null };
  /** Every question, and whether it can be answered from what is in view. */
  questions: Array<{
    id: QuestionId;
    question: string;
    availability: string;
    reason: string;
    strongestClaim: EvidenceState;
  }>;
  /** Statements the interface is not entitled to make from current data. */
  guardrails: string[];
}

export const ATLAS_GUARDRAILS: string[] = [
  'A field with nothing in it is a gap in what has been collected and published. It is never evidence that the orchid lacks the thing.',
  'Every orchid depends on a mycorrhizal fungus. "No fungal partner linked" describes the literature the Continuum holds, never the plant.',
  'A collection year measures when somebody was there with a notebook. Fewer recent records means less recent collecting, not fewer orchids.',
  'A relationship documented for a species was documented from a study somewhere. It was not measured at the site being looked at.',
  'Where a coordinate is withheld because no conservation assessment could be reached, say that it is a precaution about what is unknown — not that the species is threatened.',
  'Records shown together in one place are co-occurring. Do not describe that as one causing, supporting, or depending on the other.',
  'An aggregate cell is a count of records. It is not a range, a population, a density estimate, or a habitat boundary.',
  'Where a field is "not recorded", say so. Do not substitute general orchid biology for a missing record.',
  'Absence of records is sampling, not absence of the orchid.',
  'Never restate a precise locality for a record whose site has been generalised, and never estimate one.',
  'Do not describe any area as suitable, viable, or protected habitat; the Atlas holds no habitat model.',
];

export function buildAtlasContext(args: {
  route: string;
  accessLevel: AtlasAccessLevel;
  scale: ScaleLevel;
  mapMode: AtlasMapMode;
  question: QuestionId;
  time: AtlasTimeState;
  view: { lat: number; lng: number; distance: number };
  visiblePoints: AtlasOccurrencePoint[];
  selected: AtlasOccurrencePoint | null;
  genus: string | null;
  country: string | null;
}): AtlasContext {
  const species = new Set<string>();
  const countries = new Set<string>();
  const datasets = new Set<string>();
  let withheldThreatened = 0;
  let withheldUnresolved = 0;
  let impreciseAtSource = 0;
  let uncertaintyStated = 0;
  let maxUncertainty: number | null = null;
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;

  for (const p of args.visiblePoints) {
    if (p.canonicalName) species.add(p.canonicalName);
    if (p.country && p.country !== 'Unknown') countries.add(p.country);
    if (p.dataset) datasets.add(p.dataset);

    const policy = resolveLocation(p, args.accessLevel).policy;
    if (policy.reason === 'iucn-threatened' || policy.reason === 'conservation-status') {
      withheldThreatened += 1;
    } else if (policy.reason === 'unresolved-assessment') {
      withheldUnresolved += 1;
    } else if (policy.reason === 'coordinate-uncertainty') {
      impreciseAtSource += 1;
    }

    if (typeof p.coordinateUncertaintyM === 'number') {
      uncertaintyStated += 1;
      maxUncertainty = Math.max(maxUncertainty ?? 0, p.coordinateUncertaintyM);
    }

    // Bounds are computed from DISPLAYED positions, so a withheld site cannot
    // be narrowed down by reading the extent back out of the context.
    const loc = resolveLocation(p, args.accessLevel);
    north = Math.max(north, loc.lat);
    south = Math.min(south, loc.lat);
    east = Math.max(east, loc.lng);
    west = Math.min(west, loc.lng);
  }

  let selection: AtlasSelectionContext | null = null;
  if (args.selected) {
    const ev = resolveOccurrenceEvidence(args.selected);
    const cov = coverage(ev);
    const loc = resolveLocation(args.selected, args.accessLevel);
    selection = {
      occurrenceId: args.selected.id,
      name: displayName(args.selected),
      evidence: Object.fromEntries(Object.entries(ev).map(([k, v]) => [k, v.state])) as Record<
        string,
        EvidenceState
      >,
      recordedFields: cov.recorded,
      totalFields: cov.total,
      localityGeneralised: loc.policy.generalised,
      localityNotice: loc.policy.notice,
    };
  }

  const gap = profileOf(args.visiblePoints, args.accessLevel);
  const round = (x: number) => Math.round(x * 10) / 10;

  // Roll each dimension up to the strongest state anything in view supports.
  // `unknown` when nothing does — never a stronger state by default.
  const anyPollinator = args.visiblePoints.some((p) => recordEvidence(p).pollinatorLinked);
  const anyMyco = args.visiblePoints.some((p) => recordEvidence(p).fungalPartnerLinked);
  const anyEnvironmental = args.visiblePoints.some(
    (p) => typeof p.elevation_m === 'number' || !!p.habitat?.trim(),
  );
  const anyAssessment = args.visiblePoints.some(
    (p) => sensitivityResolution(p) !== 'unresolved',
  );

  const visibleEvidence: VisibleEvidenceStates = {
    occurrence: args.visiblePoints.length ? 'observed' : 'unknown',
    pollinator: anyPollinator ? 'documented_relationship' : 'unknown',
    mycorrhizal: anyMyco ? 'documented_relationship' : 'unknown',
    environmental: anyEnvironmental ? 'observed' : 'unknown',
    conservation: anyAssessment ? 'documented_relationship' : 'unknown',
  };

  return {
    version: 2,
    route: args.route,
    accessLevel: args.accessLevel,
    scale: args.scale,
    mapMode: args.mapMode,
    activeQuestion: args.question,
    question: QUESTIONS[args.question].question,
    view: {
      lat: round(args.view.lat),
      lng: round(args.view.lng),
      distance: Math.round(args.view.distance),
    },
    bounds: args.visiblePoints.length
      ? { north: round(north), south: round(south), east: round(east), west: round(west) }
      : null,
    timeState: { ...args.time, description: describeTime(args.time) },
    visible: {
      records: args.visiblePoints.length,
      species: species.size,
      countries: countries.size,
      protectedRecords: withheldThreatened,
      impreciseRecords: impreciseAtSource,
    },
    filters: { genus: args.genus, country: args.country },
    selection,
    visibleEvidence,
    knowledgeGap: gap,
    provenanceRefs: Array.from(datasets).sort(),
    localitySensitivity: {
      withheldThreatened,
      withheldUnresolved,
      impreciseAtSource,
      policy:
        'Threatened sites are withheld. Names with no reachable assessment are withheld as a precaution. Source imprecision withholds nothing — those records were never precise.',
    },
    coordinateUncertainty: {
      stated: uncertaintyStated,
      notStated: args.visiblePoints.length - uncertaintyStated,
      maxMetres: maxUncertainty,
    },
    questions: QUESTION_ORDER.map((id) => {
      const q = QUESTIONS[id];
      const a = resolveAvailability(q, args.visiblePoints);
      return {
        id,
        question: q.question,
        availability: a.state,
        reason: a.reason,
        strongestClaim: q.strongestClaim,
      };
    }),
    guardrails: ATLAS_GUARDRAILS,
  };
}
