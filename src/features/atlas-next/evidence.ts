/**
 * ATLAS-NEXT — evidence resolution.
 *
 * Turns a canonical `AtlasOccurrencePoint` into a set of per-field evidence
 * states. It reads only fields the Continuum actually holds and it fills
 * nothing in: where the graph is silent the answer is `unknown`, which the
 * interface renders as a question rather than hiding as an empty row.
 *
 * Nothing here upgrades a state. In particular, an occurrence sharing a place
 * with something else never becomes a documented relationship.
 */

import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';
import type { EvidenceState } from './types';

export interface FieldEvidence<T = string> {
  state: EvidenceState;
  value: T | null;
  /** Where this came from, when the record says. */
  attribution?: string;
}

export interface OccurrenceEvidence {
  /** Whether the source dataset marked this record as verified. */
  recordVerification: FieldEvidence;
  country: FieldEvidence;
  region: FieldEvidence;
  locality: FieldEvidence;
  year: FieldEvidence<number>;
  elevation: FieldEvidence<number>;
  habitat: FieldEvidence;
  biome: FieldEvidence;
  conservation: FieldEvidence;
  pollinator: FieldEvidence;
  mycorrhizal: FieldEvidence;
  media: FieldEvidence;
  provenance: FieldEvidence;
}

/** A plain recorded attribute: present means observed, absent means not recorded. */
function recorded<T>(value: T | null | undefined): FieldEvidence<T> {
  const empty =
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim().length === 0) ||
    (typeof value === 'string' && value.trim().toLowerCase() === 'unknown');
  return empty ? { state: 'unknown', value: null } : { state: 'observed', value: value as T };
}

export function resolveOccurrenceEvidence(p: AtlasOccurrencePoint): OccurrenceEvidence {
  // Pollination. A named taxon or mechanism is a documented relationship for
  // the species; a bare, unnamed entry is not enough to claim one.
  const pollinator = p.pollinators.find((x) => x.taxon || x.name);
  const pollinatorEvidence: FieldEvidence = pollinator
    ? {
        state: 'documented_relationship',
        value: [pollinator.taxon ?? pollinator.name, pollinator.mechanism]
          .filter(Boolean)
          .join(' — '),
      }
    : { state: 'unknown', value: null };

  // Mycorrhizal partner. The canonical resolver attaches a row only on an
  // exact species_id or exact binomial match, so a hit is species-level. With
  // a citation it is a documented relationship; without one the link is real
  // but unsourced here, which is `inferred`, not `documented`.
  const myco = p.mycorrhizal;
  const mycoEvidence: FieldEvidence = myco?.taxon
    ? {
        state: myco.source ? 'documented_relationship' : 'inferred',
        value: [myco.taxon, myco.family ? `(${myco.family})` : null].filter(Boolean).join(' '),
        attribution: myco.source ?? undefined,
      }
    : { state: 'unknown', value: null };

  const provenanceParts = [p.dataset, p.sourceRecordId].filter(Boolean);

  return {
    recordVerification: p.verified
      ? { state: 'observed', value: 'Verified by the source dataset' }
      : { state: 'unknown', value: null },
    country: recorded(p.country),
    region: recorded(p.region),
    locality: recorded(p.locality),
    year: recorded(p.year),
    elevation: recorded(p.elevation_m),
    habitat: recorded(p.habitat),
    biome: recorded(p.biome),
    conservation: recorded(p.conservationStatus ?? p.iucnCode),
    pollinator: pollinatorEvidence,
    mycorrhizal: mycoEvidence,
    media: recorded(p.imageUrl),
    provenance: provenanceParts.length
      ? { state: 'observed', value: provenanceParts.join(' · ') }
      : { state: 'unknown', value: null },
  };
}

/** The species name to show. Prefers the accepted name when the source gives one. */
export function displayName(p: AtlasOccurrencePoint): string {
  return (p.acceptedName ?? p.canonicalName ?? '').trim() || p.genus || 'Unnamed record';
}

/**
 * Counts how many of an evidence set are silent, so a surface can say
 * "8 of 13 fields are not recorded for this occurrence" instead of quietly
 * rendering a short list and implying completeness.
 */
export function coverage(e: OccurrenceEvidence): { recorded: number; total: number } {
  const values = Object.values(e) as FieldEvidence<unknown>[];
  return {
    recorded: values.filter((f) => f.state !== 'unknown' && f.state !== 'unavailable').length,
    total: values.length,
  };
}
