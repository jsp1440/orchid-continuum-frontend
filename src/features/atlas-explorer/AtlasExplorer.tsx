import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Download,
  Globe2,
  Layers,
  ListFilter,
  Loader2,
  Map as MapIcon,
  Microscope,
  Mountain,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import ExplorerMap, { type ColorMode, type ExplorerMapHandle } from './ExplorerMap';
import { BASEMAPS, type BasemapId } from './basemaps';
import { MODULE_CAPABILITIES, type DrawableLayerId, type ModuleCapability } from './contracts';
import { gridDegForZoom, type Viewport } from './geo';
import { matchesFilters, queryBackend, type ExplorerFilters, type ExplorerOccurrence } from './occurrenceProvider';
import { useExplorerData } from './useExplorerData';
import { Legend, LayerPanel, RecordCard, RecordList, SourceNotice, SubjectPanel, TimePanel } from './ExplorerPanels';
import { downloadBlob, exportFilename, toCsv, toGeoJson } from './exporters';

const SAFE_GENUS = /^[A-Z][a-z]+(?:-[a-z]+)?$/;
const SAFE_NAME = /^[A-Z][a-z]+(?:-[a-z]+)? [a-z][a-z-]+(?: (?:subsp\.|var\.|f\.) [a-z][a-z-]+)?$/;
const SAFE_TAXON_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

type PanelTab = 'layers' | 'time' | 'details';

function readFilters(params: URLSearchParams): ExplorerFilters {
  const genusRaw = params.get('genus') ?? params.get('genera')?.split(',')[0] ?? null;
  const speciesRaw = params.get('species')?.split(',')[0]?.trim() ?? null;
  const scientificName = speciesRaw && SAFE_NAME.test(speciesRaw) ? speciesRaw : null;
  const genus = genusRaw && SAFE_GENUS.test(genusRaw.trim()) ? genusRaw.trim() : scientificName ? scientificName.split(' ')[0] : null;
  const taxonRaw = params.get('taxon');
  const year = (k: string) => {
    const n = Number(params.get(k));
    return params.get(k) && Number.isInteger(n) && n >= 1600 && n <= 2100 ? n : null;
  };
  const months = (params.get('months') ?? '')
    .split(',')
    .map(Number)
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
  return {
    genus,
    scientificName,
    taxonId: taxonRaw && SAFE_TAXON_ID.test(taxonRaw) ? taxonRaw : null,
    yearFrom: year('from'),
    yearTo: year('to'),
    months: [...new Set(months)].sort((a, b) => a - b),
  };
}

function writeFilters(params: URLSearchParams, f: ExplorerFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const k of ['genus', 'genera', 'species', 'taxon', 'from', 'to', 'months']) next.delete(k);
  if (f.genus) next.set('genus', f.genus);
  if (f.scientificName) next.set('species', f.scientificName);
  if (f.taxonId) next.set('taxon', f.taxonId);
  if (f.yearFrom !== null) next.set('from', String(f.yearFrom));
  if (f.yearTo !== null) next.set('to', String(f.yearTo));
  if (f.months.length) next.set('months', f.months.join(','));
  return next;
}

interface Suggestion {
  kind: 'genus' | 'species';
  name: string;
  genus: string;
  taxonId: string | null;
  count: number | null;
}

function localSuggestions(records: readonly ExplorerOccurrence[] | null, query: string): Suggestion[] {
  if (!records || query.trim().length < 2) return [];
  const q = query.trim().toLowerCase();
  const genera = new Map<string, number>();
  const species = new Map<string, { genus: string; count: number; taxonId: string | null }>();
  for (const r of records) {
    if (r.genus && r.genus.toLowerCase().startsWith(q)) genera.set(r.genus, (genera.get(r.genus) ?? 0) + 1);
    if (r.scientificName.toLowerCase().includes(q) && SAFE_NAME.test(r.scientificName)) {
      const entry = species.get(r.scientificName) ?? { genus: r.scientificName.split(' ')[0], count: 0, taxonId: r.taxonID };
      entry.count += 1;
      species.set(r.scientificName, entry);
    }
  }
  const g: Suggestion[] = [...genera.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => ({ kind: 'genus', name, genus: name, taxonId: null, count }));
  const s: Suggestion[] = [...species.entries()]
    .sort((a, b) => Number(!a[0].toLowerCase().startsWith(q)) - Number(!b[0].toLowerCase().startsWith(q)) || b[1].count - a[1].count)
    .slice(0, 8)
    .map(([name, e]) => ({ kind: 'species', name, genus: e.genus, taxonId: e.taxonId, count: e.count }));
  return [...g, ...s];
}

