import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Bug, Camera, CalendarRange, Leaf, MapPin, Mountain, Sprout } from 'lucide-react';
import {
  fetchGenusImagesWithSource,
  fetchValidatedSpecies,
  fetchSpeciesEcology,
  buildImageMap,
  binomialOf,
  conservationBadge,
  placeToFlag,
  warmBackends,
  type GenusImage,
  type ImageSource,
  type SpeciesEcology,
  type SpeciesPlate,
} from '@/lib/genusData';
import { featuredGenusEntry, fetchFeaturedNarrative } from '@/lib/featuredGenus';
import { setBackendStatus } from '@/lib/backendStatus';
import { nextReplacementIndex, shouldPauseRotation } from '@/lib/dailyGenusRotation';
import { filterRankUrls } from '@/lib/imageQuality';
import FallbackImage from '@/components/orchid/FallbackImage';
import ImageSourceIndicator from '@/components/orchid/ImageSourceIndicator';

const ROTATE_MS = 45 * 1000;
const SPECIES_LIMIT = 200;
const IMAGE_LIMIT = 200;

type RichEcology = SpeciesEcology & {
  distribution?: string;
  elevation?: string;
  pollinators?: string;
  mycorrhizal?: string;
};

type Slot = {
  species: string;
  images: string[];
  commonName?: string;
  place?: string;
  conservation?: string;
  photographer?: string;
  habitat?: string;
  elevation?: string;
  pollinators?: string;
  imageSource?: string;
  imageLicense?: string;
};

const CURATED_SPECIES_BY_GENUS: Record<string, string[]> = {
  cattleya: [
    'Cattleya labiata',
    'Cattleya trianae',
    'Cattleya mossiae',
    'Cattleya warscewiczii',
    'Cattleya percivaliana',
    'Cattleya maxima',
    'Cattleya skinneri',
    'Cattleya lueddemanniana',
    'Cattleya dowiana',
    'Cattleya gaskelliana',
    'Cattleya jenmanii',
    'Cattleya intermedia',
  ],
  dracula: [
    'Dracula vespertilio',
    'Dracula vampira',
    'Dracula chimaera',
    'Dracula lotax',
    'Dracula simia',
    'Dracula bella',
    'Dracula sodiroi',
    'Dracula gorgona',
    'Dracula wallisii',
  ],
  masdevallia: [
    'Masdevallia veitchiana',
    'Masdevallia coccinea',
    'Masdevallia ignea',
    'Masdevallia tovarensis',
    'Masdevallia infracta',
    'Masdevallia nidifica',
    'Masdevallia strobelii',
    'Masdevallia triangularis',
    'Masdevallia herradurae',
    'Masdevallia caudata',
    'Masdevallia rolfeana',
    'Masdevallia erinacea',
  ],
  dendrobium: [
    'Dendrobium nobile',
    'Dendrobium kingianum',
    'Dendrobium speciosum',
    'Dendrobium anosmum',
    'Dendrobium cuthbertsonii',
    'Dendrobium moniliforme',
    'Dendrobium bigibbum',
    'Dendrobium chrysotoxum',
    'Dendrobium parishii',
    'Dendrobium lindleyi',
    'Dendrobium farmeri',
    'Dendrobium aggregatum',
  ],
  bulbophyllum: [
    'Bulbophyllum echinolabium',
    'Bulbophyllum medusae',
    'Bulbophyllum rothschildianum',
    'Bulbophyllum lobbii',
    'Bulbophyllum phalaenopsis',
    'Bulbophyllum falcatum',
    'Bulbophyllum putidum',
    'Bulbophyllum frostii',
    'Bulbophyllum barbigerum',
  ],
  catasetum: [
    'Catasetum macrocarpum',
    'Catasetum fimbriatum',
    'Catasetum cristatum',
    'Catasetum saccatum',
    'Catasetum expansum',
    'Catasetum discolor',
    'Catasetum pileatum',
    'Catasetum tenebrosum',
    'Catasetum osculatum',
  ],
  vanilla: [
    'Vanilla planifolia',
    'Vanilla pompona',
    'Vanilla tahitensis',
    'Vanilla chamissonis',
    'Vanilla imperialis',
    'Vanilla mexicana',
    'Vanilla barbellata',
    'Vanilla aphylla',
    'Vanilla bahiana',
  ],
  phalaenopsis: [
    'Phalaenopsis amabilis',
    'Phalaenopsis aphrodite',
    'Phalaenopsis bellina',
    'Phalaenopsis violacea',
    'Phalaenopsis schilleriana',
    'Phalaenopsis stuartiana',
    'Phalaenopsis equestris',
    'Phalaenopsis cornu-cervi',
    'Phalaenopsis gigantea',
  ],
};

