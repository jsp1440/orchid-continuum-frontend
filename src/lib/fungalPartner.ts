/**
 * fungalPartner — resolves the mycorrhizal evidence the Continuum actually
 * holds for a given orchid, and says plainly how strong that evidence is.
 *
 * Design rule for HOMEPAGE-SLICE-1: this module reports what is in
 * `species_mycorrhizal` and nothing else. It never asserts a partnership for a
 * species on the strength of a congener, never fills a gap with general orchid
 * biology, and never invents a citation. Every biological claim the UI renders
 * comes from a row here or is not rendered at all.
 *
 * Live coverage as measured on 2026-08-18: 15 rows, each carrying a full
 * literature citation with a DOI. Of the eight genera in the homepage rotation
 * only Vanilla and Dendrobium are represented, so the unrecorded case is the
 * common one and is treated as a first-class result rather than an error.
 */

import { supabase } from '@/lib/supabase';

/** How closely the stored evidence matches the orchid being displayed. */
export type EvidenceScope =
  /** A row exists for this exact species. */
  | 'species'
  /** A row exists for a different species in the same genus. Never promoted. */
  | 'genus'
  /** No row exists for this genus at all. */
  | 'unrecorded';

export interface FungalEvidence {
  scope: EvidenceScope;
  /** Genus the visitor is looking at. */
  genus: string;
  /** Species the visitor is looking at, when one is resolved. */
  displayedSpecies: string | null;
  /** The species the stored row is actually about. Differs from displayedSpecies when scope is 'genus'. */
  evidenceSpecies: string | null;
  fungalTaxon: string | null;
  fungalFamily: string | null;
  associationType: string | null;
  /** Study description as recorded. Rendered verbatim; not paraphrased into a claim. */
  note: string | null;
  /** Full citation string including DOI. */
  source: string | null;
  /** Total documented partnerships in the graph — gives the gap a real scale. */
  totalDocumentedSpecies: number | null;
}

export interface FungalPartnerRow {
  scientific_name: string;
  fungal_taxon: string | null;
  fungal_family: string | null;
  association_type: string | null;
  note: string | null;
  source: string | null;
}

const SELECT = 'scientific_name,fungal_taxon,fungal_family,association_type,note,source';

/** First token of a binomial. `Vanilla planifolia Andrews` -> `Vanilla`. */
export function genusOf(scientificName: string): string {
  return (scientificName ?? '').trim().split(/\s+/)[0] ?? '';
}

/** `Vanilla planifolia Andrews` -> `Vanilla planifolia` (drops the authority). */
export function binomialOf(scientificName: string): string {
  const parts = (scientificName ?? '').trim().split(/\s+/);
  return parts.slice(0, 2).join(' ');
}

/**
 * Choose the row that describes the displayed species if one exists, otherwise
 * any row from the same genus, otherwise nothing. The caller is told which.
 */
export function resolveEvidence(
  rows: FungalPartnerRow[],
  genus: string,
  displayedSpecies: string | null,
): FungalEvidence {
  const base: FungalEvidence = {
    scope: 'unrecorded',
    genus,
    displayedSpecies,
    evidenceSpecies: null,
    fungalTaxon: null,
    fungalFamily: null,
    associationType: null,
    note: null,
    source: null,
    totalDocumentedSpecies: null,
  };

  if (rows.length === 0) return base;

  const wanted = displayedSpecies ? binomialOf(displayedSpecies).toLowerCase() : null;
  const exact = wanted
    ? rows.find((r) => binomialOf(r.scientific_name).toLowerCase() === wanted)
    : undefined;
  const chosen = exact ?? rows[0];

  return {
    ...base,
    scope: exact ? 'species' : 'genus',
    evidenceSpecies: binomialOf(chosen.scientific_name),
    fungalTaxon: chosen.fungal_taxon,
    fungalFamily: chosen.fungal_family,
    associationType: chosen.association_type,
    note: chosen.note,
    source: chosen.source,
  };
}

/** Strip a trailing bare URL so the citation and its link can be laid out separately. */
export function splitCitation(source: string | null): { text: string; url: string | null } {
  if (!source) return { text: '', url: null };
  const m = source.match(/(https?:\/\/\S+)\s*$/);
  return {
    text: source.replace(/\s*https?:\/\/\S+\s*$/, '').trim(),
    url: m ? m[1] : null,
  };
}

/**
 * Fetch the evidence for a genus. Rejects on transport failure so the caller
 * can distinguish "no evidence recorded" from "we could not check".
 */
export async function fetchFungalEvidence(
  genus: string,
  displayedSpecies: string | null,
): Promise<FungalEvidence> {
  const [rowsRes, countRes] = await Promise.all([
    supabase.from('species_mycorrhizal').select(SELECT).ilike('scientific_name', `${genus}%`).limit(25),
    supabase.from('species_mycorrhizal').select('scientific_name', { count: 'exact', head: true }),
  ]);

  if (rowsRes.error) throw new Error(rowsRes.error.message);

  const evidence = resolveEvidence((rowsRes.data ?? []) as FungalPartnerRow[], genus, displayedSpecies);
  return { ...evidence, totalDocumentedSpecies: countRes.count ?? null };
}
