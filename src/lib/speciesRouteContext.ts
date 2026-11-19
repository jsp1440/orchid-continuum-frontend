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
 * The Species search box's next value when browser/history navigation or an
 * in-app link changes the route-derived query: an explicit `?q=` or, failing
 * that, a canonical `?genus=` (see {@link speciesRouteQuery}).
 *
 * A newly supplied route query owns the box and replaces the prior
 * route/query state. When route navigation removes the route query, clear the
 * box only if it still holds that old route-owned query. A visitor's
 * independent free-text query must survive that route transition.
 */
export function speciesQueryAfterRouteQueryChange(
  previousRouteQuery: string,
  nextRouteQuery: string,
  currentQuery: string,
): string {
  if (nextRouteQuery) return nextRouteQuery;
  if (previousRouteQuery && speciesQueryPreservesGenusFilter(previousRouteQuery, currentQuery)) {
    return '';
  }
  return currentQuery;
}

/** Longest free-text species query the route will carry or search for. */
export const SPECIES_QUERY_MAX_LENGTH = 200;

// C0/C1 control characters (tabs, newlines, NUL, DEL, …) and the Unicode
// line/paragraph separators never belong in a one-line search box; they become
// ordinary spaces before trimming.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

// Invisible Unicode format characters (general category Cf) are removed
// outright. They include the bidirectional controls a shared link could use to
// reverse the page copy around an echoed query (LRM/RLM U+200E/U+200F, ALM
// U+061C, embeddings/overrides U+202A–U+202E, isolates U+2066–U+2069), plus
// zero-width spaces and joiners, word joiners, the soft hyphen, the BOM and
// tag characters. No orchid name needs any of them: scientific names are
// written in Latin script, where ZWJ/ZWNJ have no role, so those are removed
// too. They are deleted rather than turned into spaces so a name pasted with a
// soft hyphen or zero-width space (`Phalae\u00ADnopsis`) still reads as one word.
const FORMAT_CHARACTERS = /\p{Cf}/gu;

/**
 * Remove the invisible format characters (Unicode category Cf, including every
 * bidirectional control) from free text, leaving everything else, including
 * surrounding whitespace, as it was. The Species page applies this to what the
 * visitor types, so the box never holds text that could reorder the page copy
 * that echoes it, without the trimming {@link resolveSpeciesQueryParam} adds.
 */
export function stripSpeciesQueryFormatCharacters(value: string): string {
  return String(value ?? '').replace(FORMAT_CHARACTERS, '');
}

/** Whether `value` holds any invisible format character (Unicode category Cf). */
function hasFormatCharacters(value: string): boolean {
  return /\p{Cf}/u.test(value);
}

/**
 * Normalise free text that is about to become a species search (a `?q=` value
 * from the address bar, a name handed over by another page, or the visitor's
 * own typing) into bounded plain text.
 *
 * The value is only ever a search string: it is rendered as text (never as
 * markup) and sent URL-encoded. Here it is stripped of invisible format
 * characters (so a shared link cannot smuggle bidirectional overrides into the
 * page copy that echoes it), has control characters turned into spaces, is
 * trimmed, and is cut to {@link SPECIES_QUERY_MAX_LENGTH} characters, counted
 * by code point so a cut never splits a surrogate pair. Whitespace inside the
 * value is kept, so hybrid names such as `Genus × epithet` survive intact.
 */
export function resolveSpeciesQueryParam(value: string | null | undefined): string {
  if (value == null) return '';
  const plain = stripSpeciesQueryFormatCharacters(String(value)).replace(CONTROL_CHARACTERS, ' ').trim();
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

/**
 * The Species route's search parameters as the address bar should show them,
 * so it never displays an invisible format character (such as a bidirectional
 * override) that a shared link carried:
 *
 * - a `genus` holding format characters is not a canonical genus, so it is
 *   rejected (see {@link resolveSpeciesGenusFilter}) and removed, rather than
 *   quietly repaired into a filter the link did not validly ask for;
 * - `q` is normalised with {@link resolveSpeciesQueryParam}, and a genus it
 *   does not describe is dropped (see {@link speciesSearchParamsForQuery});
 * - any other parameter keeps its value minus format characters, and a
 *   parameter whose name holds them is removed.
 *
 * The page applies the result with a history replace, never a push.
 */
export function speciesRouteSearchParams(current: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams();
  for (const [key, value] of current) {
    if (hasFormatCharacters(key)) continue;
    if (key === 'genus' && hasFormatCharacters(value)) continue;
    next.append(key, stripSpeciesQueryFormatCharacters(value));
  }
  return next.has('q') ? speciesSearchParamsForQuery(next, speciesRouteQuery(next)) : next;
}
