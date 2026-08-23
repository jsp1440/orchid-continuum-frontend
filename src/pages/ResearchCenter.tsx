import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Filter,
  Network,
  FileSearch,
  Download,
  Beaker,
  GitBranch,
  Database,
} from 'lucide-react';
import PageShell from '@/components/orchid/PageShell';
import ResearchStationWorkbench from '@/components/research/ResearchStationWorkbench';
import {
  researchStationAtlasHref,
  researchStationCalyxHref,
} from '@/lib/researchStationNavigation';
import { ATLAS_NEXT_RESEARCH_ORIGIN } from '@/features/atlas-next/researchHandoff';
import { ATLAS_WORKSPACE_ORIGIN } from '@/lib/featuredTaxonNavigation';
import { GENUS_PROFILE_ORIGIN } from '@/lib/genusProfileNavigation';
import { SPECIES_DOSSIER_RESEARCH_ORIGIN } from '@/lib/speciesDossierResearchNavigation';
import { MATRIX_RESEARCH_ORIGIN } from '@/lib/matrixResearchNavigation';
import { parseResearchRouteContext } from '@/lib/researchRouteContext';

/**
 * Research Center — advanced research surface for power users.
 *
 * Five pillars: Query Builder, Trait Explorer, Ecological Networks,
 * Literature/Evidence, and Exports. Each pillar maps to a future
 * Continuum API endpoint; this page is intentionally a structural
 * placeholder so researchers can see what is coming online.
 */

const PILLARS = [
  {
    icon: Filter,
    title: 'Query Builder',
    body: 'Compose filters across taxonomy, traits, ecology, and geography. Save queries as reproducible URLs.',
    endpoint: 'POST /api/research/queries',
    fields: ['genus', 'biome', 'elevation', 'pollinator', 'iucn'],
  },
  {
    icon: Beaker,
    title: 'Trait Explorer',
    body: 'Distributions of growth form, flower size, perfume class, lip morphology — across genera and clades.',
    endpoint: 'GET /api/research/traits',
    fields: ['growth-form', 'flower-size', 'spur-length', 'scent-class'],
  },
  {
    icon: Network,
    title: 'Ecological Networks',
    body: 'Bipartite plant-pollinator graphs, partner overlap, and orchid-mycorrhiza associations.',
    endpoint: 'GET /api/research/networks',
    fields: ['pollinator-graph', 'mycorrhiza-graph', 'overlap-matrix'],
  },
  {
    icon: FileSearch,
    title: 'Literature & Evidence',
    body: 'Every claim traceable to a source — herbarium specimen, peer-reviewed paper, or curatorial note.',
    endpoint: 'GET /api/research/evidence',
    fields: ['POWO', 'GBIF', 'GloBI', 'Tropicos', 'curator-notes'],
  },
  {
    icon: Download,
    title: 'Exports',
    body: 'Reproducible CSV / GeoJSON / Darwin Core archives for your filtered query.',
    endpoint: 'POST /api/research/exports',
    fields: ['csv', 'geojson', 'darwin-core', 'parquet'],
  },
] as const;

