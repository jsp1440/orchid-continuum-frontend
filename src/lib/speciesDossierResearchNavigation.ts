export const SPECIES_DOSSIER_RESEARCH_ORIGIN = 'species-dossier-research';
export const SPECIES_DOSSIER_RESEARCH_PATH = '/research';

const MAX_TAXON_CONTEXT_TEXT = 160;
const UNSAFE_CONTEXT_PUNCTUATION = /[<>{}\\]/;
const SAFE_GENUS = /^[A-Z][A-Za-z-]+$/;

export interface SpeciesDossierResearchContext {
  origin: typeof SPECIES_DOSSIER_RESEARCH_ORIGIN;
  /** Genus, the only rank the Research query builder filters on. */
  genus: string;
  /** Accepted binomial, carried so Research need not re-derive the subject. */
  taxon: string | null;
  contextIsEvidence: false;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function boundedTaxonText(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (
    !text ||
    text.length > MAX_TAXON_CONTEXT_TEXT ||
    hasControlCharacter(text) ||
    UNSAFE_CONTEXT_PUNCTUATION.test(text)
  ) {
    return null;
  }
  return text;
}

function boundedGenus(value: string | null | undefined): string | null {
  const genus = value?.trim();
  if (!genus || genus.length > MAX_TAXON_CONTEXT_TEXT || !SAFE_GENUS.test(genus)) return null;
  return genus;
}

/**
 * Build the Species Dossier → Research Station handoff.
 *
 * A dossier already knows its subject; without this the visitor arrives at
 * Research and has to type the organism in again, which is where subject
 * identity was being lost across the journey.
 *
 * Deliberately narrow. Genus drives the Research query builder, and the
 * accepted binomial rides along so Research can name the subject it inherited
 * rather than re-deriving it. Nothing else crosses: there is no parameter here
 * through which an occurrence id, coordinate, locality, collector, catalogue
 * number, site, grid, GPS value or elevation could travel, and the dossier's
 * evidence receipts stay in the dossier.
 *
 * The subject is navigation context. A dossier handoff says "this is what the
 * visitor was looking at", never "this is an evidenced finding about the
 * organism", so context_is_evidence is asserted false on the way out and
 * required false on the way in.
 */
export function speciesDossierResearchHref(input: {
  genus: string | null | undefined;
  taxon?: string | null;
}): string | null {
  const genus = boundedGenus(input.genus);
  if (!genus) return null;

  const taxon = boundedTaxonText(input.taxon);

  const params = new URLSearchParams();
  params.set('genus', genus);
  params.set('origin', SPECIES_DOSSIER_RESEARCH_ORIGIN);
  if (taxon) params.set('taxon', taxon);
  params.set('context_is_evidence', 'false');
  return `${SPECIES_DOSSIER_RESEARCH_PATH}?${params.toString()}`;
}

/** Parse a Species Dossier arrival. Fails closed on anything unexpected. */
export function parseSpeciesDossierResearchContext(
  search: string | URLSearchParams,
): SpeciesDossierResearchContext | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  if (params.get('origin') !== SPECIES_DOSSIER_RESEARCH_ORIGIN) return null;
  // Absent or truthy both fail: an unclaimed boundary is how context quietly
  // becomes evidence.
  if (params.get('context_is_evidence') !== 'false') return null;

  const genus = boundedGenus(params.get('genus'));
  if (!genus) return null;

  return {
    origin: SPECIES_DOSSIER_RESEARCH_ORIGIN,
    genus,
    taxon: boundedTaxonText(params.get('taxon')),
    contextIsEvidence: false,
  };
}
