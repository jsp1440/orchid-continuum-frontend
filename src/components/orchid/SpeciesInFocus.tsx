import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useSyncExternalStore,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  MapPin,
  Leaf,
  ArrowRight,
  Bug,
  Trees,
  Search,
  Star,
} from 'lucide-react';
import {
  conservationBadge,
  fetchSpeciesInFocus,
  fetchNeighborGenera,
  fetchGenusRotationPool,
  binomialOf,
} from '@/lib/genusData';



import { useDailyGenus } from '@/lib/dailyGenusContext';

import {
  getFeaturedSpeciesCached,
  isFavorite,
  toggleFavorite,
  subscribeFavorites,
  type FeaturedSpecies,
} from '@/lib/speciesFeature';


/**
 * SpeciesInFocus — homepage section.
 *
 * Shows the featured genus's ecological NEIGHBOURS (other orchid genera that
 * share its region/habitat, discovered live from the OC occurrence Atlas), each
 * with a real iNaturalist photo + a derived ecological-relationship sentence.
 *
 * PHOTO CACHING: every photo resolved from iNaturalist is written to the shared
 * Supabase `genus_photo_cache` table, and read back FIRST on the next visit, so
 * any previously-viewed genus loads instantly (see genusData.ts).
 *
 * SLOW ROTATING CAROUSEL: a tall hero image plus a 4-card grid quietly rotate
 * every 10s. On each tick the hero crossfades (1.5s) into the top-left grid
 * card, the grid shifts left one slot, and a fresh photo from the genus's
 * rotation pool (cache → iNaturalist) loads into the freed right slot. No
 * species repeats until every photo in the pool has been shown. Rotation pauses
 * while the pointer is over the section so a user can read/click a card.
 */

const TARGET_COUNT = 4;
const ROTATE_MS = 10000;
const CROSSFADE_MS = 1500;

/** Common orchid genera offered as typeahead suggestions for the search box. */
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

/** Per-species favorite state via a stable boolean snapshot (no array churn). */
const useIsFavorite = (name: string) =>
  useSyncExternalStore(
    subscribeFavorites,
    () => isFavorite(name),
    () => false,
  );

/** Stable identity key for a card (used for dedupe + React keys). */
const cardKey = (c: FeaturedSpecies) =>
  (binomialOf(c.name) || c.name).toLowerCase();

/**
 * Curated ecological-relationship copy for known Catasetum neighbours.
 * Used to fill in (or correct) the relationship line so the requested text
 * always shows beneath the matching neighbour photo. Keyed by genus name.
 */
const RELATIONSHIP_OVERRIDES: Record<string, string> = {
  gongora:
    'Shares orchid bee pollinators — different scent chemistry attracts different bee species',
  stanhopea:
    'Same euglossine bee guild — chemical signals partition the shared pollinators',
  epidendrum:
    'Co-occurs on same trees — pollinated by butterflies and hummingbirds instead',
  sobralia:
    'Same forest floor and understory — uses bee and hummingbird pollinators',
};

/** Apply a curated relationship override for a neighbour genus, if one exists. */
const relationshipFor = (genusName: string, current?: string): string | undefined => {
  const key = (genusName || '').trim().split(/\s+/)[0].toLowerCase();
  return RELATIONSHIP_OVERRIDES[key] ?? current;
};




