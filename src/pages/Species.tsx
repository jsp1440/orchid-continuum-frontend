import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Loader2, Leaf, ShieldAlert, ArrowRight, X } from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import { searchSpecies, type SpeciesSearchResult } from '@/lib/ocBackend';

/**
 * Species — orchid species dossiers search.
 *
 * Search the live Orchid Continuum backend across ~30,000 species and open a
 * dossier for any result. Dark-olive / cream journal aesthetic.
 *
 * If the page is opened with ?genus=Cattleya (e.g. from the homepage
 * "Explore this genus" button), the list is filtered to that genus on first
 * render and an active filter chip is shown.
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
  // Read the genus filter synchronously so there is no flash of unfiltered content.
  const genusFilter = searchParams.get('genus')?.trim() || '';
  const [query, setQuery] = useState(() => genusFilter);
  const [results, setResults] = useState<SpeciesSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const ctrlRef = useRef<AbortController | null>(null);

  // Keep the search box in sync when the genus filter changes via URL.
  useEffect(() => {
    if (genusFilter) setQuery(genusFilter);
  }, [genusFilter]);

  const clearGenusFilter = () => {
    searchParams.delete('genus');
    setSearchParams(searchParams, { replace: true });
    setQuery('');
  };


  // Debounced live search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    const t = setTimeout(() => {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setLoading(true);
      searchSpecies(q, 20, ctrl.signal)
        .then((r) => {
          setResults(r);
          setSearched(true);
        })
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const heading = useMemo(() => {
    if (!searched) return null;
    if (loading) return 'Searching…';
    return `${results.length} ${results.length === 1 ? 'result' : 'results'}`;
  }, [searched, loading, results.length]);

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

          {/* Search bar */}
          <div className="mt-8 relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-[#c9a24a]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search 30,000 orchid species..."
              className="w-full pl-14 pr-5 py-4 rounded-full bg-[#0a0d1c]/70 border border-white/[0.1] focus:border-[#c9a24a]/60 outline-none font-body text-[15px] text-[#faf7f2] placeholder:text-[#7a7466]"
            />
            {loading && (
              <Loader2 className="absolute right-5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#c9a24a] animate-spin" />
            )}
          </div>

          {/* Active genus filter chip */}
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
                  Genus: {genusFilter}
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


          {/* Suggestions */}
          {!searched && !genusFilter && (

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#7a7466]">
                Try
              </span>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setQuery(s)}
                  className="px-3 py-1 rounded-full border border-white/10 hover:border-[#c9a24a]/50 font-mono text-[10px] tracking-[0.14em] uppercase text-[#cfc8b8]/75 hover:text-[#faf7f2]"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Results */}
          {heading && (
            <div className="mt-10 font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a]">
              {heading}
            </div>
          )}

          {searched && !loading && results.length === 0 && (
            <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-8 text-center font-mono text-[10px] tracking-[0.22em] uppercase text-[#7a7466]">
              No species matched &ldquo;{query}&rdquo; · try another term
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {results.map((r) => {
              const name = r.canonical_name || r.scientific_name || r.taxonomy_id;
              return (
                <Link
                  key={r.taxonomy_id}
                  to={`/species/${encodeURIComponent(r.taxonomy_id)}`}
                  className="group rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 hover:border-[#c9a24a]/50 transition-colors p-6 flex flex-col"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-display italic text-xl text-[#faf7f2] leading-tight truncate">
                        {name}
                      </div>
                      <div className="mt-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-[#7a7466]">
                        {[r.genus, r.family].filter(Boolean).join(' · ') ||
                          'Orchidaceae'}
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
