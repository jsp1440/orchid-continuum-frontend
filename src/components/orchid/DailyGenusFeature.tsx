import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Leaf,
  Mountain,
  MapPin,
  Camera,
  ShieldQuestion,
  Bug,
  Flower2,
  CalendarRange,
} from 'lucide-react';
import {
  fetchGenusSpecies,
  fetchValidatedSpecies,
  fetchSpeciesEcology,
  fetchGenusImagesWithSource,
  buildImageMap,
  binomialOf,
  buildValidatedSet,
  isValidatedName,
  lookupGenus,
  conservationBadge,
  placeToFlag,
  warmBackends,
  type GenusEntry,
  type GenusImage,
  type ImageSource,
  type SpeciesPhoto,
  type SpeciesPlate,
  type SpeciesEcology,
} from '@/lib/genusData';
import {
  featuredGenusEntry,
  fetchFeaturedNarrative,
} from '@/lib/featuredGenus';
import { setBackendStatus } from '@/lib/backendStatus';
import FallbackImage from '@/components/orchid/FallbackImage';
import ImageSourceIndicator from '@/components/orchid/ImageSourceIndicator';
import { filterRankUrls, bestUrlScore, scoreImage, MIN_GALLERY_SCORE } from '@/lib/imageQuality';



/**
 * DailyGenusFeature — the "Genus of the Day" panel.
 *
 *   LEFT (40%):  one tall (4:5) hero image + a rich caption panel below it.
 *   RIGHT (60%): exactly a 3x3 grid of species cells. Clicking a cell promotes
 *                it to the hero (crossfade).
 *
 * IMAGE LOADING & ROTATION CONTRACT:
 *   • Every image uses {@link FallbackImage}: if a URL is broken it silently
 *     advances to the next candidate URL for that species before ever showing
 *     the "Image pending" placeholder.
 *   • The grid does NOT begin rotating until ALL nine slots have fully settled
 *     (loaded or exhausted their fallbacks).
 *   • Once everything is loaded, each image stays visible for at least
 *     {@link MIN_VISIBLE_MS} (3 minutes) before becoming eligible for swap.
 *   • Replacements happen strictly one-at-a-time: a new image must finish
 *     loading before the next slot is allowed to begin its replacement, so no
 *     two slots ever swap simultaneously.
 *
 * We NEVER fetch from iNaturalist/GBIF directly, and never show non-orchid
 * content. Caption fields with no data are omitted entirely.
 */

/** Minimum time (ms) an image must stay visible before it can be replaced. */
const MIN_VISIBLE_MS = 3 * 60 * 1000; // 3 minutes
/** How often the rotation engine re-evaluates eligibility. */
const ROTATION_TICK_MS = 5000;

/** A unified grid/hero slot — a confirmed orchid that may not yet have a photo. */
interface Slot {
  species: string;
  /** Primary image URL (first candidate) — kept for "has any photo" checks. */
  image?: string;
  /** All candidate image URLs in priority order, for fallback loading. */
  images: string[];
  commonName?: string;
  place?: string;
  conservation?: string;
  photographer?: string;
  /** Attribution from the trusted image library (/images/genus). */
  imageSource?: string;
  imageLicense?: string;
}

type GenusImageUrlField =
  | 'image_url'
  | 'original_url'
  | 'media_url'
  | 'url'
  | 'image'
  | 'photo_url'
  | 'medium_url';

const GENUS_IMAGE_URL_FIELDS: GenusImageUrlField[] = [
  'image_url',
  'original_url',
  'media_url',
  'url',
  'image',
  'photo_url',
  'medium_url',
];

