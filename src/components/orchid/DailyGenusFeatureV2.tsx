import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Bug, Camera, CalendarRange, Leaf, MapPin, Mountain, Sprout } from 'lucide-react';
import {
  fetchGenusSpecies,
  fetchGenusImagesWithSource,
  fetchSpeciesEcology,
  buildImageMap,
  binomialOf,
  conservationBadge,
  placeToFlag,
  warmBackends,
  type GenusImage,
  type ImageSource,
  type SpeciesEcology,
  type SpeciesPhoto,
  type SpeciesPlate,
} from '@/lib/genusData';
import { featuredGenusEntry, fetchFeaturedNarrative } from '@/lib/featuredGenus';
import { setBackendStatus } from '@/lib/backendStatus';
import FallbackImage from '@/components/orchid/FallbackImage';
import ImageSourceIndicator from '@/components/orchid/ImageSourceIndicator';
import { bestUrlScore } from '@/lib/imageQuality';

const ROTATE_MS = 45 * 1000;
const SPECIES_LIMIT = 200;
const IMAGE_LIMIT = 200;

const BLOCKED_NON_GALLERY_RE =
  /(herbari|preserved[\s_-]*specimen|dried[\s_-]*specimen|pressed[\s_-]*specimen|type[\s_-]*specimen|\bspecimen\b|holotype|isotype|lectotype|syntype|neotype|paratype|voucher|exsiccat|exsiccatae|\bsheet\b|barcode|accession|catalog[\s_-]*number|collection[\s_-]*number|determination[\s_-]*label|specimen[\s_-]*label|herbarium[\s_-]*label|gbif\.org\/occurrence|jstor|plants\.jstor|sweetgum\.nybg|sernecportal|swbiodiversity|biocase|mediaphoto\.mnhn|mnhn\.fr|\/herbarium\/|herbcat|catalogue.*specimen|\/specimen|\/voucher|\/barcode|idigbio|reflora|specieslink|virtualherbarium|biodiversitylibrary\.org|archive\.org\/(stream|page|download)|botanicus\.org|gallica\.bnf\.fr|\/plates?\/|\/figures?\/|\/illustrations?\/|\/drawings?\/|\/lineart\/|recolnat\.org|jacq\.org|cvh\.ac\.cn|nhm\.ac\.uk\/.*image|mobot\.org|tropicos\.org\/.*image|digitarium|ala\.org\.au\/.*occurrence|herbariovirtual|\.pdf(\?|#|$)|\.(tif|tiff|djvu|doc|docx|txt|csv)(\?|#|$))/i;

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

function uniqueClean(urls: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = typeof raw === 'string' ? raw.trim() : '';
    if (!url || seen.has(url) || BLOCKED_NON_GALLERY_RE.test(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function urlsFor(trusted?: GenusImage, fallback?: string): string[] {
  const record = trusted as Record<string, unknown> | undefined;
  const imageUrls = Array.isArray(record?.image_urls)
    ? record.image_urls.filter((u): u is string => typeof u === 'string')
    : [];

  return uniqueClean([
    ...imageUrls,
    trusted?.image_url,
    record?.original_url as string | undefined,
    record?.media_url as string | undefined,
    record?.url as string | undefined,
    fallback,
  ]);
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
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a2e1a] px-4 text-center text-[#C9A84C]">
    <Leaf className={hero ? 'h-12 w-12' : 'h-7 w-7'} strokeWidth={1.25} />
    <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.2em]">Image pending</p>
    <p className="mt-1 font-serif text-sm italic opacity-80">{label}</p>
  </div>
);

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

function speciesCaption(slot: Slot, eco: RichEcology | null, genusDescription: string): string {
  const habitat = eco?.habitat || slot.habitat;
  const elevation = eco?.elevation || slot.elevation;
  const pollinators = eco?.pollinators || slot.pollinators;
  const distribution = eco?.distribution || eco?.region || slot.place;
  const bits: string[] = [];

  if (habitat || distribution) {
    bits.push(
      `${slot.species} is shown here as part of the Orchid Continuum genus feature${
        distribution ? `, linked to records from ${distribution}` : ''
      }${habitat ? ` and associated with ${habitat.toLowerCase()}` : ''}.`,
    );
  }

  if (elevation || pollinators) {
    bits.push(
      `${elevation ? `Known records place it around ${elevation}` : 'Its ecology is still being assembled'}${
        pollinators ? `, with pollination links involving ${pollinators.toLowerCase()}` : ''
      }.`,
    );
  }

  if (eco?.mycorrhizal) {
    bits.push(`Seedling establishment is connected to orchid mycorrhizal fungi, including ${eco.mycorrhizal}.`);
  }

  return bits.length ? bits.join(' ') : genusDescription;
}

const DailyGenusFeatureV2: React.FC = () => {
  const navigate = useNavigate();
  const [entry, setEntry] = useState(() => featuredGenusEntry());
  const [pool, setPool] = useState<SpeciesPhoto[]>([]);
  const [imageMap, setImageMap] = useState<Map<string, GenusImage>>(new Map());
  const [imageSource, setImageSource] = useState<ImageSource | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [visibleIndexes, setVisibleIndexes] = useState<number[]>([]);
  const [nextIndex, setNextIndex] = useState(9);
  const [replaceCell, setReplaceCell] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ecology, setEcology] = useState<RichEcology | null>(null);

  useEffect(() => {
    warmBackends();

    const ctrl = new AbortController();
    const base = featuredGenusEntry();

    setEntry(base);
    setLoading(true);
    setBackendStatus({
      source: 'live',
      genus: base.genus,
      lastPingTime: Date.now(),
      cacheWrittenAt: null,
    });

    fetchFeaturedNarrative(base, ctrl.signal).then((narrative) => {
      if (!ctrl.signal.aborted && narrative) {
        setEntry((prev) => ({ ...prev, description: narrative }));
      }
    });

    fetchGenusSpecies(base.genus, ctrl.signal, SPECIES_LIMIT)
      .then((photos) => {
        if (!ctrl.signal.aborted) setPool(Array.isArray(photos) ? photos : []);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    fetchGenusImagesWithSource(base.genus, ctrl.signal, IMAGE_LIMIT)
      .then(({ images, source }) => {
        if (ctrl.signal.aborted) return;
        setImageMap(buildImageMap(Array.isArray(images) ? images : []));
        setImageSource(source || 'pending');
        recordBackendSource(source || 'pending', base.genus);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) recordBackendSource('pending', base.genus);
      });

    return () => ctrl.abort();
  }, []);

  const slots = useMemo<Slot[]>(() => {
    const byName = new Map<string, Slot>();

    for (const p of pool) {
      const species = binomialOf(p.species);
      const key = species.toLowerCase();
      const trusted = imageMap.get(key) ?? imageMap.get(p.species.toLowerCase());

      byName.set(key, {
        species,
        images: urlsFor(trusted, p.image),
        commonName: p.commonName,
        place: p.place,
        conservation: p.conservation,
        photographer: p.photographer,
        imageSource: trusted?.image_source,
        imageLicense: trusted?.image_license,
      });
    }

    for (const plate of (entry.plates || []) as SpeciesPlate[]) {
      const species = binomialOf(plate.species);
      const key = species.toLowerCase();
      if (byName.has(key)) continue;

      const trusted = imageMap.get(key);

      byName.set(key, {
        species,
        images: urlsFor(trusted, plate.image),
        place: plate.distribution,
        conservation: plate.conservation,
        habitat: plate.habitat,
        elevation: plate.elevation,
        pollinators: plate.pollinators,
        imageSource: trusted?.image_source,
        imageLicense: trusted?.image_license,
      });
    }

    const all = Array.from(byName.values()).filter((s) => s.species);
    const withPhotos = all.filter((s) => s.images.length > 0);
    const withoutPhotos = all.filter((s) => s.images.length === 0);

    return [...withPhotos, ...withoutPhotos];
  }, [pool, imageMap, entry.plates]);

  useEffect(() => {
    if (!slots.length) return;

    setHeroIndex(0);
    setVisibleIndexes(Array.from({ length: Math.min(9, slots.length) }, (_, i) => i));
    setNextIndex(Math.min(9, slots.length));
    setReplaceCell(0);
  }, [slots.length, entry.genus]);

  useEffect(() => {
    if (slots.length <= 1) return;

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

        const replacement = nextIndex % slots.length;
        const nextVisible = current.map((v, i) => (i === cell ? replacement : v));

        setNextIndex((n) => (n + 1) % slots.length);
        setReplaceCell((n) => (n + 1) % current.length);

        return nextVisible;
      });
    }, ROTATE_MS);

    return () => window.clearInterval(id);
  }, [slots.length, nextIndex, replaceCell]);

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
      <div className="rounded-[2rem] border border-[#d9caa8] bg-[#f6f0df]/95 p-8 text-[#3a4630]">
        Loading Genus of the Day…
      </div>
    );
  }

  if (!hero) {
    return (
      <section className="rounded-[2rem] border border-[#d9caa8] bg-[#f6f0df]/95 p-8 text-[#3a4630]">
        <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[#8a8062]">Genus of the Day</p>
        <h2 className="mt-2 font-serif text-4xl italic text-[#24321f]">{entry.genus}</h2>
        <p className="mt-3 text-sm text-[#5d684c]">
          The genus feature is waiting for approved living photographs from the Orchid Continuum image library.
        </p>
      </section>
    );
  }

  const heroScore = bestUrlScore(hero.images || [], {
    source: hero.imageSource,
    license: hero.imageLicense,
    name: hero.species,
  });

  const caption = speciesCaption(hero, ecology, entry.description);

  return (
    <section className="rounded-[2rem] border border-[#d9caa8] bg-[#f6f0df]/95 p-5 shadow-[0_16px_40px_rgba(30,40,20,0.12)]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[#8a8062]">Genus of the Day</p>
          <h2 className="font-serif text-4xl italic text-[#24321f]">{entry.genus}</h2>
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
            {hero.images.length ? (
              <FallbackImage
                urls={hero.images}
                alt={hero.species}
                className="h-full w-full object-cover"
              />
            ) : (
              <Placeholder label={hero.species} hero />
            )}

            <div className="absolute right-3 top-3">
              <ImageSourceIndicator source={imageSource} />
            </div>

            {heroScore <= 0 && !hero.images.length && <Placeholder label={hero.species} hero />}
          </div>

          <div className="mt-4 rounded-2xl border border-[#d9caa8] bg-[#fffaf0] p-5">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-serif text-3xl leading-tight text-[#24321f] italic">{hero.species}</h3>
              <StatusBadge status={hero.conservation} />
            </div>

            {hero.commonName && (
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8062]">
                {hero.commonName}
              </p>
            )}

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

            return (
              <button
                key={`${s.species}-${slotIndex}-${cell}`}
                onClick={() => setHeroIndex(slotIndex)}
                className={`group relative aspect-square overflow-hidden rounded-xl border text-left shadow-sm transition ${
                  selected ? 'border-[#8a6f2d] ring-2 ring-[#c9a84c]' : 'border-[#d7c79c] hover:border-[#8a6f2d]'
                }`}
              >
                {s.images.length ? (
                  <FallbackImage
                    urls={s.images}
                    alt={s.species}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : (
                  <Placeholder label={s.species} />
                )}

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-white">
                  <p className="line-clamp-2 font-serif text-sm italic leading-tight">{s.species}</p>

                  {s.place && (
                    <p className="mt-0.5 truncate text-[10px] opacity-85">
                      {place?.flag || '🌍'} {s.place}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default DailyGenusFeatureV2;
