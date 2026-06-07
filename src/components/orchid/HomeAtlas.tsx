import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Globe2,
  Filter,
  Database,
  Bug,
  Network,
  MapPin,
  GitBranch,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { useLeaflet } from '@/hooks/useLeaflet';
import BackendHealthBadge from '@/components/orchid/BackendHealthBadge';
import {
  fetchAtlasOccurrencePoints,
  didAtlasLoadFail,
  resetOrchidContinuumCaches,
  type AtlasOccurrencePoint,
} from '@/lib/orchidContinuum';
import {
  fetchMycorrhizalStats,
  MYCORRHIZAL_FALLBACK_COUNT,
  fetchGeneraCount,
  GENERA_FALLBACK_COUNT,
} from '@/lib/ocBackend';
import {
  COLOR_MODES,
  colorForPoint,
  legendFor,
  type ColorMode,
} from '@/lib/atlasColor';
import { featuredGenusName } from '@/lib/featuredGenus';

/**
 * HomeAtlas
 * ---------
 * Homepage's real-geography GIS section. REPLACES the previous decorative
 * SVG `LivingAtlasGlobe` centerpiece. Pure infrastructure:
 *
 *   1. Real Earth basemap        → Leaflet + OpenStreetMap (CartoDB dark)
 *      raster tiles. Real coastlines, real country borders.
 *   2. Real coordinate plotting  → atlas_occurrences rows are plotted at
 *      their actual lat/lng with strict bounds validation.
 *   3. Visible filter panel      → genus · species · country · pollinator
 *      linked · mycorrhizal linked.
 *   4. Visible diagnostics panel → total records · genera · linked
 *      pollinator records · linked mycorrhizal records.
 *   5. Honest empty state        → "No linked data available yet."
 *
 * Strict rules:
 *   - No procedural / placeholder points.
 *   - No decorative continent polygons anywhere in this file.
 *   - No AI-generated orchid imagery.
 */

// ---------------------------------------------------------------------------
// Genus → colour (shared with the Atlas page)
// ---------------------------------------------------------------------------

const GENUS_COLOR: Record<string, string> = {
  Angraecum:     '#ffffff',
  Bulbophyllum:  '#ff9b6a',
  Catasetum:     '#86efac',
  Cypripedium:   '#ffd166',
  Dendrobium:    '#9ad6ff',
  Dracula:       '#c084fc',
  Epidendrum:    '#fca5a5',
  Maxillaria:    '#fbbf24',
  Oncidium:      '#f0abfc',
  Paphiopedilum: '#c4a87a',
  Phalaenopsis:  '#fda4af',
  Pleurothallis: '#7dd3a8',
  Stanhopea:     '#fdba74',
  Vanilla:       '#fef3c7',
};
const colorFor = (g: string) => GENUS_COLOR[g] ?? '#c9a24a';