const TRUSTED_BLOCKED_URL_RE =
  /(herbari|preserved[\s_-]*specimen|dried[\s_-]*specimen|pressed[\s_-]*specimen|type[\s_-]*specimen|\bspecimen\b|holotype|isotype|lectotype|syntype|neotype|paratype|voucher|exsiccat|exsiccatae|\bsheet\b|barcode|accession|catalog[\s_-]*number|collection[\s_-]*number|determination[\s_-]*label|specimen[\s_-]*label|herbarium[\s_-]*label|gbif\.org\/occurrence|jstor\.org\/? .*plant|plants\.jstor|sweetgum\.nybg|sernecportal|swbiodiversity|biocase|mediaphoto\.mnhn|mnhn\.fr|\/herbarium\/|herbcat|catalogue.*specimen|\/specimen|\/voucher|\/barcode|idigbio|reflora|specieslink|virtualherbarium|biodiversitylibrary\.org|archive\.org\/(stream|page|download)|botanicus\.org|gallica\.bnf\.fr|\/plates?\/|\/figures?\/|\/illustrations?\/|\/drawings?\/|\/lineart\/|recolnat\.org|jacq\.org|cvh\.ac\.cn|nhm\.ac\.uk\/.*image|mobot\.org|tropicos\.org\/.*image|digitarium|ala\.org\.au\/.*occurrence|herbariovirtual|\.pdf(\?|#|$)|\.(tif|tiff|djvu|doc|docx|txt|csv)(\?|#|$))/i;

function addCandidate(arr: string[], value: unknown) {
  if (typeof value !== 'string') return;
  const url = value.trim();
  if (url && !arr.includes(url)) arr.push(url);
}

function trustedGenusImageUrls(trusted?: GenusImage): string[] {
  const arr: string[] = [];
  const record = trusted as Record<string, unknown> | undefined;
  if (!record) return arr;

  const imageUrls = record.image_urls;
  if (Array.isArray(imageUrls)) {
    for (const url of imageUrls) addCandidate(arr, url);
  }

  for (const field of GENUS_IMAGE_URL_FIELDS) addCandidate(arr, record[field]);
  return arr;
}

function isObviousNonGalleryUrl(url: string): boolean {
  return TRUSTED_BLOCKED_URL_RE.test(url);
}

/**
 * Build a prioritised candidate-URL list from a trusted image + legacy photo.
 * Trusted GenusImage records from /images/genus have already passed the Orchid
 * Continuum backend gate, so unknown-but-clean backend URLs are allowed through
 * instead of being discarded solely because their URL has no positive keywords.
 * The homepage still hard-rejects herbarium/specimen/document/plate material.
 */
function candidateUrls(
  matchImage?: string,
  trusted?: GenusImage,
  name?: string,
): string[] {
  const shared = {
    source: trusted?.image_source,
    license: trusted?.image_license,
    name: name ?? trusted?.scientific_name,
  };

  const trustedUrls = trustedGenusImageUrls(trusted)
    .filter((u) => !isObviousNonGalleryUrl(u));
  const trustedRanked = trustedUrls
    .map((u, i) => ({ u, i, s: scoreImage(u, shared) }))
    .filter((x) => x.s >= MIN_GALLERY_SCORE || x.s === 0)
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
    .map((x) => x.u);

  const legacyUrls = matchImage && !trustedRanked.includes(matchImage)
    ? filterRankUrls([matchImage], shared)
    : [];

  return [...trustedRanked, ...legacyUrls];
}


const StatusBadge: React.FC<{ status?: string; size?: 'sm' | 'md' }> = ({ status, size = 'sm' }) => {
  if (!status) return null;
  const b = conservationBadge(status);
  return (
    <span
      className={`inline-flex items-center justify-center rounded font-mono font-semibold ${
        size === 'md' ? 'px-2 py-0.5 text-[10px]' : 'px-1.5 py-px text-[9px]'
      }`}
      style={{ background: b.bg, color: b.color }}
      title={status}
    >
      {b.code}
    </span>
  );
};

const UnverifiedBadge: React.FC = () => (
  <span
    className="absolute top-1.5 left-1.5 z-10 inline-flex items-center gap-1 rounded bg-[#10160d]/75 px-1.5 py-0.5 font-mono text-[8px] tracking-[0.12em] uppercase text-[#f0c460] backdrop-blur-sm"
    title="Not yet confirmed against the OC taxonomic backbone"
  >
    <ShieldQuestion className="h-2.5 w-2.5" />
    Unverified
  </span>
);

/**
 * Clean "image pending" placeholder — forest green ground (#1a2e1a) with the
 * Orchid Continuum leaf logo centered and small-caps gold text. Shown whenever
 * the backend approved image library has not yet supplied a real photograph for
 * a species (or every candidate URL failed to load). We NEVER fall back to
 * AI-generated, stock, or external imagery — a blank placeholder is always
 * preferable to a fabricated image.
 */
const Placeholder: React.FC<{ label?: string; size?: 'hero' | 'cell' }> = ({ size = 'cell' }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a2e1a] text-[#C9A84C]">
    <span
      className={`inline-flex items-center justify-center rounded-full border border-[#C9A84C]/40 ${
        size === 'hero' ? 'h-16 w-16' : 'h-9 w-9'
      }`}
    >
      <Leaf className={size === 'hero' ? 'h-8 w-8' : 'h-4 w-4'} strokeWidth={1.25} />
    </span>
    <span
      className={`mt-3 px-3 text-center font-mono uppercase text-[#C9A84C] ${
        size === 'hero'
          ? 'text-[10px] tracking-[0.24em] leading-[1.7]'
          : 'text-[8px] tracking-[0.18em] leading-[1.6]'
      }`}
    >
      Image pending · Orchid
      <br />
      Continuum approved library
    </span>
  </div>
);


const SkeletonPanel: React.FC = () => (
  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
    <div className="lg:col-span-2">
      <div className="aspect-[4/5] rounded-2xl bg-[#e2dac6] animate-pulse" />
      <div className="mt-4 h-44 rounded-2xl bg-[#e2dac6] animate-pulse" />
    </div>
    <div className="lg:col-span-3 grid grid-cols-3 gap-3">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="aspect-square rounded-lg bg-[#e2dac6] animate-pulse" />
      ))}
    </div>
  </div>
);

