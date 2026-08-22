import {
  SPECIES_DOSSIER_MATRIX_ORIGIN,
  parseSpeciesDossierMatrixContext,
} from '@/lib/speciesDossierMatrixNavigation';

export interface IdentificationSourceContext {
  source?: 'lexicon' | typeof SPECIES_DOSSIER_MATRIX_ORIGIN;
  concept?: string;
  label?: string;
  taxonId?: string;
  taxonLabel?: string | null;
  contextIsObservation?: false;
  contextIsEvidence?: false;
}

export const MAX_IDENTIFICATION_CONTEXT_TEXT = 160;

// This module carries bounded navigation context into Matrix. The reverse
// Matrix -> Lexicon direction is served by resolveMatrixCharacterLexicon(),
// which requires a reviewed canonical concept ID and reports 'unmapped' rather
// than deriving a lexicon lookup from a character label. Dossier taxon identity
// is navigation context only and is never promoted into an observation/evidence
// claim here.

function boundedContextText(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  return text ? text.slice(0, MAX_IDENTIFICATION_CONTEXT_TEXT) : undefined;
}

export function matrixHrefForLexiconConcept(slug: string, label: string): string {
  const params = new URLSearchParams();
  const boundedSlug = boundedContextText(slug);
  const boundedLabel = boundedContextText(label);
  if (boundedSlug) params.set('concept', boundedSlug);
  if (boundedLabel) params.set('label', boundedLabel);
  const query = params.toString();
  return query ? `/orchid-identification?${query}` : '/orchid-identification';
}

export function readIdentificationSourceContext(search: string): IdentificationSourceContext {
  const dossier = parseSpeciesDossierMatrixContext(search);
  if (dossier) {
    return {
      source: SPECIES_DOSSIER_MATRIX_ORIGIN,
      taxonId: dossier.taxonId,
      taxonLabel: dossier.taxonLabel,
      contextIsObservation: false,
      contextIsEvidence: false,
    };
  }

  const params = new URLSearchParams(search);
  const concept = boundedContextText(params.get('concept'));
  const label = boundedContextText(params.get('label'));
  return { concept, label };
}
