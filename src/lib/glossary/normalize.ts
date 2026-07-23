/**
 * Deterministic text and field normalization for the Glossary Preparation
 * Workflow. All functions are pure and side-effect free.
 */

/** Normalize line endings to "\n" (handles CRLF and lone CR). */
export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Normalize a single-line field: NFC Unicode, unify line endings, collapse ALL
 * runs of whitespace (including newlines) to a single space, and trim ends.
 * Use for term, category, source, source citation.
 */
export function normalizeSingleLine(value: string): string {
  return normalizeLineEndings(value.normalize('NFC'))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize a multi-line field: NFC Unicode, unify line endings, collapse runs
 * of spaces/tabs (but preserve newlines), trim trailing spaces per line, and
 * trim the whole value. Use for definition and notes.
 */
export function normalizeMultiLine(value: string): string {
  const unified = normalizeLineEndings(value.normalize('NFC'));
  return unified
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Capitalize the first alphabetic character of a definition, leaving the rest
 * untouched. Conservative "scientifically appropriate" capitalization: we only
 * ever change the sentence-initial character and never alter interior casing,
 * so scientific terms (e.g. genus names, "pH") are preserved.
 * Returns the possibly-changed value plus whether a change was made.
 */
export function capitalizeDefinition(value: string): { value: string; changed: boolean } {
  const match = value.match(/\p{L}/u);
  if (!match || match.index === undefined) return { value, changed: false };
  const index = match.index;
  const char = value[index];
  const upper = char.toUpperCase();
  if (upper === char) return { value, changed: false };
  return {
    value: value.slice(0, index) + upper + value.slice(index + 1),
    changed: true,
  };
}

/**
 * Normalize a list-like field (synonyms, related terms). Splits on commas,
 * semicolons, pipes, and newlines; trims and NFC-normalizes each item; drops
 * empties; de-duplicates case-insensitively (keeping the first spelling); and
 * sorts case-insensitively for deterministic ordering regardless of input order.
 *
 * Accepts either a delimited string or an already-split array of values.
 */
export function normalizeList(value: string | string[]): string[] {
  const rawItems = Array.isArray(value)
    ? value.map((item) => String(item))
    : String(value).split(/[,;|\n]/);

  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of rawItems) {
    const item = normalizeSingleLine(raw);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  result.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  return result;
}

/**
 * Build a stable, URL/file-safe slug from a term. Deterministic: same term
 * always yields the same slug. Non-alphanumeric runs become single hyphens.
 */
export function slugify(term: string): string {
  const base = normalizeSingleLine(term)
    .normalize('NFKD')
    // strip combining marks so accented letters map to their base form
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'term';
}

/** Case-insensitive duplicate key for a normalized term. */
export function duplicateKey(term: string): string {
  return normalizeSingleLine(term).toLowerCase();
}
