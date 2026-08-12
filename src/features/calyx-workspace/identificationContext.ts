export interface IdentificationSourceContext {
  concept?: string;
  label?: string;
}

export const MAX_IDENTIFICATION_CONTEXT_TEXT = 160;

function boundedContextText(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  return text ? text.slice(0, MAX_IDENTIFICATION_CONTEXT_TEXT) : undefined;
}

export function humanizeMatrixCharacter(character: string): string {
  return character
    .trim()
    .replace(/_mm$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

export function lexiconHrefForMatrixCharacter(character: string): string {
  const query = humanizeMatrixCharacter(character);
  return query ? `/lexicon/browse?q=${encodeURIComponent(query)}` : '/lexicon/browse';
}

export function readIdentificationSourceContext(search: string): IdentificationSourceContext {
  const params = new URLSearchParams(search);
  const concept = boundedContextText(params.get('concept'));
  const label = boundedContextText(params.get('label'));
  return { concept, label };
}
