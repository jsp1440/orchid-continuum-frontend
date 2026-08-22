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

export type SpeciesDossierCalyxContext = {
  origin: typeof SPECIES_DOSSIER_CALYX_ORIGIN;
  genus: string;
  taxon: string;
  contextIsEvidence: false;
};

export type SpeciesDossierCalyxTurnRouteContext = {
  origin: typeof SPECIES_DOSSIER_CALYX_ORIGIN;
  featured_taxon: { rank: 'genus'; accepted_name: string };
  taxon: string;
  taxon_source: typeof SPECIES_DOSSIER_CALYX_ORIGIN;
  taxon_is_evidence: false;
};

/**
 * Parse the direct Species Dossier → Calyx handoff at the trust boundary.
 *
 * The dedicated origin is accepted only when the producer explicitly declares
 * that route context is not evidence. Exact species identity must remain a
 * bounded binomial matching the supplied genus. All other query parameters are
 * ignored, so locality, occurrence, collector/catalogue and dossier-evidence
 * material cannot become part of the accepted Calyx subject context.
 */
export function parseSpeciesDossierCalyxContext(
  search: string | URLSearchParams,
): SpeciesDossierCalyxContext | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  if (params.get('origin') !== SPECIES_DOSSIER_CALYX_ORIGIN) return null;
  if (params.get('context_is_evidence') !== 'false') return null;

  const genus = boundedGenus(params.get('genus'));
  const taxon = boundedSpecies(params.get('taxon'));
  if (!genus || !taxon || !taxon.startsWith(`${genus} `)) return null;

  return {
    origin: SPECIES_DOSSIER_CALYX_ORIGIN,
    genus,
    taxon,
    contextIsEvidence: false,
  };
}

/**
 * Convert the validated dossier handoff into the exact route_context shape
 * Calyx sends with a turn. This deliberately exposes no evidence receipt,
 * occurrence, locality, collector, catalogue, coordinate, confidence, or
 * conclusion field. The exact species is navigation context only.
 */
export function speciesDossierCalyxTurnRouteContext(
  search: string | URLSearchParams,
): SpeciesDossierCalyxTurnRouteContext | null {
  const context = parseSpeciesDossierCalyxContext(search);
  if (!context) return null;

  return {
    origin: context.origin,
    featured_taxon: { rank: 'genus', accepted_name: context.genus },
    taxon: context.taxon,
    taxon_source: context.origin,
    taxon_is_evidence: false,
  };
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
