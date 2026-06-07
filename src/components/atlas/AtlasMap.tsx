import React, { useEffect, useRef } from 'react';
import { CircleDashed, Globe2, Loader2 } from 'lucide-react';
import { useLeaflet } from '@/hooks/useLeaflet';
import type { AtlasFeature, AtlasLayerKind } from '@/lib/atlas';

interface Props {
  /** Features keyed by layer kind so each layer can be styled independently. */
  layers: Record<string, { kind: AtlasLayerKind; features: AtlasFeature[] }>;
  /** True when at least one layer is currently fetching. */
  loading?: boolean;
  /** Display message for transparent empty/error states. */
  status?: string | null;
}

const STYLE_BY_KIND: Record<string, { color: string; fill: string; radius: number }> = {
  occurrence:       { color: '#86efac', fill: '#34d399', radius: 4 },
  genus:            { color: '#fde68a', fill: '#facc15', radius: 5 },
  species:          { color: '#fca5a5', fill: '#f87171', radius: 5 },
  pollination:      { color: '#fdba74', fill: '#fb923c', radius: 5 },
  mycorrhizal:      { color: '#c4b5fd', fill: '#a78bfa', radius: 5 },
  'pollinator-range': { color: '#fcd34d', fill: '#fbbf24', radius: 5 },
  'co-occurrence':  { color: '#67e8f9', fill: '#22d3ee', radius: 5 },
  topographic:      { color: '#a3a3a3', fill: '#737373', radius: 4 },
  climate:          { color: '#7dd3fc', fill: '#38bdf8', radius: 5 },
  temporal:         { color: '#f9a8d4', fill: '#ec4899', radius: 5 },
  historical:       { color: '#d6d3d1', fill: '#a8a29e', radius: 5 },
};

const AtlasMap: React.FC<Props> = ({ layers, loading, status }) => {
  const { ready, error, L } = useLeaflet();
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerGroupsRef = useRef<Record<string, any>>({});

  // Initialize map once Leaflet is ready
  useEffect(() => {
    if (!ready || !L || !containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [5, 20],
      zoom: 2,
      minZoom: 2,
      maxZoom: 10,
      worldCopyJump: true,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    });

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      },
    ).addTo(map);

    mapRef.current = map;

    // CRITICAL: Leaflet must be told to recompute its size once the container
    // has its final dimensions. The map is initialized inside an aspect-ratio
    // box whose height may still be 0 during the first paint — without this,
    // Leaflet renders into a 0×0 viewport and never requests any tiles, leaving
    // the panel solid black. We invalidate on the next frame, after a short
    // delay, and whenever the container resizes.
    const invalidate = () => {
      try {
        map.invalidateSize(false);
      } catch {
        /* map already removed — ignore */
      }
    };
    requestAnimationFrame(invalidate);
    const t1 = window.setTimeout(invalidate, 250);
    const t2 = window.setTimeout(invalidate, 1000);

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
      layerGroupsRef.current = {};
    };
  }, [ready, L]);

  // Sync layer groups with `layers` prop
  useEffect(() => {
    if (!ready || !L || !mapRef.current) return;
    const map = mapRef.current;

    // Remove groups that are no longer present
    for (const k of Object.keys(layerGroupsRef.current)) {
      if (!layers[k]) {
        map.removeLayer(layerGroupsRef.current[k]);
        delete layerGroupsRef.current[k];
      }
    }

    // Add / update active groups
    for (const [k, layer] of Object.entries(layers)) {
      if (layerGroupsRef.current[k]) {
        map.removeLayer(layerGroupsRef.current[k]);
        delete layerGroupsRef.current[k];
      }
      const style =
        STYLE_BY_KIND[layer.kind] ?? STYLE_BY_KIND.occurrence;
      const group = L.layerGroup();
      for (const f of layer.features) {
        if (typeof f.lat !== 'number' || typeof f.lng !== 'number') continue;
        const marker = L.circleMarker([f.lat, f.lng], {
          radius: style.radius,
          color: style.color,
          weight: 1,
          fillColor: style.fill,
          fillOpacity: 0.65,
        });
        const props = f.properties ?? {};
        const name = (props as Record<string, unknown>).name as string | undefined;
        const year = (props as Record<string, unknown>).year as
          | number
          | string
          | undefined;
        if (name || year) {
          marker.bindTooltip(
            `<div style="font-family:ui-sans-serif,system-ui;color:#0d1f17">
               ${name ? `<strong>${String(name)}</strong>` : ''}
               ${year ? `<div style="font-size:11px;opacity:.7">${String(year)}</div>` : ''}
             </div>`,
          );
        }
        group.addLayer(marker);
      }
      group.addTo(map);
      layerGroupsRef.current[k] = group;
    }
  }, [layers, ready, L]);

  return (
    <div className="rounded-3xl border border-white/10 bg-[#142a1f] overflow-hidden">
      <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs tracking-[0.25em] uppercase text-emerald-300/80">
          <Globe2 className="h-3.5 w-3.5" /> Atlas Canvas
        </div>
        <div className="flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase text-white/55">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-300" />}
          {!loading && <CircleDashed className="h-3.5 w-3.5" />}
          {status ?? (loading ? 'Fetching layer…' : 'Live layer')}
        </div>
      </div>
      <div className="relative aspect-[16/8] bg-[#0d1f17]">
        {!ready && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-300 mb-3" />
            <div className="text-sm text-white/60">Initializing map renderer…</div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <div className="font-serif text-2xl text-white">Map renderer unavailable</div>
            <p className="text-sm text-white/55 mt-2 max-w-md">
              Leaflet failed to load from the CDN. Atlas intelligence layer
              will retry on next page load.
            </p>
          </div>
        )}
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ background: '#0d1f17' }}
        />
      </div>
    </div>
  );
};

export default AtlasMap;
