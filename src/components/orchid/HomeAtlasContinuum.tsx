import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Globe2, MapPinned, MessageCircle } from 'lucide-react';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import { featuredTaxonAtlasHref, featuredTaxonCalyxHref } from '@/lib/featuredTaxonNavigation';
import { publicGenusMediaItems } from '@/lib/genusMediaResolver';

/**
 * Homepage Atlas window.
 *
 * This intentionally does not recreate the full GIS workspace. The homepage
 * asks one biological/geographic question using the same canonical featured-
 * taxon state as the hero and relationship view. Detailed cartography remains
 * the responsibility of the Atlas workspace / Atlas Next lane.
 */
const HomeAtlasContinuum: React.FC = () => {
  const { genus, continuum, continuumStatus } = useDailyGenus();
  const geography = continuum?.relationships?.geography ?? null;
  const occurrenceDomain = continuum?.domains.find((item) => item.domain === 'occurrences') ?? null;
  const ecologicalDomains = continuum?.graph.status === 'ok'
    ? (continuum.graph.evidence.ecologicalDomains ?? [])
    : [];
  const geographyGraph = ecologicalDomains.find((item) => item.domain === 'geography') ?? null;
  const elevationGraph = ecologicalDomains.find((item) => item.domain === 'elevation') ?? null;
  const habitatGraph = ecologicalDomains.find((item) => item.domain === 'habitat') ?? null;
  const climateGraph = ecologicalDomains.find((item) => item.domain === 'climate') ?? null;
  const mycorrhizaGraph = ecologicalDomains.find((item) => item.domain === 'mycorrhiza') ?? null;
  const hero = publicGenusMediaItems(continuum?.media.items ?? [])[0] ?? null;

  const hasGraphLinkage = (domain: { nodes: number; edges: number } | null) =>
    Boolean(domain && (domain.nodes > 0 || domain.edges > 0));
  const geographyGraphLinked = hasGraphLinkage(geographyGraph);
  const elevationGraphLinked = hasGraphLinkage(elevationGraph);
  const habitatGraphLinked = hasGraphLinkage(habitatGraph);
  const climateGraphLinked = hasGraphLinkage(climateGraph);
  const mycorrhizaGraphLinked = hasGraphLinkage(mycorrhizaGraph);
  const evidenceAvailable = Boolean(
    geography?.hasData ||
    occurrenceDomain?.state === 'known' ||
    geographyGraphLinked ||
    elevationGraphLinked ||
    habitatGraphLinked ||
    climateGraphLinked ||
    mycorrhizaGraphLinked,
  );
  const atlasHref = featuredTaxonAtlasHref(genus);
  const calyxHref = featuredTaxonCalyxHref(genus);

  const graphCoverageSummary = [
    geographyGraphLinked && geographyGraph
      ? `geography ${geographyGraph.nodes} nodes · ${geographyGraph.edges} relationships`
      : null,
    elevationGraphLinked && elevationGraph
      ? `elevation ${elevationGraph.nodes} nodes · ${elevationGraph.edges} relationships`
      : null,
    habitatGraphLinked && habitatGraph
      ? `habitat ${habitatGraph.nodes} nodes · ${habitatGraph.edges} relationships`
      : null,
    climateGraphLinked && climateGraph
      ? `climate ${climateGraph.nodes} nodes · ${climateGraph.edges} relationships`
      : null,
    mycorrhizaGraphLinked && mycorrhizaGraph
      ? `mycorrhiza ${mycorrhizaGraph.nodes} nodes · ${mycorrhizaGraph.edges} relationships`
      : null,
  ].filter(Boolean).join(' · ');

  return (
    <section id="home-atlas" className="relative overflow-hidden border-y border-white/[0.08] bg-[#07110c] text-[#f5f0e8]">
      {hero?.image_url ? (
        <div className="absolute inset-0" aria-hidden="true">
          <img src={hero.image_url} alt="" className="h-full w-full object-cover opacity-[0.12]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,17,12,0.98)_0%,rgba(7,17,12,0.90)_48%,rgba(7,17,12,0.78)_100%)]" />
        </div>
      ) : null}

      <div className="relative z-10 mx-auto grid max-w-[1300px] gap-8 px-6 py-12 lg:grid-cols-[0.9fr_1.1fr] lg:px-10 lg:py-16">
        <div>
          <div className="inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.28em] text-[#d4b34a]">
            <Globe2 className="h-4 w-4" />
            Living Atlas
          </div>
          <h2 className="mt-4 font-serif text-4xl leading-[1.02] text-[#fffaf0] md:text-5xl">
            Where do we actually know <span className="italic text-[#d4b34a]">{genus}</span> occurs?
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#d8cfbd]/82">
            The homepage uses the same Continuum evidence state as the featured orchid instead of maintaining a second set of Atlas statistics and fallback counts.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to={atlasHref}
              className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/45 bg-[#d4b34a]/10 px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#d4b34a] transition-colors hover:bg-[#d4b34a]/18"
            >
              Explore {genus} in Atlas <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to={calyxHref}
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.16] bg-white/[0.04] px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#eee4d1] transition-colors hover:border-[#d4b34a]/35 hover:bg-[#d4b34a]/10 hover:text-[#d4b34a]"
            >
              <MessageCircle className="h-4 w-4" />
              Ask Calyx about {genus}
            </Link>
          </div>
          <p className="mt-3 max-w-2xl text-xs leading-5 text-[#9e978a]">
            Both paths carry the same featured genus through the canonical Continuum handoff, so a demonstration can move from geographic evidence to a grounded Calyx inquiry without resetting scientific context.
          </p>
        </div>

        <div className="rounded-[1.5rem] border border-white/[0.09] bg-black/20 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.2)]">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10 text-[#d4b34a]">
              <MapPinned className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#d4b34a]">Ecological and geographic evidence</p>
              <p className="mt-2 text-sm leading-6 text-[#d8cfbd]/82">
                {continuumStatus === 'loading' && 'Loading connected occurrence, geography, elevation, habitat, climate, and mycorrhizal evidence…'}
                {continuumStatus === 'unavailable' && 'Continuum evidence is temporarily unavailable. No ecological or geographic fallback has been substituted.'}
                {continuumStatus === 'ready' && evidenceAvailable && (
                  geography?.summary || graphCoverageSummary || 'Occurrence and ecological evidence are linked in the Continuum.'
                )}
                {continuumStatus === 'ready' && !evidenceAvailable && 'No geographic, elevation, habitat, climate, or mycorrhizal evidence is linked in the current Continuum view. This is a knowledge gap, not evidence that the orchid is absent.'}
              </p>
            </div>
          </div>

          {continuumStatus === 'ready' && graphCoverageSummary ? (
            <div className="mt-4 rounded-xl border border-[#d4b34a]/20 bg-[#d4b34a]/[0.06] px-3 py-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#d4b34a]">Canonical graph coverage</p>
              <p className="mt-1 text-xs leading-5 text-[#d8cfbd]/78">{graphCoverageSummary}</p>
            </div>
          ) : null}

          {continuumStatus === 'ready' && geography?.items?.length ? (
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {geography.items.slice(0, 6).map((item) => (
                <div key={item} className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-3 text-sm text-[#eee4d1]">
                  {item}
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-5 border-t border-white/[0.08] pt-4 text-xs leading-5 text-[#9e978a]">
            Counts above are graph linkage, not occurrence totals, inferred range limits, habitat breadth, climate tolerances, or association strength. This public summary does not imply that locality-sensitivity safeguards are present here; precise locality remains governed inside the full Atlas rather than being copied onto the homepage.
          </div>
        </div>
      </div>
    </section>
  );
};

export default HomeAtlasContinuum;
