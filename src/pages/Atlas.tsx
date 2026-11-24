import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Filter,
  Layers,
  Sparkles,
  Globe2,
  Loader2,
  X,
  MapPin,
  Mountain,
  ShieldAlert,
  Bug,
  Network,
  Leaf,
  GitBranch,
  Database,
  ImageOff,
  CheckCircle2,
} from 'lucide-react';

import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import LiveAtlasMap from '@/components/atlas/LiveAtlasMap';
import AtlasDebugPanel from '@/components/atlas/AtlasDebugPanel';
import AtlasCompletenessBadge from '@/components/atlas/AtlasCompletenessBadge';
import AtlasTour from '@/components/atlas/AtlasTour';
import GrandTour from '@/components/atlas/GrandTour';
import { tourPanelIndexFromParam, type TourStop } from '@/lib/grandTour';
import { useAtlasFilters } from '@/contexts/AtlasFilterContext';
import { SourceCitation } from '@/components/orchid/SourceBadges';
import { resolveAtlasLocation, toPublicAtlasOccurrence } from '@/lib/atlasLocalitySafety';
import { ATLAS_RECORDS_ZOOM, cellResolutionForZoom, hasActiveAtlasFilters } from '@/lib/atlasCells';
import {
  fetchAtlasOccurrencePointsProgressive,
  fetchAtlasOccurrence,
  fetchAtlasFacets,
  fetchAtlasCells,
  fetchAtlasGenusPoints,
  applyAtlasFilters,
  canonicalSlug,
  didAtlasLoadFail,
  didAtlasLoadIncomplete,
  didAtlasLoadCapped,
  resetOrchidContinuumCaches,
  type AtlasCellSummary,
  type AtlasOccurrencePoint,
  type AtlasSpeciesRecord,
  type AtlasFacets,
  type AtlasFilterState,
  type AtlasLoadProgress,
} from '@/lib/orchidContinuum';

/**
 * Atlas — live Orchid Continuum biodiversity intelligence interface.
 *
 * The world view is one request to the backend's cell summary
 * (`/atlas/public/cells`): record counts per generalised grid cell, drawn as
 * shaded squares. Per-record points are fetched only when the visitor filters
 * (a genus is loaded completely through the server-side genus filter) or
 * zooms in past ATLAS_RECORDS_ZOOM; if the cell route is unreachable the page
 * falls back to per-record points. Points come from the public occurrence
 * route, already generalised to grid-cell centres with no locality text
 * (precise coordinates never reach the browser). When the per-record load
 * stops at its page cap the page says so. No procedural points, no
 * synthetic imagery. Missing data is surfaced with explicit
 * "Awaiting Orchid Continuum Record" / "not yet linked" placeholders.
 */

type LayerKey =
  | 'occurrence'
  | 'pollinator'
  | 'mycorrhizal'
  | 'habitat'
  | 'climate'
  | 'conservation';

const LAYER_DEFS: { key: LayerKey; label: string; hint: string }[] = [
  { key: 'occurrence', label: 'Orchid occurrences', hint: 'Steward-verified records from species table' },
  { key: 'pollinator', label: 'Pollinator relationship', hint: 'Species with linked pollinator taxa' },
  { key: 'mycorrhizal', label: 'Mycorrhizal association', hint: 'Fungal partnerships (data pending)' },
  { key: 'habitat', label: 'Habitat / biome', hint: 'Epiphytic, terrestrial, lithophyte' },
  { key: 'climate', label: 'Climate / elevation', hint: 'Elevation banding · climate zones' },
  { key: 'conservation', label: 'Conservation risk', hint: 'IUCN-coded threatened taxa' },
];

const GENUS_COLOR: Record<string, string> = {
  Angraecum: '#ffffff',
  Bulbophyllum: '#ff9b6a',
  Catasetum: '#86efac',
  Cypripedium: '#ffd166',
  Dracula: '#c084fc',
  Paphiopedilum: '#c4a87a',
  Pleurothallis: '#7dd3a8',
  Stanhopea: '#fdba74',
  Vanilla: '#fef3c7',
};
const colorFor = (g: string) => GENUS_COLOR[g] ?? '#c9a24a';

function ToggleChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-2.5 py-1 rounded-full text-[10px] tracking-[0.14em] uppercase border transition-colors',
        active
          ? 'bg-[#c9a24a]/15 border-[#c9a24a]/60 text-[#faf7f2]'
          : 'bg-white/[0.02] border-white/10 text-[#cfc8b8]/70 hover:border-[#c9a24a]/40 hover:text-[#faf7f2]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <details open={title === 'Taxonomy'} className="border-t border-white/[0.06] pt-4">
      <summary className="flex cursor-pointer items-center gap-2 mb-2.5">
        <Icon className="h-3.5 w-3.5 text-[#c9a24a]" />
        <div className="font-mono text-[10px] tracking-[0.26em] uppercase text-[#c9a24a]">{title}</div>
      </summary>
      <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">{children}</div>
    </details>
  );
}

