import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bug,
  Leaf,
  MapPin,
  Search,
  ShieldAlert,
  Star,
  Trees,
} from 'lucide-react';
import { conservationBadge, binomialOf } from '@/lib/genusData';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import {
  getFeaturedSpeciesCached,
  getNeighborOrchidsCached,
  isFavorite,
  toggleFavorite,
  subscribeFavorites,
  type FeaturedSpecies,
} from '@/lib/speciesFeature';

/**
 * SpeciesInFocus — homepage species section.
 *
 * TAXONOMY CONTRACT:
 * This component must only render full species binomials such as
 * "Oncidium sotoanum". It must not treat a bare epithet like "sotoanum" as a
 * species identity, because epithets can repeat across genera. Species loading is
 * delegated to speciesFeature.ts, which normalizes backend rows to full binomials
 * from accepted scientific_name OR genus + species/specific_epithet fields.
 */

const TARGET_COUNT = 6;

const GENUS_SUGGESTIONS = [
  'Cattleya',
  'Dendrobium',
  'Phalaenopsis',
  'Paphiopedilum',
  'Oncidium',
  'Masdevallia',
  'Dracula',
  'Bulbophyllum',
  'Vanda',
  'Cymbidium',
  'Pleurothallis',
  'Maxillaria',
  'Epidendrum',
  'Catasetum',
  'Vanilla',
];

const useIsFavorite = (name: string) =>
  useSyncExternalStore(
    subscribeFavorites,
    () => isFavorite(name),
    () => false,
  );

function normalizeGenus(raw: string): string {
  const g = raw.trim();
  if (!g) return '';
  return g.charAt(0).toUpperCase() + g.slice(1);
}

function isFullBinomial(name: string): boolean {
  return /^[A-Z][A-Za-z-]+\s+[a-z][a-z-]+/.test(name.trim());
}

function cardKey(species: FeaturedSpecies): string {
  return (binomialOf(species.name) || species.name).toLowerCase();
}

