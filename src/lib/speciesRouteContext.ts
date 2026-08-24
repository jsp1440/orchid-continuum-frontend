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