const Fact: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({
  icon,
  label,
  value,
}) => (
  <div className="flex items-start gap-3">
    <span className="mt-0.5 text-[#5a6b3f]">{icon}</span>
    <div className="min-w-0">
      <dt className="font-mono text-[9px] tracking-[0.18em] uppercase text-[#8a8062]">{label}</dt>
      <dd className="text-[14px] text-[#3a4630] leading-snug">{value}</dd>
    </div>
  </div>
);

const DailyGenusFeature: React.FC = () => {
  const navigate = useNavigate();
  const [entry, setEntry] = useState<GenusEntry>(() => featuredGenusEntry());
  const [pool, setPool] = useState<SpeciesPhoto[]>([]);
  const [validatedNames, setValidatedNames] = useState<string[]>([]);
  const [validatedSet, setValidatedSet] = useState<Set<string>>(new Set());
  const [validationLoaded, setValidationLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [heroKey, setHeroKey] = useState<string | null>(null);
  const [cellIdx, setCellIdx] = useState<number[]>(() => [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const [ecology, setEcology] = useState<SpeciesEcology | null>(null);
  // Trusted images for the daily genus, keyed by binomial (from /images/genus).
  const [imageMap, setImageMap] = useState<Map<string, GenusImage>>(new Map());
  // Where the current genus images came from (for the source-health indicator).
  const [imageSource, setImageSource] = useState<ImageSource | null>(null);

  // ── Rotation engine state (refs so the interval reads fresh values) ──
  const loadedRef = useRef<boolean[]>(Array(9).fill(false));
  const shownAtRef = useRef<number[]>(Array(9).fill(0));
  const allLoadedRef = useRef(false);
  const replacingRef = useRef<number | null>(null);
  const rotaNextRef = useRef(9);
  const slotsCountRef = useRef(9);
  const slotsRef = useRef<Slot[]>([]);

  // 0. Warm the (cold-start-prone) Render backends the instant the panel
  //    mounts, before the user requests any genus images.
  useEffect(() => {
    warmBackends();
  }, []);

  // 1. Resolve the deterministic Genus of the Day (same 12-hour UTC window for
  //    everyone, shared with the species cards + Atlas via featuredGenus.ts).
  //    Then pull (a) an AI 2-3 sentence "what makes it remarkable" description
  //    and (b) the genus photo pool. The genus name is fixed here — never
  //    overridden by the backend's own rotation — so all four homepage elements
  //    stay perfectly in sync.
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const base = featuredGenusEntry();
    setEntry(base);
    setBackendStatus({
      source: 'live',
      genus: base.genus,
      lastPingTime: Date.now(),
      cacheWrittenAt: null,
    });

    // (a) AI-generated remarkable description (cached server-side, with a
    //     grounded local fallback). Merge it into the entry's description.
    fetchFeaturedNarrative(base, ctrl.signal).then((narrative) => {
      if (ctrl.signal.aborted || !narrative) return;
      setEntry((prev) =>
        prev.genus === base.genus ? { ...prev, description: narrative } : prev,
      );
    });

    // (b) Genus photo pool (verified orchid photos from the OC backend).
    fetchGenusSpecies(base.genus, ctrl.signal, 30)
      .then((photos) => {
        if (ctrl.signal.aborted) return;
        setPool(photos);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, []);


  // 2. Validated species backbone for the resolved genus.
  useEffect(() => {
    if (!entry.genus) return;
    const ctrl = new AbortController();
    setValidationLoaded(false);
    setValidatedNames([]);
    setValidatedSet(new Set());
    fetchValidatedSpecies(entry.genus, ctrl.signal, 60)
      .then((names) => {
        if (ctrl.signal.aborted) return;
        setValidatedNames(names);
        setValidatedSet(buildValidatedSet(names));
        setValidationLoaded(true);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setValidationLoaded(true);
      });
    return () => ctrl.abort();
  }, [entry.genus]);

  // 3. Trusted genus images from /images/genus/{genus} (v_orchid_images_trusted).
  //    We use the source-reporting variant so we can surface a small image-source
  //    health indicator (live / cache / proxy / pending) over the hero image.
  useEffect(() => {
    if (!entry.genus) return;
    const ctrl = new AbortController();
    setImageMap(new Map());
    setImageSource(null);
    fetchGenusImagesWithSource(entry.genus, ctrl.signal, 20)
      .then(({ images, source }) => {
        if (ctrl.signal.aborted) return;
        setImageMap(buildImageMap(images));
        setImageSource(source);
        if (source) {
          setBackendStatus({
            source: source.source,
            genus: entry.genus,
            lastPingTime: Date.now(),
            cacheWrittenAt: source.cached_at ?? null,
          });
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setImageSource(null);
      });
    return () => ctrl.abort();
  }, [entry.genus]);

  // Pool filtered to validated names when possible, but never blank the panel if
  // the live validation endpoint is cold/down.
  const validPool = useMemo(() => {
    if (!validationLoaded || validatedSet.size === 0) return pool;
    const filtered = pool.filter((p) => isValidatedName(p.species, validatedSet));
    return filtered.length ? filtered : pool;
  }, [pool, validatedSet, validationLoaded]);

  const seededPlates = useMemo<SpeciesPlate[]>(() => {
    // Local fallback plates are also taxonomically checked when validation has
    // loaded; if none validate, keep the static set so the panel remains alive.
    if (!validationLoaded || validatedSet.size === 0) return entry.plates;
    const filtered = entry.plates.filter((p) => isValidatedName(p.species, validatedSet));
    return filtered.length ? filtered : entry.plates;
  }, [entry.plates, validatedSet, validationLoaded]);

  const slots = useMemo<Slot[]>(() => {
    const fromApi: Slot[] = validPool.map((p) => {
      const key = p.species.toLowerCase();
      const trusted = imageMap.get(key) ?? imageMap.get(binomialOf(p.species).toLowerCase());
      const images = candidateUrls(p.image, trusted, p.species);
      return {
        species: p.species,
        image: images[0],
        images,
        commonName: p.commonName,
        place: p.place,
        conservation: p.conservation,
        photographer: p.photographer,
        imageSource: trusted?.image_source,
        imageLicense: trusted?.image_license,
      };
    });

    const apiNames = new Set(fromApi.map((p) => binomialOf(p.species).toLowerCase()));
    const fromEntry: Slot[] = seededPlates
      .filter((p) => !apiNames.has(binomialOf(p.species).toLowerCase()))
      .map((p) => {
        const key = binomialOf(p.species).toLowerCase();
        const trusted = imageMap.get(key);
        const images = candidateUrls(p.image, trusted, p.species);
        return {
          ...p,
          image: images[0],
          images,
          place: p.distribution,
          imageSource: trusted?.image_source,
          imageLicense: trusted?.image_license,
        };
      });

    const combined = [...fromApi, ...fromEntry];
    return combined.length ? combined : fromEntry;
  }, [validPool, seededPlates, imageMap]);

  useEffect(() => {
    slotsRef.current = slots;
    slotsCountRef.current = Math.max(1, slots.length);
    if (!slots.some((s) => s.species === heroKey)) {
      setHeroKey(slots[0]?.species ?? null);
    }
    setCellIdx(Array.from({ length: Math.min(9, Math.max(1, slots.length)) }, (_, i) => i));
    loadedRef.current = Array(Math.min(9, Math.max(1, slots.length))).fill(false);
    shownAtRef.current = Array(Math.min(9, Math.max(1, slots.length))).fill(0);
    allLoadedRef.current = false;
    replacingRef.current = null;
    rotaNextRef.current = Math.min(9, Math.max(1, slots.length));
  }, [slots, heroKey]);

  const hero = useMemo(() => {
    if (!slots.length) return null;
    return slots.find((p) => p.species === heroKey) ?? slots[0];
  }, [slots, heroKey]);

  const heroScore = useMemo(() => {
    if (!hero?.images?.length) return 0;
    return bestUrlScore(hero.images, {
      source: hero.imageSource,
      license: hero.imageLicense,
      name: hero.species,
    });
  }, [hero]);

  // Fetch ecology for the currently selected hero, then fall back to the genus
  // overview. Missing fields are omitted in the UI; no more "—" filler.
  useEffect(() => {
    if (!hero?.species) return;
    const ctrl = new AbortController();
    setEcology(null);
    fetchSpeciesEcology(hero.species, ctrl.signal).then((eco) => {
      if (!ctrl.signal.aborted) setEcology(eco);
    });
    return () => ctrl.abort();
  }, [hero?.species]);

  // Once every visible cell has either loaded or exhausted fallbacks, allow
  // rotation. FallbackImage calls this even on final failure, so a backend outage
  // cannot freeze the panel forever.
  const markLoaded = useCallback((idx: number) => {
    loadedRef.current[idx] = true;
    shownAtRef.current[idx] = Date.now();
    if (loadedRef.current.every(Boolean)) allLoadedRef.current = true;
    if (replacingRef.current === idx) replacingRef.current = null;
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!allLoadedRef.current || replacingRef.current !== null) return;
      const count = slotsCountRef.current;
      if (count <= 1) return;
      const now = Date.now();
      const current = cellIdx;
      const eligible = current.findIndex((_, i) => now - (shownAtRef.current[i] ?? 0) >= MIN_VISIBLE_MS);
      if (eligible < 0) return;

      const visible = new Set(current);
      let next = rotaNextRef.current % count;
      let guard = 0;
      while (visible.has(next) && guard < count + 1) {
        next = (next + 1) % count;
        guard += 1;
      }
      if (visible.has(next)) return;

      replacingRef.current = eligible;
      loadedRef.current[eligible] = false;
      allLoadedRef.current = false;
      rotaNextRef.current = (next + 1) % count;
      setCellIdx((prev) => prev.map((v, i) => (i === eligible ? next : v)));
    }, ROTATION_TICK_MS);
    return () => window.clearInterval(id);
  }, [cellIdx]);

  if (loading && !slots.length) return <SkeletonPanel />;
  if (!hero) return null;

  const heroEco = {
    habitat: ecology?.habitat || entry.ecology.habitat,
    elevation: ecology?.elevation || entry.ecology.elevation,
    pollinators: ecology?.pollinators || entry.ecology.pollinatorGuild,
    mycorrhizal: ecology?.mycorrhizal || entry.ecology.mycorrhizal,
    distribution: ecology?.distribution || hero.place || entry.regions.join(', '),
  };

  return (
    <section className="rounded-[2rem] border border-[#d9caa8] bg-[#f6f0df]/95 p-5 shadow-[0_16px_40px_rgba(30,40,20,0.12)]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.26em] uppercase text-[#8a8062]">Genus of the Day</p>
          <h2 className="font-serif text-3xl md:text-4xl text-[#24321f] italic">{entry.genus}</h2>
          <p className="mt-1 max-w-2xl text-sm text-[#5d684c]">{entry.description}</p>
        </div>
        <button
          onClick={() => navigate(`/genus/${encodeURIComponent(entry.genus)}`)}
          className="inline-flex items-center gap-2 rounded-full border border-[#c7b27a] bg-[#fff8e6] px-4 py-2 text-xs font-mono uppercase tracking-[0.18em] text-[#5b4b21] hover:bg-[#f8ecc8]"
        >
          Explore Genus <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2">
          <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-[#d7c79c] bg-[#1a2e1a] shadow-inner">
            {hero.images?.length ? (
              <FallbackImage
                urls={hero.images}
                alt={hero.species}
                className="h-full w-full object-cover"
                onSettled={() => markLoaded(0)}
                fallback={<Placeholder label={hero.species} size="hero" />}
              />
            ) : (
              <Placeholder label={hero.species} size="hero" />
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
              <p className="font-serif text-2xl italic">{hero.species}</p>
              <p className="text-xs opacity-85">{hero.place || heroEco.distribution}</p>
            </div>
            <ImageSourceIndicator source={imageSource} score={heroScore} />
          </div>

          <div className="mt-4 rounded-2xl border border-[#d9caa8] bg-[#fffaf0] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Flower2 className="h-4 w-4 text-[#8a6f2d]" />
              <h3 className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#6d5b2a]">Featured species field note</h3>
            </div>
            <dl className="grid gap-3">
              {heroEco.habitat && <Fact icon={<Leaf className="h-4 w-4" />} label="Habitat" value={heroEco.habitat} />}
              {heroEco.elevation && <Fact icon={<Mountain className="h-4 w-4" />} label="Elevation" value={heroEco.elevation} />}
              {heroEco.pollinators && <Fact icon={<Bug className="h-4 w-4" />} label="Pollinators" value={heroEco.pollinators} />}
              {heroEco.distribution && <Fact icon={<MapPin className="h-4 w-4" />} label="Distribution" value={heroEco.distribution} />}
              {hero.photographer && <Fact icon={<Camera className="h-4 w-4" />} label="Photographer" value={hero.photographer} />}
              {hero.conservation && <Fact icon={<CalendarRange className="h-4 w-4" />} label="Conservation" value={hero.conservation} />}
            </dl>
          </div>
        </div>

        <div className="lg:col-span-3 grid grid-cols-3 gap-3">
          {cellIdx.map((slotIndex, i) => {
            const s = slots[slotIndex % slots.length];
            return (
              <button
                key={`${s.species}-${slotIndex}-${i}`}
                onClick={() => setHeroKey(s.species)}
                className={`group relative aspect-square overflow-hidden rounded-xl border text-left shadow-sm transition ${
                  hero.species === s.species ? 'border-[#8a6f2d] ring-2 ring-[#c9a84c]' : 'border-[#d7c79c] hover:border-[#8a6f2d]'
                }`}
              >
                {s.images?.length ? (
                  <FallbackImage
                    urls={s.images}
                    alt={s.species}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    onSettled={() => markLoaded(i)}
                    fallback={<Placeholder label={s.species} />}
                  />
                ) : (
                  <Placeholder label={s.species} />
                )}
                {!isValidatedName(s.species, validatedSet) && validationLoaded && <UnverifiedBadge />}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2 text-white">
                  <p className="line-clamp-2 font-serif text-sm italic leading-tight">{s.species}</p>
                  {s.place && <p className="mt-0.5 truncate text-[10px] opacity-85">{placeToFlag(s.place)} {s.place}</p>}
                </div>
                {s.conservation && <div className="absolute right-1.5 top-1.5"><StatusBadge status={s.conservation} /></div>}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default DailyGenusFeature;
