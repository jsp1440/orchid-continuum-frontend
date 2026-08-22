export const SPECIES_DOSSIER_MATRIX_ORIGIN = 'species-dossier';
export const SPECIES_DOSSIER_MATRIX_PATH = '/orchid-identification';

const MAX_TAXON_CONTEXT_TEXT = 160;
const UNSAFE_CONTEXT_TEXT = /[\u0000-\u001f\u007f<>{}\\]/;

export interface SpeciesDossierMatrixContext {
  origin: typeof SPECIES_DOSSIER_MATRIX_ORIGIN;
  taxonId: string;
  taxonLabel: string | null;
  contextIsObservation: false;
  contextIsEvidence: false;
}

function boundedTaxonText(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text || text.length > MAX_TAXON_CONTEXT_TEXT || UNSAFE_CONTEXT_TEXT.test(text)) {
    return null;
  }
  return text;
}

function canonicalMatrixDestination(matrixUrl: string | null | undefined): boolean {
  const raw = matrixUrl?.trim();
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return false;

  try {
    const base = new URL('https://orchidcontinuum.invalid');
    const parsed = new URL(raw, base);
    return parsed.origin === base.origin && parsed.pathname === SPECIES_DOSSIER_MATRIX_PATH;
  } catch {
    return false;
  }
}

/**
 * Build the only supported Species Dossier → Matrix route. The backend-supplied
 * matrix_url is used strictly as a governed destination signal; its query and
 * fragment are never forwarded. Taxon identity is navigation context only and
 * cannot become an observation or evidence claim through this route.
 */
export function speciesDossierMatrixHref(
  matrixUrl: string | null | undefined,
  input: { taxonId: string | null | undefined; taxonLabel?: string | null },
): string | null {
  if (!canonicalMatrixDestination(matrixUrl)) return null;

  const taxonId = boundedTaxonText(input.taxonId);
  if (!taxonId) return null;
  const taxonLabel = boundedTaxonText(input.taxonLabel);

  const params = new URLSearchParams();
  params.set('origin', SPECIES_DOSSIER_MATRIX_ORIGIN);
  params.set('taxon_id', taxonId);
  if (taxonLabel) params.set('taxon_label', taxonLabel);
  params.set('context_is_observation', 'false');
  params.set('context_is_evidence', 'false');
  return `${SPECIES_DOSSIER_MATRIX_PATH}?${params.toString()}`;
}

export function parseSpeciesDossierMatrixContext(
  search: string,
): SpeciesDossierMatrixContext | null {
  const params = new URLSearchParams(search);
  if (params.get('origin') !== SPECIES_DOSSIER_MATRIX_ORIGIN) return null;
  if (params.get('context_is_observation') !== 'false') return null;
  if (params.get('context_is_evidence') !== 'false') return null;

  const taxonId = boundedTaxonText(params.get('taxon_id'));
  if (!taxonId) return null;

  return {
    origin: SPECIES_DOSSIER_MATRIX_ORIGIN,
    taxonId,
    taxonLabel: boundedTaxonText(params.get('taxon_label')),
    contextIsObservation: false,
    contextIsEvidence: false,
  };
}
