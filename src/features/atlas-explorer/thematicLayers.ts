/**
 * Atlas Explorer — reusable frontend thematic-layer architecture.
 *
 * A `FrontendThematicLayer` is the self-describing unit every derived map
 * layer registers as: identity, the point colour mode it activates, a typed
 * legend (continuous ramp or categorical classes, each with unit, source and
 * uncertainty note), provenance/attribution strings, and the caveats the UI
 * must surface alongside the data. The layer panel, the legend block, and the
 * map colouring all read from this registry, so future climate, vegetation,
 * phenology and conservation layers each add one entry here plus a sampler,
 * without touching panel or map wiring.
 *
 * Import direction is strictly one way — contracts.ts and palette.ts never
 * import this module — so there are no cycles: elevation.ts and basemaps.ts
 * are leaves, this module composes them, and the UI composes this.
 */

import type { ColorMode } from './palette';
import { ELEVATION_LAYER_ID, ELEVATION_RAMP, elevationCss } from './elevation';
import { TERRAIN_SOURCE } from './basemaps';

export interface ThematicLegendStop {
  /** Data value at which this colour applies (metres for elevation). */
  value: number;
  color: string;
  label?: string;
}

export interface ThematicLegend {
  kind: 'continuous' | 'categorical';
  title: string;
  unit: string;
  stops: ThematicLegendStop[];
  /** Uncertainty and method note shown beneath the legend. */
  note?: string;
}

export interface FrontendThematicLayer {
  /** Matches the layer's id in contracts.ts FRONTEND_DERIVED_LAYERS. */
  layerId: string;
  /** Point colour mode activated while this layer is on. */
  colorMode: ColorMode;
  /** Short human label for the legend header. */
  legendTitle: string;
  legend: ThematicLegend;
  /** Where the underlying data comes from, stated scientifically. */
  provenance: string;
  /** Attribution rendered with the map (HTML allowed, as for basemaps). */
  attribution: string;
  /** Caveats the interface must surface when the layer is active. */
  caveats: string[];
}

const elevationStops: ThematicLegendStop[] = ELEVATION_RAMP.map((s) => ({
  value: s.elevation,
  color: elevationCss(s.elevation) ?? '#000',
  label: `${s.elevation.toLocaleString('en-US')} m`,
}));

export const DEM_ELEVATION_LAYER: FrontendThematicLayer = {
  layerId: ELEVATION_LAYER_ID,
  colorMode: 'elevation',
  legendTitle: 'Elevation at shown position',
  legend: {
    kind: 'continuous',
    title: 'Elevation',
    unit: 'm a.s.l.',
    stops: elevationStops,
    note: 'Sampled client-side from AWS Open Data Terrain Tiles (terrarium DEM, ≈150 m/px at the sampling zoom) at each record’s shown position. For generalised records this is the elevation of the grid-cell centre shown on the map, not of the withheld collection site. Values below the finest source resolution carry the source’s vertical uncertainty.',
  },
  provenance:
    'AWS Open Data Terrain Tiles (Mapzen/Joerd terrarium encoding), aggregated from public DEMs (SRTM, GMTED, ETOPO1 and national sources). Sampled in the browser at the shown, locality-safe record position.',
  attribution: TERRAIN_SOURCE.attribution,
  caveats: [
    'Elevation describes the shown position; for protected or unresolved records that position is a grid-cell centre by design.',
    'DEM vertical accuracy varies by source region; treat values as context, not surveyed heights.',
  ],
};

const registry: ReadonlyMap<string, FrontendThematicLayer> = new Map([
  [DEM_ELEVATION_LAYER.layerId, DEM_ELEVATION_LAYER],
]);

export function thematicLayerFor(layerId: string): FrontendThematicLayer | undefined {
  return registry.get(layerId);
}

export const FRONTEND_THEMATIC_LAYERS: readonly FrontendThematicLayer[] = [...registry.values()];