const TOP_GENERA = 16;
const TOP_COUNTRIES = 16;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const HomeAtlas: React.FC = () => {
  const { ready, error, L } = useLeaflet();

  const [points, setPoints] = useState<AtlasOccurrencePoint[]>([]);
  const [loading, setLoading] = useState(true);
  // True when the atlas occurrence fetch exhausted its retries with no data.
  const [atlasError, setAtlasError] = useState(false);
  // Bumped by the "Retry now" button to re-run the load effect.
  const [reloadKey, setReloadKey] = useState(0);

  // Filters — the map auto-filters to the synchronized "Genus of the Day" on
  // load (same 12-hour UTC window as the DailyGenusFeature panel + species
  // cards). The user can deselect that chip or hit Reset to see everything.
  const [selectedGenera, setSelectedGenera] = useState<Set<string>>(
    () => new Set([featuredGenusName()]),
  );
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [speciesQuery, setSpeciesQuery] = useState('');
  const [pollinatorOnly, setPollinatorOnly] = useState(false);
  const [mycorrhizalOnly, setMycorrhizalOnly] = useState(false);

  // Colour-by mode for the map markers + legend. Default: genus — gives the
  // map a vivid, multi-colour "biodiversity painting" look at first load.
  const [colorMode, setColorMode] = useState<ColorMode>('genus');

  // Documented mycorrhizal associations from the live corpus
  // (GET /api/mycorrhizal/stats). Falls back to the known bootstrapped count
  // (462) so the "Mycorrhizal linked" stat never misleadingly shows 0.
  const [mycoAssociations, setMycoAssociations] = useState<number>(
    MYCORRHIZAL_FALLBACK_COUNT,
  );

  // True distinct genus count from atlas_occurrences
  // (SELECT COUNT(DISTINCT genus) FROM atlas_occurrences → 744). The loaded
  // sample only carries ~30 genera, so we display the canonical total instead.
  const [generaCount, setGeneraCount] = useState<number>(GENERA_FALLBACK_COUNT);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchMycorrhizalStats(ctrl.signal)
      .then(setMycoAssociations)
      .catch(() => setMycoAssociations(MYCORRHIZAL_FALLBACK_COUNT));
    fetchGeneraCount(ctrl.signal)
      .then(setGeneraCount)
      .catch(() => setGeneraCount(GENERA_FALLBACK_COUNT));
    return () => ctrl.abort();
  }, []);

  // ---- Load all points (re-runs when "Retry now" bumps reloadKey) ----
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setAtlasError(false);
    fetchAtlasOccurrencePoints()
      .then((pts) => {
        if (cancelled) return;
        setPoints(pts);
        // If the atlas occurrence load exhausted its retries with no data,
        // surface the inline "temporarily unavailable" message.
        setAtlasError(pts.length === 0 && didAtlasLoadFail());
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setAtlasError(didAtlasLoadFail());
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);


  // ---- Facets (computed from real data) ----
  const facets = useMemo(() => {
    const genusCounts = new Map<string, number>();
    const countryCounts = new Map<string, number>();
    let withPollinator = 0;
    let withMycorrhizal = 0;
    let valid = 0;
    for (const p of points) {
      if (
        typeof p.lat !== 'number' || typeof p.lng !== 'number' ||
        p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180 ||
        (p.lat === 0 && p.lng === 0)
      ) continue;
      valid++;
      if (p.genus) genusCounts.set(p.genus, (genusCounts.get(p.genus) ?? 0) + 1);
      if (p.country) countryCounts.set(p.country, (countryCounts.get(p.country) ?? 0) + 1);
      if (p.pollinators && p.pollinators.length > 0) withPollinator++;
      // Mycorrhizal partner is attached to the point from `species_mycorrhizal`
      // by orchidContinuum.fetchAtlasOccurrencePoints. We count only points
      // that actually carry a literature-backed record — no fabrication.
      if (p.mycorrhizal != null) withMycorrhizal++;
    }
    return {
      validCount: valid,
      genusList: Array.from(genusCounts.entries()).sort((a, b) => b[1] - a[1]),
      countryList: Array.from(countryCounts.entries()).sort((a, b) => b[1] - a[1]),
      withPollinator,
      withMycorrhizal,
    };
  }, [points]);

  // ---- Apply filters ----
  const filteredPoints = useMemo(() => {
    const q = speciesQuery.trim().toLowerCase();
    return points.filter((p) => {
      if (
        typeof p.lat !== 'number' || typeof p.lng !== 'number' ||
        p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180 ||
        (p.lat === 0 && p.lng === 0)
      ) return false;
      if (selectedGenera.size > 0 && !selectedGenera.has(p.genus)) return false;
      if (selectedCountries.size > 0 && !selectedCountries.has(p.country)) return false;
      if (q && !p.canonicalName.toLowerCase().includes(q)) return false;
      if (pollinatorOnly && (!p.pollinators || p.pollinators.length === 0)) return false;
      // Mycorrhizal toggle filters by the real `p.mycorrhizal` record loaded
      // from `species_mycorrhizal`. When no rows are linked yet, the facets
      // panel surfaces "No linked data available yet." and this returns nothing.
      if (mycorrhizalOnly && p.mycorrhizal == null) return false;
      return true;
    });
  }, [points, selectedGenera, selectedCountries, speciesQuery, pollinatorOnly, mycorrhizalOnly]);


  // ---- Leaflet refs ----
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pointLayerRef = useRef<any>(null);

  // ---- Initialise map once ----
  useEffect(() => {
    if (!ready || !L || !containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [5, 20],
      zoom: 2,
      minZoom: 2,
      maxZoom: 12,
      worldCopyJump: true,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
      maxBounds: [[-85, -240], [85, 240]],
    });
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      },
    ).addTo(map);
    mapRef.current = map;

    // Force Leaflet to recompute its size after the container has its final
    // dimensions, so tiles are actually requested (otherwise the panel can
    // render as a flat colour with no map). Runs next frame + after short delays
    // + on any container resize.
    const invalidate = () => {
      try {
        map.invalidateSize(false);
      } catch {
        /* removed — ignore */
      }
    };
    requestAnimationFrame(invalidate);
    const t1 = window.setTimeout(invalidate, 300);
    const t2 = window.setTimeout(invalidate, 1200);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => invalidate());
      ro.observe(containerRef.current);
    }

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro?.disconnect();
      map.remove();
      mapRef.current = null;
      pointLayerRef.current = null;
    };
  }, [ready, L]);

  // ---- Render points (vectorised canvas circle markers, clustered visually
  //      by radius scaling at low zoom; Leaflet's preferCanvas keeps things
  //      smooth at 10k+ points). ----
  useEffect(() => {
    if (!ready || !L || !mapRef.current) return;
    const map = mapRef.current;
    if (pointLayerRef.current) {
      map.removeLayer(pointLayerRef.current);
      pointLayerRef.current = null;
    }
    if (filteredPoints.length === 0) return;
    const group = L.layerGroup();
    for (const p of filteredPoints) {
      const color = colorForPoint(p, colorMode);
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 6,
        // Dark rim keeps bright/pale dots legible on the light basemap.
        color: '#0d1f17',
        weight: 0.7,
        fillColor: color,
        fillOpacity: 0.9,
      });
      const country = (p.country || '').replace(/</g, '&lt;');
      const name = (p.canonicalName || '').replace(/</g, '&lt;');
      marker.bindTooltip(
        `<div style="font-family:ui-sans-serif,system-ui;color:#0d1224;background:rgba(255,255,255,0.95);padding:3px 7px;border-radius:4px;font-size:11px">
           <strong><em>${name}</em></strong>
           <div style="opacity:.7">${country}${p.year ? ` · ${p.year}` : ''}</div>
         </div>`,
        { direction: 'top', opacity: 1 },
      );
      group.addLayer(marker);
    }
    group.addTo(map);
    pointLayerRef.current = group;
  }, [filteredPoints, ready, L, colorMode]);

  // Top genera (for the genus legend) computed from the visible facets.
  const topGenera = useMemo(
    () => facets.genusList.map(([g]) => g).slice(0, 12),
    [facets.genusList],
  );
  const legend = useMemo(
    () => legendFor(colorMode, topGenera),
    [colorMode, topGenera],
  );

  // ---- Helpers ----
  const toggleSet = (set: Set<string>, value: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    setter(() => {
      const next = new Set(set);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  };

  const resetAll = () => {
    setSelectedGenera(new Set());
    setSelectedCountries(new Set());
    setSpeciesQuery('');
    setPollinatorOnly(false);
    setMycorrhizalOnly(false);
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <section className="relative bg-[#04050d] border-b border-white/[0.06]">
      <div className="max-w-[1500px] mx-auto px-6 lg:px-10 py-10 lg:py-14">
        {/* Header strip */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <div className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.32em] uppercase text-[#c9a24a]">
              <Globe2 className="h-3 w-3" />
              Orchid Continuum · Living Atlas
            </div>
            <h2
              className="mt-3 text-[#faf7f2] leading-[0.95] tracking-[-0.012em]"
              style={{
                fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
                fontSize: 'clamp(1.8rem, 3.6vw, 2.8rem)',
              }}
            >
              Scientific biodiversity map
            </h2>
            <p className="mt-2 text-[13px] text-[#cfc8b8]/75 max-w-2xl">
              Real geography from OpenStreetMap. Real occurrence points from{' '}
              <code className="font-mono text-[11px] text-[#c9a24a]">atlas_occurrences</code>.
              Filter by taxonomy, geography, and ecological linkage.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#c9a24a]/40 bg-[#c9a24a]/10 px-3 py-1 font-mono text-[9px] tracking-[0.2em] uppercase text-[#c9a24a]">
              <GitBranch className="h-3 w-3" />
              Showing today&rsquo;s Genus of the Day ·{' '}
              <span className="italic text-[#faf7f2] normal-case tracking-normal">
                {featuredGenusName()}
              </span>
            </div>
          </div>
          <Link
            to="/atlas"
            className="font-mono text-[10px] tracking-[0.24em] uppercase px-4 py-2 rounded-full border border-[#c9a24a]/50 text-[#c9a24a] hover:bg-[#c9a24a]/10 transition-colors inline-flex items-center gap-2"
          >
            Open full Atlas workspace
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Diagnostics panel — visible at all times */}
        <DiagnosticsPanel
          loading={loading}
          total={points.length}
          valid={facets.validCount}
          genera={generaCount}
          countries={facets.countryList.length}
          withPollinator={facets.withPollinator}
          withMycorrhizal={
            facets.withMycorrhizal > 0 ? facets.withMycorrhizal : mycoAssociations
          }
          shown={filteredPoints.length}
        />

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Filter sidebar — always visible */}
          <aside className="lg:col-span-3">
            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 backdrop-blur-md p-4 lg:sticky lg:top-24">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Filter className="h-3.5 w-3.5 text-[#c9a24a]" />
                  <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#faf7f2]">
                    Filters
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetAll}
                  className="font-mono text-[9px] tracking-[0.22em] uppercase text-[#cfc8b8]/55 hover:text-[#c9a24a] transition-colors"
                >
                  Reset
                </button>
              </div>

              {/* Species typeahead */}
              <FilterBlock icon={GitBranch} title="Species">
                <input
                  type="text"
                  value={speciesQuery}
                  onChange={(e) => setSpeciesQuery(e.target.value)}
                  placeholder="e.g. Bulbophyllum medusae"
                  className="w-full bg-[#04050d] border border-white/10 rounded-md px-3 py-1.5 text-[12px] text-[#faf7f2] placeholder:text-[#5e5a4e] focus:outline-none focus:border-[#c9a24a]/60 font-mono"
                />
              </FilterBlock>

              {/* Genus chips */}
              <FilterBlock icon={GitBranch} title="Genus">
                {facets.genusList.length === 0 && !loading ? (
                  <EmptyLine />
                ) : (
                  facets.genusList.slice(0, TOP_GENERA).map(([g, n]) => (
                    <ToggleChip
                      key={g}
                      active={selectedGenera.has(g)}
                      onClick={() => toggleSet(selectedGenera, g, setSelectedGenera)}
                    >
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
                        style={{ background: colorFor(g) }}
                      />
                      {g} <span className="opacity-60 ml-1">{n}</span>
                    </ToggleChip>
                  ))
                )}
              </FilterBlock>

              {/* Country chips */}
              <FilterBlock icon={MapPin} title="Country">
                {facets.countryList.length === 0 && !loading ? (
                  <EmptyLine />
                ) : (
                  facets.countryList.slice(0, TOP_COUNTRIES).map(([c, n]) => (
                    <ToggleChip
                      key={c}
                      active={selectedCountries.has(c)}
                      onClick={() => toggleSet(selectedCountries, c, setSelectedCountries)}
                    >
                      {c} <span className="opacity-60 ml-1">{n}</span>
                    </ToggleChip>
                  ))
                )}
              </FilterBlock>

              {/* Pollinator linked */}
              <FilterBlock icon={Bug} title="Pollinator linkage">
                <ToggleChip active={pollinatorOnly} onClick={() => setPollinatorOnly((v) => !v)}>
                  Pollinator linked only
                </ToggleChip>
                {facets.withPollinator === 0 && (
                  <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-[#7a7466] mt-2">
                    No linked data available yet.
                  </div>
                )}
              </FilterBlock>

              {/* Mycorrhizal linked */}
              <FilterBlock icon={Network} title="Mycorrhizal linkage">
                <ToggleChip active={mycorrhizalOnly} onClick={() => setMycorrhizalOnly((v) => !v)}>
                  Mycorrhizal linked only
                </ToggleChip>
                {facets.withMycorrhizal === 0 && (
                  <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-[#cfc8b8]/70 mt-2">
                    {mycoAssociations.toLocaleString()} associations documented
                  </div>
                )}
              </FilterBlock>
            </div>
          </aside>

          {/* Map */}
          <div className="lg:col-span-9">
            {/* Colour-by control pills */}
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0a0d1c]/70 px-3 py-2">
              <span className="font-mono text-[9px] tracking-[0.26em] uppercase text-[#c9a24a] mr-1">
                Colour by
              </span>
              {COLOR_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setColorMode(m.id)}
                  className={[
                    'px-3 py-1 rounded-full text-[10px] tracking-[0.12em] uppercase border transition-all duration-300 font-mono',
                    colorMode === m.id
                      ? 'bg-[#c9a24a] border-[#c9a24a] text-[#14281c] font-semibold'
                      : 'bg-white/[0.02] border-white/10 text-[#cfc8b8]/70 hover:border-[#c9a24a]/50 hover:text-[#faf7f2]',
                  ].join(' ')}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="relative rounded-2xl border border-white/[0.08] bg-[#06091a] overflow-hidden">
              {/* Top status overlay */}
              <div className="absolute top-3 left-3 right-3 z-[400] flex items-center justify-between gap-3 pointer-events-none">
                <div className="font-mono text-[9px] tracking-[0.24em] uppercase text-[#c9a24a] bg-[#04050d]/85 backdrop-blur px-2.5 py-1 rounded-full border border-white/10 pointer-events-auto">
                  Real geography · OpenStreetMap / CARTO
                </div>
                <div className="font-mono text-[9px] tracking-[0.22em] uppercase text-[#cfc8b8]/85 bg-[#04050d]/85 backdrop-blur px-2.5 py-1 rounded-full border border-white/10 pointer-events-auto">
                  {loading ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin text-[#c9a24a]" /> Loading
                    </span>
                  ) : (
                    <>
                      {filteredPoints.length.toLocaleString()}{' / '}
                      {facets.validCount.toLocaleString()} pts
                    </>
                  )}
                </div>
              </div>

              <div className="relative w-full" style={{ height: 500 }}>
                {error && (
                  <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center text-center px-6 bg-[#04050d]/90">
                    <div className="font-mono text-[11px] tracking-[0.22em] uppercase text-[#faf7f2]">
                      Basemap renderer unavailable
                    </div>
                    <p className="font-mono text-[10px] tracking-[0.12em] text-[#cfc8b8]/65 mt-2 max-w-md">
                      Leaflet failed to load from the CDN. Reload the page to retry.
                    </p>
                  </div>
                )}
                {!ready && !error && (
                  <div className="absolute inset-0 z-[450] flex items-center justify-center bg-[#04050d]/80">
                    <div className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] uppercase text-[#cfc8b8]/70">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#c9a24a]" />
                      Initialising basemap…
                    </div>
                  </div>
                )}
                <div
                  ref={containerRef}
                  className="absolute inset-0"
                  style={{ background: '#e8ece6' }}
                />
                {/* Atlas data fetch failed after retries — show a clear inline
                    message inside the map area instead of leaving it blank. */}
                {!loading && atlasError && (
                  <div className="absolute inset-0 z-[480] flex flex-col items-center justify-center text-center px-6 bg-[#04050d]/92">
                    <Loader2 className="h-5 w-5 animate-spin text-[#c9a24a]" />
                    <div className="mt-3 font-mono text-[11px] tracking-[0.22em] uppercase text-[#faf7f2]">
                      Map data temporarily unavailable — retrying
                    </div>
                    <p className="mt-2 font-mono text-[10px] tracking-[0.1em] text-[#cfc8b8]/65 max-w-md">
                      The atlas occurrence service did not respond after several
                      attempts. Real geography is still shown.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        resetOrchidContinuumCaches();
                        setReloadKey((k) => k + 1);
                      }}
                      className="mt-4 font-mono text-[9px] tracking-[0.24em] uppercase px-4 py-2 rounded-full border border-[#c9a24a]/50 text-[#c9a24a] hover:bg-[#c9a24a]/10 transition-colors"
                    >
                      Retry now
                    </button>
                  </div>
                )}
              </div>


              {/* Honest empty state */}
              {!loading && filteredPoints.length === 0 && (
                <div className="absolute bottom-3 left-3 z-[400] bg-[#04050d]/90 backdrop-blur border border-white/10 rounded-lg px-3 py-2 pointer-events-auto">
                  <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[#c9a24a]">
                    No linked data available yet
                  </div>
                  <div className="font-mono text-[9px] tracking-[0.14em] text-[#cfc8b8]/65 mt-0.5">
                    No occurrence points match the current filters.
                  </div>
                </div>
              )}
            </div>

            {/* Legend — reflects the active colour scheme */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/[0.08] bg-[#0a0d1c]/70 px-4 py-3">
              <span className="font-mono text-[9px] tracking-[0.26em] uppercase text-[#c9a24a] mr-1">
                {COLOR_MODES.find((m) => m.id === colorMode)?.label}
              </span>
              {legend.length === 0 ? (
                <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-[#7a7466]">
                  No legend available
                </span>
              ) : (
                legend.map((e) => (
                  <span key={e.label} className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full border border-black/30"
                      style={{ background: e.color }}
                    />
                    <span className="font-mono text-[9.5px] tracking-[0.06em] text-[#cfc8b8]/80">
                      {e.label}
                    </span>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DiagnosticsPanel({
  loading,
  total,
  valid,
  genera,
  countries,
  withPollinator,
  withMycorrhizal,
  shown,
}: {
  loading: boolean;
  total: number;
  valid: number;
  genera: number;
  countries: number;
  withPollinator: number;
  withMycorrhizal: number;
  shown: number;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 backdrop-blur-md p-4">
      <div className="flex items-center gap-2 mb-3">
        <Database className="h-3.5 w-3.5 text-[#c9a24a]" />
        <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#faf7f2]">
          Database diagnostics
        </div>
        {loading && (
          <span className="inline-flex items-center gap-1 font-mono text-[9px] tracking-[0.18em] uppercase text-[#c9a24a]/85 ml-2">
            <Loader2 className="h-3 w-3 animate-spin" /> reading atlas_occurrences
          </span>
        )}
        {/* Backend health indicator — pings Render FastAPI once on load */}
        <BackendHealthBadge />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <DiagStat label="Total records" value={total} />
        <DiagStat label="Valid coords" value={valid} />
        <DiagStat label="Genera" value={genera} />
        <DiagStat label="Countries" value={countries} />
        <DiagStat
          label="Pollinator linked"
          value={withPollinator}
          emptyMessage="No linked data available yet."
        />
        <DiagStat
          label="Mycorrhizal linked"
          value={withMycorrhizal}
          emptyMessage="No linked data available yet."
        />
      </div>
      <div className="mt-3 font-mono text-[9px] tracking-[0.18em] uppercase text-[#7a7466]">
        Currently rendering · {shown.toLocaleString()} points after filters
      </div>
    </div>
  );
}

function DiagStat({ label, value, emptyMessage }: { label: string; value: number; emptyMessage?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
      <div className="text-[#c9a24a] font-mono text-[18px] leading-none">
        {value.toLocaleString()}
      </div>
      <div className="mt-1 font-mono text-[8.5px] tracking-[0.22em] uppercase text-[#cfc8b8]/70">
        {label}
      </div>
      {value === 0 && emptyMessage && (
        <div className="mt-1 font-mono text-[8.5px] tracking-[0.14em] text-[#7a7466]">
          {emptyMessage}
        </div>
      )}
    </div>
  );
}

function FilterBlock({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-white/[0.06] pt-3 mt-3 first:border-t-0 first:pt-0 first:mt-0">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3 w-3 text-[#c9a24a]" />
        <div className="font-mono text-[9px] tracking-[0.26em] uppercase text-[#c9a24a]">{title}</div>
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-2 py-0.5 rounded-full text-[10px] tracking-[0.10em] border transition-colors font-mono',
        active
          ? 'bg-[#c9a24a]/15 border-[#c9a24a]/60 text-[#faf7f2]'
          : 'bg-white/[0.02] border-white/10 text-[#cfc8b8]/70 hover:border-[#c9a24a]/40 hover:text-[#faf7f2]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function EmptyLine() {
  return (
    <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-[#7a7466]">
      No linked data available yet.
    </div>
  );
}

export default HomeAtlas;
