/**
 * HabitatJourney
 * --------------
 * Two routes share this page:
 *   /habitats/:biome     — biome-level immersive journey
 *   /ecosystems/:species — species-level habitat journey
 *
 * Atmospheric "space → continent → biome → forest → orchid niche"
 * transitions are implemented with lightweight CSS layering + the
 * shared AtlasMiniMap (no autoplaying video).
 */

import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Leaf,
  Mountain,
  Globe2,
  Bug,
  Network,
  ShieldAlert,
  Database,
  ImageOff,
} from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import AtlasMiniMap from '@/components/orchid/AtlasMiniMap';
import {
  Awaiting,
  ConservationChip,
  SourceCitation,
  VerifiedBadge,
} from '@/components/orchid/SourceBadges';
import {
  fetchBiome,
  fetchCanonicalSpecies,
  fetchOccurrencesForSpecies,
  fetchAtlasOccurrencePoints,
  type AtlasOccurrencePoint,
  type BiomeAggregate,
  type CanonicalSpecies,
} from '@/lib/orchidContinuum';

interface HabitatJourneyProps {
  mode: 'biome' | 'species';
}

const HabitatJourney: React.FC<HabitatJourneyProps> = ({ mode }) => {
  const params = useParams();
  const slug = mode === 'biome' ? params.biome : params.species;

  const [loading, setLoading] = useState(true);
  const [biome, setBiome] = useState<BiomeAggregate | null>(null);
  const [species, setSpecies] = useState<CanonicalSpecies | null>(null);
  const [points, setPoints] = useState<AtlasOccurrencePoint[]>([]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    let cancelled = false;
    (async () => {
      if (mode === 'biome') {
        const [b, allPoints] = await Promise.all([fetchBiome(slug), fetchAtlasOccurrencePoints()]);
        if (cancelled) return;
        setBiome(b);
        if (b) {
          const slugSet = new Set(b.species.map((s) => s.slug));
          setPoints(
            allPoints.filter(
              (p) =>
                p.habitat?.toLowerCase() === b.biome.toLowerCase() ||
                slugSet.has(p.taxonomyId ?? ''),
            ),
          );
        } else {
          setPoints([]);
        }
      } else {
        const s = await fetchCanonicalSpecies(slug);
        if (cancelled) return;
        setSpecies(s);
        if (s) {
          const occ = await fetchOccurrencesForSpecies(s.slug);
          if (!cancelled) setPoints(occ);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug, mode]);

  return (
    <div className="min-h-screen bg-[#04050d] text-[#f5f0e8]" style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      <style>{`
        .font-display { font-family: 'Playfair Display', 'Cormorant Garamond', Georgia, serif; }
        .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        @keyframes mistDrift { 0%,100% { transform: translateX(0); opacity:0.4 } 50% { transform: translateX(20px); opacity:0.7 } }
        .mist { animation: mistDrift 16s ease-in-out infinite; }
      `}</style>
      <Navbar />

      <main className="pt-20">
        {loading && (
          <div className="min-h-[60vh] flex items-center justify-center">
            <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] uppercase text-[#cfc8b8]/70">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading habitat journey…
            </div>
          </div>
        )}

        {!loading && mode === 'biome' && !biome && (
          <EmptyState title="Biome not yet linked" />
        )}
        {!loading && mode === 'species' && !species && (
          <EmptyState title="Species not yet linked" />
        )}

        {!loading && mode === 'biome' && biome && (
          <BiomeView biome={biome} points={points} />
        )}

        {!loading && mode === 'species' && species && (
          <SpeciesEcosystemView species={species} points={points} />
        )}
      </main>

      <Footer />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Biome view
// ---------------------------------------------------------------------------

const BiomeView: React.FC<{ biome: BiomeAggregate; points: AtlasOccurrencePoint[] }> = ({ biome, points }) => (
  <>
    {/* Hero — atmospheric layering: space → continent → biome */}
    <section className="relative overflow-hidden border-b border-white/[0.05]">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-[#c9a24a]/[0.06] blur-3xl mist" />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-emerald-500/[0.05] blur-3xl mist" />
      </div>
      <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10 py-14">
        <Link
          to="/atlas"
          className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.24em] uppercase text-[#cfc8b8]/55 hover:text-[#c9a24a] mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Atlas
        </Link>

        <div className="font-mono text-[10px] tracking-[0.36em] uppercase text-[#c9a24a]/85 mb-3">
          Habitat journey · Biome
        </div>
        <h1 className="font-display leading-[0.95] tracking-[-0.012em]" style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)' }}>
          {biome.biome}
        </h1>
        <div className="mt-4 max-w-3xl text-[14px] text-[#cfc8b8]/80 leading-relaxed">
          A living section of the Continuum where{' '}
          <span className="text-[#c9a24a]">{biome.speciesCount}</span> orchid species and{' '}
          <span className="text-[#c9a24a]">{biome.occurrenceCount.toLocaleString()}</span> georeferenced
          records intersect with the same ecological community.
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {biome.countries.slice(0, 10).map((c) => (
            <span key={c} className="font-mono text-[10px] tracking-[0.18em] uppercase px-2.5 py-1 rounded-full border border-white/15 text-[#cfc8b8]/75">
              {c}
            </span>
          ))}
        </div>
      </div>
    </section>

    {/* Distribution + species */}
    <section className="max-w-[1400px] mx-auto px-6 lg:px-10 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-7">
        <AtlasMiniMap
          points={points}
          title={`${biome.biome} · distribution`}
          atlasHref={`/atlas?habitats=${encodeURIComponent(biome.biome)}`}
        />
        <div className="mt-4 font-mono text-[10px] tracking-[0.18em] uppercase text-[#7a7466]">
          Source · Orchid Continuum DB · species + atlas_occurrences
        </div>
      </div>
      <div className="lg:col-span-5">
        <div className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-6">
          <div className="font-mono text-[10px] tracking-[0.26em] uppercase text-[#c9a24a] mb-4">
            Linked species
          </div>
          <ul className="divide-y divide-white/[0.06]">
            {biome.species.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/species/${encodeURIComponent(s.slug)}`}
                  className="flex items-center gap-3 py-3 hover:bg-white/[0.03] -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="w-10 h-10 rounded bg-[#06091a] border border-[#c9a24a]/20 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {s.imageUrl ? (
                      <img src={s.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImageOff className="h-3.5 w-3.5 text-[#c9a24a]/40" strokeWidth={1.2} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display italic text-[14px] text-[#faf7f2] truncate">{s.scientificName}</div>
                    {s.growthForm && (
                      <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-[#7a7466] truncate">
                        {s.growthForm}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
            {biome.species.length === 0 && (
              <li className="py-6 text-center">
                <Awaiting what="Linked species" />
              </li>
            )}
          </ul>
        </div>
      </div>
    </section>

    {/* Ecological story */}
    <section className="border-t border-white/[0.05]">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        <NarrativeCard icon={Leaf} title="Habitat type">
          {biome.biome}
        </NarrativeCard>
        <NarrativeCard icon={Mountain} title="Elevation pattern">
          {points.some((p) => typeof p.elevation_m === 'number')
            ? `${points
                .filter((p) => typeof p.elevation_m === 'number')
                .reduce((m, p) => Math.min(m, p.elevation_m!), Infinity)} – ${
                points
                  .filter((p) => typeof p.elevation_m === 'number')
                  .reduce((m, p) => Math.max(m, p.elevation_m!), 0)
              } m`
            : <Awaiting what="Elevation" />}
        </NarrativeCard>
        <NarrativeCard icon={Globe2} title="Distribution span">
          {biome.countries.length > 0 ? `${biome.countries.length} countries` : <Awaiting what="Range" />}
        </NarrativeCard>
      </div>
    </section>
  </>
);

// ---------------------------------------------------------------------------
// Species ecosystem view
// ---------------------------------------------------------------------------

const SpeciesEcosystemView: React.FC<{ species: CanonicalSpecies; points: AtlasOccurrencePoint[] }> = ({ species, points }) => (
  <>
    {/* Hero */}
    <section className="relative overflow-hidden border-b border-white/[0.05]">
      <div className="absolute inset-0 pointer-events-none">
        {species.imageUrl && (
          <img src={species.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#04050d]/85 via-[#04050d]/95 to-[#04050d]" />
      </div>
      <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10 py-14">
        <Link
          to={`/species/${encodeURIComponent(species.slug)}`}
          className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.24em] uppercase text-[#cfc8b8]/55 hover:text-[#c9a24a] mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to species card
        </Link>

        <div className="font-mono text-[10px] tracking-[0.36em] uppercase text-[#c9a24a]/85 mb-3">
          Habitat journey · Species ecosystem
        </div>
        <h1 className="font-display italic leading-[0.95] tracking-[-0.012em]" style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)' }}>
          {species.scientificName}
        </h1>
        {species.authority && (
          <div className="mt-2 font-mono text-[11px] tracking-[0.22em] uppercase text-[#c9a24a]/70">
            {species.authority}
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <ConservationChip status={species.conservationStatus} iucnCode={species.iucnCode} />
          {species.growthForm && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/15 bg-white/[0.02] font-mono text-[9px] tracking-[0.20em] uppercase text-[#cfc8b8]/85">
              <Leaf className="h-3 w-3" /> {species.growthForm}
            </span>
          )}
          {species.habitat && (
            <Link
              to={`/habitats/${encodeURIComponent(species.habitat.toLowerCase().replace(/\s+/g, '-'))}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#c9a24a]/30 bg-[#c9a24a]/[0.06] font-mono text-[9px] tracking-[0.20em] uppercase text-[#c9a24a]/90 hover:bg-[#c9a24a]/15"
            >
              {species.habitat}
            </Link>
          )}
        </div>
      </div>
    </section>

    {/* Distribution + relationships */}
    <section className="max-w-[1400px] mx-auto px-6 lg:px-10 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-7">
        <AtlasMiniMap
          points={points}
          title="Native distribution"
          atlasHref={`/atlas?genera=${encodeURIComponent(species.genus)}`}
        />
      </div>
      <div className="lg:col-span-5 space-y-5">
        <NarrativeCard icon={Bug} title="Pollinator relationship">
          {species.pollinators.length > 0 ? (
            <div className="space-y-2">
              {species.pollinators.map((p, i) => (
                <Link
                  key={i}
                  to={`/pollinators/${encodeURIComponent((p.taxon || p.name || '').toLowerCase().replace(/\s+/g, '-'))}`}
                  className="block hover:text-[#c9a24a] transition-colors"
                >
                  {p.name || p.taxon}
                  {p.mechanism && (
                    <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#7a7466] mt-0.5">
                      {p.mechanism}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          ) : <Awaiting what="Pollinator data" />}
        </NarrativeCard>

        <NarrativeCard icon={Network} title="Mycorrhizal association">
          {species.mycorrhizal ? (
            <Link
              to={`/mycorrhizae/${encodeURIComponent((species.mycorrhizal.taxon || '').toLowerCase().replace(/\s+/g, '-'))}`}
              className="hover:text-[#c9a24a]"
            >
              {species.mycorrhizal.taxon}
              {species.mycorrhizal.family && (
                <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#7a7466]">
                  {species.mycorrhizal.family}
                </div>
              )}
            </Link>
          ) : <Awaiting what="Mycorrhizal data" />}
        </NarrativeCard>

        <NarrativeCard icon={Mountain} title="Elevation envelope">
          {species.traits?.elevation_m
            ? `${species.traits.elevation_m[0]} – ${species.traits.elevation_m[1]} m`
            : <Awaiting what="Elevation" />}
        </NarrativeCard>
      </div>
    </section>

    {/* Provenance */}
    <section className="border-t border-white/[0.05]">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-10 flex flex-wrap items-center gap-3">
        <div className="font-mono text-[10px] tracking-[0.24em] uppercase text-[#c9a24a]">Data provenance</div>
        <VerifiedBadge verified={species.curatedOccurrenceCount > 0} />
        <SourceCitation dataset="Orchid Continuum" sourceRecordId={species.id} />
        {species.ingestedOccurrenceCount > 0 && (
          <SourceCitation dataset="GBIF" sourceRecordId={`${species.ingestedOccurrenceCount}`} />
        )}
      </div>
    </section>
  </>
);

const NarrativeCard: React.FC<{ icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }> = ({ icon: Icon, title, children }) => (
  <div className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-5">
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-3.5 w-3.5 text-[#c9a24a]" />
      <div className="font-mono text-[10px] tracking-[0.26em] uppercase text-[#c9a24a]">{title}</div>
    </div>
    <div className="font-body text-[13.5px] text-[#cfc8b8]/85">{children}</div>
  </div>
);

const EmptyState: React.FC<{ title: string }> = ({ title }) => (
  <div className="min-h-[60vh] flex items-center justify-center px-6">
    <div className="text-center max-w-lg rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-10">
      <Database className="h-9 w-9 text-[#c9a24a]/50 mx-auto mb-4" strokeWidth={1.2} />
      <div className="font-mono text-[10px] tracking-[0.24em] uppercase text-[#c9a24a]/70 mb-2">
        Awaiting Orchid Continuum Record
      </div>
      <div className="font-display text-2xl text-[#faf7f2] mb-3">{title}</div>
      <div className="text-sm text-[#cfc8b8]/65 leading-relaxed">
        The curatorial team has not yet linked this entry to the live biodiversity layer.
        It will appear here once ingestion or steward review completes.
      </div>
      <Link
        to="/atlas"
        className="inline-flex items-center gap-2 mt-6 font-mono text-[10px] tracking-[0.22em] uppercase px-4 py-2 rounded-full border border-[#c9a24a]/40 text-[#c9a24a] hover:bg-[#c9a24a]/10"
      >
        Open the Atlas
      </Link>
    </div>
  </div>
);

export default HabitatJourney;
