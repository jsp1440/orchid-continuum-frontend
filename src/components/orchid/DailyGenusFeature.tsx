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
import { filterRankUrls, bestUrlScore } from '@/lib/imageQuality';



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

/**
 * Build a prioritised candidate-URL list from a trusted image + legacy photo,
 * then run it through the homepage image-quality curator: herbarium sheets,
 * preserved-specimen scans, type vouchers, barcoded records and non-image
 * documents (score < 60) are dropped entirely, and the survivors are returned
 * highest-scoring first (flower > whole plant > habitat > pollinator >
 * botanical illustration). The species name + source/licence are passed as
 * shared metadata so the classifier has every available signal.
 */
function candidateUrls(
  matchImage?: string,
  trusted?: GenusImage,
  name?: string,
): string[] {
  const arr: string[] = [];
  if (trusted?.image_urls?.length) {
    for (const u of trusted.image_urls) if (u && !arr.includes(u)) arr.push(u);
  } else if (trusted?.image_url) {
    arr.push(trusted.image_url);
  }
  if (matchImage && !arr.includes(matchImage)) arr.push(matchImage);
  return filterRankUrls(arr, {
    source: trusted?.image_source,
    license: trusted?.image_license,
    name: name ?? trusted?.scientific_name,
  });
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
      })
      .catch(() => {
        /* keep empty map → Image pending placeholders */
        if (!ctrl.signal.aborted) setImageSource('pending');
      });
    return () => ctrl.abort();
  }, [entry.genus]);


  // Unverified mode: backbone responded but returned nothing.
  const unverifiedMode = validationLoaded && validatedSet.size === 0;

  // Build the unified slot pool: validated species names are the source of
  // truth for what appears; real photos (legacy /photos pool + the trusted
  // /images/genus library) are merged onto matching names by binomial.
  const slots = useMemo<Slot[]>(() => {
    const photos = validatedSet.size === 0
      ? pool
      : pool.filter((p) => isValidatedName(p.species, validatedSet));

    const nameList = validatedNames.length > 0
      ? validatedNames
      : entry.plates.map((p) => p.species);

    const byBinom = new Map<string, SpeciesPhoto>();
    for (const ph of photos) {
      const bin = binomialOf(ph.species);
      if (!byBinom.has(bin)) byBinom.set(bin, ph);
    }

    const built: Slot[] = [];
    const used = new Set<string>();
    const usedImages = new Set<string>();
    for (const name of nameList) {
      const bin = binomialOf(name);
      const match = byBinom.get(bin);
      if (match) used.add(bin);
      const plate = entry.plates.find((p) => binomialOf(p.species) === bin);
      const trusted = imageMap.get(bin);
      if (trusted) usedImages.add(bin);
      const images = candidateUrls(match?.image, trusted, name);
      built.push({
        species: name,
        image: images[0],
        images,
        commonName: match?.commonName,
        place: match?.place ?? plate?.distribution,
        conservation: match?.conservation ?? plate?.conservation,
        photographer: match?.photographer,
        imageSource: trusted?.image_source,
        imageLicense: trusted?.image_license,
      });
    }
    for (const ph of photos) {
      const bin = binomialOf(ph.species);
      if (used.has(bin)) continue;
      used.add(bin);
      const trusted = imageMap.get(bin);
      if (trusted) usedImages.add(bin);
      const images = candidateUrls(ph.image, trusted, ph.species);
      built.push({
        ...ph,
        image: images[0],
        images,
        imageSource: trusted?.image_source,
        imageLicense: trusted?.image_license,
      });
    }
    for (const [bin, img] of imageMap) {
      if (usedImages.has(bin) || used.has(bin)) continue;
      usedImages.add(bin);
      const images = candidateUrls(undefined, img, img.scientific_name);
      built.push({
        species: img.scientific_name,
        image: images[0],
        images,
        imageSource: img.image_source,
        imageLicense: img.image_license,
      });
    }
    // Curate the gallery: rank slots by their best image's curation score so
    // the most beautiful, story-telling photographs lead (flower > whole plant
    // > habitat > pollinator > botanical illustration). Slots whose images were
    // all filtered out as herbarium/specimen/document material fall to the end
    // as "Image pending" placeholders rather than ever showing a specimen scan.
    // The sort is stable, preserving the validated-name ordering within a tier.
    const slotScore = (s: Slot): number =>
      s.images.length === 0
        ? -1
        : bestUrlScore(s.images, {
            source: s.imageSource,
            license: s.imageLicense,
            name: s.species,
          });
    const ordered = built
      .map((s, i) => ({ s, i, score: slotScore(s) }))
      .sort((a, b) => (b.score - a.score) || (a.i - b.i))
      .map((x) => x.s);
    while (ordered.length < 9) {
      ordered.push({ species: entry.genus, images: [] });
    }
    return ordered;
  }, [pool, validatedSet, validatedNames, entry, imageMap]);

  // Keep live references for the rotation engine (interval reads these).
  slotsCountRef.current = slots.length;
  slotsRef.current = slots;

  // Reset rotation + load tracking whenever the slot pool changes.
  useEffect(() => {
    setCellIdx([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    loadedRef.current = Array(9).fill(false);
    shownAtRef.current = Array(9).fill(0);
    allLoadedRef.current = false;
    replacingRef.current = null;
    rotaNextRef.current = 9;
    setHeroKey((prev) => prev ?? `0`);
  }, [slots.length, entry.genus]);

  // Called by each cell's FallbackImage once it settles (loaded OR exhausted).
  const handleCellSettled = useCallback((pos: number) => {
    loadedRef.current[pos] = true;
    shownAtRef.current[pos] = Date.now();
    if (replacingRef.current === pos) replacingRef.current = null;
  }, []);

  // Find the next pool slot (beyond the first 9) that has loadable images and
  // isn't already on screen, so rotation never swaps a real photo for a blank
  // placeholder (and never picks an already-visible slot).
  const nextRotatableSlot = useCallback(
    (currentCells: number[]): number | null => {
      const total = slotsCountRef.current;
      if (total <= 9) return null;
      const onScreen = new Set(currentCells);
      for (let step = 0; step < total; step++) {
        const candidate = rotaNextRef.current % total;
        rotaNextRef.current += 1;
        if (onScreen.has(candidate)) continue;
        if ((slotsRef.current[candidate]?.images.length ?? 0) === 0) continue;
        return candidate;
      }
      return null;
    },
    [],
  );

  // The rotation engine: a single timer that enforces the load-gating, the
  // 3-minute minimum visibility, and strictly one-at-a-time replacement.
  useEffect(() => {
    const id = setInterval(() => {
      // (a) Hold all rotation until every slot has finished loading.
      if (!allLoadedRef.current) {
        if (loadedRef.current.slice(0, 9).every(Boolean)) {
          allLoadedRef.current = true;
          const t = Date.now();
          for (let i = 0; i < 9; i++) shownAtRef.current[i] = t;
        }
        return;
      }
      // (b) A replacement is in flight — wait for its image to finish loading
      //     before touching any other slot (no simultaneous swaps).
      if (replacingRef.current !== null) return;
      // (c) Nothing to rotate to.
      if (slotsCountRef.current <= 9) return;

      // (d) Pick the longest-visible cell that has met the 3-minute minimum.
      const now = Date.now();
      let oldest = -1;
      let oldestT = Infinity;
      for (let i = 0; i < 9; i++) {
        const age = now - shownAtRef.current[i];
        if (age >= MIN_VISIBLE_MS && shownAtRef.current[i] < oldestT) {
          oldest = i;
          oldestT = shownAtRef.current[i];
        }
      }
      if (oldest === -1) return;

      // (e) Begin a single replacement on that cell. We mark it "not loaded"
      //     and unset its timestamp; handleCellSettled clears `replacing` once
      //     the new image has fully loaded, allowing the next replacement.
      setCellIdx((prev) => {
        const next = nextRotatableSlot(prev);
        if (next == null) return prev;
        replacingRef.current = oldest;
        loadedRef.current[oldest] = false;
        const arr = [...prev];
        arr[oldest] = next;
        return arr;
      });
    }, ROTATION_TICK_MS);
    return () => clearInterval(id);
  }, [nextRotatableSlot]);

  const cells = useMemo(
    () => cellIdx.map((i) => slots[i] ?? { species: entry.genus, images: [] }),
    [cellIdx, slots, entry.genus],
  );

  // Resolve the active hero slot.
  const heroIdx = useMemo(() => {
    if (heroKey == null) return 0;
    const n = Number(heroKey);
    return Number.isFinite(n) && n >= 0 && n < slots.length ? n : 0;
  }, [heroKey, slots.length]);
  const hero: Slot | undefined = slots[heroIdx] ?? slots[0];
  const heroFlag = placeToFlag(hero?.place);
  const heroHasImage = !!hero && hero.images.length > 0;

  // Matching plate for the hero — supplies habitat/elevation/pollinator data.
  const heroPlate: SpeciesPlate | undefined = useMemo(() => {
    if (!hero) return undefined;
    const bin = hero.species.toLowerCase().split(/\s+/).slice(0, 2).join(' ');
    const local = lookupGenus(entry.genus) ?? entry;
    return local.plates.find(
      (p) => p.species.toLowerCase().split(/\s+/).slice(0, 2).join(' ') === bin,
    );
  }, [hero, entry]);

  // Confirmed-only ecology for the hero species (OC backend).
  useEffect(() => {
    if (!hero?.species || hero.species === entry.genus) {
      setEcology(null);
      return;
    }
    const ctrl = new AbortController();
    setEcology(null);
    fetchSpeciesEcology(hero.species, ctrl.signal).then((e) => {
      if (!ctrl.signal.aborted) setEcology(e);
    });
    return () => ctrl.abort();
  }, [hero?.species, entry.genus]);

  // Derived caption values (omit when absent).
  const habitat = ecology?.confirmed ? ecology.habitat : heroPlate?.habitat;
  const elevation = heroPlate?.elevation;
  const pollinator = heroPlate?.pollinators ?? entry.ecology.pollinatorGuild;
  const conservation = hero?.conservation ?? heroPlate?.conservation;
  const speciesIsGenusOnly = !hero || hero.species === entry.genus;
  const noPhotosAtAll = slots.every((s) => s.images.length === 0);

  return (
    <section
      id="genus-of-the-day"
      className="bg-[#f5f0e8] text-[#2f3b21] border-y border-[#d4b34a]/20 scroll-mt-20"
    >
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-16 lg:py-20">
        {/* Section header — large, warm, inviting (ACT 2) */}
        <div className="mb-10 max-w-3xl">
          <div className="flex items-center gap-3">
            <span className="inline-block w-8 h-px bg-[#C9A84C]/60" />
            <span className="font-mono text-[11px] tracking-[0.34em] uppercase text-[#C9A84C]">
              Genus of the Day
            </span>
          </div>
          <h2
            className="mt-4"
            style={{
              fontFamily: '"Playfair Display",Georgia,serif',
              fontSize: 'clamp(1.85rem, 3.4vw, 2.75rem)',
              fontWeight: 700,
              color: '#1a2e1a',
              lineHeight: 1.15,
            }}
          >
            Genus of the Day
            <span style={{ color: '#1a2e1a', fontWeight: 700 }}> · </span>
            <span className="italic" style={{ color: '#C9A84C', fontWeight: 500 }}>
              {entry.genus}
            </span>
          </h2>

          <p
            className="mt-4"
            style={{
              color: '#2a2a2a',
              fontSize: 'clamp(1.0625rem, 1.4vw, 1.2rem)',
              fontWeight: 400,
              lineHeight: 1.7,
              fontFamily: '"Cormorant Garamond",Georgia,serif',
            }}
          >
            Every day, the Orchid Continuum features a different genus from the
            orchid family. A genus is a group of closely related species that
            share a common ancestor — think of it as an orchid family within the
            family. Come back tomorrow to meet a new one.
          </p>
        </div>


        {loading && noPhotosAtAll && !validationLoaded ? (
          <SkeletonPanel />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-7">
            {/* LEFT — hero image (4:5) + rich caption (40%) */}
            <div className="lg:col-span-2 flex flex-col">
              <div className="relative aspect-[4/5] rounded-2xl overflow-hidden border border-[#2f3b21]/12 bg-[#0f1c10]">
                {heroHasImage ? (
                  <FallbackImage
                    urls={hero!.images}
                    alt={hero!.species}
                    loading="eager"
                    className="absolute inset-0 w-full h-full object-cover animate-in fade-in duration-700"
                  />
                ) : null}
                {!heroHasImage && <Placeholder label={hero?.species ?? entry.genus} size="hero" />}
                {heroHasImage && unverifiedMode && <UnverifiedBadge />}
                {/* Small, non-intrusive image-source health indicator. */}
                <div className="absolute top-2 right-2 z-10">
                  <ImageSourceIndicator source={imageSource} />
                </div>
              </div>

              {/* Rich caption panel */}
              <div className="mt-4 rounded-2xl bg-[#eae3d2] border border-[#2f3b21]/12 p-6">
                <div
                  className="italic text-[#2f3b21] text-2xl lg:text-[1.7rem] leading-tight"
                  style={{ fontFamily: '"Playfair Display",Georgia,serif' }}
                >
                  {entry.genus}
                </div>
                {!speciesIsGenusOnly && (
                  <div
                    className="mt-0.5 italic text-[#5a6b3f] text-lg leading-tight"
                    style={{ fontFamily: '"Playfair Display",Georgia,serif' }}
                  >
                    {hero?.species}
                  </div>
                )}
                {hero?.commonName && (
                  <div className="mt-1 text-[#7a7256] text-sm">{hero.commonName}</div>
                )}

                <dl className="mt-5 space-y-3">
                  {hero?.place && (
                    <Fact
                      icon={<MapPin className="h-4 w-4" />}
                      label="Origin"
                      value={`${heroFlag.flag} ${hero.place}`}
                    />
                  )}
                  {habitat && (
                    <Fact icon={<Leaf className="h-4 w-4" />} label="Habitat" value={habitat} />
                  )}
                  {elevation && (
                    <Fact
                      icon={<Mountain className="h-4 w-4" />}
                      label="Elevation"
                      value={elevation}
                    />
                  )}
                  {pollinator && (
                    <Fact icon={<Bug className="h-4 w-4" />} label="Pollinator guild" value={pollinator} />
                  )}
                  {conservation && (
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-[#5a6b3f]">
                        <Flower2 className="h-4 w-4" />
                      </span>
                      <div>
                        <dt className="font-mono text-[9px] tracking-[0.18em] uppercase text-[#8a8062]">
                          Conservation
                        </dt>
                        <dd className="mt-1 flex items-center gap-2 text-[14px] text-[#3a4630]">
                          <StatusBadge status={conservation} size="md" />
                          <span>{conservation}</span>
                        </dd>
                      </div>
                    </div>
                  )}
                  {entry.ecology.elevation && !elevation && (
                    <Fact
                      icon={<CalendarRange className="h-4 w-4" />}
                      label="Genus elevation range"
                      value={entry.ecology.elevation}
                    />
                  )}
                </dl>

                {heroHasImage && (hero?.imageSource || hero?.imageLicense || hero?.photographer) && (
                  <div className="mt-5 pt-3 border-t border-[#2f3b21]/10 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] uppercase text-[#8a8062]">
                    <Camera className="h-3 w-3" />
                    {hero?.imageSource || hero?.imageLicense
                      ? [hero?.imageSource, hero?.imageLicense].filter(Boolean).join(' · ')
                      : `Photo: @${hero?.photographer} · iNaturalist`}
                  </div>
                )}

              </div>
            </div>

            {/* RIGHT — 3x3 species grid (60%) */}
            <div className="lg:col-span-3 flex flex-col">
              <div className="grid grid-cols-3 gap-3 lg:gap-3.5">
                {cells.map((cell, i) => {
                  const idx = cellIdx[i];
                  const isHero = idx === heroIdx;
                  const flag = placeToFlag(cell?.place);
                  const isGenusOnly = !cell || cell.species === entry.genus;
                  const hasImage = cell.images.length > 0;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setHeroKey(String(idx))}
                      aria-label={`Show ${cell?.species ?? entry.genus}`}
                      className={`group relative aspect-square rounded-lg overflow-hidden border text-left transition-all ${
                        isHero
                          ? 'border-[#b08a1e] ring-2 ring-[#b08a1e]/50'
                          : 'border-[#2f3b21]/12 hover:border-[#b08a1e]/60'
                      }`}
                    >
                      {hasImage ? (
                        <FallbackImage
                          urls={cell.images}
                          alt={cell.species}
                          onSettled={() => handleCellSettled(i)}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      ) : null}
                      {!hasImage && (
                        <Placeholder label={isGenusOnly ? entry.genus : cell.species} />
                      )}
                      {/* No image candidates → the slot is already "settled". */}
                      {!hasImage && <SettleOnMount onSettle={() => handleCellSettled(i)} />}
                      {hasImage && unverifiedMode && <UnverifiedBadge />}
                      {hasImage && (
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-2.5 pt-6 pb-2">
                          <div
                            className="italic text-[#faf7f2] text-[12px] leading-tight truncate"
                            style={{ fontFamily: '"Playfair Display",Georgia,serif' }}
                          >
                            {cell.species}
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-1">
                            <span className="text-[9px] text-[#e9e2cf]/90 truncate">
                              {flag.flag} {flag.country}
                            </span>
                            {cell.conservation && <StatusBadge status={cell.conservation} />}
                          </div>
                        </div>
                      )}
                      {!hasImage && !isGenusOnly && (
                        <div className="absolute inset-x-0 bottom-0 bg-[#2f3b21]/10 px-2.5 py-1.5">
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className="italic text-[#3f5026] text-[11px] leading-tight truncate"
                              style={{ fontFamily: '"Playfair Display",Georgia,serif' }}
                            >
                              {cell.species}
                            </span>
                            <span className="text-[10px]">{flag.flag}</span>
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Genus summary + CTA */}
              <div className="mt-6 rounded-2xl bg-[#eae3d2] border border-[#2f3b21]/12 p-6 lg:p-7 flex-1">
                <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-[#5a6b3f]">
                  {entry.family} · {entry.tribe} · {entry.speciesCount} species
                </div>
                <p
                  className="mt-3 text-[#3a4630] leading-relaxed"
                  style={{
                    fontFamily: '"Cormorant Garamond",Georgia,serif',
                    fontSize: 'clamp(1.05rem, 1.4vw, 1.2rem)',
                  }}
                >
                  {entry.description}
                </p>
                {noPhotosAtAll && (
                  <p className="mt-3 text-[13px] italic text-[#8a8062]">
                    Photos coming soon · {entry.speciesCount} species in database.
                  </p>
                )}
                <div className="mt-5 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => navigate(`/genus/${encodeURIComponent(entry.genus)}`)}
                    className="group inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#2f3b21] text-[#f5f0e8] hover:bg-[#3f5026] transition-colors font-mono text-[11px] tracking-[0.22em] uppercase"
                  >
                    Explore this genus
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                  <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#8a8062]">
                    Rotates every 12 hours · 744 genera
                  </span>

                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

/**
 * Invisible helper: reports a cell as "settled" immediately on mount. Used for
 * placeholder cells (no image candidates) so the rotation engine still counts
 * them toward the "all slots loaded" gate.
 */
const SettleOnMount: React.FC<{ onSettle: () => void }> = ({ onSettle }) => {
  useEffect(() => {
    onSettle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

export default DailyGenusFeature;
