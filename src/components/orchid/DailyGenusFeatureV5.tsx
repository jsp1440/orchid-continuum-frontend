import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Bug,
  CalendarRange,
  Database,
  Flower2,
  Leaf,
  Map,
  MapPin,
  Mountain,
  ShieldCheck,
  Sprout,
} from 'lucide-react';
import DailyGenusFeatureV4 from '@/components/orchid/DailyGenusFeatureV4';
import DailyGenusGraphEvidence from '@/components/orchid/DailyGenusGraphEvidence';
import DailyGenusRelationshipChips from '@/components/orchid/DailyGenusRelationshipChips';
import { KNOWLEDGE_GRAPH_ENABLED } from '@/lib/backendConfig';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import { featuredGenusEntry } from '@/lib/featuredGenus';
import { lookupGenus } from '@/lib/genusData';
import type { GenusEntry, SpeciesPlate } from '@/lib/genusData';
import { fetchCalyxGenusMedia, type GenusMediaItem } from '@/lib/genusMediaResolver';

type DiscoveryTrail = {
  label: string;
  title: string;
  body: string;
};

type SummaryCard = {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
};

type EvidenceRow = {
  label: string;
  value: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const FLOWERING_WINDOWS: Record<string, number[]> = {
  cattleya: [2, 3, 4, 8, 9],
  dracula: [3, 4, 5, 6, 7, 8, 9],
  masdevallia: [2, 3, 4, 5, 8, 9, 10],
  dendrobium: [0, 1, 2, 3, 10, 11],
  bulbophyllum: [4, 5, 6, 7, 8],
  catasetum: [5, 6, 7, 8, 9],
  vanilla: [2, 3, 4, 5],
  phalaenopsis: [0, 1, 2, 3, 11],
};

function buildDiscoveryTrails(entry: GenusEntry): DiscoveryTrail[] {
  const habitat = entry.ecology?.habitat || 'Habitat evidence is being assembled.';
  const pollinator = entry.ecology?.pollinatorGuild || 'Pollinator evidence is being assembled.';
  const mycorrhiza = entry.ecology?.mycorrhizal || 'Mycorrhizal evidence is being assembled.';

  return [
    {
      label: 'Habitat',
      title: 'Where it lives',
      body: habitat,
    },
    {
      label: 'Pollination',
      title: 'Who visits it',
      body: pollinator,
    },
    {
      label: 'Fungi',
      title: 'What seedlings need',
      body: mycorrhiza,
    },
    {
      label: 'Care',
      title: 'Why it matters',
      body: 'Follow the evidence into conservation, learning, and cultivation.',
    },
  ];
}

function speciesLabel(plate: SpeciesPlate): string {
  return plate.species.replace(/^([A-Z][a-z]+)\s+(.+)$/, '$1 $2');
}

function buildSummaryCards(entry: GenusEntry): SummaryCard[] {
  return [
    {
      label: 'Habitat',
      value: entry.ecology.habitat,
      detail: 'The ecological setting visitors should understand first.',
      icon: <Leaf className="h-4 w-4" />,
    },
    {
      label: 'Climate band',
      value: entry.ecology.elevation,
      detail: 'Elevation gives a quick proxy for temperature and moisture.',
      icon: <Mountain className="h-4 w-4" />,
    },
    {
      label: 'Range',
      value: entry.regions.join(', '),
      detail: 'Interpreted from curated genus records and public references.',
      icon: <MapPin className="h-4 w-4" />,
    },
  ];
}

function buildEvidenceRows(entry: GenusEntry, liveCount?: number): EvidenceRow[] {
  const speciesNote = liveCount != null && liveCount > 0
    ? `${liveCount} live media records from the Calyx backend on this page`
    : `${entry.plates.length} curated reference species cards on this page`;
  return [
    { label: 'Taxonomic scope', value: `${entry.family} / ${entry.tribe}` },
    { label: 'Species represented', value: speciesNote },
    { label: 'Genus estimate', value: `${entry.speciesCount.toLocaleString()} described or accepted species in the working profile` },
    { label: 'Provenance state', value: 'Public summary; source-linked research view remains available through deeper pages' },
  ];
}

function activeFloweringMonths(entry: GenusEntry): Set<number> {
  const months = FLOWERING_WINDOWS[entry.genus.toLowerCase()] || [2, 3, 4, 5, 8, 9];
  return new Set(months);
}

const MiniCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <article className={`rounded-lg border border-[#dfd1ad] bg-[#fffaf0] p-4 ${className}`}>{children}</article>
);