function titleCaseGenus(name: string): string {
  const t = (name || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t;
}

function botanicalName(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return titleCaseGenus(parts[0]);
  const genus = titleCaseGenus(parts[0]);
  const epithet = parts[1].toLowerCase();
  const remainder = parts.length > 2 ? ` ${parts.slice(2).join(' ')}` : '';
  return `${genus} ${epithet}${remainder}`;
}

const ScientificName: React.FC<{ name: string; className?: string }> = ({ name, className = '' }) => (
  <span className={`italic normal-case ${className}`}>{botanicalName(name)}</span>
);

function urlsFor(trusted?: GenusImage, fallback?: string): string[] {
  const record = trusted as Record<string, unknown> | undefined;
  const imageUrls = Array.isArray(record?.image_urls)
    ? record.image_urls.filter((u): u is string => typeof u === 'string')
    : [];

  const rawUrls = [
    ...imageUrls,
    trusted?.image_url,
    record?.original_url as string | undefined,
    record?.media_url as string | undefined,
    record?.url as string | undefined,
    fallback,
  ].filter((u): u is string => typeof u === 'string' && u.trim().length > 0);

  return filterRankUrls(rawUrls, {
    name: trusted?.scientific_name,
    source: trusted?.image_source,
    license: trusted?.image_license,
  });
}

async function fetchInaturalistSpeciesPhoto(species: string, signal?: AbortSignal): Promise<GenusImage | null> {
  const s = (species || '').trim();
  if (!s) return null;
  const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(s)}&rank=species&photos=true`;

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;

    const payload = (await res.json()) as { results?: Record<string, unknown>[] };
    const results = Array.isArray(payload.results) ? payload.results : [];
    const wanted = s.toLowerCase();

    for (const r of results) {
      if (r.iconic_taxon_name !== 'Plantae') continue;

      const name = typeof r.name === 'string' ? r.name.trim() : '';
      if (!name || !name.toLowerCase().startsWith(wanted)) continue;

      const photo = (r.default_photo as Record<string, unknown>) ?? {};
      const medium = typeof photo.medium_url === 'string' ? photo.medium_url.trim() : '';
      const attribution = typeof photo.attribution === 'string' ? photo.attribution.trim() : 'iNaturalist';
      const license = typeof photo.license_code === 'string' ? photo.license_code.trim() : undefined;

      const safeUrls = filterRankUrls([medium], {
        name,
        source: attribution,
        license,
      });

      if (safeUrls.length === 0) continue;

      return {
        scientific_name: name,
        image_url: safeUrls[0],
        image_urls: safeUrls,
        image_source: attribution,
        image_license: license,
      };
    }
  } catch {
    return null;
  }

  return null;
}

async function fetchInaturalistSpeciesBatch(speciesNames: string[], signal?: AbortSignal): Promise<GenusImage[]> {
  const out: GenusImage[] = [];
  const seen = new Set<string>();

  for (const batchStart of [0, 6, 12, 18]) {
    const batch = speciesNames.slice(batchStart, batchStart + 6);
    if (!batch.length || signal?.aborted) break;

    const hits = await Promise.all(batch.map((name) => fetchInaturalistSpeciesPhoto(name, signal)));

    for (const hit of hits) {
      if (!hit) continue;
      const key = binomialOf(hit.scientific_name) || hit.image_url;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(hit);
    }

    if (out.length >= 9) break;
  }

  return out;
}

function plateSlot(plate: SpeciesPlate, trusted?: GenusImage): Slot {
  return {
    species: binomialOf(plate.species),
    images: urlsFor(trusted, plate.image),
    place: plate.distribution,
    conservation: plate.conservation,
    habitat: plate.habitat,
    elevation: plate.elevation,
    pollinators: plate.pollinators,
    imageSource: trusted?.image_source,
    imageLicense: trusted?.image_license,
  };
}

function speciesCaption(slot: Slot, eco: RichEcology | null, genusDescription: string): string {
  const habitat = eco?.habitat || slot.habitat;
  const elevation = eco?.elevation || slot.elevation;
  const pollinators = eco?.pollinators || slot.pollinators;
  const distribution = eco?.distribution || eco?.region || slot.place;
  const displayName = botanicalName(slot.species);
  const bits: string[] = [];

  if (habitat || distribution) {
    bits.push(`${displayName} is shown here as part of the Orchid Continuum genus feature${distribution ? `, linked to records from ${distribution}` : ''}${habitat ? ` and associated with ${habitat.toLowerCase()}` : ''}.`);
  }

  if (elevation || pollinators) {
    bits.push(`${elevation ? `Known records place it around ${elevation}` : 'Its ecology is still being assembled'}${pollinators ? `, with pollination links involving ${pollinators.toLowerCase()}` : ''}.`);
  }

  if (eco?.mycorrhizal) {
    bits.push(`Seedling establishment is connected to orchid mycorrhizal fungi, including ${eco.mycorrhizal}.`);
  }

  return bits.length ? bits.join(' ') : genusDescription;
}

function recordBackendSource(source: ImageSource | null, genus: string): void {
  setBackendStatus({
    source: source || 'pending',
    genus,
    lastPingTime: Date.now(),
    cacheWrittenAt: null,
  });
}

const Placeholder: React.FC<{ label: string; hero?: boolean }> = ({ label, hero = false }) => (
  <div className="absolute inset-0 z-0 flex flex-col items-center justify-center bg-[#1a2e1a] px-4 text-center text-[#C9A84C]">
    <Leaf className={hero ? 'h-12 w-12' : 'h-7 w-7'} strokeWidth={1.25} />
    <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.2em]">Image pending</p>
    <p className="mt-1 font-serif text-sm italic normal-case opacity-80">{label}</p>
  </div>
);

const ImageLayer: React.FC<{ urls: string[]; alt: string; hover?: boolean }> = ({ urls, alt, hover = false }) => {
  if (!urls.length) return null;

  return (
    <FallbackImage
      key={`${alt}-${urls.join('|')}`}
      urls={urls}
      alt={alt}
      loading="eager"
      shimmer={false}
      className={`absolute inset-0 z-10 block h-full w-full object-cover opacity-100 ${hover ? 'transition duration-500 group-hover:scale-105' : ''}`}
    />
  );
};

const Fact: React.FC<{ icon: React.ReactNode; label: string; value?: string }> = ({ icon, label, value }) => {
  if (!value) return null;

  return (
    <div className="rounded-xl border border-[#e2d1a2] bg-[#fffaf0] px-3 py-2">
      <div className="flex items-center gap-2 text-[#7b6425]">
        {icon}
        <span className="font-mono text-[9px] uppercase tracking-[0.18em]">{label}</span>
      </div>
      <p className="mt-1 text-sm leading-snug text-[#33412a]">{value}</p>
    </div>
  );
};

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (!status) return null;
  const b = conservationBadge(status);

  return (
    <span
      className="rounded px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]"
      style={{ background: b.bg, color: b.color }}
    >
      {b.code}
    </span>
  );
};

const DailyGenusFeatureV3: React.FC = () => {
  const navigate = useNavigate();
  const [entry, setEntry] = useState(() => featuredGenusEntry());
  const [validatedNames, setValidatedNames] = useState<string[]>([]);
  const [trustedImages, setTrustedImages] = useState<GenusImage[]>([]);
  const [inatImages, setInatImages] = useState<GenusImage[]>([]);
  const [imageSource, setImageSource] = useState<ImageSource | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [visibleIndexes, setVisibleIndexes] = useState<number[]>([]);
  const [nextIndex, setNextIndex] = useState(9);
  const [replaceCell, setReplaceCell] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ecology, setEcology] = useState<RichEcology | null>(null);
  const [hovered, setHovered] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const onVisibility = () => setTabVisible(document.visibilityState === 'visible');
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);

    let mql: MediaQueryList | null = null;
    const onMotion = (event?: MediaQueryListEvent) => {
      setReducedMotion(event ? event.matches : mql?.matches ?? false);
    };

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      mql = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReducedMotion(mql.matches);
      if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onMotion);
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (!mql) return;
      if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', onMotion);
    };
  }, []);

  useEffect(() => {
    warmBackends();

    const ctrl = new AbortController();
    const base = featuredGenusEntry();
    const genusKey = base.genus.toLowerCase();
    const curated = CURATED_SPECIES_BY_GENUS[genusKey] ?? [];

    setEntry(base);
    setValidatedNames(curated);
    setTrustedImages([]);
    setInatImages([]);
    setImageSource(null);
    setLoading(true);
    setBackendStatus({ source: 'live', genus: base.genus, lastPingTime: Date.now(), cacheWrittenAt: null });

    fetchFeaturedNarrative(base, ctrl.signal).then((narrative) => {
      if (!ctrl.signal.aborted && narrative) setEntry((prev) => ({ ...prev, description: narrative }));
    });

    fetchValidatedSpecies(base.genus, ctrl.signal, SPECIES_LIMIT)
      .then((names) => {
        if (ctrl.signal.aborted) return;

        const merged = [...curated, ...(Array.isArray(names) ? names : [])];
        const seen = new Set<string>();

        setValidatedNames(
          merged.filter((name) => {
            const key = binomialOf(name);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          }),
        );
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setValidatedNames(curated);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    fetchGenusImagesWithSource(base.genus, ctrl.signal, IMAGE_LIMIT)
      .then(({ images, source }) => {
        if (ctrl.signal.aborted) return;
        setTrustedImages(Array.isArray(images) ? images : []);
        setImageSource(source || 'pending');
        recordBackendSource(source || 'pending', base.genus);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) recordBackendSource('pending', base.genus);
      });

    if (curated.length > 0) {
      fetchInaturalistSpeciesBatch(curated, ctrl.signal).then((images) => {
        if (ctrl.signal.aborted) return;
        setInatImages(images);
        if (images.length > 0) setImageSource((prev) => (prev && prev !== 'pending' ? prev : 'inaturalist'));
      });
    }

    return () => ctrl.abort();
  }, []);

  const slots = useMemo<Slot[]>(() => {
    const imageMap = buildImageMap([...trustedImages, ...inatImages]);
    const byName = new Map<string, Slot>();

    const pushSlot = (slot: Slot) => {
      const key = binomialOf(slot.species);
      if (!key || byName.has(key)) return;
      byName.set(key, { ...slot, species: key });
    };

    for (const name of validatedNames) {
      const key = binomialOf(name);
      const trusted = imageMap.get(key) ?? imageMap.get(name.toLowerCase());

      pushSlot({
        species: key,
        images: urlsFor(trusted),
        imageSource: trusted?.image_source,
        imageLicense: trusted?.image_license,
      });
    }

    for (const plate of (entry.plates || []) as SpeciesPlate[]) {
      const key = binomialOf(plate.species);
      const trusted = imageMap.get(key);
      pushSlot(plateSlot(plate, trusted));
    }

    for (const img of [...trustedImages, ...inatImages]) {
      const key = binomialOf(img.scientific_name);
      if (!key) continue;

      pushSlot({
        species: key,
        images: urlsFor(img),
        photographer: img.image_source,
        imageSource: img.image_source,
        imageLicense: img.image_license,
      });
    }

    const all = Array.from(byName.values()).filter((s) => s.species);
    const withPhotos = all.filter((s) => s.images.length > 0);
    const withoutPhotos = all.filter((s) => s.images.length === 0);

    return [...withPhotos, ...withoutPhotos].slice(0, Math.max(9, SPECIES_LIMIT));
  }, [entry.plates, inatImages, trustedImages, validatedNames]);

  useEffect(() => {
    if (!slots.length) return;
    setHeroIndex(0);
    setVisibleIndexes(Array.from({ length: Math.min(9, slots.length) }, (_, i) => i));
    setNextIndex(Math.min(9, slots.length));
    setReplaceCell(0);
  }, [slots.length, entry.genus]);

  useEffect(() => {
    if (shouldPauseRotation(slots.length, hovered, tabVisible, reducedMotion)) return;

    const id = window.setInterval(() => {
      setVisibleIndexes((prev) => {
        const current = prev.length ? prev : [0];
        const cell = replaceCell % current.length;
        const promoted = current[cell] ?? 0;

        setHeroIndex(promoted);

        if (slots.length <= current.length) {
          setReplaceCell((n) => (n + 1) % current.length);
          return current;
        }

        const replacement = nextReplacementIndex(current, nextIndex, slots.length);
        const nextVisible = current.map((v, i) => (i === cell ? replacement : v));

        setNextIndex((n) => (n + 1) % slots.length);
        setReplaceCell((n) => (n + 1) % current.length);

        return nextVisible;
      });
    }, ROTATE_MS);

    return () => window.clearInterval(id);
  }, [slots.length, nextIndex, replaceCell, hovered, tabVisible, reducedMotion]);

  const hero = slots[heroIndex % Math.max(1, slots.length)];

  useEffect(() => {
    if (!hero?.species) return;

    const ctrl = new AbortController();
    setEcology(null);

    fetchSpeciesEcology(hero.species, ctrl.signal).then((eco) => {
      if (!ctrl.signal.aborted) setEcology((eco || null) as RichEcology | null);
    });

    return () => ctrl.abort();
  }, [hero?.species]);

  if (loading && !slots.length) {
    return (
      <section className="rounded-[2rem] border border-[#d9caa8] bg-[#f6f0df]/95 p-8 text-[#3a4630]">
        Loading Genus of the Day…
      </section>
    );
  }

  if (!hero) {
    return (
      <section className="rounded-[2rem] border border-[#d9caa8] bg-[#f6f0df]/95 p-8 text-[#3a4630]">
        <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[#8a8062]">Genus of the Day</p>
        <h2 className="mt-2 font-serif text-4xl italic normal-case text-[#24321f]">{titleCaseGenus(entry.genus)}</h2>
        <p className="mt-3 text-sm text-[#5d684c]">The genus feature is waiting for approved living photographs from the Orchid Continuum image library.</p>
      </section>
    );
  }

  const caption = speciesCaption(hero, ecology, entry.description);
  const displaySource: ImageSource | null = imageSource || (inatImages.length > 0 ? 'inaturalist' : null);
  const heroLabel = botanicalName(hero.species);

  return (
    <section
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="rounded-[2rem] border border-[#d9caa8] bg-[#f6f0df]/95 p-5 shadow-[0_16px_40px_rgba(30,40,20,0.12)]"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[#8a8062]">Genus of the Day</p>
          <h2 className="font-serif text-4xl italic normal-case text-[#24321f]">{titleCaseGenus(entry.genus)}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#5d684c]">{entry.description}</p>
        </div>

        <button
          onClick={() => navigate(`/genus/${encodeURIComponent(entry.genus)}`)}
          className="inline-flex items-center gap-2 rounded-full border border-[#c7b27a] bg-[#fff8e6] px-4 py-2 text-xs font-mono uppercase tracking-[0.18em] text-[#5b4b21] hover:bg-[#f8ecc8]"
        >
          Explore Genus <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-[#d7c79c] bg-[#1a2e1a] shadow-inner">
            <Placeholder label={heroLabel} hero />
            <ImageLayer urls={hero.images} alt={heroLabel} />
            <div className="absolute right-3 top-3 z-20">
              <ImageSourceIndicator source={displaySource} />
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[#d9caa8] bg-[#fffaf0] p-5">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-serif text-3xl leading-tight text-[#24321f] normal-case">
                <ScientificName name={hero.species} />
              </h3>
              <StatusBadge status={hero.conservation} />
            </div>

            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6b664f]">
              <div className="flex items-baseline gap-1">
                <dt className="font-medium text-[#5d684c]">Genus</dt>
                <dd>{titleCaseGenus(entry.genus)}</dd>
              </div>
              {(hero.imageSource || displaySource) && (
                <div className="flex items-baseline gap-1">
                  <dt className="font-medium text-[#5d684c]">Source</dt>
                  <dd>{hero.imageSource || displaySource}</dd>
                </div>
              )}
              {hero.imageLicense && (
                <div className="flex items-baseline gap-1">
                  <dt className="font-medium text-[#5d684c]">License</dt>
                  <dd>{hero.imageLicense}</dd>
                </div>
              )}
            </dl>

            {hero.commonName && <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8062]">{hero.commonName}</p>}

            <p className="mt-4 font-serif text-[1.1rem] leading-8 text-[#3a4630]">{caption}</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Fact icon={<MapPin className="h-4 w-4" />} label="Distribution" value={ecology?.distribution || ecology?.region || hero.place || entry.regions.join(', ')} />
              <Fact icon={<Mountain className="h-4 w-4" />} label="Elevation" value={ecology?.elevation || hero.elevation || entry.ecology.elevation} />
              <Fact icon={<Leaf className="h-4 w-4" />} label="Habitat" value={ecology?.habitat || hero.habitat || entry.ecology.habitat} />
              <Fact icon={<Bug className="h-4 w-4" />} label="Pollinators" value={ecology?.pollinators || hero.pollinators || entry.ecology.pollinatorGuild} />
              <Fact icon={<Sprout className="h-4 w-4" />} label="Mycorrhizae" value={ecology?.mycorrhizal || entry.ecology.mycorrhizal} />
              <Fact icon={<Camera className="h-4 w-4" />} label="Photographer" value={hero.photographer} />
              <Fact icon={<CalendarRange className="h-4 w-4" />} label="Conservation" value={hero.conservation} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 lg:col-span-3">
          {visibleIndexes.map((slotIndex, cell) => {
            const s = slots[slotIndex % slots.length];
            const selected = s.species === hero.species;
            const place = s.place ? placeToFlag(s.place) : null;
            const label = botanicalName(s.species);

            return (
              <button
                key={`${s.species}-${slotIndex}-${cell}`}
                onClick={() => setHeroIndex(slotIndex)}
                className={`group relative aspect-square overflow-hidden rounded-xl border text-left shadow-sm transition ${
                  selected ? 'border-[#8a6f2d] ring-2 ring-[#c9a84c]' : 'border-[#d7c79c] hover:border-[#8a6f2d]'
                }`}
              >
                <Placeholder label={label} />
                <ImageLayer urls={s.images} alt={label} hover />

                <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 to-transparent p-2 text-white">
                  <p className="line-clamp-2 font-serif text-sm leading-tight normal-case">
                    <ScientificName name={s.species} />
                  </p>
                  {s.place && <p className="mt-0.5 truncate text-[10px] opacity-85">{place?.flag || '🌍'} {s.place}</p>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default DailyGenusFeatureV3;
