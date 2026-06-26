import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Bug, Camera, CalendarRange, Leaf, MapPin, Mountain, Sprout } from 'lucide-react';
import {
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
import { fetchPublicGenusImages } from '@/lib/publicImageSource';
import { featuredGenusEntry, fetchFeaturedNarrative } from '@/lib/featuredGenus';
import { setBackendStatus } from '@/lib/backendStatus';
import FallbackImage from '@/components/orchid/FallbackImage';
import ImageSourceIndicator from '@/components/orchid/ImageSourceIndicator';
import EcologicalNeighborhood from '@/components/orchid/EcologicalNeighborhood';
import { fetchSpeciesEcologicalNeighborhood, type EcologicalNeighborhoodCard } from '@/lib/ecologicalNeighborhood';

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

const CURATED_SPECIES_BY_GENUS: Record<string, string[]> = {
  cattleya: ['Cattleya labiata', 'Cattleya trianae', 'Cattleya mossiae', 'Cattleya warscewiczii', 'Cattleya percivaliana', 'Cattleya maxima', 'Cattleya skinneri', 'Cattleya lueddemanniana', 'Cattleya dowiana', 'Cattleya gaskelliana', 'Cattleya jenmanii', 'Cattleya intermedia'],
  dracula: ['Dracula vespertilio', 'Dracula vampira', 'Dracula chimaera', 'Dracula lotax', 'Dracula simia', 'Dracula bella', 'Dracula sodiroi', 'Dracula gorgona', 'Dracula wallisii'],
  masdevallia: ['Masdevallia veitchiana', 'Masdevallia coccinea', 'Masdevallia ignea', 'Masdevallia tovarensis', 'Masdevallia infracta', 'Masdevallia nidifica', 'Masdevallia strobelii', 'Masdevallia triangularis', 'Masdevallia herradurae', 'Masdevallia caudata', 'Masdevallia rolfeana', 'Masdevallia erinacea'],
  dendrobium: ['Dendrobium nobile', 'Dendrobium kingianum', 'Dendrobium speciosum', 'Dendrobium anosmum', 'Dendrobium cuthbertsonii', 'Dendrobium moniliforme', 'Dendrobium bigibbum', 'Dendrobium chrysotoxum', 'Dendrobium parishii', 'Dendrobium lindleyi', 'Dendrobium farmeri', 'Dendrobium aggregatum'],
  bulbophyllum: ['Bulbophyllum echinolabium', 'Bulbophyllum medusae', 'Bulbophyllum rothschildianum', 'Bulbophyllum lobbii', 'Bulbophyllum phalaenopsis', 'Bulbophyllum falcatum', 'Bulbophyllum putidum', 'Bulbophyllum frostii', 'Bulbophyllum barbigerum'],
  catasetum: ['Catasetum macrocarpum', 'Catasetum fimbriatum', 'Catasetum cristatum', 'Catasetum saccatum', 'Catasetum expansum', 'Catasetum discolor', 'Catasetum pileatum', 'Catasetum tenebrosum', 'Catasetum osculatum'],
  vanilla: ['Vanilla planifolia', 'Vanilla pompona', 'Vanilla tahitensis', 'Vanilla chamissonis', 'Vanilla imperialis', 'Vanilla mexicana', 'Vanilla barbellata', 'Vanilla aphylla', 'Vanilla bahiana'],
  phalaenopsis: ['Phalaenopsis amabilis', 'Phalaenopsis aphrodite', 'Phalaenopsis bellina', 'Phalaenopsis violacea', 'Phalaenopsis schilleriana', 'Phalaenopsis stuartiana', 'Phalaenopsis equestris', 'Phalaenopsis cornu-cervi', 'Phalaenopsis gigantea'],
};

const SPECIES_NOTES: Record<string, string> = {
  'bulbophyllum echinolabium': 'A dramatic Sulawesi species with a long, mobile lip and fly-pollination biology; its flowers are showy, but the scent strategy is part of a broader Bulbophyllum fly-attraction syndrome rather than a rule for every species in the genus.',
  'bulbophyllum medusae': 'Named for its Medusa-like spray of narrow white sepals, this species emphasizes visual extravagance more than the carrion-scented strategy seen in some of its relatives.',
  'bulbophyllum rothschildianum': 'A Himalayan species with fan-like, fringed flowers; it represents the genus\'s architectural diversity rather than the large carrion-flower extreme.',
  'bulbophyllum lobbii': 'A comparatively elegant Bulbophyllum with a hinged lip that can guide small fly visitors into contact with the column.',
  'bulbophyllum phalaenopsis': 'This large New Guinea species is one of the classic malodorous Bulbophyllum, using strong carrion-like odor to recruit fly visitors.',
  'dendrobium nobile': 'A deciduous cane Dendrobium from seasonal Asian forests; cool, drier winters help cue its spring flowering.',
  'dendrobium kingianum': 'A compact Australian lithophyte and epiphyte, often growing on rock faces where bright light, air movement, and seasonal dryness shape its habit.',
  'dendrobium speciosum': 'A robust Australian species that can form massive clumps and carry large sprays of cream to yellow flowers visited by insects.',
  'dendrobium anosmum': 'A fragrant, pendant-caned species whose leafless flowering canes show the seasonal rhythm common in many Dendrobium groups.',
  'cattleya labiata': 'The classic corsage orchid of Brazil, famous for large fragrant flowers and a flaring labellum that guides bee visitors.',
  'cattleya trianae': 'Colombia\'s national flower, a showy epiphyte from montane forests where seasonal light and moisture influence blooming.',
  'cattleya mossiae': 'A Venezuelan Cattleya known for large spring flowers; wild populations are tied to forest canopies and specialized bee visitation.',
  'dracula vampira': 'A cloud-forest Dracula whose dark, pendant flowers participate in mushroom-mimicry pollination systems involving tiny flies.',
  'dracula chimaera': 'One of the iconic long-tailed Dracula species, adapted to cool, wet cloud-forest understories and fly pollination.',
  'vanilla planifolia': 'The cultivated vanilla orchid, a climbing vine whose hand-pollinated capsules become the vanilla beans of commerce.',
  'catasetum macrocarpum': 'A sexually dimorphic orchid: male and female flowers look different, and male flowers can eject pollinia onto fragrance-collecting bees.',
};

function titleCaseGenus(name: string): string {
  const t = (name || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t;
}

function botanicalName(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return titleCaseGenus(parts[0]);
  return `${titleCaseGenus(parts[0])} ${parts[1].toLowerCase()}${parts.length > 2 ? ` ${parts.slice(2).join(' ')}` : ''}`;
}

const ScientificName: React.FC<{ name: string; className?: string }> = ({ name, className = '' }) => (
  <span className={`italic normal-case ${className}`}>{botanicalName(name)}</span>
);

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
  const imageUrls = Array.isArray(record?.image_urls) ? record.image_urls.filter((u): u is string => typeof u === 'string') : [];
  return uniqueClean([
    ...imageUrls,
    trusted?.image_url,
    record?.storage_uri as string | undefined,
    record?.public_url as string | undefined,
    record?.representative_image_url as string | undefined,
    record?.thumbnail_url as string | undefined,
    record?.medium_url as string | undefined,
    record?.original_url as string | undefined,
    record?.media_url as string | undefined,
    record?.url as string | undefined,
    fallback,
  ]);
}

function mergeImages(a: string[] = [], b: string[] = []): string[] {
  return uniqueClean([...a, ...b]);
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
  const key = binomialOf(slot.species);
  const displayName = botanicalName(slot.species);
  const note = SPECIES_NOTES[key];
  const distribution = eco?.distribution || eco?.region || slot.place;
  const habitat = eco?.habitat || slot.habitat;
  const elevation = eco?.elevation || slot.elevation;
  const pollinators = eco?.pollinators || slot.pollinators;
  const bits: string[] = [];

  if (note) bits.push(note);
  else if (habitat || distribution) bits.push(`${displayName} is part of today's ${titleCaseGenus(slot.species.split(' ')[0])} story${distribution ? `, linked to records from ${distribution}` : ''}${habitat ? ` and associated with ${habitat.toLowerCase()}` : ''}.`);
  else bits.push(`${displayName} is included here as a verified species-level member of the Genus of the Day image rotation.`);

  if (elevation || pollinators) bits.push(`${elevation ? `Records place it around ${elevation}` : 'Its species-level ecology is still being assembled'}${pollinators ? `, with pollination links involving ${pollinators.toLowerCase()}` : ''}.`);
  if (eco?.mycorrhizal) bits.push(`Seedling establishment is connected to orchid mycorrhizal fungi, including ${eco.mycorrhizal}.`);

  return bits.join(' ') || genusDescription;
}

function recordBackendSource(sourceView: ImageSource | null, genus: string): void {
  setBackendStatus({ sourceView: sourceView || 'pending', genus, lastPingTime: Date.now(), cacheWrittenAt: null });
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
  return <FallbackImage key={`${alt}-${urls.join('|')}`} urls={urls} alt={alt} loading="eager" shimmer={false} className={`absolute inset-0 z-10 block h-full w-full object-cover ${hover ? 'transition duration-500 group-hover:scale-105' : ''}`} />;
};

const Fact: React.FC<{ icon: React.ReactNode; label: string; value?: string }> = ({ icon, label, value }) => {
  if (!value) return null;
  return (
    <div className="rounded-xl border border-[#e2d1a2] bg-[#fffaf0] px-3 py-2">
      <div className="flex items-center gap-2 text-[#7b6425]">{icon}<span className="font-mono text-[9px] uppercase tracking-[0.18em]">{label}</span></div>
      <p className="mt-1 text-sm leading-snug text-[#33412a]">{value}</p>
    </div>
  );
};

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (!status) return null;
  const b = conservationBadge(status);
  return <span className="rounded px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]" style={{ background: b.bg, color: b.color }}>{b.code}</span>;
};

