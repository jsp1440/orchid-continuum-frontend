const SAFE_GENUS = /^[A-Z][A-Za-z-]+$/;

/**
 * Resolve the optional genus filter accepted by the Species browser.
 *
 * An absent filter means an ordinary unfiltered Species search. An explicitly
 * supplied but malformed genus is rejected rather than being treated as a
 * free-text search term. This keeps canonical Continuum handoffs from widening
 * malformed route context into an unrelated result set.
 */
export function resolveSpeciesGenusFilter(value: string | null | undefined): string {
  if (value == null) return '';

  const genus = String(value).trim();
  if (!genus || genus.length > 120 || !SAFE_GENUS.test(genus)) {
    return '';
  }

  return genus;
}

/**
 * A route-derived genus filter is truthful only while the search box still
 * represents that same genus. As soon as a visitor edits the query to another
 * subject, the URL filter must be cleared rather than leaving a "Filtering by
 * Genus" badge beside results produced by unrelated free-text input.
 */
export function speciesQueryPreservesGenusFilter(
  activeGenus: string,
  nextQuery: string,
): boolean {
  if (!activeGenus) return false;
  return String(nextQuery ?? '').trim() === activeGenus;
}
