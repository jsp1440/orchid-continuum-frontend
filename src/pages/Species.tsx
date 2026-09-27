import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Loader2, Leaf, ShieldAlert, ArrowRight, X, RotateCcw } from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import { searchSpeciesOutcome, type SpeciesSearchResult } from '@/lib/ocBackend';
import { speciesPageHref } from '@/lib/speciesDossier';
import {
  SPECIES_QUERY_MAX_LENGTH,
  resolveSpeciesGenusFilter,
  resolveSpeciesQueryParam,
  speciesQueryAfterRouteQueryChange,
  speciesRouteQuery,
  speciesSearchParamsForQuery,
  stripSpeciesQueryFormatCharacters,
} from '@/lib/speciesRouteContext';

/**
 * Species — orchid species dossiers search.
 *
 * Search the live Orchid Continuum backend across ~30,000 species and open a
 * dossier for any result. Dark-olive / cream journal aesthetic.
 *
 * If the page is opened with ?genus=Cattleya (e.g. from the homepage
 * "Explore this genus" button), the list is filtered to that genus on first
 * render and an active filter chip is shown.
 *
 * The query lives in the URL as ?q= so a search can be shared, bookmarked and
 * linked to (e.g. "Search species" from a dossier with no taxon record). The
 * address is replaced while the visitor types; submitting (Enter, or a
 * suggestion) commits the current entry, so the next edit starts a new history
 * entry and Back returns to the committed search. The query is bounded plain
 * text: it is rendered as text and sent URL-encoded, never as markup. Invisible
 * format characters (bidirectional overrides and the like) are stripped from
 * the URL and from typing, and every echo of the query sits in a <bdi> so the
 * visitor's text can never change the direction of the copy around it.
 */

const SUGGESTIONS = [
  'Dracula',
  'Bulbophyllum',
  'Cypripedium',
  'Vanilla',
  'Paphiopedilum',
  'Stanhopea',
];