function useCapabilities(): { capabilities: ModuleCapability[]; live: boolean } {
  const [state, setState] = useState<{ capabilities: ModuleCapability[]; live: boolean }>({
    capabilities: MODULE_CAPABILITIES.capabilities,
    live: false,
  });
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${CALYX_BACKEND_BASE_URL}/atlas/capabilities`, { signal: controller.signal, headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body?.schema === MODULE_CAPABILITIES.schema && Array.isArray(body.capabilities)) {
          setState({ capabilities: body.capabilities as ModuleCapability[], live: true });
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return state;
}

const DEFAULT_LAYERS: DrawableLayerId[] = ['occurrences'];

const AtlasExplorer: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);
  const basemap = (BASEMAPS.find((b) => b.id === params.get('basemap'))?.id ?? 'scientific') as BasemapId;
  const globe = params.get('view') !== 'map';
  const [terrain3d, setTerrain3d] = useState(false);
  const [activeLayers, setActiveLayers] = useState<Set<DrawableLayerId>>(() => new Set(DEFAULT_LAYERS));
  const [rawView, setRawView] = useState<Viewport | null>(null);
  const [view, setView] = useState<Viewport | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<PanelTab>('details');
  const [panelOpen, setPanelOpen] = useState(true);
  const [basemapNotice, setBasemapNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const mapRef = useRef<ExplorerMapHandle>(null);
  const { capabilities, live: capabilitiesLive } = useCapabilities();

  // Debounce viewport changes so a drag issues one query, not dozens.
  useEffect(() => {
    if (!rawView) return;
    const t = window.setTimeout(() => setView(rawView), 250);
    return () => window.clearTimeout(t);
  }, [rawView]);

  const { calyx, canonical, canonicalRecords, viewData } = useExplorerData(view, filters);

  const colorMode: ColorMode = activeLayers.has('conservation-assessment')
    ? 'conservation-assessment'
    : activeLayers.has('record-age')
      ? 'record-age'
      : 'default';

  const setFilters = useCallback(
    (next: Partial<ExplorerFilters>) => setParams((p) => writeFilters(p, { ...readFilters(p), ...next }), { replace: true }),
    [setParams],
  );
  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (value === null) n.delete(key);
        else n.set(key, value);
        return n;
      },
      { replace: true },
    );

  const toggleLayer = (id: DrawableLayerId, on: boolean) =>
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (on) {
        next.add(id);
        // Colour modes are mutually exclusive.
        if (id === 'record-age') next.delete('conservation-assessment');
        if (id === 'conservation-assessment') next.delete('record-age');
      } else next.delete(id);
      return next;
    });

  // Taxon search: the canonical taxonomy service when it answers; otherwise the
  // names already loaded (whole canonical store, or the records in view).
  const localNames = canonicalRecords ?? viewData.records;
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const local = () => setSuggestions(localSuggestions(localNames, q));
    if (calyx.kind !== 'available') {
      local();
      return;
    }
    const controller = new AbortController();
    const t = window.setTimeout(() => {
      fetch(`${CALYX_BACKEND_BASE_URL}/atlas/taxa/search?${new URLSearchParams({ q, limit: '10' })}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => {
          const matches = (body?.matches ?? []) as {
            taxon_id: string | null;
            scientific_name: string;
            genus: string | null;
            rank: string;
            record_count?: number | null;
          }[];
          const usable = matches
            .filter((m) => SAFE_NAME.test(m.scientific_name) || SAFE_GENUS.test(m.scientific_name))
            .map<Suggestion>((m) => ({
              kind: m.rank === 'genus' ? 'genus' : 'species',
              name: m.scientific_name,
              genus: m.genus ?? m.scientific_name.split(' ')[0],
              taxonId: m.taxon_id ?? null,
              count: typeof m.record_count === 'number' ? m.record_count : null,
            }));
          if (usable.length) setSuggestions(usable);
          else local();
        })
        .catch((error) => {
          if ((error as { name?: string })?.name !== 'AbortError') local();
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(t);
    };
  }, [query, calyx.kind, localNames]);

  const chooseSuggestion = (s: Suggestion) => {
    setSearchOpen(false);
    setQuery('');
    setSelectedId(null);
    setTab('details');
    const next: ExplorerFilters =
      s.kind === 'genus'
        ? { ...filters, genus: s.genus, scientificName: null, taxonId: null }
        : { ...filters, genus: s.genus, scientificName: s.name, taxonId: s.taxonId };
    setFilters(next);
    void flyToSubject(next);
  };

  // Fit the map to where the subject is recorded: from the canonical store when
  // it is loaded, otherwise from a world-level viewport query for the subject.
  const flyToSubject = async (subject: ExplorerFilters) => {
    const fit = (lats: number[], lngs: number[], pad = 0) => {
      if (!lats.length) return;
      mapRef.current?.flyToBounds([
        Math.max(-180, Math.min(...lngs) - pad),
        Math.max(-85, Math.min(...lats) - pad),
        Math.min(180, Math.max(...lngs) + pad),
        Math.min(85, Math.max(...lats) + pad),
      ]);
    };
    if (canonicalRecords) {
      const matches = canonicalRecords.filter((r) => matchesFilters(r, subject));
      fit(matches.map((r) => r.decimalLatitude), matches.map((r) => r.decimalLongitude));
      return;
    }
    if (calyx.kind !== 'available') return;
    try {
      const world = { west: -180, south: -90, east: 180, north: 90, zoom: 3 };
      const outcome = await queryBackend(world, subject, new AbortController().signal, { base: CALYX_BACKEND_BASE_URL });
      if (outcome.kind !== 'ok') return;
      const c = outcome.response.clusters;
      const p = outcome.response.points;
      const lats = [...c.map((x) => x.latitude), ...p.map((x) => Number(x.decimalLatitude))].filter(Number.isFinite);
      const lngs = [...c.map((x) => x.longitude), ...p.map((x) => Number(x.decimalLongitude))].filter(Number.isFinite);
      fit(lats, lngs, (outcome.response.cell_deg ?? 0) / 2);
    } catch {
      // Navigation convenience only; the filter has already been applied.
    }
  };

  // A subject arriving in the URL (a handoff from another module) is framed once,
  // as soon as a provider can say where it is recorded.
  const framedArrival = useRef(false);
  const providerReady = calyx.kind === 'available' || canonical.kind === 'ready';
  useEffect(() => {
    if (framedArrival.current || !providerReady) return;
    framedArrival.current = true;
    if (filters.genus || filters.scientificName || filters.taxonId) void flyToSubject(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerReady]);

  const clearSubject = () => {
    setFilters({ genus: null, scientificName: null, taxonId: null });
    setSelectedId(null);
  };

  const selected = useMemo(
    () => (selectedId ? viewData.records.find((r) => r.occurrenceID === selectedId) ?? null : null),
    [selectedId, viewData.records],
  );
  useEffect(() => {
    if (selected) {
      setTab('details');
      setPanelOpen(true);
    }
  }, [selected]);

  const familyUnstated = useMemo(
    () => viewData.records.filter((r) => !r.familyStated).length,
    [viewData.records],
  );
  const recordsAvailable = viewData.records.length > 0 || viewData.mode === 'points';
  const filterSummary = [
    filters.scientificName ?? filters.genus,
    filters.yearFrom !== null || filters.yearTo !== null ? `${filters.yearFrom ?? '…'}–${filters.yearTo ?? '…'}` : null,
    filters.months.length ? `months ${filters.months.join(',')}` : null,
  ]
    .filter(Boolean)
    .join('; ');

  const doExport = async (kind: 'csv' | 'geojson' | 'png') => {
    const at = new Date();
    if (kind === 'png') {
      const blob = await mapRef.current?.exportPng();
      if (blob) downloadBlob(blob, exportFilename('png', at), 'image/png');
      else setExportNotice('The map image could not be exported in this browser.');
      return;
    }
    if (!viewData.records.length) {
      setExportNotice('Zoom in until individual records load, then export.');
      return;
    }
    const ctx = {
      provider: viewData.provider ?? 'canonical-store',
      generatedAt: at,
      bbox: view ? `${view.west.toFixed(3)},${view.south.toFixed(3)},${view.east.toFixed(3)},${view.north.toFixed(3)}` : 'world',
      filters: filterSummary,
    } as const;
    if (kind === 'csv') downloadBlob(toCsv(viewData.records, ctx), exportFilename('csv', at), 'text/csv');
    else downloadBlob(toGeoJson(viewData.records, ctx), exportFilename('geojson', at), 'application/geo+json');
  };
  useEffect(() => {
    if (!exportNotice) return;
    const t = window.setTimeout(() => setExportNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, [exportNotice]);

  const loading = viewData.status === 'loading' || canonical.kind === 'loading';
  const providerLabel =
    viewData.provider === 'calyx-viewport' ? 'Calyx Atlas service (viewport query)' : viewData.provider === 'canonical-store' ? 'Canonical occurrence store' : null;

  const fallbackReason =
    calyx.kind === 'source-unavailable'
      ? 'The Calyx Atlas service has no approved occurrence source configured yet.'
      : calyx.kind === 'unreachable'
        ? calyx.detail
        : null;

  const tabs: { id: PanelTab; label: string; icon: React.ReactNode }[] = [
    { id: 'details', label: 'Explore', icon: <Microscope className="h-4 w-4" aria-hidden /> },
    { id: 'layers', label: 'Layers', icon: <Layers className="h-4 w-4" aria-hidden /> },
    { id: 'time', label: 'Time', icon: <ListFilter className="h-4 w-4" aria-hidden /> },
  ];

  return (
    <div className="flex h-[100dvh] flex-col bg-slate-100 text-slate-900" data-testid="atlas-explorer">
      <header className="z-20 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 shadow-sm sm:flex-nowrap sm:px-4">
        <Link to="/" className="flex shrink-0 items-center gap-2 rounded focus:outline-none focus:ring-2 focus:ring-teal-600">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-800 text-white">
            <Globe2 className="h-4 w-4" aria-hidden />
          </span>
          <span className="leading-tight">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-800">Orchid Continuum</span>
            <span className="block text-sm font-semibold text-slate-900">Atlas Explorer</span>
          </span>
        </Link>

        <div className="relative order-3 w-full sm:order-none sm:ml-4 sm:max-w-md sm:flex-1">
          <label htmlFor="atlas-search" className="sr-only">
            Search genus or species
          </label>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            id="atlas-search"
            type="search"
            autoComplete="off"
            placeholder="Search a genus or species, e.g. Dracula"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && suggestions[0]) chooseSuggestion(suggestions[0]);
              if (e.key === 'Escape') setSearchOpen(false);
            }}
            role="combobox"
            aria-expanded={searchOpen && suggestions.length > 0}
            aria-controls="atlas-search-results"
            className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-8 pr-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/30"
          />
          {searchOpen && query.trim().length >= 2 ? (
            <ul
              id="atlas-search-results"
              role="listbox"
              className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
            >
              {suggestions.length ? (
                suggestions.map((s) => (
                  <li key={`${s.kind}:${s.name}`} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => chooseSuggestion(s)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-teal-50 focus:bg-teal-50 focus:outline-none"
                    >
                      <span>
                        <span className="italic">{s.name}</span>
                        <span className="ml-2 text-[11px] uppercase tracking-wide text-slate-500">{s.kind}</span>
                      </span>
                      {s.count !== null ? <span className="text-xs tabular-nums text-slate-500">{s.count.toLocaleString()}</span> : null}
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-3 py-2 text-sm text-slate-600">
                  {canonical.kind === 'loading' || calyx.kind === 'probing' ? 'Loading names…' : 'No matching names in the Atlas.'}
                </li>
              )}
            </ul>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5" role="group" aria-label="Projection">
            <button
              type="button"
              aria-pressed={!globe}
              onClick={() => setParam('view', 'map')}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${!globe ? 'bg-teal-800 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              <MapIcon className="h-3.5 w-3.5" aria-hidden /> Map
            </button>
            <button
              type="button"
              aria-pressed={globe}
              onClick={() => setParam('view', null)}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${globe ? 'bg-teal-800 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              <Globe2 className="h-3.5 w-3.5" aria-hidden /> Globe
            </button>
          </div>
          <button
            type="button"
            aria-pressed={terrain3d}
            onClick={() => setTerrain3d((t) => !t)}
            title="3D terrain"
            className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs ${terrain3d ? 'border-teal-800 bg-teal-800 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
          >
            <Mountain className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden md:inline">3D terrain</span>
          </button>
          <label className="sr-only" htmlFor="atlas-basemap">
            Basemap
          </label>
          <select
            id="atlas-basemap"
            value={basemap}
            onChange={(e) => setParam('basemap', e.target.value === 'scientific' ? null : e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            {BASEMAPS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100">
              <Download className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden md:inline">Export</span>
            </summary>
            <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-lg">
              <button type="button" onClick={() => doExport('png')} className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-100">
                Map image (PNG)
              </button>
              <button type="button" onClick={() => doExport('csv')} className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-100">
                Records in view (CSV)
              </button>
              <button type="button" onClick={() => doExport('geojson')} className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-100">
                Records in view (GeoJSON)
              </button>
              <p className="px-2 pb-1 pt-1.5 text-[11px] leading-snug text-slate-500">
                Exports contain the public locality-safe projection with dataset attribution.
              </p>
            </div>
          </details>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <aside
          className={`absolute inset-x-0 bottom-0 z-20 flex max-h-[62%] flex-col rounded-t-2xl border-t border-slate-200 bg-slate-50 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] transition-transform md:static md:max-h-none md:w-[360px] md:shrink-0 md:translate-y-0 md:rounded-none md:border-r md:border-t-0 md:shadow-none ${
            panelOpen ? 'translate-y-0' : 'translate-y-[calc(100%-52px)]'
          }`}
          aria-label="Atlas panels"
        >
          <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-2 py-1.5 md:px-3" role="tablist" aria-label="Atlas panel">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                aria-controls={`atlas-panel-${t.id}`}
                onClick={() => {
                  setTab(t.id);
                  setPanelOpen(true);
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm ${
                  tab === t.id ? 'bg-teal-50 font-medium text-teal-900' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
            <button
              type="button"
              className="rounded-md px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 md:hidden"
              onClick={() => setPanelOpen((o) => !o)}
              aria-expanded={panelOpen}
            >
              {panelOpen ? 'Hide' : 'Show'}
            </button>
          </div>

          {filters.genus || filters.scientificName ? (
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-teal-50 px-3 py-1.5 text-xs text-teal-950">
              <span>
                Showing <span className="font-semibold italic">{filters.scientificName ?? filters.genus}</span>
              </span>
              <button type="button" onClick={clearSubject} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-teal-100">
                <X className="h-3 w-3" aria-hidden /> Clear
              </button>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto p-3" id={`atlas-panel-${tab}`} role="tabpanel">
            {tab === 'layers' ? <LayerPanel active={activeLayers} onToggle={toggleLayer} /> : null}
            {tab === 'time' ? (
              <TimePanel filters={filters} onChange={setFilters} records={viewData.records} recordsAvailable={recordsAvailable} />
            ) : null}
            {tab === 'details' ? (
              <div className="space-y-4">
                {selected ? <RecordCard record={selected} onClose={() => setSelectedId(null)} /> : null}
                {viewData.mode === 'points' ? (
                  <RecordList records={viewData.records} selectedId={selectedId} onSelect={setSelectedId} />
                ) : null}
                <SubjectPanel
                  filters={filters}
                  records={viewData.records}
                  recordsAvailable={recordsAvailable}
                  capabilities={capabilities}
                  capabilitiesLive={capabilitiesLive}
                />
              </div>
            ) : null}
          </div>
        </aside>

        <main className="relative min-h-0 flex-1" aria-label="Map">
          <ExplorerMap
            ref={mapRef}
            basemap={basemap}
            globe={globe}
            terrain3d={terrain3d}
            activeLayers={activeLayers}
            colorMode={colorMode}
            records={viewData.records}
            clusters={viewData.clusters}
            mode={viewData.mode}
            gridDeg={gridDegForZoom(view?.zoom ?? 2)}
            selectedId={selectedId}
            onViewportChange={setRawView}
            onSelectRecord={setSelectedId}
            onBasemapDegraded={setBasemapNotice}
          />

          <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex flex-col items-start gap-2">
            <div
              className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs text-slate-700 shadow-sm backdrop-blur"
              aria-live="polite"
            >
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-700" aria-hidden /> Loading occurrence records…
                </span>
              ) : viewData.status === 'unavailable' ? (
                <span className="font-medium text-rose-800">Occurrence data unavailable</span>
              ) : (
                <>
                  <span>
                    <strong className="tabular-nums text-slate-900">{viewData.totalInView.toLocaleString()}</strong>
                    {viewData.totalIsExact ? '' : '+'} records in view
                  </span>
                  <span className="text-slate-500">
                    {viewData.mode === 'clusters' ? `clustered at ${viewData.cellDeg}°` : 'individual records'}
                  </span>
                  {providerLabel ? <span className="text-slate-500">· {providerLabel}</span> : null}
                </>
              )}
            </div>
            {fallbackReason && viewData.provider === 'canonical-store' ? (
              <SourceNotice kind="info">
                {fallbackReason} Records are read from the canonical occurrence store and protected in the browser with the same
                locality policy.
              </SourceNotice>
            ) : null}
            {familyUnstated > 0 ? (
              <SourceNotice kind="info">
                {familyUnstated.toLocaleString()} of these records have no stated family; their place in this Orchidaceae Atlas rests on
                the source&apos;s own orchid export. Records a source states are not orchids are excluded.
              </SourceNotice>
            ) : null}
            {viewData.status === 'unavailable' ? (
              <SourceNotice kind="warning">
                {canonical.kind === 'unavailable' ? canonical.detail : 'The occurrence store could not be reached.'} The map is blank because
                the data could not be read — this is not a statement about where orchids occur.
              </SourceNotice>
            ) : null}
            {viewData.status === 'ready' && viewData.totalInView === 0 ? (
              <SourceNotice kind="info">
                No records match this view{filterSummary ? ` and filter (${filterSummary})` : ''}. An empty area is unsampled or
                undocumented here, not evidence of absence.
              </SourceNotice>
            ) : null}
            {viewData.truncated && viewData.truncationReason ? <SourceNotice kind="info">{viewData.truncationReason}</SourceNotice> : null}
            {basemapNotice ? <SourceNotice kind="warning">{basemapNotice}</SourceNotice> : null}
            {exportNotice ? <SourceNotice kind="info">{exportNotice}</SourceNotice> : null}
          </div>

          <div className="pointer-events-none absolute bottom-[calc(52px+12px)] left-3 z-10 md:bottom-9">
            <Legend colorMode={colorMode} mode={viewData.mode} activeLayers={activeLayers} />
          </div>
          <button
            type="button"
            onClick={() => mapRef.current?.resetView()}
            className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 px-2 py-1.5 text-xs text-slate-700 shadow-sm hover:bg-white"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset view
          </button>
        </main>
      </div>
    </div>
  );
};

export default AtlasExplorer;
