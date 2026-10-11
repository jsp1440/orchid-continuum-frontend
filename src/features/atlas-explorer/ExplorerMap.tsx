import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LABEL_FONT, TERRAIN_SOURCE, basemapById, offlineStyle, type BasemapId } from './basemaps';
import { gridSummary, normaliseViewport, recordAgeClass, type Cluster, type GridCell, type Viewport } from './geo';
import type { ExplorerOccurrence } from './occurrenceProvider';
import type { DrawableLayerId } from './contracts';
import type { ColorMode } from './palette';
export type { ColorMode } from './palette';
import { PALETTE } from './palette';


export interface ExplorerMapHandle {
  flyToBounds(bounds: [number, number, number, number]): void;
  exportPng(): Promise<Blob | null>;
  zoomBy(delta: number): void;
  resetView(): void;
}

export interface ExplorerMapProps {
  basemap: BasemapId;
  globe: boolean;
  terrain3d: boolean;
  activeLayers: ReadonlySet<DrawableLayerId>;
  colorMode: ColorMode;
  records: readonly ExplorerOccurrence[];
  clusters: readonly Cluster[];
  mode: 'points' | 'clusters';
  gridDeg: number;
  selectedId: string | null;
  onViewportChange(view: Viewport): void;
  onSelectRecord(id: string | null): void;
  onBasemapDegraded(detail: string | null): void;
}

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] as GeoJSON.Feature[] };
const INITIAL = { center: [-62, 4] as [number, number], zoom: 1.6 };


function pointsGeoJson(records: readonly ExplorerOccurrence[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: records.map((r) => ({
      type: 'Feature',
      id: undefined,
      geometry: { type: 'Point', coordinates: [r.decimalLongitude, r.decimalLatitude] },
      properties: {
        id: r.occurrenceID,
        name: r.scientificName,
        generalised: r.generalised,
        age: recordAgeClass(r.year),
        assessment: r.assessment,
        weight: 1,
      },
    })),
  };
}

function clustersGeoJson(clusters: readonly Cluster[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: clusters.map((c) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.longitude, c.latitude] },
      properties: {
        cellId: c.cellId,
        count: c.count,
        label: c.count >= 1000 ? `${Math.round(c.count / 100) / 10}k` : String(c.count),
        weight: c.count,
      },
    })),
  };
}

/** Rebuild cell bounds from a backend or client cluster id `deg:i:j`. */
function gridFromClusters(clusters: readonly Cluster[]): GridCell[] {
  const out: GridCell[] = [];
  for (const c of clusters) {
    const [deg, i, j] = c.cellId.split(':').map(Number);
    if (![deg, i, j].every(Number.isFinite)) continue;
    out.push({
      cellId: c.cellId,
      south: Math.max(-90, i * deg),
      north: Math.min(90, (i + 1) * deg),
      west: Math.max(-180, j * deg),
      east: Math.min(180, (j + 1) * deg),
      records: c.count,
      taxa: c.taxonCount,
    });
  }
  return out;
}

function gridGeoJson(cells: readonly GridCell[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: cells.map((c) => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [c.west, c.south],
            [c.east, c.south],
            [c.east, c.north],
            [c.west, c.north],
            [c.west, c.south],
          ],
        ],
      },
      properties: { records: c.records, taxa: c.taxa },
    })),
  };
}

function pointColor(mode: ColorMode): maplibregl.ExpressionSpecification | string {
  if (mode === 'record-age') {
    return ['match', ['get', 'age'], 'pre-1950', PALETTE.age['pre-1950'], '1950-1999', PALETTE.age['1950-1999'], '2000-plus', PALETTE.age['2000-plus'], PALETTE.age.undated];
  }
  if (mode === 'conservation-assessment') {
    return ['match', ['get', 'assessment'], 'threatened', PALETTE.assessment.threatened, 'not-threatened', PALETTE.assessment['not-threatened'], PALETTE.assessment.unresolved];
  }
  return ['case', ['get', 'generalised'], PALETTE.generalised, PALETTE.point];
}

