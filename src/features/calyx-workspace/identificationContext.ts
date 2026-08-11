export interface IdentificationSourceContext {
  concept?: string;
  label?: string;
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
  if (slug.trim()) params.set('concept', slug.trim());
  if (label.trim()) params.set('label', label.trim());
  const query = params.toString();
  return query ? `/orchid-identification?${query}` : '/orchid-identification';
}

export function lexiconHrefForMatrixCharacter(character: string): string {
  const query = humanizeMatrixCharacter(character);
  return query ? `/lexicon/browse?q=${encodeURIComponent(query)}` : '/lexicon/browse';
}

export function readIdentificationSourceContext(search: string): IdentificationSourceContext {
  const params = new URLSearchParams(search);
  const concept = params.get('concept')?.trim() || undefined;
  const label = params.get('label')?.trim() || undefined;
  return { concept, label };
}