const SpeciesInFocus: React.FC = () => {
  const { genus: dailyGenus } = useDailyGenus();
  const [genus, setGenus] = useState(() => normalizeGenus(dailyGenus));
  const [query, setQuery] = useState(() => normalizeGenus(dailyGenus));
  const [species, setSpecies] = useState<FeaturedSpecies[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const next = normalizeGenus(dailyGenus);
    setGenus(next);
    setQuery(next);
  }, [dailyGenus]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setFailed(false);
    setSpecies([]);

    // Primary source: different-genus orchids that geographically co-occur with
    // this genus ("no orchid exists alone"). When no neighbours are available
    // (honest empty), fall back to featured same-genus species.
    getNeighborOrchidsCached(genus, TARGET_COUNT, ctrl.signal)
      .then((neighbors) => {
        if (ctrl.signal.aborted) return [] as FeaturedSpecies[];
        if (neighbors.length > 0) return neighbors;
        return getFeaturedSpeciesCached(TARGET_COUNT, ctrl.signal, genus);
      })
      .then((rows) => {
        if (ctrl.signal.aborted) return;

        // Final UI guard: never render bare species epithets even if a backend
        // endpoint regresses. The loader should already enforce this, but the
        // component keeps the contract explicit.
        const safe: FeaturedSpecies[] = [];
        const seen = new Set<string>();
        for (const row of rows) {
          if (!row?.name || !isFullBinomial(row.name)) continue;
          const key = cardKey(row);
          if (seen.has(key)) continue;
          seen.add(key);
          safe.push(row);
          if (safe.length >= TARGET_COUNT) break;
        }

        setSpecies(safe);
        setFailed(safe.length === 0);
        setLoading(false);
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setFailed(true);
        setLoading(false);
      });

    return () => ctrl.abort();
  }, [genus]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const next = normalizeGenus(query);
    if (next && next.toLowerCase() !== genus.toLowerCase()) {
      setGenus(next);
    }
  };

  return (
    <section
      id="species-in-focus"
      className="relative bg-[#1a2e1a] text-[#f5f0e8] border-b border-white/[0.06] overflow-hidden"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 80% 10%, rgba(120,90,40,0.14) 0%, transparent 55%),' +
            'radial-gradient(ellipse at 10% 90%, rgba(54,102,72,0.22) 0%, transparent 55%)',
        }}
      />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 py-20 lg:py-28">
        <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.32em] uppercase text-[#C9A84C]">
          <span className="inline-block w-8 h-px bg-[#C9A84C]/60" />
          Species in Focus · From the Continuum
        </div>

        <h2
          className="mt-8 text-[#faf7f2] leading-[1.07] max-w-3xl"
          style={{
            fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
            fontSize: 'clamp(1.9rem, 3.6vw, 3rem)',
            fontWeight: 500,
          }}
        >
          No orchid exists alone —{' '}
          <span className="italic text-[#C9A84C]">meet their species</span>.
        </h2>

        <form onSubmit={handleSearch} className="mt-8 flex flex-wrap items-center gap-3">
          <label className="font-mono text-[10px] tracking-[0.24em] uppercase text-[#cfc8b8]/70">
            Browse genus
          </label>
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#C9A84C]" />
            <input
              type="text"
              list="oc-genus-suggestions"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Cattleya, Dendrobium…"
              className="w-full rounded-full bg-[#0f1c10] border border-[#C9A84C]/30 pl-9 pr-4 py-2.5 text-[#faf7f2] text-sm placeholder:text-[#7a7466] focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/50"
            />
            <datalist id="oc-genus-suggestions">
              {GENUS_SUGGESTIONS.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#C9A84C] text-[#14281c] hover:bg-[#e6c763] transition-colors font-mono text-[10px] tracking-[0.2em] uppercase"
          >
            Show species
          </button>
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#7a7466]">
            Now viewing · <span className="italic text-[#C9A84C]">{genus}</span>
          </span>
        </form>

        <div className="mt-10">
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: TARGET_COUNT }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : failed ? (
            <EmptyGenus genus={genus} />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {species.map((s, i) => (
                <SpeciesCard key={cardKey(s)} data={s} eager={i < 3} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

const ImagePending: React.FC<{ genus?: string }> = ({ genus }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a2e1a] text-[#C9A84C] px-4 text-center">
    <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#C9A84C]/40">
      <Leaf className="h-6 w-6" strokeWidth={1.25} />
    </span>
    {genus && (
      <span
        className="mt-4 italic text-[#C9A84C] leading-tight"
        style={{
          fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
          fontSize: 'clamp(1.05rem, 1.8vw, 1.45rem)',
        }}
      >
        {genus}
      </span>
    )}
    <span className="mt-2 font-mono text-[10px] tracking-[0.26em] uppercase text-[#C9A84C]">
      Photo Coming Soon
    </span>
  </div>
);

const CardImage: React.FC<{ src?: string; alt: string; genus?: string; eager?: boolean }> = ({ src, alt, genus, eager }) => {
  const [errored, setErrored] = useState(false);
  useEffect(() => setErrored(false), [src]);
  return (
    <div className="absolute inset-0">
      {src && !errored ? (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          // @ts-expect-error fetchpriority is a valid DOM attribute not yet in this React typings version
          fetchpriority={eager ? 'high' : 'auto'}
          decoding="async"
          onError={() => setErrored(true)}
          className="absolute inset-0 h-full w-full object-cover transition-all duration-[1200ms] ease-in-out group-hover:scale-105"
        />
      ) : (
        <ImagePending genus={genus} />
      )}
    </div>
  );
};

const SpeciesCard: React.FC<{ data: FeaturedSpecies; eager?: boolean }> = ({ data, eager }) => {
  const navigate = useNavigate();
  const favorited = useIsFavorite(data.name);
  const badge = data.conservation ? conservationBadge(data.conservation) : null;
  const speciesHref = `/species/${encodeURIComponent(data.name)}`;
  const atlasHref = `/atlas?species=${encodeURIComponent(data.name)}`;
  const ecoNote = data.habitat || data.pollinator || data.climate;

  return (
    <div className="group flex flex-col h-full rounded-2xl border border-[#C9A84C]/20 bg-[#16271a] overflow-hidden transition-colors hover:border-[#C9A84C]/45">
      <div className="relative w-full aspect-[16/10] overflow-hidden bg-[#1a2e1a]">
        <button
          type="button"
          onClick={() => navigate(speciesHref)}
          className="absolute inset-0 block w-full h-full"
          aria-label={`View ${data.name}`}
        >
          <CardImage src={data.image} alt={data.name} genus={data.genus} eager={eager} />
          <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#16271a] to-transparent pointer-events-none" />
        </button>

        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-md bg-[#0d2535]/85 backdrop-blur px-2.5 py-1 font-mono text-[9px] tracking-[0.26em] uppercase text-[#C9A84C] border border-[#C9A84C]/40 pointer-events-none">
          <Leaf className="h-3 w-3" />
          Species
        </span>

        <button
          type="button"
          onClick={() => toggleFavorite(data.name)}
          aria-pressed={favorited}
          aria-label={favorited ? `Remove ${data.name} from favorites` : `Save ${data.name} to favorites`}
          title={favorited ? 'Saved to favorites' : 'Save to favorites'}
          className={`absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur transition-colors ${
            favorited
              ? 'bg-[#C9A84C] border-[#C9A84C] text-[#14281c]'
              : 'bg-[#0d2535]/80 border-[#C9A84C]/40 text-[#C9A84C] hover:bg-[#0d2535]'
          }`}
        >
          <Star className="h-4 w-4" fill={favorited ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="flex flex-col flex-1 p-7">
        <button
          type="button"
          onClick={() => navigate(speciesHref)}
          className="text-left italic text-[#faf7f2] leading-tight hover:text-[#C9A84C] transition-colors"
          style={{
            fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
            fontSize: 'clamp(1.4rem, 2.2vw, 1.9rem)',
          }}
        >
          {data.name}
        </button>

        <div className="mt-2 font-mono text-[10px] tracking-[0.22em] uppercase text-[#7a7466]">
          {[data.genus, data.family].filter(Boolean).join(' · ') || 'Orchidaceae'}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {data.distribution && (
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase text-[#cfc8b8]/80">
              <MapPin className="h-3.5 w-3.5 text-[#C9A84C]" />
              {data.distribution}
            </span>
          )}
          {badge && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-flex items-center justify-center rounded-md px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] font-semibold"
                style={{ background: badge.bg, color: badge.color }}
              >
                {badge.code}
              </span>
              <span className="flex items-center gap-1 font-mono text-[10px] tracking-[0.14em] uppercase text-[#cfc8b8]/70">
                <ShieldAlert className="h-3 w-3 text-[#C9A84C]" />
                {data.conservation}
              </span>
            </span>
          )}
        </div>

        {ecoNote && (
          <p className="mt-5 flex-1 text-[#f5f0e8] text-[17px] leading-[1.75]">
            <span className="inline-flex items-center gap-1.5 mr-2 align-middle text-[#C9A84C]">
              {data.habitat ? <Trees className="h-4 w-4" /> : <Bug className="h-4 w-4" />}
            </span>
            {ecoNote}
            {data.pollinator && data.habitat ? ` Pollinated by ${data.pollinator.toLowerCase()}.` : ''}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate(speciesHref)}
            className="group/btn inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#C9A84C] text-[#14281c] hover:bg-[#e6c763] transition-colors font-mono text-[10px] tracking-[0.2em] uppercase"
          >
            Species card
            <ArrowRight className="h-3.5 w-3.5 group-hover/btn:translate-x-1 transition-transform" />
          </button>
          <Link
            to={atlasHref}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-[#C9A84C]/40 text-[#faf7f2] hover:bg-[#C9A84C]/10 hover:border-[#C9A84C] transition-colors font-mono text-[10px] tracking-[0.2em] uppercase"
          >
            View in atlas
          </Link>
        </div>
      </div>
    </div>
  );
};

const SkeletonCard: React.FC = () => (
  <div className="rounded-2xl border border-white/[0.06] bg-[#16271a] overflow-hidden animate-pulse">
    <div className="aspect-[16/10] w-full bg-white/[0.06]" />
    <div className="p-7">
      <div className="h-6 w-2/3 rounded bg-white/[0.08]" />
      <div className="mt-3 h-3 w-1/3 rounded bg-white/[0.06]" />
      <div className="mt-6 h-3 w-1/2 rounded bg-white/[0.06]" />
      <div className="mt-5 h-4 w-full rounded bg-white/[0.05]" />
      <div className="mt-2 h-4 w-4/5 rounded bg-white/[0.05]" />
      <div className="mt-7 h-9 w-40 rounded-full bg-white/[0.06]" />
    </div>
  </div>
);

const EmptyGenus: React.FC<{ genus: string }> = ({ genus }) => (
  <div className="rounded-2xl border border-[#C9A84C]/15 bg-[#1a2e1a] p-16 flex flex-col items-center justify-center text-center">
    <span className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-[#C9A84C]/30 text-[#C9A84C]">
      <Leaf className="h-7 w-7" />
    </span>
    <p className="mt-5 font-mono text-[11px] tracking-[0.28em] uppercase text-[#C9A84C]">
      No taxonomy-backed binomial species available for {genus}
    </p>
    <p className="mt-2 text-[#cfc8b8]/70 text-sm">
      This section now rejects bare species epithets. Check the species search endpoint if this persists.
    </p>
  </div>
);

export default SpeciesInFocus;