function ensureOverlays(map: MapLibreMap) {
  const add = (id: string, data: GeoJSON.FeatureCollection = EMPTY_FC) => {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data });
  };
  add('oc-grid');
  add('oc-points');
  add('oc-clusters');
  if (!map.getSource('oc-terrain')) map.addSource('oc-terrain', TERRAIN_SOURCE);

  const layer = (spec: maplibregl.LayerSpecification) => {
    if (!map.getLayer(spec.id)) map.addLayer(spec);
  };
  layer({
    id: 'oc-hillshade',
    type: 'hillshade',
    source: 'oc-terrain',
    layout: { visibility: 'none' },
    paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#3f3f46' },
  });
  layer({
    id: 'oc-grid-fill',
    type: 'fill',
    source: 'oc-grid',
    layout: { visibility: 'none' },
    paint: { 'fill-color': '#0f766e', 'fill-opacity': 0.5, 'fill-outline-color': 'rgba(15,118,110,0.35)' },
  });
  layer({
    id: 'oc-heat',
    type: 'heatmap',
    source: 'oc-points',
    layout: { visibility: 'none' },
    paint: {
      'heatmap-weight': ['coalesce', ['get', 'weight'], 1],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 6, 9, 22],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.6, 9, 1.4],
      'heatmap-opacity': 0.75,
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.2, '#99f6e4', 0.45, '#2dd4bf', 0.7, '#f59e0b', 1, '#b91c1c'],
    },
  });
  layer({
    id: 'oc-heat-clusters',
    type: 'heatmap',
    source: 'oc-clusters',
    layout: { visibility: 'none' },
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 1, 0.2, 200, 1],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 18, 9, 40],
      'heatmap-opacity': 0.75,
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.2, '#99f6e4', 0.45, '#2dd4bf', 0.7, '#f59e0b', 1, '#b91c1c'],
    },
  });
  layer({
    id: 'oc-cluster-circle',
    type: 'circle',
    source: 'oc-clusters',
    paint: {
      'circle-color': PALETTE.cluster,
      'circle-opacity': 0.82,
      'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'count']], 1, 8, 10, 14, 40, 24],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
  });
  layer({
    id: 'oc-cluster-count',
    type: 'symbol',
    source: 'oc-clusters',
    layout: { 'text-field': ['get', 'label'], 'text-font': LABEL_FONT, 'text-size': 11, 'text-allow-overlap': true },
    paint: { 'text-color': '#ffffff' },
  });
  layer({
    id: 'oc-point',
    type: 'circle',
    source: 'oc-points',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 3.5, 10, 6.5],
      'circle-color': pointColor('default'),
      'circle-stroke-color': PALETTE.pointStroke,
      'circle-stroke-width': ['case', ['get', 'generalised'], 2, 1],
      'circle-opacity': ['case', ['get', 'generalised'], 0.55, 0.95],
    },
  });
  layer({
    id: 'oc-point-selected',
    type: 'circle',
    source: 'oc-points',
    filter: ['==', ['get', 'id'], ''],
    paint: { 'circle-radius': 11, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': PALETTE.selected, 'circle-stroke-width': 3 },
  });
}

