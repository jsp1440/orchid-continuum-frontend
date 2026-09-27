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

/**
 * Keep the Species search box synchronized when browser/history navigation
 * changes the route-derived genus.
 *
 * A newly supplied canonical genus owns the query and replaces the prior
 * route/query state. When route navigation removes the genus, clear the query
 * only if it is still the old route-owned genus. A visitor's independent
 * free-text query must survive that route transition.
 */
export function speciesQueryAfterGenusRouteChange(
  previousGenus: string,
  nextGenus: string,
  currentQuery: string,
): string {
  if (nextGenus) return nextGenus;
  if (previousGenus && speciesQueryPreservesGenusFilter(previousGenus, currentQuery)) {
    return '';
  }
  return currentQuery;
}

/** Longest free-text species query the route will carry or search for. */
export const SPECIES_QUERY_MAX_LENGTH = 200;

// C0/C1 control characters (tabs, newlines, NUL, DEL, …) never belong in a
// one-line search box; they become ordinary spaces before trimming.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * Normalise free text that is about to become a species search (a `?q=` value
 * from the address bar, a name handed over by another page, or the visitor's
 * own typing) into bounded plain text.
 *
 * The value is only ever a search string: it is rendered as text (never as
 * markup) and sent URL-encoded. Here it is trimmed, stripped of control
 * characters and cut to {@link SPECIES_QUERY_MAX_LENGTH} characters, counted
 * by code point so a cut never splits a surrogate pair. Whitespace inside the
 * value is kept, so hybrid names such as `Genus × epithet` survive intact.
 */
export function resolveSpeciesQueryParam(value: string | null | undefined): string {
  if (value == null) return '';
  const plain = String(value).replace(CONTROL_CHARACTERS, ' ').trim();
  const codePoints = Array.from(plain);
  if (codePoints.length <= SPECIES_QUERY_MAX_LENGTH) return plain;
  return codePoints.slice(0, SPECIES_QUERY_MAX_LENGTH).join('').trim();
}

/**
 * The Species search page prefilled with `name`, for in-app "search for X"
 * links. An empty name, or a bare identifier (all digits, or a namespaced id
 * such as `taxon:source:slug`) that a name search could not match, links to
 * the unfilled search page instead of searching for the identifier.
 */
export function speciesSearchHref(name: string | null | undefined): string {
  const query = resolveSpeciesQueryParam(name);
  if (!query || /^\d+$/.test(query) || /^[a-z][\w-]*:\S+$/i.test(query)) return '/species';
  return `/species?q=${encodeURIComponent(query)}`;
}

/**
 * The Species route's search parameters after the query becomes `nextQuery`,
 * keeping every other parameter as it was.
 *
 * - A route-derived genus filter survives only while the query is still that
 *   genus (see {@link speciesQueryPreservesGenusFilter}); otherwise it is
 *   dropped so the page never claims to filter by a genus it is not searching.
 * - While the genus filter still describes the query, `q` is omitted as
 *   redundant; otherwise `q` holds the normalised query, or is removed when
 *   the query is empty.
 */
export function speciesSearchParamsForQuery(
  current: URLSearchParams,
  nextQuery: string,
): URLSearchParams {
  const next = new URLSearchParams(current);
  const query = resolveSpeciesQueryParam(nextQuery);
  const genus = resolveSpeciesGenusFilter(next.get('genus'));
  const genusStillDescribesQuery = Boolean(genus) && speciesQueryPreservesGenusFilter(genus, query);
  if (next.has('genus') && !genusStillDescribesQuery) next.delete('genus');
  if (!query || genusStillDescribesQuery) next.delete('q');
  else next.set('q', query);
  return next;
}

/**
 * The query a Species route asks for: an explicit `?q=` wins, otherwise a
 * valid route-derived genus, otherwise nothing.
 */
export function speciesRouteQuery(params: URLSearchParams): string {
  return resolveSpeciesQueryParam(params.get('q')) || resolveSpeciesGenusFilter(params.get('genus'));
}
