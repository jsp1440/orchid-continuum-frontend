import React, { useEffect, useMemo, useRef } from 'react';
import { Globe2, Loader2, Layers as LayersIcon } from 'lucide-react';
import { useLeaflet } from '@/hooks/useLeaflet';
import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';

/**
 * LiveAtlasMap — real-geography scientific biodiversity map.
 *
 * Uses Leaflet with CartoDB dark_all raster tiles (OpenStreetMap data, real
 * world coastlines, country borders, cities). NO hand-drawn continent
 * silhouettes anywhere in this component.
 *
 * - Renders occurrence points as canvas circle markers (Leaflet's preferCanvas
 *   keeps thousands of points fluid).
 * - Color-codes by genus.
 * - Overlay "halo" rings express the active layer toggles (pollinator,
 *   habitat, climate, conservation).
 * - Click a point → onSelect(point) so the parent opens the species card.
 * - selectedId draws a highlighted ring around the currently-open point.
 */

export type LayerKey =
  | 'occurrence'
  | 'pollinator'
  | 'mycorrhizal'
  | 'habitat'
  | 'climate'
  | 'conservation';

export interface AtlasFocusBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface AtlasFocusView {
  lat: number;
  lng: number;
  zoom: number;
}

interface Props {
  points: AtlasOccurrencePoint[];
  activeLayers: Set<LayerKey>;
  onSelect: (point: AtlasOccurrencePoint) => void;
  selectedId?: string | null;
  loading?: boolean;
  totalLoaded?: number;
  /**
   * When set, the map animates a fitBounds to this rectangle. Used by the
   * Atlas Tour's "Start Ecuador Expedition" action. Pass a NEW object each
   * time you want to re-trigger the zoom.
   */
  focusBounds?: AtlasFocusBounds | null;
  /**
   * When set, the map animates a setView to this center + zoom. Used by the
   * Grand Tour to pan/zoom the live map to each stop. Pass a NEW object each
   * time you want to re-trigger the animation.
   */
  focusView?: AtlasFocusView | null;
}


const GENUS_COLOR: Record<string, string> = {
  Angraecum:     '#ffffff',
  Bulbophyllum:  '#ff9b6a',
  Catasetum:     '#86efac',
  Cypripedium:   '#ffd166',
  Dracula:       '#c084fc',
  Paphiopedilum: '#c4a87a',
  Pleurothallis: '#7dd3a8',
  Stanhopea:     '#fdba74',
  Vanilla:       '#fef3c7',
};
const colorFor = (g: string) => GENUS_COLOR[g] ?? '#c9a24a';