const Atlas: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialOccurrenceId = searchParams.get('occurrence');
  const [allPoints, setAllPoints] = useState<AtlasOccurrencePoint[]>([]);
  const [facets, setFacets] = useState<AtlasFacets | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // 'failed' = the occurrence service returned nothing after its retries;
  // 'partial' = some pages failed, so the map is incomplete. Neither may be
  // shown as "0 records" / a complete map: that would read as absence.
  const [loadOutcome, setLoadOutcome] = useState<'ok' | 'partial' | 'failed'>('ok');
  const [reloadKey, setReloadKey] = useState(0);
  const { filters, setFilters } = useAtlasFilters();
  const [activeLayers, setActiveLayers] = useState<Set<LayerKey>>(new Set(['occurrence']));
  const [intersectionMode, setIntersectionMode] = useState(false);
  const [selected, setSelected] = useState<AtlasOccurrencePoint | null>(null);
  const [record, setRecord] = useState<AtlasSpeciesRecord | null>(null);
  const [focusBounds, setFocusBounds] = useState<{ south: number; west: number; north: number; east: number } | null>(null);
  const [focusView, setFocusView] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  // `/atlas?tour=3` (or a stop slug) opens the Grand Tour at that stop.
  const tourParamIndex = tourPanelIndexFromParam(searchParams.get('tour'));
  const [grandTourOpen, setGrandTourOpen] = useState(tourParamIndex !== null);
  const [tourStartIndex, setTourStartIndex] = useState<number | null>(tourParamIndex);
  const [loadProgress, setLoadProgress] = useState<AtlasLoadProgress | null>(null);
  const [zoom, setZoom] = useState(2);
  const [cellSummary, setCellSummary] = useState<AtlasCellSummary | null>(null);
  const [cellsStatus, setCellsStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  // The per-record load stopped at its page cap: only the first records are shown.
  const [capped, setCapped] = useState(false);

  const selectedGenera = filters.genera ?? [];
  const generaKey = [...selectedGenera].sort().join('|');
  const recordsWanted =
    hasActiveAtlasFilters(filters) ||
    intersectionMode ||
    zoom >= ATLAS_RECORDS_ZOOM ||
    cellsStatus === 'unavailable' ||
    !!initialOccurrenceId;
  const recordMode: 'none' | 'genus' | 'all' = !recordsWanted ? 'none' : selectedGenera.length > 0 ? 'genus' : 'all';
  const overview = recordMode === 'none';
  const cellResolution = cellResolutionForZoom(zoom);

  const handleGrandTourStop = useCallback(
    (stop: TourStop) => {
      setFocusView({ lat: stop.map.lat, lng: stop.map.lng, zoom: stop.map.zoom });
      setFilters((prev) => ({ ...prev, countries: stop.map.country ? [stop.map.country] : undefined }));
    },
    [setFilters],
  );

  // Facets from the species table only: building them from every occurrence
  // would start the many-page load the overview exists to avoid. Genera and
  // countries of loaded records are merged in below.
  useEffect(() => {
    let cancelled = false;
    fetchAtlasFacets({ includeOccurrenceRows: false }).then((fs) => { if (!cancelled) setFacets(fs); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // World overview: one request for counts per generalised cell.
  const cellsNeeded = zoom < ATLAS_RECORDS_ZOOM;
  useEffect(() => {
    if (!cellsNeeded) return;
    let cancelled = false;
    fetchAtlasCells({ resolution: cellResolution }).then((summary) => {
      if (cancelled) return;
      if (summary === null) {
        setCellsStatus('unavailable');
        return;
      }
      setCellSummary(summary);
      setCellsStatus('ready');
    });
    return () => { cancelled = true; };
  }, [cellResolution, cellsNeeded, reloadKey]);

  // Per-record points, only once the visitor filters or zooms in.
  useEffect(() => {
    if (recordMode === 'none') return;
    let cancelled = false;
    setLoading(true);
    setLoadOutcome('ok');
    setLoadProgress(null);
    setCapped(false);
    (async () => {
      if (recordMode === 'genus') {
        const loads = await Promise.all(generaKey.split('|').map((genus) => fetchAtlasGenusPoints(genus)));
        if (cancelled) return;
        const byId = new Map<string, AtlasOccurrencePoint>();
        for (const load of loads) for (const p of load.points) byId.set(p.id, p);
        const pts = [...byId.values()];
        setAllPoints(pts);
        setCapped(loads.some((l) => l.capped));
        setLoadOutcome(
          pts.length === 0 && loads.every((l) => l.failed)
            ? 'failed'
            : loads.some((l) => l.failed || l.incomplete)
              ? 'partial'
              : 'ok',
        );
        setLoading(false);
        setLoadingMore(false);
        return;
      }
      // Progressive: paint as soon as the first page arrives, then grow as the
      // remaining pages (fetched a few at a time) come in.
      const pts = await fetchAtlasOccurrencePointsProgressive((points, progress) => {
        if (cancelled) return;
        setAllPoints(points);
        setLoadProgress(progress);
        if (points.length > 0) setLoading(false);
        setLoadingMore(!progress.done);
      });
      if (cancelled) return;
      setAllPoints(pts);
      setCapped(didAtlasLoadCapped());
      setLoadOutcome(
        pts.length === 0 && didAtlasLoadFail()
          ? 'failed'
          : didAtlasLoadFail() || didAtlasLoadIncomplete()
            ? 'partial'
            : 'ok',
      );
      setLoading(false);
      setLoadingMore(false);
    })();
    return () => { cancelled = true; };
  }, [recordMode, generaKey, reloadKey]);

  const shownFacets = useMemo(() => {
    if (!facets) return null;
    const merge = (base: string[], extra: (string | undefined)[]) =>
      Array.from(new Set([...base, ...extra.filter((v): v is string => !!v && v !== 'Unknown')])).sort((a, b) => a.localeCompare(b));
    return {
      ...facets,
      genera: merge(facets.genera, allPoints.map((p) => p.genus)),
      countries: merge(facets.countries, allPoints.map((p) => p.country)),
    };
  }, [facets, allPoints]);

  const retryAtlasLoad = useCallback(() => {
    resetOrchidContinuumCaches();
    setCellsStatus('loading');
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!initialOccurrenceId || allPoints.length === 0) return;
    const match = allPoints.find((p) => p.id === initialOccurrenceId);
    if (match) setSelected(toPublicAtlasOccurrence(match));
  }, [initialOccurrenceId, allPoints]);

  useEffect(() => {
    if (!selected) { setRecord(null); return; }
    let cancelled = false;
    fetchAtlasOccurrence(selected.id, {
      genus: selected.genus,
      canonicalName: selected.canonicalName,
      country: selected.country,
      region: selected.region,
      elevation_m: selected.elevation_m,
    }).then((r) => { if (!cancelled) setRecord(r); });
    return () => { cancelled = true; };
  }, [selected]);

  const filteredPoints = useMemo(() => {
    const effective: AtlasFilterState = { ...filters };
    if (intersectionMode) {
      if (activeLayers.has('occurrence')) effective.requireOccurrence = true;
      if (activeLayers.has('pollinator')) effective.requirePollinator = true;
      if (activeLayers.has('mycorrhizal')) effective.requireMycorrhizal = true;
    }
    return applyAtlasFilters(allPoints, effective).map(toPublicAtlasOccurrence);
  }, [allPoints, filters, intersectionMode, activeLayers]);

  const toggleLayer = (k: LayerKey) => setActiveLayers((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const toggleStringFilter = (field: keyof AtlasFilterState, value: string) => {
    setFilters((prev) => {
      const arr = (prev[field] as string[] | undefined) ?? [];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      return { ...prev, [field]: next.length ? next : undefined };
    });
  };
  const isActive = (field: keyof AtlasFilterState, value: string) => ((filters[field] as string[] | undefined) ?? []).includes(value);
  const resetFilters = () => setFilters({});
  const pointLayerMatch = (p: AtlasOccurrencePoint): Record<LayerKey, boolean> => ({
    occurrence: true,
    pollinator: p.pollinators.length > 0,
    mycorrhizal: p.mycorrhizal != null,
    habitat: !!p.habitat,
    climate: typeof p.elevation_m === 'number',
    conservation: p.iucnCode ? ['VU', 'EN', 'CR', 'NT', 'EW', 'EX'].includes(p.iucnCode) : false,
  });

  return (
    <div className="min-h-screen bg-[#04050d] text-[#f5f0e8]" style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      <style>{`.font-display { font-family: 'Playfair Display', 'Cormorant Garamond', Georgia, serif; } .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }`}</style>
      <Navbar />
      <main className="pt-20">
        <section className="border-b border-white/5">
          <div className="max-w-[1500px] mx-auto px-6 lg:px-10 py-5">
            <Link to="/" className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.24em] uppercase text-[#cfc8b8]/55 hover:text-[#c9a24a] transition-colors mb-3">
              <ArrowLeft className="h-3.5 w-3.5" /> Return to Continuum
            </Link>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <div className="font-mono text-[10px] tracking-[0.36em] uppercase text-[#c9a24a]/85 mb-3">Living Atlas · Biodiversity Workspace</div>
                <h1 className="font-display leading-[0.95] tracking-[-0.012em]" style={{ fontSize: 'clamp(2rem, 4.5vw, 3.4rem)' }}>
                  The Atlas <span className="italic text-[#c9a24a]">of Orchidaceae</span>
                </h1>
                <p className="mt-4 max-w-2xl text-[14px] text-[#cfc8b8]/80 leading-relaxed">
                  Explore recorded observations. Choose a genus or country, then select a point to inspect its source.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-[#cfc8b8]">
                {overview ? (
                  cellSummary && <Stat label="Records in the Atlas" value={cellSummary.recordCount} />
                ) : (
                  <>
                    <Stat label="Matching records" value={filteredPoints.length} />
                    <Stat label="Loaded records" value={allPoints.length} />
                    {loadProgress && !loadProgress.done && loadProgress.total !== null && (
                      <Stat label="Records in the Atlas" value={loadProgress.total} />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-[1500px] mx-auto px-6 lg:px-10 py-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <aside className="lg:col-span-3 lg:order-first order-last">
            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 backdrop-blur-md p-5 max-h-[70vh] overflow-y-auto lg:sticky lg:top-24">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-[#c9a24a]" /><div className="font-mono text-[11px] tracking-[0.28em] uppercase text-[#faf7f2]">Filters</div></div>
                <button type="button" onClick={resetFilters} className="font-mono text-[9px] tracking-[0.22em] uppercase text-[#cfc8b8]/55 hover:text-[#c9a24a] transition-colors">Reset</button>
              </div>
              {!shownFacets && <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#7a7466] flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading facets…</div>}
              {shownFacets && (
                <div className="space-y-4">
                  <Section icon={GitBranch} title="Taxonomy">{shownFacets.genera.map((g) => <ToggleChip key={g} active={isActive('genera', g)} onClick={() => toggleStringFilter('genera', g)}>{g}</ToggleChip>)}</Section>
                  {shownFacets.tribes.length > 0 && <Section icon={GitBranch} title="Tribe">{shownFacets.tribes.map((t) => <ToggleChip key={t} active={isActive('tribes', t)} onClick={() => toggleStringFilter('tribes', t)}>{t}</ToggleChip>)}</Section>}
                  <Section icon={MapPin} title="Country">{shownFacets.countries.map((c) => <ToggleChip key={c} active={isActive('countries', c)} onClick={() => toggleStringFilter('countries', c)}>{c}</ToggleChip>)}</Section>
                  <Section icon={Leaf} title="Growth habit">{shownFacets.growthForms.map((g) => <ToggleChip key={g} active={isActive('growthForms', g)} onClick={() => toggleStringFilter('growthForms', g)}>{g}</ToggleChip>)}</Section>
                  {shownFacets.habitats.length > 0 && <Section icon={Leaf} title="Habitat">{shownFacets.habitats.map((h) => <ToggleChip key={h} active={isActive('habitats', h)} onClick={() => toggleStringFilter('habitats', h)}>{h}</ToggleChip>)}</Section>}
                  <Section icon={ShieldAlert} title="Conservation · IUCN">{shownFacets.iucnCodes.map((c) => <ToggleChip key={c} active={isActive('iucnCodes', c)} onClick={() => toggleStringFilter('iucnCodes', c)}>{c}</ToggleChip>)}</Section>
                  {shownFacets.pollinatorTaxa.length > 0 && <Section icon={Bug} title="Pollinator taxa">{shownFacets.pollinatorTaxa.slice(0, 24).map((p) => <ToggleChip key={p} active={isActive('pollinatorTaxa', p)} onClick={() => toggleStringFilter('pollinatorTaxa', p)}>{p}</ToggleChip>)}</Section>}
                  <Section icon={Database} title="Data source">{shownFacets.datasets.map((d) => <ToggleChip key={d} active={isActive('datasets', d)} onClick={() => toggleStringFilter('datasets', d)}>{d}</ToggleChip>)}<ToggleChip active={!!filters.verifiedOnly} onClick={() => setFilters((p) => ({ ...p, verifiedOnly: !p.verifiedOnly }))}>Verified only</ToggleChip></Section>
                  <div className="border-t border-white/[0.06] pt-4"><div className="flex items-center gap-2 mb-2"><Network className="h-3.5 w-3.5 text-[#c9a24a]" /><div className="font-mono text-[10px] tracking-[0.26em] uppercase text-[#c9a24a]">Mycorrhizal</div></div><div className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#7a7466] leading-relaxed">Mycorrhizal data not yet linked to occurrence records.</div></div>
                </div>
              )}
            </div>
          </aside>

          <div className="lg:col-span-9 space-y-4">
            {!overview && !loading && capped && (
              <div role="status" data-testid="atlas-load-capped" className="rounded-2xl border border-[#c9a24a]/45 bg-[#1a1405]/80 p-4 text-[13px] leading-relaxed text-[#ead28c]">
                {recordMode === 'genus'
                  ? `Showing the first ${allPoints.length.toLocaleString()} records for the selected genus; the Atlas holds more. Narrow the filter to see the rest.`
                  : `Showing the first ${allPoints.length.toLocaleString()} records; filter by genus to see all.`}
              </div>
            )}
            {overview && cellSummary?.truncated && (
              <div role="status" data-testid="atlas-cells-truncated" className="rounded-2xl border border-[#c9a24a]/45 bg-[#1a1405]/80 p-4 text-[13px] leading-relaxed text-[#ead28c]">
                Showing the most populated grid cells only; zoom in or filter by genus to see the rest.
              </div>
            )}
            {!overview && !loading && loadOutcome !== 'ok' && (
              <div role="alert" data-testid="atlas-load-outcome" className="rounded-2xl border border-[#c9a24a]/45 bg-[#1a1405]/80 p-4 flex flex-wrap items-center justify-between gap-3 text-[13px] leading-relaxed text-[#ead28c]">
                <span>
                  {loadOutcome === 'failed'
                    ? 'Occurrence records could not be loaded from the Orchid Continuum service. This is a connection problem, not evidence that no orchids were recorded.'
                    : 'Some occurrence records could not be loaded. The map below is incomplete; missing records are a connection gap, not absence.'}
                </span>
                <button type="button" onClick={retryAtlasLoad} className="inline-flex items-center gap-2 rounded-full border border-[#c9a24a]/60 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[#c9a24a] hover:bg-[#c9a24a]/10">Retry</button>
              </div>
            )}
            {loadingMore && loadProgress && (
              <div role="status" aria-live="polite" data-testid="atlas-load-progress" className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 px-4 py-2.5 flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase text-[#cfc8b8]/85">
                <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none text-[#c9a24a]" />
                Loading {loadProgress.loaded.toLocaleString()}{loadProgress.total !== null ? ` of ${loadProgress.total.toLocaleString()}` : ''} records — showing {allPoints.length.toLocaleString()} while loading
              </div>
            )}
            <LiveAtlasMap points={overview ? [] : filteredPoints} cells={overview ? (cellSummary?.cells ?? null) : null} onZoomChange={setZoom} activeLayers={activeLayers} onSelect={setSelected} selectedId={selected?.id ?? null} loading={overview ? cellsStatus === 'loading' : loading} totalLoaded={allPoints.length} loadProgress={overview ? null : loadProgress} focusBounds={focusBounds} focusView={focusView} />
            {/* One active-filter row, directly under the map it narrows (#948 review: it was rendered twice). */}
            <ActiveFilterPills filters={filters} setFilters={setFilters} />
            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 backdrop-blur-md p-4 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 mr-2"><Layers className="h-4 w-4 text-[#c9a24a]" /><div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#faf7f2]">Layers</div></div>
              {LAYER_DEFS.map((l) => <ToggleChip key={l.key} active={activeLayers.has(l.key)} onClick={() => toggleLayer(l.key)}>{l.label}</ToggleChip>)}
              <div className="ml-auto flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-[#c9a24a]" /><button type="button" onClick={() => setIntersectionMode((v) => !v)} className={['px-3 py-1.5 rounded-full text-[10px] tracking-[0.18em] uppercase border transition-colors', intersectionMode ? 'bg-[#c9a24a] border-[#c9a24a] text-[#14140a]' : 'border-[#c9a24a]/50 text-[#c9a24a] hover:bg-[#c9a24a]/10'].join(' ')}>Intersection mode {intersectionMode ? 'on' : 'off'}</button></div>
            </div>
            <div className="rounded-2xl border border-[#c9a24a]/40 bg-gradient-to-r from-[#1a1405]/90 via-[#0e1018]/80 to-[#0a0d1c]/80 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0"><div className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#c9a24a] mb-1.5">The Living Geography of Orchids</div><h3 className="font-display text-[#faf7f2] text-xl leading-tight">A guided expedition across the planet</h3><p className="mt-1.5 text-[12.5px] text-[#cfc8b8]/75 leading-relaxed max-w-xl">Ten global stops of progressive discovery — evolution, biodiversity, and conservation, with the live map flying to each region.</p></div>
              <button type="button" onClick={() => { setTourStartIndex(null); setGrandTourOpen(true); }} className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#c9a24a] text-[#14140a] hover:bg-[#deb866] font-mono text-[11px] tracking-[0.24em] uppercase transition-colors shadow-lg shadow-[#c9a24a]/20"><Sparkles className="h-4 w-4" /> Begin the Grand Tour</button>
            </div>
            {!overview && <AtlasCompletenessBadge count={filteredPoints.length} total={allPoints.length} loading={loading} />}
            <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[9px] tracking-[0.22em] uppercase text-[#cfc8b8]/70 px-1"><div className="flex items-center gap-2"><Globe2 className="h-3 w-3 text-[#c9a24a]" />{overview ? <span data-testid="atlas-overview-summary">{cellSummary ? `${cellSummary.recordCount.toLocaleString()} records in ${cellSummary.cells.length.toLocaleString()} grid cells` : 'Loading the world overview'}</span> : <>{filteredPoints.length.toLocaleString()} of {allPoints.length.toLocaleString()} live records</>}{!overview && loadingMore && <span className="ml-2 inline-flex items-center gap-1 text-[#c9a24a]/80"><Loader2 className="h-3 w-3 animate-spin" /> loading more{loadProgress?.total != null ? ` · ${loadProgress.total.toLocaleString()} in the Atlas` : ''}</span>}</div><div className="text-[#7a7466]">Basemap · OpenStreetMap / CARTO · Data · Orchid Continuum + GBIF</div></div>
            <AtlasDebugPanel />
            {overview ? (
              <div data-testid="atlas-overview-hint" className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-6 text-center text-[13px] leading-relaxed text-[#cfc8b8]/80">
                World overview: each square counts the records in a generalised grid cell. Choose a genus or zoom in to list individual records. Threatened taxa are never counted into a cell finer than their own public cell.
              </div>
            ) : (
              <ResultList points={filteredPoints} onSelect={setSelected} layerMatch={pointLayerMatch} />
            )}
          </div>
        </section>
      </main>

      {selected && <SpeciesCardOverlay selected={selected} record={record} onClose={() => { setSelected(null); if (initialOccurrenceId) { const next = new URLSearchParams(searchParams); next.delete('occurrence'); setSearchParams(next, { replace: true }); } }} />}
      <AtlasTour onZoomEcuador={(b) => setFocusBounds({ south: b.south, west: b.west, north: b.north, east: b.east })} />
      <GrandTour open={grandTourOpen} initialIndex={tourStartIndex} onClose={() => { setGrandTourOpen(false); setTourStartIndex(null); if (searchParams.has('tour')) { const next = new URLSearchParams(searchParams); next.delete('tour'); setSearchParams(next, { replace: true }); } }} onStop={handleGrandTourStop} />
      <Footer />
    </div>
  );
};

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"><div className="text-[#c9a24a] font-display text-[16px] leading-tight not-italic">{value.toLocaleString()}</div><div className="mt-0.5 text-[8.5px] tracking-[0.24em]">{label}</div></div>;
}

function ActiveFilterPills({ filters, setFilters }: { filters: AtlasFilterState; setFilters: React.Dispatch<React.SetStateAction<AtlasFilterState>> }) {
  const pills: { label: string; remove: () => void }[] = [];
  const addArr = (field: keyof AtlasFilterState, label: string) => {
    const arr = filters[field] as string[] | undefined;
    arr?.forEach((v) => pills.push({ label: `${label} · ${v}`, remove: () => setFilters((p) => { const next: AtlasFilterState = { ...p }; const cur = (next[field] as string[] | undefined) ?? []; const filtered = cur.filter((x) => x !== v); (next as Record<string, unknown>)[field as string] = filtered.length ? filtered : undefined; return next; }) }));
  };
  addArr('genera', 'Genus'); addArr('tribes', 'Tribe'); addArr('countries', 'Country'); addArr('growthForms', 'Form'); addArr('habitats', 'Habitat'); addArr('iucnCodes', 'IUCN'); addArr('pollinatorTaxa', 'Pollinator'); addArr('datasets', 'Source');
  if (filters.verifiedOnly) pills.push({ label: 'Verified only', remove: () => setFilters((p) => ({ ...p, verifiedOnly: false })) });
  if (pills.length === 0) return null;
  return <div role="group" aria-label="Active Atlas filters" className="flex flex-wrap gap-2">{pills.map((p) => <button key={p.label} type="button" onClick={p.remove} aria-label={`Remove filter ${p.label}`} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#c9a24a]/40 bg-[#c9a24a]/[0.08] font-mono text-[9px] tracking-[0.18em] uppercase text-[#faf7f2] hover:bg-[#c9a24a]/15">{p.label}<X className="h-3 w-3" /></button>)}</div>;
}

function ResultList({ points, onSelect, layerMatch }: { points: AtlasOccurrencePoint[]; onSelect: (p: AtlasOccurrencePoint) => void; layerMatch: (p: AtlasOccurrencePoint) => Record<LayerKey, boolean> }) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [points]);
  const pageCount = Math.max(1, Math.ceil(points.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [currentPage, points]);
  if (points.length === 0) return <div className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-8 text-center font-mono text-[10px] tracking-[0.22em] uppercase text-[#7a7466]">Awaiting Orchid Continuum Records · adjust filters</div>;
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-white/[0.06]"><div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a]">Records · {points.length}</div><div className="font-mono text-[9px] tracking-[0.22em] uppercase text-[#7a7466]">Click row → species/habitat card</div></div>
      <ul ref={listRef} className="divide-y divide-white/[0.04] max-h-[480px] overflow-y-auto">
        {points.slice(currentPage * 50, (currentPage + 1) * 50).map((p) => { const m = layerMatch(p); return (
          <li key={p.id}><button type="button" onClick={() => onSelect(p)} className="w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-white/[0.03] transition-colors">
            <div className="w-12 h-12 flex-shrink-0 rounded-sm bg-[#06091a] border border-[#c9a24a]/20 overflow-hidden flex items-center justify-center">{p.imageUrl ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" /> : <ImageOff className="h-4 w-4 text-[#c9a24a]/40" strokeWidth={1.2} />}</div>
            <div className="flex-1 min-w-0"><div className="font-display italic text-[15px] text-[#faf7f2] truncate">{p.canonicalName}</div><div className="font-mono text-[9px] tracking-[0.20em] uppercase text-[#7a7466] mt-0.5 truncate">{p.country}{p.region ? ` · ${p.region}` : ''}{p.year ? ` · ${p.year}` : ''}</div></div>
            <div className="hidden sm:flex items-center gap-1.5">{(['occurrence', 'pollinator', 'mycorrhizal', 'habitat', 'climate', 'conservation'] as LayerKey[]).map((k) => <span key={k} title={`${k}: ${m[k] ? 'linked' : 'not yet linked'}`} className={['w-1.5 h-1.5 rounded-full', m[k] ? 'bg-[#c9a24a]' : 'bg-white/10'].join(' ')} />)}</div>
            {p.iucnCode && <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-[#c9a24a]/85 px-2 py-0.5 rounded-full border border-[#c9a24a]/40">{p.iucnCode}</span>}
          </button></li>
        ); })}
      </ul>
      {pageCount > 1 && <nav aria-label="Occurrence result pages" className="flex items-center justify-between gap-3 p-4 text-sm">
        <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="min-h-11 rounded border border-white/20 px-4 disabled:opacity-40">Previous records</button>
        <span>{currentPage + 1} / {pageCount}</span>
        <button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} className="min-h-11 rounded border border-white/20 px-4 disabled:opacity-40">Next records</button>
      </nav>}
    </div>
  );
}

function SpeciesCardOverlay({ selected, record, onClose }: { selected: AtlasOccurrencePoint; record: AtlasSpeciesRecord | null; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/65 backdrop-blur-sm p-0 md:p-6" onClick={onClose}>
      <div className="relative w-full md:max-w-4xl max-h-[92vh] overflow-y-auto bg-[#0a1224] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close species card" className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/40 border border-white/20 flex items-center justify-center text-[#cfc8b8] hover:text-[#faf7f2]"><X className="h-4 w-4" /></button>
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="relative aspect-[4/3] md:aspect-auto md:min-h-[420px] bg-[#06091a] border-b md:border-b-0 md:border-r border-white/[0.05]">
            {record?.imageUrl && !record.isPlaceholder ? <img src={record.imageUrl} alt={record.scientificName} className="absolute inset-0 w-full h-full object-cover" /> : <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6"><ImageOff className="h-9 w-9 text-[#c9a24a]/40 mb-3" strokeWidth={1.2} /><div className="font-mono text-[10px] tracking-[0.24em] uppercase text-[#c9a24a]/75">Awaiting Orchid Continuum Record</div></div>}
          </div>
          <div className="p-7 md:p-8">
            <div className="flex items-center justify-between gap-3 mb-3"><div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.24em] uppercase text-[#c9a24a]"><span className="inline-block w-2 h-2 rounded-full" style={{ background: colorFor(selected.genus), boxShadow: `0 0 8px ${colorFor(selected.genus)}` }} />Atlas record · {selected.id}</div>{(record?.verified ?? selected.verified) && <div className="flex items-center gap-1 font-mono text-[9px] tracking-[0.18em] uppercase text-[#86efac]/85"><CheckCircle2 className="h-3 w-3" /> Verified</div>}</div>
            <div className={record && !record.isPlaceholder ? 'font-display italic text-2xl md:text-3xl text-[#faf7f2] leading-tight' : 'font-mono text-[13px] tracking-[0.18em] uppercase text-[#cfc8b8]/85 py-1'}>{record && !record.isPlaceholder ? record.scientificName : 'Awaiting Orchid Continuum Record'}</div>
            {record && !record.isPlaceholder && (record.family || record.subfamily || record.tribe) && <div className="mt-2 font-mono text-[10px] tracking-[0.22em] uppercase text-[#c9a24a]/80">{[record.family, record.subfamily, record.tribe, record.genus].filter(Boolean).join(' · ')}</div>}
            {record?.authority && <div className="mt-1 font-body italic text-[12px] text-[#cfc8b8]/65">{record.authority}{record.commonName ? ` · ${record.commonName}` : ''}</div>}
            <div className="mt-5 grid grid-cols-1 gap-3 font-body text-[13.5px] text-[#cfc8b8]">
              <Row icon={MapPin} label="Where"><div>{[selected.country, selected.region].filter(Boolean).join(' · ') || 'Country not recorded'}{selected.year && <span className="ml-2 font-mono text-[10px] tracking-[0.18em] uppercase text-[#7a7466]">{selected.year}</span>}</div><div data-testid="atlas-location-notice" className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#c9a24a]/85 mt-1">Location generalised to ~{generalisedLocation(selected).km} km</div><div className="text-[12px] text-[#cfc8b8]/70 mt-1">{generalisedLocation(selected).notice}</div></Row>
              <Row icon={Leaf} label="Habitat">{record?.habitatDescription ? <div>{record.habitatType && <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#c9a24a]/80 mr-2">{record.habitatType}</span>}{record.habitatDescription}</div> : record?.habitatType ? <div className="font-mono text-[11px] tracking-[0.10em] uppercase">{record.habitatType}</div> : <Awaiting />}</Row>
              {(record?.elevation_m ?? selected.elevation_m ?? record?.elevationRange) && <Row icon={Mountain} label="Elevation">{record?.elevation_m != null && <div>{record.elevation_m.toLocaleString()} m</div>}{record?.elevationRange && <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#c9a24a]/70">Range · {record.elevationRange[0]}–{record.elevationRange[1]} m</div>}</Row>}
              <Row icon={ShieldAlert} label="Conservation · IUCN">{record?.conservationStatus ? <div>{record.conservationStatus}{record.iucnCode && <span className="ml-2 font-mono text-[10px] tracking-[0.18em] uppercase text-[#c9a24a]/85">{record.iucnCode}</span>}</div> : <Awaiting />}</Row>
              <Row icon={Bug} label="Pollinator relationship">{record && record.pollinators.length > 0 ? <div className="space-y-1">{record.pollinators.map((p, i) => <div key={i}>{p.name || p.taxon}{p.taxon && p.name && <span className="ml-2 font-display italic text-[#cfc8b8]/75">({p.taxon})</span>}{p.mechanism && <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-[#c9a24a]/65 mt-0.5">{p.mechanism}</div>}</div>)}</div> : <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#7a7466]">Pollinator data not yet linked</div>}</Row>
              <Row icon={Network} label="Mycorrhizal association">{record?.mycorrhizal ? <div className="space-y-0.5"><div><span className="font-display italic text-[#faf7f2]">{record.mycorrhizal.taxon ?? 'Fungal partner'}</span>{record.mycorrhizal.family && <span className="ml-2 font-mono text-[10px] tracking-[0.14em] uppercase text-[#c9a24a]/75">{record.mycorrhizal.family}</span>}</div>{record.mycorrhizal.type && <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#c9a24a]/70">{record.mycorrhizal.type}</div>}{record.mycorrhizal.note && <div className="text-[12px] text-[#cfc8b8]/75 italic">{record.mycorrhizal.note}</div>}{record.mycorrhizal.source && <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-[#7a7466]">Source · {record.mycorrhizal.source}</div>}</div> : <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#7a7466]">Relationship data not yet linked.</div>}</Row>
              {(record?.traits || record?.growthForm) && <Row icon={GitBranch} label="Form & phenology">{record?.growthForm && <div>{record.growthForm}</div>}{record?.traits?.phenology && <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#c9a24a]/70">Bloom · {record.traits.phenology}</div>}{record?.traits?.flower_size_cm && <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#c9a24a]/70">Flower · {record.traits.flower_size_cm} cm</div>}</Row>}
              <Row icon={Database} label="Source · record"><div className="font-mono text-[10px] tracking-[0.18em] uppercase">{record?.dataset ?? selected.dataset} · {selected.id}</div></Row>
            </div>
            <div className="mt-5 pt-4 border-t border-white/[0.06] font-mono text-[9px] tracking-[0.22em] uppercase text-[#5e5a4e]">{record?.sourceCredit ?? 'Orchid Continuum approved library'}</div>
            <div className="mt-6 flex flex-wrap gap-2 items-center">{(record?.sourceRecordId || selected.dataset) && <SourceCitation dataset={record?.dataset ?? selected.dataset} sourceRecordId={record?.sourceRecordId} occurrenceId={selected.id} />}</div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to={`/species/${encodeURIComponent(selected.taxonomyId ?? record?.taxonomyId ?? canonicalSlug(selected.canonicalName))}`} className="font-mono text-[11px] tracking-[0.22em] uppercase px-5 py-2.5 rounded-full bg-[#c9a24a] text-[#14140a] hover:bg-[#deb866] transition-colors inline-flex items-center gap-2">Open Species Card</Link>
              <Link to={`/ecosystems/${encodeURIComponent(selected.taxonomyId ?? record?.taxonomyId ?? canonicalSlug(selected.canonicalName))}`} className="font-mono text-[11px] tracking-[0.22em] uppercase px-5 py-2.5 rounded-full border border-white/20 text-[#faf7f2] hover:border-[#c9a24a]/60 hover:text-[#c9a24a] transition-colors">View Habitat Journey</Link>
              {selected.habitat && <Link to={`/habitats/${encodeURIComponent(canonicalSlug(selected.habitat))}`} className="font-mono text-[11px] tracking-[0.22em] uppercase px-5 py-2.5 rounded-full border border-white/20 text-[#faf7f2] hover:border-[#c9a24a]/60 hover:text-[#c9a24a] transition-colors">Open biome</Link>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Public cell size and notice for the card; the card never shows a coordinate or locality text. */
function generalisedLocation(point: AtlasOccurrencePoint): { km: number; notice: string } {
  const displayed = resolveAtlasLocation(point, 'public');
  return { km: Math.round(displayed.policy.cellDeg * 111), notice: displayed.policy.notice };
}

function Row({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return <div className="flex items-start gap-2.5"><Icon className="h-4 w-4 text-[#c9a24a] mt-0.5 flex-shrink-0" /><div className="min-w-0 flex-1"><div className="font-mono text-[9px] tracking-[0.22em] uppercase text-[#7a7466] mb-0.5">{label}</div>{children}</div></div>;
}

function Awaiting() {
  return <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#7a7466]">Awaiting Orchid Continuum Record</div>;
}

export default Atlas;