const ResearchCenter: React.FC = () => {
  // A project carried in from another module keeps the investigation intact.
  //
  // Governed origins are read through the shared parser rather than by
  // re-deriving the rule here. The parser fails closed on a malformed genus,
  // on an unbounded project id, and on any attempt to assert governed Atlas
  // navigation context as evidence.
  const [searchParams] = useSearchParams();
  const routeContext = parseResearchRouteContext(searchParams);
  const routeGenus = routeContext?.genus ?? '';
  const projectId = routeContext?.projectId ?? null;
  const arrivedFromAtlas =
    routeContext?.origin === ATLAS_NEXT_RESEARCH_ORIGIN ||
    routeContext?.origin === ATLAS_WORKSPACE_ORIGIN;
  const arrivedFromGenusProfile = routeContext?.origin === GENUS_PROFILE_ORIGIN;
  const arrivedFromDossier = routeContext?.origin === SPECIES_DOSSIER_RESEARCH_ORIGIN;
  // A Matrix arrival previously fell through to "Continuing from Genus of the
  // Day" — a curated editorial pick, which is not where this subject came from.
  // Misattributing provenance on the surface whose purpose is provenance is not
  // a copy problem.
  const arrivedFromMatrix = routeContext?.origin === MATRIX_RESEARCH_ORIGIN;
  // The dossier supplies the accepted binomial; every other origin carries only
  // a genus. Naming the subject the visitor actually arrived with is the point
  // of the handoff - re-deriving it here would be the loss it exists to fix.
  const routeTaxon =
    routeContext && 'taxon' in routeContext ? (routeContext.taxon ?? null) : null;
  const subjectLabel = routeTaxon ?? routeGenus;

  // The onward links must carry the subject the banner just named, not the
  // genus token it was derived from. A visitor arriving from a Species Dossier
  // for Cattleya purpurata is studying that species; handing Atlas and Calyx
  // only "Cattleya" silently widens the subject to every congener, which is
  // precisely the identity loss these handoffs exist to prevent — and the page
  // says the subject is preserved while doing it.
  //
  // researchStationAtlasHref/CalyxHref classify by name shape rather than
  // assuming rank: a binomial becomes Atlas's species filter (matched against
  // the canonical binomial) and reaches Calyx as an exact taxon alongside the
  // derived genus; a bare genus resolves to the same genus filter as before.
  // Calyx reads that exact taxon only under the research-station origin, and
  // asserts taxon_is_evidence=false when it does.
  const onwardContext = { taxon: subjectLabel, projectId };
  const featuredGenusWithoutProject = Boolean(routeGenus && !projectId);
  const [activeQuery, setActiveQuery] = useState({
    genus: routeGenus,
    country: '',
    biome: '',
    pollinator: '',
  });

  useEffect(() => {
    if (!routeGenus) return;
    setActiveQuery((query) => ({ ...query, genus: routeGenus }));
  }, [routeGenus]);

  return (
    <PageShell
      eyebrow="Research surface"
      title="Research Center"
      titleAccent="ask the Continuum harder questions."
      intro="Compose queries across taxonomy, traits, ecology, and geography. Trace every result to evidence, then export reproducible bundles for your analysis."
      heroAside={
        <div className="rounded-2xl border border-emerald-300/30 bg-emerald-300/5 p-5">
          <div className="text-[10px] tracking-[0.25em] uppercase text-emerald-300/80 mb-3 flex items-center gap-2">
            <Database className="h-3 w-3" /> Backed by oc_api views
          </div>
          <p className="text-xs text-white/65 leading-relaxed">
            All research queries flow through the typed FastAPI surface —
            never directly to the underlying Postgres. Reproducibility is
            built into every export.
          </p>
        </div>
      }
    >
      {routeGenus ? (
        <section className="pt-10">
          <div className="max-w-7xl mx-auto px-6 lg:px-10">
            <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.06] p-5 md:flex md:items-center md:justify-between md:gap-6">
              <div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-emerald-300/75">
                  {arrivedFromDossier
                    ? 'Continuing from the Species Dossier'
                    : arrivedFromAtlas
                      ? 'Continuing from the Atlas'
                      : arrivedFromGenusProfile
                        ? 'Continuing from the Genus Profile'
                        : arrivedFromMatrix
                          ? 'Continuing from a Matrix candidate'
                          : 'Continuing from Genus of the Day'}
                </div>
                <p className="mt-2 text-sm leading-6 text-white/75">
                  <span className="font-serif text-lg italic text-white">{subjectLabel}</span>{' '}
                  is preserved here as navigation context and preloaded into the research query builder.
                  It is not scientific evidence and it does not imply that a persisted research project is
                  about this genus.
                </p>
                {/* The Matrix contract asserts context_is_identification=false.
                    That assertion was parsed and then never shown, so a ranked
                    candidate read exactly like a determined one. */}
                {arrivedFromMatrix ? (
                  <p className="mt-2 text-sm leading-6 text-white/75">
                    This subject came from a Matrix ranking, which is a candidate rather than a
                    verified identification. Nothing here determines what the specimen is.
                  </p>
                ) : null}
              </div>
              <div className="mt-4 flex shrink-0 flex-wrap gap-2 md:mt-0">
                <Link
                  to={researchStationAtlasHref(onwardContext)}
                  className="rounded-full border border-white/15 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/70 hover:border-emerald-300/50"
                >
                  Return to Atlas
                </Link>
                <Link
                  to={researchStationCalyxHref(onwardContext)}
                  className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-100 hover:bg-emerald-300/15"
                >
                  Ask Calyx
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Research Station — one investigation, read end to end against the
          canonical Research Workspace contract. This is the live surface; the
          query-builder pillars below remain a structural preview. */}
      <section className="py-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="mb-6">
            <div className="text-[10px] tracking-[0.25em] uppercase text-emerald-300/70 mb-2">
              Research Station · live
            </div>
            <h2 className="font-serif text-2xl md:text-3xl">
              {featuredGenusWithoutProject ? 'No persisted investigation selected' : 'Your current investigation'}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
              {featuredGenusWithoutProject
                ? 'The featured genus remains navigation context only. Choose or carry a project before the Research Station opens persisted evidence, so an unrelated project is never presented as if it belongs to this genus.'
                : 'Subject, question, what the Continuum holds, where evidence disagrees, what remains unknown, and where to continue. Interpretation comes from Calyx over the governed evidence-synthesis path — never from this page.'}
            </p>
          </div>
          {featuredGenusWithoutProject ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-[#142a1f] p-6">
              <p className="max-w-3xl text-sm leading-6 text-white/65">
                No research project identity came with this handoff. The Research Station will not auto-select
                another persisted project merely because one exists. Continue with the genus in Atlas or Calyx,
                or open Research with an explicit project to inspect its governed evidence.
              </p>
            </div>
          ) : (
            <ResearchStationWorkbench projectId={projectId} />
          )}
        </div>
      </section>

      {/* Query builder mockup */}
      <section className="py-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="rounded-2xl border border-white/10 bg-[#142a1f] p-6 md:p-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-emerald-300/70 mb-2">
                  Query builder · prototype
                </div>
                <h2 className="font-serif text-2xl md:text-3xl">
                  Compose a research query
                </h2>
              </div>
              <span className="text-[10px] tracking-[0.2em] uppercase text-amber-200/80 px-2 py-1 rounded-full border border-amber-300/30">
                placeholder
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(['genus', 'country', 'biome', 'pollinator'] as const).map(
                k => (
                  <label
                    key={k}
                    className="flex flex-col gap-2 text-[10px] tracking-[0.2em] uppercase text-white/55"
                  >
                    {k}
                    <input
                      value={activeQuery[k]}
                      onChange={e =>
                        setActiveQuery(q => ({ ...q, [k]: e.target.value }))
                      }
                      placeholder={`filter by ${k}`}
                      className="bg-[#0d1f17] border border-white/15 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-300/60 normal-case tracking-normal"
                    />
                  </label>
                ),
              )}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled
                className="px-5 py-2 rounded-full bg-emerald-300/30 text-emerald-100 text-sm cursor-not-allowed border border-emerald-300/30"
              >
                Run query (API pending)
              </button>
              <span className="text-[10px] tracking-[0.2em] uppercase text-white/40">
                <code className="text-emerald-200/80">POST /api/research/queries</code>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="pb-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/70 mb-3">
            Five research pillars
          </div>
          <h2 className="font-serif text-3xl md:text-4xl mb-10 max-w-2xl">
            From curated lists to reproducible exports.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {PILLARS.map(p => {
              const Icon = p.icon;
              return (
                <div
                  key={p.title}
                  className="rounded-2xl border border-white/10 bg-[#142a1f] p-6 flex flex-col"
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-300/10 border border-emerald-300/20 flex items-center justify-center text-emerald-200 mb-4">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="font-serif text-xl mb-2">{p.title}</div>
                  <p className="text-sm text-white/60 leading-relaxed mb-4">
                    {p.body}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {p.fields.map(f => (
                      <span
                        key={f}
                        className="text-[10px] tracking-[0.15em] uppercase text-white/55 px-2 py-0.5 rounded-full border border-white/15"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                  <code className="text-[10px] text-emerald-200/80 mt-auto truncate">
                    {p.endpoint}
                  </code>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Architecture note */}
      <section className="py-16 border-t border-white/5 bg-[#0a1812]">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 text-center">
          <GitBranch className="h-6 w-6 text-emerald-300 mx-auto mb-4" />
          <h2 className="font-serif text-2xl md:text-3xl mb-4">
            Reproducibility is a first-class citizen.
          </h2>
          <p className="text-sm text-white/60 leading-relaxed max-w-2xl mx-auto">
            Every query is a stable URL. Every export carries its query, the
            API version, and the dataset snapshot date. Cite the Continuum;
            the Continuum will cite itself back.
          </p>
        </div>
      </section>
    </PageShell>
  );
};

export default ResearchCenter;
