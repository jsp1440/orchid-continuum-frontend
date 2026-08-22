export const SPECIES_DOSSIER_CALYX_ORIGIN = 'species-dossier-calyx';
export const SPECIES_DOSSIER_CALYX_PATH = '/calyx';

const MAX_TAXON_CONTEXT_TEXT = 160;
const UNSAFE_CONTEXT_PUNCTUATION = /[<>{}\\]/;
const SAFE_GENUS = /^[A-Z][A-Za-z-]+$/;
const SAFE_BINOMIAL = /^[A-Z][A-Za-z-]+\s+[a-z][A-Za-z-]+$/;

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function boundedGenus(value: string | null | undefined): string | null {
  const genus = value?.trim();
  if (!genus || genus.length > MAX_TAXON_CONTEXT_TEXT || !SAFE_GENUS.test(genus)) return null;
  return genus;
}

function boundedSpecies(value: string | null | undefined): string | null {
  const taxon = value?.trim();
  if (
    !taxon ||
    taxon.length > MAX_TAXON_CONTEXT_TEXT ||
    hasControlCharacter(taxon) ||
    UNSAFE_CONTEXT_PUNCTUATION.test(taxon) ||
    !SAFE_BINOMIAL.test(taxon)
  ) {
    return null;
  }
  return taxon;
}

/**
 * Build the direct Species Dossier → Calyx navigation handoff.
 *
 * This producer carries subject identity only: genus + accepted binomial,
 * dedicated origin, and an explicit declaration that route context is not
 * evidence. It intentionally has no input through which locality, coordinates,
 * occurrence/catalogue identifiers, collector data, evidence receipts, or
 * dossier conclusions could be serialized into the URL.
 *
 * The Calyx consumer must independently recognise this dedicated origin before
 * treating `taxon` as route context; this producer alone grants no evidentiary
 * or scientific status to the subject.
 */
export function speciesDossierCalyxHref(input: {
  genus: string | null | undefined;
  taxon: string | null | undefined;
}): string | null {
  const genus = boundedGenus(input.genus);
  const taxon = boundedSpecies(input.taxon);
  if (!genus || !taxon || !taxon.startsWith(`${genus} `)) return null;

  const params = new URLSearchParams();
  params.set('genus', genus);
  params.set('taxon', taxon);
  params.set('origin', SPECIES_DOSSIER_CALYX_ORIGIN);
  params.set('context_is_evidence', 'false');
  return `${SPECIES_DOSSIER_CALYX_PATH}?${params.toString()}`;
}
