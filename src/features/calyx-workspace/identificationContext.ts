export interface IdentificationSourceContext {
  concept?: string;
  label?: string;
}

export const MAX_IDENTIFICATION_CONTEXT_TEXT = 160;

// This module carries context Lexicon -> Matrix only. The reverse direction is
// served by resolveMatrixCharacterLexicon(), which requires a reviewed canonical
// concept ID and reports 'unmapped' rather than deriving a lexicon lookup from a
// character label. Guessing the concept from the label would undo that.

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
  const params = new URLSearchParams(search);
  const concept = boundedContextText(params.get('concept'));
  const label = boundedContextText(params.get('label'));
  return { concept, label };
}
