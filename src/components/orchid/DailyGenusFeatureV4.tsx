import React, { useEffect, useMemo, useState } from 'react';
<<<<<<< HEAD
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
import { homepageSafeUrl } from '@/lib/imageQuality';
import FallbackImage from '@/components/orchid/FallbackImage';
import ImageSourceIndicator from '@/components/orchid/ImageSourceIndicator';
import EcologicalNeighborhood from '@/components/orchid/EcologicalNeighborhood';
import { fetchSpeciesEcologicalNeighborhood, type EcologicalNeighborhoodCard } from '@/lib/ecologicalNeighborhood';
=======
import { Link } from 'react-router-dom';
import { ArrowRight, Camera, Database, Leaf, ShieldCheck } from 'lucide-react';
>>>>>>> origin/main

import { featuredGenusEntry } from '@/lib/featuredGenus';
import { fetchCalyxGenusMedia, type GenusMediaResponse } from '@/lib/genusMediaResolver';

const EMPTY: GenusMediaResponse = {
  status: 'service_error',
  requested_genus: '',
  accepted_genus: null,
  generated_at: null,
  items: [],
  summary: { eligible_count: 0, returned_count: 0, exclusion_counts: {} },
};

<<<<<<< HEAD
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

function safeLivingPhotoUrl(raw: string | undefined, shared?: { title?: string; description?: string; source?: string; license?: string; name?: string }): string | undefined {
  const url = typeof raw === 'string' ? raw.trim() : '';
  if (!url) return undefined;
  const haystack = [url, shared?.title, shared?.description, shared?.source, shared?.license, shared?.name].filter(Boolean).join(' ');
  if (BLOCKED_NON_GALLERY_RE.test(haystack)) {
    console.warn('[DailyGenusFeatureV4] REJECTED IMAGE: non-living-photo keyword', { url, shared });
    return undefined;
  }
  const safe = homepageSafeUrl(url, shared);
  if (!safe) {
    console.warn('[DailyGenusFeatureV4] REJECTED IMAGE: imageQuality score below threshold', { url, shared });
    return undefined;
  }
  console.debug('[DailyGenusFeatureV4] ACCEPTED IMAGE', { url: safe, source: shared?.source, name: shared?.name });
  return safe;
}

function uniqueClean(urls: Array<string | undefined>, shared?: { title?: string; description?: string; source?: string; license?: string; name?: string }): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = safeLivingPhotoUrl(raw, shared);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function urlsFor(trusted?: GenusImage, fallback?: string): string[] {
  const record = trusted as Record<string, unknown> | undefined;
  const imageUrls = Array.isArray(record?.image_urls) ? record.image_urls.filter((u): u is string => typeof u === 'string') : [];
  const shared = {
    title: trusted?.scientific_name,
    description: [trusted?.scientific_name, trusted?.image_source].filter(Boolean).join(' '),
    source: trusted?.image_source,
    license: trusted?.image_license,
    name: trusted?.scientific_name,
  };
  return uniqueClean([
    ...imageUrls,
    trusted?.image_url,
    record?.representative_image_url as string | undefined,
    record?.thumbnail_url as string | undefined,
    record?.medium_url as string | undefined,
    record?.original_url as string | undefined,
    record?.media_url as string | undefined,
    record?.url as string | undefined,
    fallback,
  ], shared);
}

function mergeImages(a: string[] = [], b: string[] = []): string[] {
  return uniqueClean([...a, ...b]);
}

