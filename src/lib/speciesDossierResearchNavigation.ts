export const SPECIES_DOSSIER_RESEARCH_ORIGIN = 'species-dossier';

const MAX_TAXON_CHARACTERS = 180;
const SAFE_TAXON = /^[A-Za-z][A-Za-z .()'×-]*$/;
const SAFE_GENUS = /^[A-Z][A-Za-z-]+$/;

export type SpeciesDossierResearchContext = {
  origin: typeof SPECIES_DOSSIER_RESEARCH_ORIGIN;
  genus: string;
  taxon: string;
  projectId: null;
  contextIsEvidence: false;
};

function boundedTaxon(value: string | null | undefined): string | null {
  const taxon = String(value ?? '').trim();
  if (!taxon || taxon.length > MAX_TAXON_CHARACTERS || !SAFE_TAXON.test(taxon)) return null;
  return taxon;
}

function genusFromTaxon(taxon: string): string | null {
  const genus = taxon.split(/\s+/)[0] ?? '';
  return SAFE_GENUS.test(genus) ? genus : null;
}

/**
 * Carry an exact Species Dossier subject into Research as navigation context only.
 * Dossier evidence, locality and occurrence material deliberately have no route channel.
 */
export function speciesDossierResearchHref(scientificName: string | null | undefined): string | null {
  const taxon = boundedTaxon(scientificName);
  if (!taxon) return null;
  const genus = genusFromTaxon(taxon);
  if (!genus) return null;

  const params = new URLSearchParams();
  params.set('origin', SPECIES_DOSSIER_RESEARCH_ORIGIN);
  params.set('genus', genus);
  params.set('taxon', taxon);
  params.set('context_is_evidence', 'false');
  return `/research?${params.toString()}`;
}

export function parseSpeciesDossierResearchContext(
  search: string | URLSearchParams,
): SpeciesDossierResearchContext | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  if (params.get('origin') !== SPECIES_DOSSIER_RESEARCH_ORIGIN) return null;
  if (params.get('context_is_evidence') !== 'false') return null;

  const taxon = boundedTaxon(params.get('taxon'));
  if (!taxon) return null;
  const derivedGenus = genusFromTaxon(taxon);
  const genus = String(params.get('genus') ?? '').trim();
  if (!derivedGenus || genus !== derivedGenus) return null;

  return {
    origin: SPECIES_DOSSIER_RESEARCH_ORIGIN,
    genus,
    taxon,
    projectId: null,
    contextIsEvidence: false,
  };
}
