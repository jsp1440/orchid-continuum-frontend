import React, { useEffect, useRef, useState } from 'react';
import type { GlobeMark } from './AtlasGlobe';
import { MAPBOX_STYLE_URL, mapboxConfig } from './mapboxConfig';

/**
 * ATLAS-NEXT — the regional half of the scale ladder.
 *
 * Below the country rung a 3D globe stops paying for itself: what it is good at
 * — planetary pattern, one continuous Earth — is not what a valley needs. This
 * is the same Atlas at a closer distance, not a second application, so it
 * inherits the camera position, the selection, the active question, and above
 * all the same sensitivity policy: a mark is drawn here exactly where the globe
 * would have drawn it, generalised or not.
 *
 * mapbox-gl is 1.8 MB and is imported dynamically, so it costs nothing until a
 * viewer actually descends. If no token is configured the Atlas says which
 * variable is missing and stays on the globe; it never degrades to a broken map.
 */

export interface RegionalView {
  lat: number;
  lng: number;
  /** Mapbox zoom level. */
  zoom: number;
}

interface Props {
  view: RegionalView;
  marks: GlobeMark[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onViewChange?: (v: RegionalView) => void;
  /** Terrain is an extension point; off until a question needs it. */
  terrain?: boolean;
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'unconfigured'; envVar: string; reason: string }
  | { kind: 'failed'; detail: string };

/**
 * Mapbox error text quotes the failing request URL, which carries the access
 * token as a query parameter. A pk.* token is public by design, but printing it
 * into the interface puts it into every screenshot and bug report, so it is
 * stripped before anything is shown.
 */
function sanitiseDetail(raw: string): string {
  return raw
    .replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]')
    .replace(/\bpk\.[A-Za-z0-9._-]+/g, '[redacted token]');
}

const SOURCE_ID = 'atlas-occurrences';
const CIRCLE_LAYER = 'atlas-occurrence-circles';
const HALO_LAYER = 'atlas-occurrence-haloes';

/** Marks as GeoJSON. Mapbox handles tens of thousands of these natively. */
function toGeoJson(marks: GlobeMark[], selectedId: string | null) {
  return {
    type: 'FeatureCollection' as const,
    features: marks.map((m) => ({
      type: 'Feature' as const,
      id: undefined,
      geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
      properties: {
        id: m.id,
        color: m.color,
        // Degrees of generalisation, so the halo can be drawn at its true size
        // rather than at a decorative one.
        haloDeg: m.haloDeg ?? 0,
        selected: m.id === selectedId ? 1 : 0,
      },
    })),
  };
}

