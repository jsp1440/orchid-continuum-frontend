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
  const [pool, setPool] = useState<