const LiveAtlasMap: React.FC<Props> = ({
  points,
  activeLayers,
  onSelect,
  selectedId,
  loading,
  totalLoaded,
  focusBounds,
  focusView,
}) => {
  const { ready, error, L } = useLeaflet();
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const occurrenceLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const haloLayerRefs = useRef<Record<string, any>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const highlightRef = useRef<any>(null);

  // Latest onSelect via ref so we don't tear down + rebuild markers on every
  // parent re-render.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // ---- Initialise map once Leaflet is ready ----
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
      preferCanvas: true, // canvas renderer keeps thousands of points smooth
      maxBounds: [[-85, -240], [85, 240]],
    });

    // Real geography. CartoDB "voyager" is OSM-derived raster tiles with a
    // light, legible background so land masses are clearly visible and the
    // colored occurrence dots stand out.
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

    return () => {
      map.remove();
      mapRef.current = null;
      occurrenceLayerRef.current = null;
      haloLayerRefs.current = {};
      highlightRef.current = null;
    };
  }, [ready, L]);

  // ---- Sync occurrence points ----
  useEffect(() => {
    if (!ready || !L || !mapRef.current) return;
    const map = mapRef.current;

    // Remove previous layer
    if (occurrenceLayerRef.current) {
      map.removeLayer(occurrenceLayerRef.current);
      occurrenceLayerRef.current = null;
    }

    if (!activeLayers.has('occurrence')) return;

    const group = L.layerGroup();
    for (const p of points) {
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue;
      if (p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) continue;
      const color = colorFor(p.genus);
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 3.4,
        // Dark rim so bright/pale dots stay legible on the light basemap.
        color: '#0d1f17',
        weight: 0.8,
        fillColor: color,
        fillOpacity: 0.92,
      });
      marker.bindTooltip(
        `<div style="font-family:ui-sans-serif,system-ui;color:#0d1224;background:rgba(255,255,255,0.95);padding:4px 8px;border-radius:4px">
           <strong><em>${escapeHtml(p.canonicalName)}</em></strong>
           <div style="font-size:11px;opacity:.75;margin-top:2px">${escapeHtml(p.country)}${p.year ? ` · ${p.year}` : ''}</div>
         </div>`,
        { direction: 'top', opacity: 1 },
      );
      marker.on('click', () => onSelectRef.current(p));
      group.addLayer(marker);
    }
    group.addTo(map);
    occurrenceLayerRef.current = group;
  }, [points, ready, L, activeLayers]);

  // ---- Sync halo / overlay layers (pollinator, habitat, climate, conservation) ----
  useEffect(() => {
    if (!ready || !L || !mapRef.current) return;
    const map = mapRef.current;

    const haloSpecs: { key: LayerKey; color: string; radius: number; predicate: (p: AtlasOccurrencePoint) => boolean }[] = [
      { key: 'pollinator',   color: '#86efac', radius: 9,  predicate: (p) => p.pollinators.length > 0 },
      { key: 'habitat',      color: '#c084fc', radius: 11, predicate: (p) => !!p.habitat },
      { key: 'climate',      color: '#9ad6ff', radius: 7,  predicate: (p) => typeof p.elevation_m === 'number' },
      { key: 'conservation', color: '#ff6b6b', radius: 13, predicate: (p) => !!p.iucnCode && ['VU', 'EN', 'CR', 'NT'].includes(p.iucnCode) },
    ];

    for (const spec of haloSpecs) {
      // Tear down existing layer
      if (haloLayerRefs.current[spec.key]) {
        map.removeLayer(haloLayerRefs.current[spec.key]);
        delete haloLayerRefs.current[spec.key];
      }
      if (!activeLayers.has(spec.key)) continue;

      const group = L.layerGroup();
      for (const p of points) {
        if (!spec.predicate(p)) continue;
        const ring = L.circleMarker([p.lat, p.lng], {
          radius: spec.radius,
          color: spec.color,
          weight: 0.8,
          fillOpacity: 0,
          opacity: 0.55,
          interactive: false,
        });
        group.addLayer(ring);
      }
      group.addTo(map);
      haloLayerRefs.current[spec.key] = group;
    }
  }, [points, ready, L, activeLayers]);

  // ---- Highlight ring for the currently-selected point ----
  useEffect(() => {
    if (!ready || !L || !mapRef.current) return;
    const map = mapRef.current;

    if (highlightRef.current) {
      map.removeLayer(highlightRef.current);
      highlightRef.current = null;
    }
    if (!selectedId) return;
    const point = points.find((p) => p.id === selectedId);
    if (!point) return;

    const ring = L.circleMarker([point.lat, point.lng], {
      radius: 14,
      color: '#c9a24a',
      weight: 2,
      fillOpacity: 0,
      opacity: 1,
      interactive: false,
    });
    ring.addTo(map);
    highlightRef.current = ring;
    map.setView([point.lat, point.lng], Math.max(map.getZoom(), 5), {
      animate: true,
    });
  }, [selectedId, points, ready, L]);

  // ---- Fit to a requested focus rectangle (e.g. Ecuador Expedition) ----
  useEffect(() => {
    if (!ready || !L || !mapRef.current || !focusBounds) return;
    const map = mapRef.current;
    const { south, west, north, east } = focusBounds;
    map.fitBounds(
      [
        [south, west],
        [north, east],
      ],
      { animate: true, padding: [24, 24] },
    );
  }, [focusBounds, ready, L]);

  // ---- Pan/zoom to a requested center + zoom (Grand Tour stops) ----
  useEffect(() => {
    if (!ready || !L || !mapRef.current || !focusView) return;
    const map = mapRef.current;
    map.flyTo([focusView.lat, focusView.lng], focusView.zoom, {
      animate: true,
      duration: 1.4,
    });
  }, [focusView, ready, L]);

  const legend = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of points) counts.set(p.genus, (counts.get(p.genus) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [points]);

  return (
    <div className="relative rounded-2xl border border-white/[0.08] overflow-hidden bg-[#06091a]">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-[400] px-4 py-3 flex items-center justify-between gap-3 pointer-events-none">
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a] bg-[#04050d]/85 backdrop-blur px-3 py-1.5 rounded-full border border-white/10 pointer-events-auto">
          <Globe2 className="h-3 w-3" />
          Living Atlas · Real Geography
        </div>
        <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.22em] uppercase text-[#cfc8b8]/80 bg-[#04050d]/85 backdrop-blur px-3 py-1.5 rounded-full border border-white/10 pointer-events-auto">
          {loading ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-[#c9a24a]" />
              Loading
            </>
          ) : (
            <>
              <LayersIcon className="h-3 w-3 text-[#c9a24a]" />
              {points.length.toLocaleString()}
              {typeof totalLoaded === 'number' && totalLoaded !== points.length
                ? ` / ${totalLoaded.toLocaleString()}`
                : ''}{' '}
              records
            </>
          )}
        </div>
      </div>

      {/* Legend (genus colors) */}
      {legend.length > 0 && (
        <div className="absolute bottom-3 left-3 z-[400] bg-[#04050d]/85 backdrop-blur border border-white/10 rounded-lg px-3 py-2 font-mono text-[9px] tracking-[0.18em] uppercase text-[#cfc8b8]/85 pointer-events-auto max-w-[260px]">
          <div className="text-[#c9a24a] mb-1">Genera</div>
          <div className="flex flex-wrap gap-x-2.5 gap-y-1">
            {legend.slice(0, 12).map(([g, n]) => (
              <div key={g} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: colorFor(g), boxShadow: `0 0 6px ${colorFor(g)}66` }}
                />
                <span className="italic normal-case text-[10px]">{g}</span>
                <span className="text-[#7a7466]">{n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Map */}
      <div className="relative w-full" style={{ height: 'clamp(420px, 60vh, 720px)' }}>
        {error && (
          <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center text-center px-6 bg-[#04050d]/90">
            <div className="font-display text-xl text-[#faf7f2]">Basemap renderer unavailable</div>
            <p className="text-sm text-[#cfc8b8]/65 mt-2 max-w-md">
              Leaflet failed to load from the CDN. Reload the page to retry. Points are still being
              read from the live Orchid Continuum database.
            </p>
          </div>
        )}
        {!ready && !error && (
          <div className="absolute inset-0 z-[450] flex items-center justify-center bg-[#04050d]/80">
            <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] uppercase text-[#cfc8b8]/70">
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
      </div>
    </div>
  );
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default LiveAtlasMap;