const DailyGenusFeatureV4: React.FC = () => {
  const navigate = useNavigate();
  const [entry, setEntry] = useState(() => featuredGenusEntry());
  const [validatedNames, setValidatedNames] = useState<string[]>([]);
  const [trustedImages, setTrustedImages] = useState<GenusImage[]>([]);
  const [imageSource, setImageSource] = useState<ImageSource | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [visibleIndexes, setVisibleIndexes] = useState<number[]>([]);
  const [nextIndex, setNextIndex] = useState(9);
  const [replaceCell, setReplaceCell] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ecology, setEcology] = useState<RichEcology | null>(null);
  const [neighborhoodCards, setNeighborhoodCards] = useState<EcologicalNeighborhoodCard[]>([]);
  const [neighborhoodLoading, setNeighborhoodLoading] = useState(false);

  useEffect(() => {
    warmBackends();
    const ctrl = new AbortController();
    const base = featuredGenusEntry();
    const curated = CURATED_SPECIES_BY_GENUS[base.genus.toLowerCase()] ?? [];

    setEntry(base);
    setValidatedNames(curated);
    setTrustedImages([]);
    setImageSource(null);
    setLoading(true);
    setBackendStatus({ sourceView: 'pending', genus: base.genus, lastPingTime: Date.now(), cacheWrittenAt: null });

    fetchFeaturedNarrative(base, ctrl.signal).then((narrative) => {
      if (!ctrl.signal.aborted && narrative) setEntry((prev) => ({ ...prev, relationship: narrative }));
    });

    fetchValidatedSpecies(base.genus, ctrl.signal, SPECIES_LIMIT)
      .then((names) => {
        if (ctrl.signal.aborted) return;
        const seen = new Set<string>();
        setValidatedNames([...curated, ...(Array.isArray(names) ? names : [])].filter((name) => {
          const key = binomialOf(name);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        }));
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setValidatedNames(curated);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    fetchPublicGenusImages(base.genus, ctrl.signal, IMAGE_LIMIT)
      .then(({ images, source }) => {
        if (ctrl.signal.aborted) return;
        setTrustedImages(Array.isArray(images) ? images : []);
        setImageSource((source || 'pending') as ImageSource);
        recordBackendSource((source || 'pending') as ImageSource, base.genus);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) recordBackendSource('pending', base.genus);
      });

    return () => ctrl.abort();
  }, []);

  const slots = useMemo<Slot[]>(() => {
    const imageMap = buildImageMap(trustedImages);
    const byName = new Map<string, Slot>();
    const pushSlot = (slot: Slot) => {
      const key = binomialOf(slot.species);
      if (!key) return;
      const next = { ...slot, species: key, images: uniqueClean(slot.images || []) };
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, next);
        return;
      }
      const images = mergeImages(existing.images, next.images);
      byName.set(key, {
        ...existing,
        ...next,
        images,
        place: existing.place || next.place,
        conservation: existing.conservation || next.conservation,
        habitat: existing.habitat || next.habitat,
        elevation: existing.elevation || next.elevation,
        pollinators: existing.pollinators || next.pollinators,
        imageSource: existing.imageSource || next.imageSource,
        imageLicense: existing.imageLicense || next.imageLicense,
        photographer: existing.photographer || next.photographer,
      });
    };

    for (const name of validatedNames) {
      const key = binomialOf(name);
      const trusted = imageMap.get(key) ?? imageMap.get(name.toLowerCase());
      pushSlot({ species: key, images: urlsFor(trusted), imageSource: trusted?.image_source, imageLicense: trusted?.image_license });
    }

    for (const plate of (entry.plates || []) as SpeciesPlate[]) pushSlot(plateSlot(plate, imageMap.get(binomialOf(plate.species))));

    for (const img of trustedImages) {
      const key = binomialOf(img.scientific_name);
      if (!key) continue;
      pushSlot({ species: key, images: urlsFor(img), photographer: img.image_source, imageSource: img.image_source, imageLicense: img.image_license });
    }

    const all = Array.from(byName.values()).filter((s) => s.species);
    return [...all.filter((s) => s.images.length > 0), ...all.filter((s) => s.images.length === 0)].slice(0, Math.max(9, SPECIES_LIMIT));
  }, [entry.plates, trustedImages, validatedNames]);

  useEffect(() => {
    if (!slots.length) return;
    const firstWithImage = slots.findIndex((s) => s.images.length > 0);
    setHeroIndex(firstWithImage >= 0 ? firstWithImage : 0);
    const imageFirst = slots.map((s, i) => ({ s, i })).sort((a, b) => Number(b.s.images.length > 0) - Number(a.s.images.length > 0)).slice(0, Math.min(9, slots.length)).map(({ i }) => i);
    setVisibleIndexes(imageFirst);
    setNextIndex(Math.min(9, slots.length));
    setReplaceCell(0);
  }, [slots, entry.genus]);

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

  useEffect(() => {
    if (!hero?.species) return;
    let alive = true;
    setNeighborhoodLoading(true);
    fetchSpeciesEcologicalNeighborhood(hero.species, 12)
      .then((cards) => {
        if (alive) setNeighborhoodCards(cards);
      })
      .catch(() => {
        if (alive) setNeighborhoodCards([]);
      })
      .finally(() => {
        if (alive) setNeighborhoodLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [hero?.species]);

  if (loading && !slots.length) return <section className="rounded-[2rem] border border-[#d9caa8] bg-[#f6f0df]/95 p-8 text-[#3a4630]">Loading Genus of the Day…</section>;

  if (!hero) {
    return (
      <section className="rounded-[2rem] border border-[#d9caa8] bg-[#f6f0df]/95 p-8 text-[#3a4630]">
        <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[#8a8062]">Genus of the Day</p>
        <h2 className="mt-2 font-serif text-4xl italic normal-case text-[#24321f]">{titleCaseGenus(entry.genus)}</h2>
        <p className="mt-3 text-sm text-[#5d684c]">The genus feature is waiting for approved living photographs from the Orchid Continuum image library.</p>
      </section>
    );
  }

  const displaySource: ImageSource | null = imageSource || null;
  const heroLabel = botanicalName(hero.species);
  const caption = speciesCaption(hero, ecology, entry.description);

  return (
    <>
    <section className="rounded-[2rem] border border-[#d9caa8] bg-[#f6f0df]/95 p-5 shadow-[0_16px_40px_rgba(30,40,20,0.12)]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[#8a8062]">Genus of the Day</p>
          <h2 className="font-serif text-4xl italic normal-case text-[#24321f]">{titleCaseGenus(entry.genus)}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#5d684c]">{entry.description}</p>
        </div>
        <button onClick={() => navigate(`/genus/${encodeURIComponent(entry.genus)}`)} className="inline-flex items-center gap-2 rounded-full border border-[#c7b27a] bg-[#fff8e6] px-4 py-2 text-xs font-mono uppercase tracking-[0.18em] text-[#5b4b21] hover:bg-[#f8ecc8]">
          Explore Genus <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-[#d7c79c] bg-[#1a2e1a] shadow-inner">
            <Placeholder label={heroLabel} hero />
            <ImageLayer urls={hero.images} alt={heroLabel} />
            <div className="absolute right-3 top-3 z-20"><ImageSourceIndicator source={displaySource} /></div>
          </div>

          <div className="mt-4 rounded-2xl border border-[#d9caa8] bg-[#fffaf0] p-5">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-serif text-3xl leading-tight text-[#24321f] normal-case"><ScientificName name={hero.species} /></h3>
              <StatusBadge status={hero.conservation} />
            </div>
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

        <div className="lg:col-span-3">
          <div className="grid grid-cols-3 gap-3 rounded-2xl bg-[#efe6cf] p-3">
            {visibleIndexes.slice(0, 9).map((slotIndex, cell) => {
              const s = slots[slotIndex % slots.length];
              const selected = s.species === hero.species;
              const place = s.place ? placeToFlag(s.place) : null;
              const label = botanicalName(s.species);
              return (
                <button key={`${s.species}-${slotIndex}-${cell}`} onClick={() => setHeroIndex(slotIndex)} className={`group relative aspect-square overflow-hidden rounded-xl border bg-[#1a2e1a] text-left shadow-sm transition ${selected ? 'border-[#8a6f2d] ring-2 ring-[#c9a84c]' : 'border-[#d7c79c] hover:border-[#8a6f2d]'}`}>
                  <Placeholder label={label} />
                  <ImageLayer urls={s.images} alt={label} hover />
                  <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 to-transparent p-2 text-white">
                    <p className="line-clamp-2 font-serif text-sm leading-tight normal-case"><ScientificName name={s.species} /></p>
                    {s.place && <p className="mt-0.5 truncate text-[10px] opacity-85">{place?.flag || '🌍'} {s.place}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
    <EcologicalNeighborhood
      scientificName={hero.species}
      cards={neighborhoodCards}
      loading={neighborhoodLoading}
    />
    </>
  );
};

export default DailyGenusFeatureV4;
