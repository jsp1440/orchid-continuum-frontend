import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Leaf, Loader2, Image as ImageIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  fetchFeaturedSpecies,
  searchSpecies,
  type Species,
} from '@/lib/species';

const filters = ['All', 'Epiphytic', 'Terrestrial', 'Lithophytic'] as const;

const SpeciesGrid: React.FC = () => {
  const [filter, setFilter] = useState<(typeof filters)[number]>('All');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [species, setSpecies] = useState<Species[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unconfigured, setUnconfigured] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    const run = async () => {
      const result = debouncedQuery
        ? await searchSpecies(debouncedQuery, controller.signal)
        : await fetchFeaturedSpecies(controller.signal);
      if (controller.signal.aborted) return;
      setSpecies(result.data);
      setUnconfigured(result.unconfigured);
      setError(result.error);
      setLoading(false);
    };
    run();
    return () => controller.abort();
  }, [debouncedQuery]);

  const filtered = useMemo(() => {
    return species.filter(s => {
      if (filter === 'All') return true;
      return (s.habitat || '').toLowerCase().includes(filter.toLowerCase());
    });
  }, [filter, species]);

  return (
    <section id="species" className="relative py-28 bg-[#0d1f17] text-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
          <div>
            <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/80 mb-4">
              Species Explorer · Living catalogue
            </div>
            <h2 className="font-serif text-4xl md:text-5xl leading-tight max-w-2xl">
              The breadth of Orchidaceae,<br />
              <span className="italic text-emerald-200/90">across continents and canopies.</span>
            </h2>
            {!loading && !error && !unconfigured && species.length > 0 && (
              <div className="text-xs text-white/45 mt-3 tracking-wider uppercase">
                {filtered.length} species ·{' '}
                {debouncedQuery ? `search: "${debouncedQuery}"` : 'featured selection'}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3 md:items-end">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search genus, species, region..."
              className="w-full md:w-72 bg-white/5 border border-white/15 rounded-full px-4 py-2 text-sm placeholder:text-white/40 focus:outline-none focus:border-emerald-300/60"
            />
            <div className="flex gap-2 flex-wrap">
              {filters.map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={
                    'text-xs px-3 py-1.5 rounded-full border transition-colors ' +
                    (filter === f
                      ? 'bg-emerald-300 border-emerald-300 text-[#0d1f17]'
                      : 'border-white/20 text-white/70 hover:border-emerald-300/60 hover:text-white')
                  }
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24 text-white/60">
            <Loader2 className="h-5 w-5 animate-spin mr-3" />
            {debouncedQuery ? 'Searching the living catalogue…' : 'Loading featured species…'}
          </div>
        )}

        {!loading && unconfigured && (
          <EmptyState
            title="The living catalogue is coming online"
            body="The Orchid Continuum scientific service is not yet connected for this deployment. Featured species and search results will appear here as soon as the platform is live."
          />
        )}

        {!loading && !unconfigured && error && (
          <EmptyState
            title="Species service is refreshing"
            body={`We could not reach the species service. ${error}`}
          />
        )}

        {!loading && !error && !unconfigured && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(s => (
              <Link
                to={`/species/${encodeURIComponent(s.taxonomy_id)}`}
                key={s.id}
                className="group relative rounded-2xl overflow-hidden bg-[#142a1f] border border-white/5 hover:border-emerald-300/40 transition-all"
              >
                <div className="aspect-[4/3] overflow-hidden bg-[#0d1f17]/60 flex items-center justify-center">
                  {s.image_url ? (
                    <img
                      src={s.image_url}
                      alt={`${s.genus} ${s.epithet}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      onError={e => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-white/30 text-xs tracking-wider uppercase">
                      <ImageIcon className="h-5 w-5" />
                      Photograph pending review
                    </div>
                  )}
                </div>
                {s.conservation_status && (
                  <div className="absolute top-4 left-4 text-[10px] tracking-[0.2em] uppercase px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm border border-white/15">
                    {s.conservation_status}
                  </div>
                )}
                {s.confidence_label && (
                  <div className="absolute top-4 right-4 text-[10px] tracking-[0.2em] uppercase px-2.5 py-1 rounded-full bg-emerald-300/15 border border-emerald-300/40 text-emerald-100">
                    {s.confidence_label}
                  </div>
                )}
                <div className="p-6">
                  <div className="text-[10px] tracking-[0.25em] uppercase text-emerald-300/70 mb-2 flex items-center gap-2">
                    <Leaf className="h-3 w-3" />
                    {s.habitat}
                  </div>
                  <h3 className="font-serif text-xl">
                    <span>{s.genus}</span>{' '}
                    <span className="italic text-white/80">{s.epithet}</span>
                  </h3>
                  {s.common_name && (
                    <div className="text-xs text-white/50 mt-0.5">{s.common_name}</div>
                  )}
                  {s.region && (
                    <div className="flex items-center gap-1.5 text-xs text-white/55 mt-3">
                      <MapPin className="h-3 w-3" />
                      {s.region}
                    </div>
                  )}
                  <div className="mt-5 flex items-center gap-3 text-[10px] tracking-[0.2em] uppercase text-white/45">
                    {s.knowledge_label && <span>knowledge: {s.knowledge_label}</span>}
                    {s.family && <span>{s.family}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {!loading && !error && !unconfigured && filtered.length === 0 && (
          <EmptyState
            title={debouncedQuery ? 'No matching species' : 'No featured species yet'}
            body={
              debouncedQuery
                ? `No species in the living catalogue match "${debouncedQuery}". Try a genus name (e.g. Bulbophyllum, Dracula, Angraecum) or a country.`
                : 'No featured species have been published yet. Check back as the curatorial team adds new entries.'
            }
          />
        )}
      </div>
    </section>
  );
};

const EmptyState: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div className="rounded-2xl border border-white/10 bg-[#142a1f] px-8 py-14 text-center">
    <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/70 mb-3">
      Honest about what we know
    </div>
    <div className="font-serif text-2xl text-white mb-3">{title}</div>
    <p className="text-sm text-white/60 max-w-xl mx-auto leading-relaxed">{body}</p>
  </div>
);

export default SpeciesGrid;