const DailyGenusFeatureV5: React.FC = () => {
  // Use the context-driven genus so all homepage sections display the same genus,
  // including when the curator overrides via the daily_genus_snapshot table.
  const { genus: contextGenus } = useDailyGenus();

  // Resolve the full genus entry (ecology, regions, etc.) from the context genus.
  const entry = useMemo(() => {
    const local = lookupGenus(contextGenus);
    return local ?? featuredGenusEntry();
  }, [contextGenus]);

  // Fetch live species media from the Calyx backend. When the response arrives,
  // the species gallery replaces the static fallback plates so that images,
  // scientific names, and attribution all come from the same backend record.
  const [mediaItems, setMediaItems] = useState<GenusMediaItem[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void fetchCalyxGenusMedia(contextGenus, controller.signal)
      .then((resp) => {
        if (!controller.signal.aborted) setMediaItems(resp.items);
      })
      .catch(() => {
        // Backend offline — species grid falls back to static plates below.
        console.warn('[DailyGenusFeatureV5] Calyx media fetch failed for genus:', contextGenus);
      });
    return () => controller.abort();
  }, [contextGenus]);
  const trails = useMemo(() => buildDiscoveryTrails(entry), [entry]);
  const summaryCards = useMemo(() => buildSummaryCards(entry), [entry]);
  const evidenceRows = useMemo(() => buildEvidenceRows(entry, mediaItems.length > 0 ? mediaItems.length : undefined), [entry, mediaItems.length]);
  const floweringMonths = useMemo(() => activeFloweringMonths(entry), [entry]);
  // Static plates serve as the offline fallback for the species gallery.
  const staticPlates = useMemo(() => entry.plates.slice(0, 12), [entry.plates]);

  return (
    <div className="space-y-4">
      <DailyGenusFeatureV4 />

      {KNOWLEDGE_GRAPH_ENABLED && <DailyGenusGraphEvidence genus={entry.genus} />}

      <section className="rounded-lg border border-[#d9caa8] bg-[#f6f0df]/95 p-3 shadow-[0_10px_24px_rgba(30,40,20,0.06)]">
        <DailyGenusRelationshipChips
          genus={entry.genus}
          habitat={entry.ecology.habitat}
          geography={entry.regions.join(', ')}
          pollinator={entry.ecology.pollinatorGuild}
          fungus={entry.ecology.mycorrhizal}
          elevation={entry.ecology.elevation}
          sourceView="featuredGenusEntry"
          className="mt-0"
        />
      </section>

      <section className="rounded-lg border border-[#d9caa8] bg-[#fffaf0]/95 p-5 shadow-[0_10px_24px_rgba(30,40,20,0.06)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#8a8062]">Featured Genus</p>
            <h3 className="mt-1 font-serif text-3xl leading-tight text-[#24321f]">{entry.genus} as a living exhibit</h3>
            <p className="mt-2 text-sm leading-6 text-[#5d684c]">
              A public path from name and image into species, ecological partners, place, season, conservation, and visible evidence.
            </p>
          </div>
          <Link
            to={`/genus/${encodeURIComponent(entry.genus)}`}
            className="inline-flex items-center gap-2 rounded-lg border border-[#c7b27a] bg-[#f8ecc8] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[#5b4b21] hover:bg-[#efdca7]"
          >
            Open research profile <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {trails.map((trail) => (
            <MiniCard key={trail.label}>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#8a6f2d]">{trail.label}</p>
              <h4 className="mt-1 font-serif text-lg leading-tight text-[#24321f]">{trail.title}</h4>
              <p className="mt-2 line-clamp-3 text-[12.5px] leading-5 text-[#5d684c]">{trail.body}</p>
            </MiniCard>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[#d9caa8] bg-[#f6f0df]/95 p-5 shadow-[0_10px_24px_rgba(30,40,20,0.06)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#8a8062]">Species Gallery</p>
            <h3 className="mt-1 font-serif text-3xl leading-tight text-[#24321f]">Representative species</h3>
          </div>
          <Link
            to="/gallery"
            className="inline-flex items-center gap-2 rounded-lg border border-[#c7b27a] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[#5b4b21] hover:bg-[#fff6dc]"
          >
            Full gallery <Flower2 className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/*
          Live path: media items are sourced from the same Calyx API record
          as the hero image above — images, scientific names, and attribution
          all come from a single backend response so they are always in sync.

          Offline path: static curated plates are shown as text-only fallback
          cards when the Calyx backend is unavailable.
        */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mediaItems.length > 0
            ? mediaItems.slice(0, 12).map((item) => (
                <MiniCard key={item.media_id} className="overflow-hidden !p-0">
                  <figure>
                    <img
                      src={item.thumbnail_url || item.image_url}
                      alt={item.scientific_name}
                      className="h-40 w-full object-cover"
                      loading="lazy"
                    />
                    <figcaption className="p-4">
                      <h4 className="font-serif text-lg italic leading-tight text-[#24321f]">
                        {item.scientific_name}
                      </h4>
                      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8062]">
                        {item.source_name}
                      </p>
                      {item.attribution && (
                        <p className="mt-1 text-xs leading-5 text-[#5d684c]">{item.attribution}</p>
                      )}
                    </figcaption>
                  </figure>
                </MiniCard>
              ))
            : staticPlates.map((plate) => (
                <MiniCard key={plate.species} className="min-h-[150px]">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="font-serif text-xl italic leading-tight text-[#24321f]">{speciesLabel(plate)}</h4>
                    <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-[#8a6f2d]" />
                  </div>
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8062]">{plate.conservation}</p>
                  <p className="mt-3 text-sm leading-6 text-[#5d684c]">{plate.distribution}</p>
                </MiniCard>
              ))
          }
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[#d9caa8] bg-[#fffaf0]/95 p-5 shadow-[0_10px_24px_rgba(30,40,20,0.06)]">
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#8a8062]">Ecology Relationships</p>
          <h3 className="mt-1 font-serif text-3xl leading-tight text-[#24321f]">Partners in the life cycle</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <MiniCard>
              <div className="flex items-center gap-2 text-[#7b6425]"><Bug className="h-4 w-4" /><span className="font-mono text-[9px] uppercase tracking-[0.18em]">Pollinators</span></div>
              <p className="mt-3 text-sm leading-6 text-[#3a4630]">{entry.ecology.pollinatorGuild}</p>
              <Link to="/pollinators" className="mt-4 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#7b6425] hover:text-[#24321f]">Drill down <ArrowRight className="h-3 w-3" /></Link>
            </MiniCard>
            <MiniCard>
              <div className="flex items-center gap-2 text-[#7b6425]"><Sprout className="h-4 w-4" /><span className="font-mono text-[9px] uppercase tracking-[0.18em]">Mycorrhizae</span></div>
              <p className="mt-3 text-sm leading-6 text-[#3a4630]">{entry.ecology.mycorrhizal}</p>
              <Link to="/mycorrhizae" className="mt-4 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#7b6425] hover:text-[#24321f]">Drill down <ArrowRight className="h-3 w-3" /></Link>
            </MiniCard>
          </div>
        </div>

        <div className="rounded-lg border border-[#d9caa8] bg-[#fffaf0]/95 p-5 shadow-[0_10px_24px_rgba(30,40,20,0.06)]">
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#8a8062]">Habitat / Climate / Elevation</p>
          <h3 className="mt-1 font-serif text-3xl leading-tight text-[#24321f]">A compact ecological read</h3>
          <div className="mt-5 grid gap-3">
            {summaryCards.map((card) => (
              <MiniCard key={card.label}>
                <div className="flex items-center gap-2 text-[#7b6425]">{card.icon}<span className="font-mono text-[9px] uppercase tracking-[0.18em]">{card.label}</span></div>
                <p className="mt-2 text-sm leading-6 text-[#3a4630]">{card.value}</p>
                <p className="mt-1 text-xs leading-5 text-[#7c806f]">{card.detail}</p>
              </MiniCard>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[#d9caa8] bg-[#f6f0df]/95 p-5 shadow-[0_10px_24px_rgba(30,40,20,0.06)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#8a8062]">Map and Atlas Preview</p>
              <h3 className="mt-1 font-serif text-3xl leading-tight text-[#24321f]">Records, ranges, and caveats</h3>
            </div>
            <Map className="h-5 w-5 text-[#8a6f2d]" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {['Observations', 'Herbarium and GBIF', 'Interpreted range'].map((label) => (
              <MiniCard key={label}>
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a6f2d]">{label}</p>
                <p className="mt-2 text-xs leading-5 text-[#5d684c]">Displayed as evidence layers, not exact boundaries.</p>
              </MiniCard>
            ))}
          </div>
          <Link to="/atlas" className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[#c7b27a] bg-[#fff8e6] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[#5b4b21] hover:bg-[#f8ecc8]">Open atlas <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>

        <div className="rounded-lg border border-[#d9caa8] bg-[#f6f0df]/95 p-5 shadow-[0_10px_24px_rgba(30,40,20,0.06)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#8a8062]">Flowering Through Time</p>
              <h3 className="mt-1 font-serif text-3xl leading-tight text-[#24321f]">Seasonal signal</h3>
            </div>
            <CalendarRange className="h-5 w-5 text-[#8a6f2d]" />
          </div>
          <div className="mt-5 grid grid-cols-6 gap-2 sm:grid-cols-12">
            {MONTHS.map((month, index) => {
              const active = floweringMonths.has(index);
              return (
                <div key={month} className={`rounded-lg border px-2 py-3 text-center font-mono text-[10px] uppercase tracking-[0.1em] ${active ? 'border-[#9c7b25] bg-[#d4b34a] text-[#14281c]' : 'border-[#dfd1ad] bg-[#fffaf0] text-[#8a8062]'}`}>
                  {month}
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs leading-5 text-[#5d684c]">Genus-level phenology is summarized here; species-level timing belongs in the research profile.</p>
        </div>
      </section>

      <section className="rounded-lg border border-[#d9caa8] bg-[#fffaf0]/95 p-5 shadow-[0_10px_24px_rgba(30,40,20,0.06)]">
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#8a8062]">Conservation and Evidence</p>
            <h3 className="mt-1 font-serif text-3xl leading-tight text-[#24321f]">Why {entry.genus} matters</h3>
            <p className="mt-3 text-sm leading-6 text-[#5d684c]">
              Conservation context stays paired with visible evidence so the public story remains inviting without hiding uncertainty.
            </p>
            <Link to="/conservation" className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[#c7b27a] bg-[#f8ecc8] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[#5b4b21] hover:bg-[#efdca7]">Conservation hub <ShieldCheck className="h-3.5 w-3.5" /></Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {evidenceRows.map((row) => (
              <MiniCard key={row.label}>
                <div className="flex items-center gap-2 text-[#7b6425]"><Database className="h-4 w-4" /><span className="font-mono text-[9px] uppercase tracking-[0.18em]">{row.label}</span></div>
                <p className="mt-2 text-sm leading-6 text-[#3a4630]">{row.value}</p>
              </MiniCard>
            ))}
            <MiniCard>
              <div className="flex items-center gap-2 text-[#7b6425]"><BookOpen className="h-4 w-4" /><span className="font-mono text-[9px] uppercase tracking-[0.18em]">Research view</span></div>
              <p className="mt-2 text-sm leading-6 text-[#3a4630]">Taxonomy, literature, occurrence filters, and trait methods continue beyond the homepage.</p>
            </MiniCard>
          </div>
        </div>
      </section>
    </div>
  );
};

export default DailyGenusFeatureV5;