const Species: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  // Only a bounded canonical genus may become a route-derived search/filter.
  const genusFilter = resolveSpeciesGenusFilter(searchParams.get('genus'));
  // An explicit ?q= is bounded plain text and wins over the genus filter.
  const urlQueryParam = resolveSpeciesQueryParam(searchParams.get('q'));
  const routeQuery = urlQueryParam || genusFilter;
  const [query, setQuery] = useState(() => urlQueryParam || genusFilter);
  const [results, setResults] = useState<SpeciesSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  // A search the service did not answer (unreachable, timed out, non-2xx) is
  // not "no species matched". It gets its own state and a retry.
  const [unavailable, setUnavailable] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const ctrlRef = useRef<AbortController | null>(null);
  // The route query this page last wrote to, or adopted from, the address bar.
  const routeQueryRef = useRef(routeQuery);
  // Whether the current history entry holds a committed search (submitted, or
  // arrived at through a ?q= link). The next edit then pushes a new entry
  // instead of overwriting it, so Back returns to that search.
  const entryCommittedRef = useRef(Boolean(urlQueryParam));

  // Keep the search box aligned with browser/history navigation and in-app
  // links. The page's own writes are recognised and skipped, so typing is
  // never overwritten by its normalised echo. A newly arrived route query owns
  // the box. If navigation removes the route query, clear the box only when it
  // still holds that route-owned query; never erase an independent search.
  useEffect(() => {
    const previousRouteQuery = routeQueryRef.current;
    if (routeQuery === previousRouteQuery) return;
    routeQueryRef.current = routeQuery;
    entryCommittedRef.current = Boolean(urlQueryParam);
    setQuery((currentQuery) =>
      speciesQueryAfterRouteQueryChange(previousRouteQuery, routeQuery, currentQuery),
    );
  }, [routeQuery, urlQueryParam]);

  // An arriving ?q= is normalised in place (bounded, trimmed), and a genus
  // filter that does not describe it is dropped so the chip never claims a
  // filter the search is not applying.
  useEffect(() => {
    if (!searchParams.has('q')) return;
    const normalised = speciesSearchParamsForQuery(searchParams, speciesRouteQuery(searchParams));
    if (normalised.toString() !== searchParams.toString()) {
      routeQueryRef.current = speciesRouteQuery(normalised);
      setSearchParams(normalised, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const applyQueryToRoute = (nextQuery: string, { commit }: { commit: boolean }) => {
    const nextParams = speciesSearchParamsForQuery(searchParams, nextQuery);
    if (nextParams.toString() === searchParams.toString()) {
      if (commit) entryCommittedRef.current = true;
      return;
    }
    const push = commit || entryCommittedRef.current;
    entryCommittedRef.current = commit;
    routeQueryRef.current = speciesRouteQuery(nextParams);
    setSearchParams(nextParams, { replace: !push });
  };

  const clearGenusFilter = () => {
    applyQueryToRoute('', { commit: false });
    setQuery('');
  };

  const handleQueryChange = (nextQuery: string, { commit = false }: { commit?: boolean } = {}) => {
    // The route-derived genus chip describes the query that produced the
    // results. If the visitor changes subjects, the route drops that genus at
    // the same moment (speciesSearchParamsForQuery) so the UI never claims
    // "Filtering by Phalaenopsis" while the backend is actually searching
    // Dracula (or any other free-text subject).
    // Invisible format characters (e.g. a pasted right-to-left override) are
    // dropped as they arrive; spacing is left alone so typing is not disturbed.
    const typed = stripSpeciesQueryFormatCharacters(nextQuery);
    applyQueryToRoute(typed, { commit });
    setQuery(typed);
  };

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    applyQueryToRoute(query, { commit: true });
  };

  // Debounced live search, keyed on the normalised term: an edit that does not
  // change what would be searched (e.g. trailing whitespace) starts no search.
  const searchTerm = resolveSpeciesQueryParam(query);
  useEffect(() => {
    const q = searchTerm;
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setUnavailable(false);
      return;
    }
    const t = setTimeout(() => {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setLoading(true);
      searchSpeciesOutcome(q, 20, ctrl.signal)
        .then((outcome) => {
          // A search superseded by a newer query says nothing about either.
          if (ctrl.signal.aborted) return;
          setResults(outcome.status === 'ok' ? outcome.results : []);
          setUnavailable(outcome.status === 'unavailable');
          setSearched(true);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, 350);
    return () => clearTimeout(t);
  }, [searchTerm, retryNonce]);

  const heading = useMemo(() => {
    if (!searched) return null;
    if (loading) return 'Searching…';
    if (unavailable) return 'Search unavailable';
    return `${results.length} ${results.length === 1 ? 'result' : 'results'}`;
  }, [searched, loading, unavailable, results.length]);

  return (
    <div
      className="min-h-screen bg-[#04050d] text-[#f5f0e8]"
      style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
    >
      <style>{`
        .font-display { font-family: 'Playfair Display','Cormorant Garamond',Georgia,serif; }
        .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
      `}</style>
      <Navbar />

      <main className="pt-28 pb-20">
        <section className="max-w-[1100px] mx-auto px-6 lg:px-10">
          <div className="font-mono text-[10px] tracking-[0.36em] uppercase text-[#c9a24a]/85 mb-3">
            Species Dossiers
          </div>
          <h1
            className="font-display leading-[0.95] tracking-[-0.012em]"
            style={{ fontSize: 'clamp(2rem, 4.5vw, 3.4rem)' }}
          >
            Search the <span className="italic text-[#c9a24a]">orchid flora</span>
          </h1>
          <p className="mt-4 max-w-2xl text-[14px] text-[#cfc8b8]/80 leading-relaxed">
            Query taxonomy, conservation status, and ecological context across
            the Orchid Continuum species database.
          </p>

          <form role="search" onSubmit={submitSearch} className="mt-8 relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-[#c9a24a]" />
            <input
              type="text"
              name="q"
              aria-label="Search orchid species"
              enterKeyHint="search"
              maxLength={SPECIES_QUERY_MAX_LENGTH}
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search 30,000 orchid species..."
              className="w-full pl-14 pr-5 py-4 rounded-full bg-[#0a0d1c]/70 border border-white/[0.1] focus:border-[#c9a24a]/60 outline-none font-body text-[15px] text-[#faf7f2] placeholder:text-[#7a7466]"
            />
            {loading && (
              <Loader2 className="absolute right-5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#c9a24a] animate-spin" />
            )}
          </form>

          {genusFilter && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#7a7466]">
                Filtering by
              </span>
              <span className="inline-flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-full border border-[#c9a24a]/50 bg-[#c9a24a]/[0.1]">
                <Link
                  to={`/genus/${encodeURIComponent(genusFilter)}`}
                  className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#c9a24a] hover:underline"
                >
                  Genus: <bdi>{genusFilter}</bdi>
                </Link>
                <button
                  type="button"
                  onClick={clearGenusFilter}
                  aria-label="Clear genus filter"
                  className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[#c9a24a] hover:bg-[#c9a24a]/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </div>
          )}

          {!searched && !genusFilter && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#7a7466]">
                Try
              </span>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleQueryChange(s, { commit: true })}
                  className="px-3 py-1 rounded-full border border-white/10 hover:border-[#c9a24a]/50 font-mono text-[10px] tracking-[0.14em] uppercase text-[#cfc8b8]/75 hover:text-[#faf7f2]"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {heading && (
            <div className="mt-10 font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a]">
              {heading}
            </div>
          )}

          {searched && !loading && unavailable && (
            <div
              role="status"
              data-testid="species-search-unavailable"
              className="mt-6 rounded-2xl border border-amber-300/30 bg-amber-300/[0.05] p-8 text-center"
            >
              <p className="font-display text-xl text-[#faf7f2]">
                Species search is temporarily unavailable
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-[#cfc8b8]/80 [overflow-wrap:anywhere]">
                The species service could not be reached, so no results can be shown for
                &ldquo;<bdi>{searchTerm}</bdi>&rdquo;. This is not a statement that no species matched.
              </p>
              <button
                type="button"
                onClick={() => setRetryNonce((n) => n + 1)}
                className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#c9a24a]/50 font-mono text-[10px] tracking-[0.18em] uppercase text-[#c9a24a] hover:bg-[#c9a24a]/10"
              >
                <RotateCcw className="h-3 w-3" /> Try again
              </button>
            </div>
          )}

          {searched && !loading && !unavailable && results.length === 0 && (
            <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-8 text-center font-mono text-[10px] tracking-[0.22em] uppercase text-[#7a7466] [overflow-wrap:anywhere]">
              No species matched &ldquo;<bdi>{searchTerm}</bdi>&rdquo; · try another term
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {results.map((r) => {
              const name = r.canonical_name || r.scientific_name || r.taxonomy_id;
              // taxonomy_id is the public API's id, not a Calyx taxon id; the name
              // lets the dossier page confirm it shows this species' evidence.
              const href = speciesPageHref(r.taxonomy_id, r.canonical_name || r.scientific_name);
              return (
                <Link
                  key={r.taxonomy_id}
                  to={href}
                  className="group rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 hover:border-[#c9a24a]/50 transition-colors p-6 flex flex-col"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-display italic text-xl text-[#faf7f2] leading-tight truncate">
                        {name}
                      </div>
                      <div className="mt-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-[#7a7466]">
                        {[r.genus, r.family].filter(Boolean).join(' · ') || 'Orchidaceae'}
                      </div>
                    </div>
                    <Leaf className="h-4 w-4 text-[#c9a24a]/60 shrink-0 mt-1" />
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    {r.conservation_status ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#c9a24a]/40 bg-[#c9a24a]/[0.08] font-mono text-[9px] tracking-[0.16em] uppercase text-[#c9a24a]">
                        <ShieldAlert className="h-3 w-3" />
                        {r.conservation_status}
                      </span>
                    ) : (
                      <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-[#7a7466]">
                        Status not assessed
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 font-mono text-[9px] tracking-[0.18em] uppercase text-[#cfc8b8]/60 group-hover:text-[#c9a24a]">
                      Dossier <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Species;
