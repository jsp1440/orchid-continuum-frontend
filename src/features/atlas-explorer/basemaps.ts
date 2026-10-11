/**
 * Atlas Explorer — basemaps and terrain.
 *
 * Only open, no-key, no-cost sources are used, each with its attribution. Any
 * of them can be replaced by deployment configuration without a code change.
 * No paid mapping service, token, or Google Earth dependency is introduced.
 *
 * - Vector cartography: OpenFreeMap (OpenMapTiles schema, OSM data).
 * - Imagery: EOX Sentinel-2 cloudless 2016 (CC BY 4.0).
 * - Terrain: AWS Open Data Terrain Tiles, terrarium encoding.
 */

import type { StyleSpecification } from 'maplibre-gl';

const env = import.meta.env as Record<string, string | undefined>;

export type BasemapId = 'scientific' | 'streets' | 'imagery';

export interface BasemapDefinition {
  id: BasemapId;
  label: string;
  description: string;
  style: string | StyleSpecification;
}

const GLYPHS = env.VITE_ATLAS_GLYPHS_URL || 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const LABEL_FONT = ['Noto Sans Regular'];

export const TERRAIN_SOURCE = {
  type: 'raster-dem' as const,
  tiles: [
    env.VITE_ATLAS_TERRAIN_TILES ||
      'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  ],
  encoding: 'terrarium' as const,
  tileSize: 256,
  maxzoom: 14,
  attribution:
    '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">Terrain: Mapzen, AWS Open Data</a>',
};

function imageryStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      imagery: {
        type: 'raster',
        tiles: [
          env.VITE_ATLAS_IMAGERY_TILES ||
            'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg',
        ],
        tileSize: 256,
        maxzoom: 15,
        attribution:
          '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless 2016 by EOX</a> (contains modified Copernicus Sentinel data 2016, CC BY 4.0)',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#0b1220' } },
      { id: 'imagery', type: 'raster', source: 'imagery' },
    ],
  };
}

export const BASEMAPS: BasemapDefinition[] = [
  {
    id: 'scientific',
    label: 'Scientific',
    description: 'Muted cartography that keeps occurrence data legible.',
    style: env.VITE_ATLAS_STYLE_SCIENTIFIC || 'https://tiles.openfreemap.org/styles/positron',
  },
  {
    id: 'streets',
    label: 'Topographic',
    description: 'Roads, places, water and land cover.',
    style: env.VITE_ATLAS_STYLE_STREETS || 'https://tiles.openfreemap.org/styles/liberty',
  },
  {
    id: 'imagery',
    label: 'Satellite',
    description: 'Sentinel-2 cloudless mosaic.',
    style: imageryStyle(),
  },
];

export function basemapById(id: string | null | undefined): BasemapDefinition {
  return BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0];
}

/**
 * Used when no basemap can be fetched at all (offline, blocked tile hosts, or
 * a tile service outage). Natural Earth country outlines ship with the app
 * (world-atlas, public domain) and are loaded only when this fallback is
 * needed, so the data layers always have geographic context.
 */
export async function offlineStyle(): Promise<StyleSpecification> {
  const [{ feature }, topology] = await Promise.all([
    import('topojson-client'),
    import('world-atlas/countries-50m.json').then((m) => m.default),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const countries = feature(topology as any, (topology as any).objects.countries) as unknown as GeoJSON.FeatureCollection;
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      countries: {
        type: 'geojson',
        data: countries,
        attribution: 'Country outlines: Natural Earth (public domain) via world-atlas',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#cfe3ea' } },
      { id: 'land', type: 'fill', source: 'countries', paint: { 'fill-color': '#f4f1ea' } },
      { id: 'borders', type: 'line', source: 'countries', paint: { 'line-color': '#b8b2a7', 'line-width': 0.6 } },
    ],
  };
}