async function fetchInaturalistSpeciesPhoto(species: string, signal?: AbortSignal): Promise<GenusImage | null> {
  const s = species.trim();
  if (!s) return null;
  try {
    const res = await fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(s)}&rank=species&photos=true`, { signal });
    if (!res.ok) return null;
    const payload = (await res.json()) as { results?: Record<string, unknown>[] };
    const wanted = s.toLowerCase();
    for (const r of Array.isArray(payload.results) ? payload.results : []) {
      if (r.iconic_taxon_name !== 'Plantae') continue;
      const name = typeof r.name === 'string' ? r.name.trim() : '';
      if (!name || !name.toLowerCase().startsWith(wanted)) continue;
      const photo = (r.default_photo as Record<string, unknown>) ?? {};
      const medium = typeof photo.medium_url === 'string' ? photo.medium_url.trim() : '';
      const attribution = typeof photo.attribution === 'string' ? photo.attribution.trim() : 'iNaturalist';
      const license = typeof photo.license_code === 'string' ? photo.license_code.trim() : undefined;
      const safe = safeLivingPhotoUrl(medium, { title: name, source: attribution, license, name });
      if (!safe) continue;
      return {
        scientific_name: name,
        image_url: safe,
        image_urls: [safe],
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
  for (let batchStart = 0; batchStart < speciesNames.length; batchStart += 6) {
    if (signal?.aborted || out.length >= 12) break;
    const hits = await Promise.all(speciesNames.slice(batchStart, batchStart + 6).map((name) => fetchInaturalistSpeciesPhoto(name, signal)));
    for (const hit of hits) {
      if (!hit) continue;
      const key = binomialOf(hit.scientific_name) || hit.image_url;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(hit);
    }
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
=======
const ScientificName: React.FC<{ name: string }> = ({ name }) => <span className="italic">{name}</span>;
>>>>>>> origin/main

const DailyGenusFeatureV4: React.FC = () => {
  const entry = useMemo(() => featuredGenusEntry(), []);
  const [media, setMedia] = useState<GenusMediaResponse>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetchCalyxGenusMedia(entry.genus, controller.signal)
      .then(setMedia)
      .catch(() => setMedia({ ...EMPTY, requested_genus: entry.genus }))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [entry.genus]);

<<<<<<< HEAD
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

    fetchGenusImagesWithSource(base.genus, ctrl.signal, IMAGE_LIMIT)
      .then(({ images, source }) => {
        if (ctrl.signal.aborted) return;
        const filtered = (Array.isArray(images) ? images : []).map((img) => ({ ...img, image_urls: urlsFor(img), image_url: urlsFor(img)[0] || '' })).filter((img) => img.image_url);
        setTrustedImages(filtered);
        setImageSource(source || 'pending');
        recordBackendSource(source || 'pending', base.genus);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) recordBackendSource('pending', base.genus);
      });

    if (curated.length > 0) {
      fetchInaturalistSpeciesBatch(curated, ctrl.signal).then((images) => {
        if (ctrl.signal.aborted) return;
        const filtered = images.map((img) => ({ ...img, image_urls: urlsFor(img), image_url: urlsFor(img)[0] || '' })).filter((img) => img.image_url);
        setInatImages(filtered);
        if (filtered.length > 0) setImageSource((prev) => (prev && prev !== 'pending' ? prev : 'inaturalist'));
      });
    }

    return () => ctrl.abort();
  }, []);

  const slots = useMemo<Slot[]>(() => {
    const imageMap = buildImageMap([...trustedImages, ...inatImages]);
    const byName = new Map<string, Slot>();
    const pushSlot = (slot: Slot) => {
      const key = binomialOf(slot.species);
      if (!key) return;
      const next = { ...slot, species: key, images: uniqueClean(slot.images || [], { title: key, source: slot.imageSource, license: slot.imageLicense, name: key }) };
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

    for (const img of [...trustedImages, ...inatImages]) {
      const key = binomialOf(img.scientific_name);
      if (!key) continue;
      pushSlot({ species: key, images: urlsFor(img), photographer: img.image_source, imageSource: img.image_source, imageLicense: img.image_license });
    }

    const all = Array.from(byName.values()).filter((s) => s.species);
    return [...all.filter((s) => s.images.length > 0), ...all.filter((s) => s.images.length === 0)].slice(0, Math.max(9, SPECIES_LIMIT));
  }, [entry.plates, inatImages, trustedImages, validatedNames]);

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

  const displaySource: ImageSource | null = imageSource || (inatImages.length > 0 ? 'inaturalist' : null);
  const heroLabel = botanicalName(hero.species);
  const caption = speciesCaption(hero, ecology, entry.description);
=======
  const hero = media.items[0];
  const gallery = media.items.slice(1, 9);
>>>>>>> origin/main

  return (
    <section className="rounded-xl border border-[#d9caa8] bg-[#fffaf0]/95 p-5 shadow-[0_10px_24px_rgba(30,40,20,0.06)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#8a8062]">Featured Genus</p>
          <h2 className="mt-1 font-serif text-4xl leading-tight text-[#24321f] italic">{entry.genus}</h2>
          <p className="mt-2 text-sm leading-6 text-[#5d684c]">{entry.description}</p>
        </div>
        <Link
          to={`/genus/${encodeURIComponent(entry.genus)}`}
          className="inline-flex items-center gap-2 rounded-lg border border-[#c7b27a] bg-[#f8ecc8] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[#5b4b21] hover:bg-[#efdca7]"
        >
          Open research profile <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading && (
        <div className="mt-5 flex min-h-[260px] items-center justify-center rounded-lg border border-dashed border-[#c7b27a] bg-[#f6f0df] text-center">
          <div><Camera className="mx-auto h-8 w-8 text-[#8a6f2d]" /><p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[#6b664f]">Loading verified Orchid Continuum media</p></div>
        </div>
      )}

      {!loading && media.status === 'ok' && hero && (
        <>
          <figure className="mt-5 overflow-hidden rounded-lg border border-[#d9caa8] bg-[#1a2e1a]">
            <img src={hero.image_url} alt={hero.scientific_name} className="h-[360px] w-full object-cover" loading="eager" />
            <figcaption className="bg-[#fffaf0] px-4 py-3 text-sm text-[#4c5841]">
              <p className="font-serif text-lg text-[#24321f]"><ScientificName name={hero.scientific_name} /></p>
              <p className="mt-1 text-xs">Source: {hero.source_name}{hero.attribution ? ` · ${hero.attribution}` : ''}{hero.license ? ` · ${hero.license}` : ''}</p>
            </figcaption>
          </figure>
          {gallery.length > 0 && <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {gallery.map((item) => (
              <figure key={item.media_id} className="overflow-hidden rounded-lg border border-[#d9caa8] bg-[#fffaf0]">
                <img src={item.thumbnail_url || item.image_url} alt={item.scientific_name} className="h-44 w-full object-cover" loading="lazy" />
                <figcaption className="p-3"><p className="font-serif text-base text-[#24321f]"><ScientificName name={item.scientific_name} /></p><p className="mt-1 text-[10px] text-[#6b664f]">{item.source_name}</p></figcaption>
              </figure>
            ))}
          </div>}
        </>
      )}

      {!loading && media.status === 'no_approved_media' && <div className="mt-5 flex min-h-[260px] items-center justify-center rounded-lg border border-dashed border-[#c7b27a] bg-[#f6f0df] p-6 text-center"><div className="max-w-md"><Leaf className="mx-auto h-9 w-9 text-[#8a6f2d]" /><p className="mt-3 font-serif text-xl text-[#24321f]">No verified Orchid Continuum photograph is available yet for {entry.genus}.</p><p className="mt-2 text-sm leading-6 text-[#5d684c]">The site will not substitute an unrelated orchid, herbarium sheet, or external fallback image.</p></div></div>}
      {!loading && media.status === 'invalid_genus' && <div className="mt-5 rounded-lg border border-[#d9caa8] bg-[#f6f0df] p-5 text-center text-sm text-[#5d684c]">The current Featured Genus could not be resolved by Calyx.</div>}
      {!loading && media.status === 'service_error' && <div className="mt-5 rounded-lg border border-[#d9caa8] bg-[#f6f0df] p-5 text-center"><Database className="mx-auto h-7 w-7 text-[#8a6f2d]" /><p className="mt-2 font-serif text-lg text-[#24321f]">Calyx media service is temporarily unavailable.</p><p className="mt-1 text-sm text-[#5d684c]">No external image fallback is used.</p></div>}

      <div className="mt-5 flex items-center gap-2 text-[10px] text-[#6b664f]"><ShieldCheck className="h-3.5 w-3.5 text-[#8a6f2d]" /><span>Featured Genus media is resolved by Calyx from Orchid Continuum-linked taxon records.</span></div>
    </section>
  );
};

export default DailyGenusFeatureV4;