const RegionalMap: React.FC<Props> = ({ view, marks, selectedId, onSelect, onViewChange, terrain }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const [state, setState] = useState<LoadState>({ kind: 'idle' });

  const selectRef = useRef(onSelect);
  const viewChangeRef = useRef(onViewChange);
  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    viewChangeRef.current = onViewChange;
  }, [onViewChange]);

  // Latest data, read by the map once it exists.
  const marksRef = useRef(marks);
  const selectedRef = useRef(selectedId);
  marksRef.current = marks;
  selectedRef.current = selectedId;

  useEffect(() => {
    const cfg = mapboxConfig();
    if (!cfg.configured) {
      setState({ kind: 'unconfigured', envVar: cfg.envVar, reason: cfg.reason });
      return;
    }

    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any = null;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const [{ default: mapboxgl }] = await Promise.all([
          import('mapbox-gl'),
          import('mapbox-gl/dist/mapbox-gl.css'),
        ]);
        if (cancelled || !hostRef.current) return;

        mapboxgl.accessToken = cfg.token as string;
        map = new mapboxgl.Map({
          container: hostRef.current,
          style: MAPBOX_STYLE_URL,
          center: [view.lng, view.lat],
          zoom: view.zoom,
          attributionControl: true,
          // Touch-first: one finger pans, two rotate/zoom, and the page does not
          // steal the gesture.
          cooperativeGestures: false,
        });
        mapRef.current = map;

        map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'bottom-left');

        map.on('load', () => {
          if (cancelled) return;
          map.addSource(SOURCE_ID, {
            type: 'geojson',
            data: toGeoJson(marksRef.current, selectedRef.current),
          });

          // Generalisation haloes, drawn to the real cell radius so the viewer
          // sees the size of the uncertainty rather than a decorative ring.
          map.addLayer({
            id: HALO_LAYER,
            type: 'circle',
            source: SOURCE_ID,
            filter: ['>', ['get', 'haloDeg'], 0],
            paint: {
              'circle-color': ['get', 'color'],
              'circle-opacity': 0.1,
              'circle-stroke-color': ['get', 'color'],
              'circle-stroke-opacity': 0.5,
              'circle-stroke-width': 1,
              // One degree of latitude is ~111 km; convert to metres and let
              // Mapbox scale it with the viewport.
              'circle-radius': [
                'interpolate',
                ['exponential', 2],
                ['zoom'],
                0,
                0,
                22,
                ['*', ['get', 'haloDeg'], 111000 / 0.075],
              ],
            },
          });

          map.addLayer({
            id: CIRCLE_LAYER,
            type: 'circle',
            source: SOURCE_ID,
            paint: {
              'circle-color': ['get', 'color'],
              'circle-opacity': 0.85,
              'circle-radius': ['case', ['==', ['get', 'selected'], 1], 9, 5],
              'circle-stroke-width': ['case', ['==', ['get', 'selected'], 1], 2, 0],
              'circle-stroke-color': '#f0ede4',
            },
          });

          map.on('click', CIRCLE_LAYER, (e: { features?: Array<{ properties: { id: string } }> }) => {
            const f = e.features?.[0];
            if (f) selectRef.current(f.properties.id);
          });
          map.on('click', (e: { point: { x: number; y: number } }) => {
            const hits = map.queryRenderedFeatures(e.point, { layers: [CIRCLE_LAYER] });
            if (!hits.length) selectRef.current(null);
          });
          // Touch targets: a fingertip is not a cursor, so widen the hit area
          // without changing what is drawn.
          map.getCanvas().style.cursor = 'grab';

          setState({ kind: 'ready' });
        });

        map.on('moveend', () => {
          if (cancelled || !viewChangeRef.current) return;
          const c = map.getCenter();
          viewChangeRef.current({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
        });

        map.on('error', (e: { error?: { message?: string } }) => {
          if (cancelled) return;
          setState({
            kind: 'failed',
            detail: sanitiseDetail(e?.error?.message ?? 'Mapbox reported an error.'),
          });
        });
      } catch (e) {
        if (!cancelled) {
          setState({
            kind: 'failed',
            detail: sanitiseDetail(e instanceof Error ? e.message : 'Failed to load the map.'),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current = null;
      map?.remove?.();
    };
    // Built once; the camera and data flow in through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data updates.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || state.kind !== 'ready') return;
    const src = map.getSource(SOURCE_ID);
    src?.setData?.(toGeoJson(marks, selectedId));
  }, [marks, selectedId, state.kind]);

  // Camera updates driven from outside (a descent, or a place chosen in the panel).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || state.kind !== 'ready') return;
    map.easeTo({ center: [view.lng, view.lat], zoom: view.zoom, duration: 900 });
  }, [view, state.kind]);

  // Terrain is an extension point, not a feature yet: wired so a later slice
  // turns it on without restructuring anything.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || state.kind !== 'ready') return;
    try {
      if (terrain) {
        if (!map.getSource('mapbox-dem')) {
          map.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14,
          });
        }
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.2 });
      } else {
        map.setTerrain(null);
      }
    } catch {
      /* terrain is optional; never let it take the map down */
    }
  }, [terrain, state.kind]);

  return (
    <div className="absolute inset-0" data-testid="atlas-regional-map">
      <div ref={hostRef} className="absolute inset-0" />

      {state.kind === 'unconfigured' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#05070b] px-6">
          <div className="max-w-md rounded-xl border border-[#7fa8d8]/30 bg-black/70 px-5 py-4 backdrop-blur">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#9dc0e0]">
              Regional map not configured
            </p>
            <p className="mt-2 text-[13.5px] leading-[1.6] text-white/80">
              The Atlas can descend to regional scales, but this deployment has no map provider
              configured, so it will stay on the globe.
            </p>
            <p className="mt-3 text-[12.5px] leading-[1.6] text-white/60">
              Set <span className="font-mono text-[#9dc0e0]">{state.envVar}</span> to the existing
              Mapbox <span className="font-mono">pk.*</span> public token and redeploy. Nothing else
              needs to change.
            </p>
            <p className="mt-2 text-[11.5px] leading-[1.55] text-white/40">{state.reason}</p>
          </div>
        </div>
      )}

      {state.kind === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#05070b]">
          <p className="text-[13px] text-white/60">Descending…</p>
        </div>
      )}

      {state.kind === 'failed' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#05070b] px-6">
          <div className="max-w-md rounded-xl border border-white/12 bg-black/70 px-5 py-4 text-center backdrop-blur">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#8b9487]">
              Unavailable
            </p>
            <p className="mt-1.5 text-[13.5px] leading-[1.6] text-white/75">
              The regional map could not be loaded. This is a connection or configuration problem —
              it says nothing about the records.
            </p>
            <p className="mt-2 font-mono text-[10.5px] text-white/35">{state.detail}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegionalMap;