const SpeciesInFocus: React.FC = () => {
  // Consume the shared Genus of the Day — same genus as DailyGenusFeature,
  // ContinuumWeb, and HomeAtlas. Never call featuredGenusName() here.
  const { genus: dailyGenus } = useDailyGenus();
  const [genus, setGenus] = useState(() => dailyGenus);
  const [query, setQuery] = useState(() => dailyGenus);

  // Re-sync if the 12-hour window rotates while the page is open, or if the
  // Supabase snapshot resolves after mount (and the user hasn't searched yet).
  useEffect(() => {
    setGenus(dailyGenus);
    setQuery(dailyGenus);
  }, [dailyGenus]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [neighborMode, setNeighborMode] = useState(true);

  // ── Carousel state ──
  // `order` is the full rotation pool (neighbours first, then extra genus
  // species). `hero` is the large crossfading image; `grid` holds the 4 cards.
  const [hero, setHero] = useState<FeaturedSpecies | null>(null);
  const [grid, setGrid] = useState<FeaturedSpecies[]>([]);
  const gridRef = useRef<FeaturedSpecies[]>([]);
  const orderRef = useRef<FeaturedSpecies[]>([]);
  const cursorRef = useRef(0);
  const pausedRef = useRef(false);

  // Mirror the grid into a ref so the rotation interval can read the current
  // grid WITHOUT re-subscribing the interval on every tick.
  useEffect(() => {
    gridRef.current = grid;
  }, [grid]);

  /** Seed hero + grid from a freshly-built pool. */
  const seedCarousel = useCallback((pool: FeaturedSpecies[]) => {
    // Dedupe by binomial / genus name, preserving order (neighbours first).
    const seen = new Set<string>();
    const deduped: FeaturedSpecies[] = [];
    for (const c of pool) {
      if (!c) continue;
      const k = cardKey(c);
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(c);
    }
    orderRef.current = deduped;
    if (deduped.length === 0) {
      setHero(null);
      setGrid([]);
      return;
    }
    setHero(deduped[0]);
    const initialGrid: FeaturedSpecies[] = [];
    for (let i = 1; i <= TARGET_COUNT; i++) {
      initialGrid.push(deduped[i % deduped.length]);
    }
    setGrid(initialGrid);
    cursorRef.current = (TARGET_COUNT + 1) % deduped.length;
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setFailed(false);
    setHero(null);
    setGrid([]);
    orderRef.current = [];
    cursorRef.current = 0;

    // ── PRIMARY: NEW two-step backend flow ──
    //   1. GET /api/search?q={genus}&limit=6      → 6 species names
    //   2. GET /api/species/{name}/images?limit=1 → one image per species
    // Display those 6 species (with their images) in the grid.
    const loadSpeciesInFocus = async (): Promise<boolean> => {
      try {
        const cards = await fetchSpeciesInFocus(genus, ctrl.signal, 6);
        if (ctrl.signal.aborted) return true;
        if (cards.length === 0) return false;
        setNeighborMode(false);
        seedCarousel(cards);
        setLoading(false);
        return true;
      } catch {
        return false;
      }
    };

    // ── FALLBACK A: dynamic neighbouring genera (cache-first). ──
    const loadNeighborMode = async (): Promise<boolean> => {
      try {
        const list = await fetchNeighborGenera(genus, ctrl.signal);
        if (ctrl.signal.aborted) return true;
        if (list.length === 0) return false;
        setNeighborMode(true);
        const neighbourCards: FeaturedSpecies[] = list.map((n) => ({
          name: n.genus,
          genus: n.region,
          image: n.image,
          relationship: relationshipFor(n.genus, n.relationship),
        }));
        seedCarousel(neighbourCards);
        setLoading(false);

        // Enrich the rotation pool with the genus's own species photos.
        try {
          const pool = await fetchGenusRotationPool(genus, ctrl.signal, 12);
          if (ctrl.signal.aborted || pool.length === 0) return true;
          const speciesCards: FeaturedSpecies[] = pool.map((p) => ({
            name: p.name,
            genus: p.genus,
            family: 'Orchidaceae',
            image: p.image,
          }));
          seedCarousel([...neighbourCards, ...speciesCards]);
        } catch {
          /* keep neighbour-only carousel */
        }
        return true;
      } catch {
        return false;
      }
    };

    // ── FALLBACK B: cached species set (last resort). ──
    const loadCachedSpecies = async () => {
      try {
        const list = await getFeaturedSpeciesCached(TARGET_COUNT, ctrl.signal, genus);
        if (ctrl.signal.aborted) return;
        if (list.length === 0) {
          setFailed(true);
          setLoading(false);
          return;
        }
        setNeighborMode(false);
        seedCarousel(list);
        setLoading(false);
      } catch {
        if (ctrl.signal.aborted) return;
        setFailed(true);
        setLoading(false);
      }
    };

    // Run the resolution chain in order: species-in-focus → neighbours → cache.
    (async () => {
      if (await loadSpeciesInFocus()) return;
      if (ctrl.signal.aborted) return;
      if (await loadNeighborMode()) return;
      if (ctrl.signal.aborted) return;
      await loadCachedSpecies();
    })();

    return () => ctrl.abort();
  }, [genus, seedCarousel]);


  // ── Rotation tick ──
  // Reads/writes via refs so the interval is installed exactly once and never
  // double-advances the cursor (React StrictMode re-invokes state updaters in
  // dev, so we keep the rotation logic OUT of the setState updater).
  useEffect(() => {
    const id = window.setInterval(() => {
      if (pausedRef.current) return;
      const order = orderRef.current;
      const prevGrid = gridRef.current;
      if (order.length < 2 || prevGrid.length === 0) return;

      // Hero crossfades into the current top-left grid card.
      setHero(prevGrid[0]);
      // Grid shifts left; a fresh pool photo enters the freed right slot.
      const next = order[cursorRef.current % order.length];
      cursorRef.current = (cursorRef.current + 1) % order.length;
      const nextGrid = [...prevGrid.slice(1), next];
      gridRef.current = nextGrid;
      setGrid(nextGrid);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);



  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const next = query.trim();
    if (next && next.toLowerCase() !== genus.toLowerCase()) {
      setGenus(next.charAt(0).toUpperCase() + next.slice(1));
    }
  };

  return (
    <section
      id="species-in-focus"
      className="relative bg-[#1a2e1a] text-[#f5f0e8] border-b border-white/[0.06] overflow-hidden"
      onMouseEnter={() => {
        pausedRef.current = true;
      }}
      onMouseLeave={() => {
        pausedRef.current = false;
      }}
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
          <span className="italic text-[#C9A84C]">
            {neighborMode ? 'meet their neighbors' : 'meet four of them'}
          </span>
          .
        </h2>


        {/* Genus search / select */}
        <form
          onSubmit={handleSearch}
          className="mt-8 flex flex-wrap items-center gap-3"
        >
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
          {loading && !hero ? (
            <div className="space-y-6">
              <div className="aspect-[21/9] w-full rounded-2xl bg-white/[0.06] animate-pulse" />
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {Array.from({ length: TARGET_COUNT }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            </div>
          ) : failed && !hero ? (
            <EmptyGenus genus={genus} />
          ) : (
            <div className="space-y-6 lg:space-y-8">
              {/* Crossfading hero image */}
              {hero && <HeroImage data={hero} neighbor={!!hero.relationship} />}

              {/* Rotating 4-card grid */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {grid.map((s, i) => (
                  <SpeciesCard
                    key={`${cardKey(s)}-${i}`}
                    data={s}
                    neighbor={!!s.relationship}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Crossfading hero — double-buffered <img> layers, 1.5s opacity transition.
// ---------------------------------------------------------------------------

const HeroImage: React.FC<{ data: FeaturedSpecies; neighbor: boolean }> = ({
  data,
  neighbor,
}) => {
  const navigate = useNavigate();
  // Keep the previous image mounted underneath while the new one fades in.
  const [layers, setLayers] = useState<{ src?: string; id: number }[]>(() => [
    { src: data.image, id: 0 },
  ]);
  const lastSrc = useRef<string | undefined>(data.image);
  const idRef = useRef(0);

  useEffect(() => {
    if (data.image === lastSrc.current) return;
    lastSrc.current = data.image;
    idRef.current += 1;
    const id = idRef.current;
    // Add the new layer on top (starts transparent, fades to opaque).
    setLayers((prev) => [...prev.slice(-1), { src: data.image, id }]);
    // After the crossfade completes, drop the old layer.
    const t = window.setTimeout(() => {
      setLayers((prev) => prev.filter((l) => l.id === id));
    }, CROSSFADE_MS + 100);
    return () => window.clearTimeout(t);
  }, [data.image]);

  const href = neighbor
    ? `/genus/${encodeURIComponent(data.name)}`
    : `/species/${encodeURIComponent(data.name)}`;

  return (
    <button
      type="button"
      onClick={() => navigate(href)}
      aria-label={`View ${data.name}`}
      className="group relative block w-full aspect-[21/9] overflow-hidden rounded-2xl border border-[#C9A84C]/25 bg-[#16271a] text-left"
    >
      {layers.map((layer, idx) =>
        layer.src ? (
          <img
            key={layer.id}
            src={layer.src}
            alt={data.name}
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              opacity: idx === layers.length - 1 ? 1 : 0,
              transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
              animation:
                idx === layers.length - 1 && layers.length > 1
                  ? `oc-hero-fade ${CROSSFADE_MS}ms ease-in-out`
                  : undefined,
            }}
          />
        ) : (
          <div
            key={layer.id}
            className="absolute inset-0 flex items-center justify-center bg-[#1a2e1a] text-[#C9A84C]"
          >
            <Leaf className="h-10 w-10" strokeWidth={1.1} />
          </div>
        ),
      )}
      <style>{`@keyframes oc-hero-fade{from{opacity:0}to{opacity:1}}`}</style>

      {/* Bottom gradient + caption */}
      <span className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#0c160d] via-[#0c160d]/40 to-transparent pointer-events-none" />
      <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-md bg-[#0d2535]/85 backdrop-blur px-2.5 py-1 font-mono text-[9px] tracking-[0.26em] uppercase text-[#C9A84C] border border-[#C9A84C]/40">
        <Leaf className="h-3 w-3" />
        {neighbor ? 'Neighbor' : 'Species'} · In Focus
      </span>
      <div className="absolute bottom-5 left-5 right-5">
        <div
          className="italic text-[#faf7f2] leading-tight group-hover:text-[#C9A84C] transition-colors"
          style={{
            fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
            fontSize: 'clamp(1.7rem, 3.4vw, 2.8rem)',
          }}
        >
          {data.name}
        </div>
        <div className="mt-1.5 font-mono text-[10px] tracking-[0.22em] uppercase text-[#cfc8b8]/85">
          {[data.genus, data.family].filter(Boolean).join(' · ') || 'Orchidaceae'}
        </div>
        {neighbor && data.relationship && (
          <p className="mt-3 max-w-2xl italic text-[#C9A84C] text-[13px] leading-[1.6]">
            {data.relationship}
          </p>
        )}
      </div>
    </button>
  );
};

// ---------------------------------------------------------------------------
// Image area — real photo OR a clean "image pending" placeholder.
// ---------------------------------------------------------------------------

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

const CardImage: React.FC<{ src?: string; alt: string; genus?: string }> = ({
  src,
  alt,
  genus,
}) => {
  const [errored, setErrored] = useState(false);
  useEffect(() => setErrored(false), [src]);
  const showImage = !!src && !errored;
  return (
    <div className="absolute inset-0">
      {showImage ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setErrored(true)}
          className="absolute inset-0 h-full w-full object-cover transition-all duration-[1200ms] ease-in-out group-hover:scale-105"
          style={{ animation: `oc-card-fade ${CROSSFADE_MS}ms ease-in-out` }}
        />
      ) : (
        <ImagePending genus={genus} />
      )}
      <style>{`@keyframes oc-card-fade{from{opacity:0.25}to{opacity:1}}`}</style>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Species / neighbour card
// ---------------------------------------------------------------------------

const SpeciesCard: React.FC<{
  data: FeaturedSpecies;
  /** When true the card represents a NEIGHBOURING GENUS, not a species. */
  neighbor?: boolean;
}> = ({ data, neighbor = false }) => {
  const navigate = useNavigate();
  const favorited = useIsFavorite(data.name);
  const badge = data.conservation ? conservationBadge(data.conservation) : null;

  const ecoNote = data.habitat || data.pollinator || data.climate;
  const speciesHref = neighbor
    ? `/genus/${encodeURIComponent(data.name)}`
    : `/species/${encodeURIComponent(data.name)}`;
  const atlasHref = neighbor
    ? `/atlas?genus=${encodeURIComponent(data.name)}`
    : `/atlas?species=${encodeURIComponent(data.name)}`;

  return (
    <div className="group flex flex-col h-full rounded-2xl border border-[#C9A84C]/20 bg-[#16271a] overflow-hidden transition-colors hover:border-[#C9A84C]/45">
      <div className="relative w-full aspect-[16/10] overflow-hidden bg-[#1a2e1a]">
        <button
          type="button"
          onClick={() => navigate(speciesHref)}
          className="absolute inset-0 block w-full h-full"
          aria-label={`View ${data.name}`}
        >
          <CardImage src={data.image} alt={data.name} genus={data.genus} />
          <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#16271a] to-transparent pointer-events-none" />
        </button>

        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-md bg-[#0d2535]/85 backdrop-blur px-2.5 py-1 font-mono text-[9px] tracking-[0.26em] uppercase text-[#C9A84C] border border-[#C9A84C]/40 pointer-events-none">
          <Leaf className="h-3 w-3" />
          {neighbor ? 'Neighbor' : 'Species'}
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
        <div className="flex items-start justify-between gap-4">
          <div>
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
          </div>
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
              {data.habitat ? (
                <Trees className="h-4 w-4" />
              ) : (
                <Bug className="h-4 w-4" />
              )}
            </span>
            {ecoNote}
            {data.pollinator && data.habitat ? ` Pollinated by ${data.pollinator.toLowerCase()}.` : ''}
          </p>
        )}

        {/* ECOLOGICAL RELATIONSHIP — neighbour cards only. */}
        {neighbor && data.relationship && (
          <div className="mt-5 flex-1">
            <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.3em] uppercase text-[#C9A84C]/80">
              <span className="inline-block w-5 h-px bg-[#C9A84C]/50" />
              Ecological Relationship
            </div>
            <p className="mt-2 italic text-[#C9A84C] text-[13px] leading-[1.65]">
              {data.relationship}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate(speciesHref)}
            className="group/btn inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#C9A84C] text-[#14281c] hover:bg-[#e6c763] transition-colors font-mono text-[10px] tracking-[0.2em] uppercase"
          >
            {neighbor ? 'Genus page' : 'Species card'}
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

// ---------------------------------------------------------------------------
// Skeleton / empty states
// ---------------------------------------------------------------------------

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
      No species available for {genus}
    </p>
    <p className="mt-2 text-[#cfc8b8]/70 text-sm">
      Try another genus — e.g. Cattleya, Dendrobium, or Masdevallia.
    </p>
  </div>
);

export default SpeciesInFocus;