const ExplorerMap = React.forwardRef<ExplorerMapHandle, ExplorerMapProps>(function ExplorerMap(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [styleVersion, setStyleVersion] = useState(0);
  const basemapErrorReported = useRef(false);

  useImperativeHandle(ref, () => ({
    flyToBounds([w, s, e, n]) {
      mapRef.current?.fitBounds([[w, s], [e, n]], { padding: 60, maxZoom: 9, duration: 1200 });
    },
    zoomBy(delta) {
      const map = mapRef.current;
      if (map) map.easeTo({ zoom: map.getZoom() + delta, duration: 300 });
    },
    resetView() {
      mapRef.current?.flyTo({ ...INITIAL, pitch: 0, bearing: 0, duration: 1200 });
    },
    async exportPng() {
      const map = mapRef.current;
      if (!map) return null;
      return new Promise<Blob | null>((resolve) => {
        map.once('render', () => {
          try {
            map.getCanvas().toBlob((blob) => resolve(blob), 'image/png');
          } catch {
            // Tainted canvas (a tile server without CORS) cannot be exported.
            resolve(null);
          }
        });
        map.triggerRepaint();
      });
    },
  }));

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    const initial = basemapById(propsRef.current.basemap);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: initial.style,
      center: INITIAL.center,
      zoom: INITIAL.zoom,
      attributionControl: { compact: true },
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      maxPitch: 75,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 120 }), 'bottom-left');
    map.addControl(new maplibregl.NavigationControl({ showZoom: false, visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.FullscreenControl(), 'bottom-right');

    let styleLoaded = false;
    let offline = false;
    const switchToOfflineBasemap = (detail: string) => {
      if (offline) return;
      offline = true;
      propsRef.current.onBasemapDegraded(detail);
      offlineStyle()
        .then((style) => map.setStyle(style))
        .catch(() => propsRef.current.onBasemapDegraded('No basemap is available; occurrence data is drawn without geographic context.'));
    };
    const fallbackTimer = window.setTimeout(() => {
      if (!styleLoaded) {
        switchToOfflineBasemap('Online basemap could not be loaded; showing bundled country outlines.');
      }
    }, 9000);

    map.on('style.load', () => {
      styleLoaded = true;
      ensureOverlays(map);
      setStyleVersion((v) => v + 1);
    });
    map.on('error', (event) => {
      const sourceId = (event as { sourceId?: string }).sourceId;
      if (!styleLoaded && !sourceId) {
        window.clearTimeout(fallbackTimer);
        switchToOfflineBasemap('Online basemap could not be loaded; showing bundled country outlines.');
        return;
      }
      if (sourceId && !sourceId.startsWith('oc-') && !basemapErrorReported.current) {
        basemapErrorReported.current = true;
        propsRef.current.onBasemapDegraded('Some basemap tiles failed to load. Occurrence data is unaffected.');
      }
    });

    const emitView = () => {
      const b = map.getBounds();
      propsRef.current.onViewportChange(
        normaliseViewport({ west: b.getWest(), east: b.getEast(), south: b.getSouth(), north: b.getNorth(), zoom: map.getZoom() }),
      );
    };
    // Do not wait for 'load': it needs a fully rendered first frame, which a
    // failing basemap can delay indefinitely. Data must not depend on tiles.
    map.on('style.load', emitView);
    map.on('moveend', emitView);
    const firstView = window.requestAnimationFrame(emitView);

    map.on('click', 'oc-cluster-circle', (e) => {
      const f = e.features?.[0];
      const cellId = f?.properties?.cellId as string | undefined;
      if (!cellId) return;
      const [deg, i, j] = cellId.split(':').map(Number);
      map.fitBounds([[j * deg, i * deg], [(j + 1) * deg, (i + 1) * deg]], { padding: 40, duration: 900 });
    });
    map.on('click', 'oc-point', (e) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      propsRef.current.onSelectRecord(id ?? null);
    });
    for (const id of ['oc-cluster-circle', 'oc-point']) {
      map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
    }

    return () => {
      window.clearTimeout(fallbackTimer);
      window.cancelAnimationFrame(firstView);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Basemap switching. Overlays are re-added on the next style.load.
  const firstBasemap = useRef(true);
  useEffect(() => {
    if (firstBasemap.current) {
      firstBasemap.current = false;
      return;
    }
    basemapErrorReported.current = false;
    props.onBasemapDegraded(null);
    mapRef.current?.setStyle(basemapById(props.basemap).style);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.basemap]);

  // Projection and terrain.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleVersion) return;
    map.setProjection({ type: props.globe ? 'globe' : 'mercator' });
    if (props.terrain3d) {
      map.setTerrain({ source: 'oc-terrain', exaggeration: 1.4 });
      if (map.getPitch() < 30) map.easeTo({ pitch: 55, duration: 800 });
    } else {
      map.setTerrain(null);
    }
  }, [props.globe, props.terrain3d, styleVersion]);

  const { records, clusters, mode, activeLayers, colorMode, gridDeg, selectedId } = props;
  const density = activeLayers.has('occurrence-density');
  const gridOn = activeLayers.has('observed-richness') || activeLayers.has('sampling-gaps');
  const gridMetric: 'taxa' | 'records' = activeLayers.has('observed-richness') ? 'taxa' : 'records';

  // Data sources: only rewritten when the data itself changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleVersion || !map.getSource('oc-points')) return;
    (map.getSource('oc-points') as GeoJSONSource).setData(
      mode === 'points' || density ? pointsGeoJson(records) : EMPTY_FC,
    );
    (map.getSource('oc-clusters') as GeoJSONSource).setData(mode === 'clusters' ? clustersGeoJson(clusters) : EMPTY_FC);
  }, [records, clusters, mode, density, styleVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleVersion || !map.getSource('oc-grid')) return;
    const cells = gridOn ? (records.length ? gridSummary(records, gridDeg) : gridFromClusters(clusters)) : [];
    (map.getSource('oc-grid') as GeoJSONSource).setData(gridGeoJson(cells));
    const maxValue = Math.max(1, ...cells.map((c) => c[gridMetric]));
    map.setPaintProperty('oc-grid-fill', 'fill-color', [
      'interpolate',
      ['linear'],
      ['get', gridMetric],
      1,
      gridMetric === 'taxa' ? '#ccfbf1' : '#fef3c7',
      Math.max(2, maxValue),
      gridMetric === 'taxa' ? '#134e4a' : '#b45309',
    ]);
  }, [records, clusters, gridOn, gridDeg, gridMetric, styleVersion]);

  // Layer visibility and styling.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleVersion || !map.getLayer('oc-point')) return;
    const showOcc =
      activeLayers.has('occurrences') || activeLayers.has('record-age') || activeLayers.has('conservation-assessment');
    const vis = (id: string, on: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    };
    vis('oc-grid-fill', gridOn);
    vis('oc-hillshade', activeLayers.has('terrain'));
    vis('oc-heat', density && records.length > 0);
    vis('oc-heat-clusters', density && records.length === 0 && mode === 'clusters');
    vis('oc-cluster-circle', showOcc && mode === 'clusters');
    vis('oc-cluster-count', showOcc && mode === 'clusters');
    vis('oc-point', showOcc && mode === 'points');
    vis('oc-point-selected', showOcc && mode === 'points');
    map.setPaintProperty('oc-point', 'circle-color', pointColor(colorMode));
    map.setFilter('oc-point-selected', ['==', ['get', 'id'], selectedId ?? '']);
  }, [activeLayers, colorMode, selectedId, mode, density, gridOn, records.length, styleVersion]);

  return (
    // MapLibre sets `position: relative` on its container, so the container
    // fills an absolutely positioned wrapper rather than being positioned itself.
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        className="h-full w-full"
        role="application"
        aria-label="Interactive orchid occurrence map. Use the controls to zoom, change basemap, and switch between map and globe."
        data-testid="atlas-explorer-map"
      />
    </div>
  );
});

export default ExplorerMap;
