/**
 * Atlas Explorer — DEM elevation thematic layer (`dem-elevation`).
 *
 * Colour-codes occurrence points by the elevation of their SHOWN, locality-safe
 * position, sampled client-side from the same AWS Open Data Terrain Tiles
 * (terrarium encoding) that already power the Explorer's 3-D terrain. No new
 * service, key, or dependency is introduced; the tile URL template and its
 * attribution are reused from `basemaps.ts` and honour the
 * VITE_ATLAS_TERRAIN_TILES deployment override.
 *
 * Locality safety: sampling uses only `decimalLatitude`/`decimalLongitude` as
 * exposed by the occurrence provider, i.e. the already-generalised public
 * projection. For protected or unresolved-assessment records the sample
 * therefore describes the grid-cell centre, never the withheld collection
 * site. Elevation of the point as drawn is the honest semantic.
 *
 * Scientific basis: terrarium decoding follows the Mapzen/Joerd definition
 * (elevation_m = R*256 + G + B/256 − 32768). The hypsometric ramp and the
 * elevational band names (lowland / submontane / montane / upper montane /
 * alpine) follow standard orchid-habitat usage; bands are descriptive
 * context, not a modelled vegetation product.
 *
 * This module is deliberately DOM-free so it is unit-testable in Node: tile
 * pixels are obtained through an injectable `TileLoader`, with a browser
 * implementation (fetch + ImageBitmap + canvas) provided separately.
 */

import { TERRAIN_SOURCE } from './basemaps';

export const ELEVATION_LAYER_ID = 'dem-elevation';

/** Zoom at which tiles are sampled. z10 ≈ 150 m/px at the equator — a sane
 *  trade between tile volume and the horizontal uncertainty of generalised
 *  records (the finest grid cell is 0.05° ≈ 5 km). */
export const ELEVATION_SAMPLE_ZOOM = 10;

/** Terrarium tiles are 256×256 per TERRAIN_SOURCE.tileSize. */
export const TILE_SIZE = TERRAIN_SOURCE.tileSize;

/** Upper bound for the in-memory tile cache (≈ 64 × 256 KB decoded). */
export const MAX_CACHED_TILES = 64;

/** Web-mercator latitude limit used by the tile scheme. */
const MAX_MERCATOR_LAT = 85.05112878;

/** Mapzen/Joerd terrarium decoding: metres above sea level. */
export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

export interface RampStop {
  /** Elevation in metres. */
  elevation: number;
  rgb: readonly [number, number, number];
}

/**
 * Hypsometric tint ramp (lowland green → montane browns → alpine grey/white).
 * Terrestrial only: occurrences below 0 m are clamped to the first stop.
 */
export const ELEVATION_RAMP: readonly RampStop[] = [
  { elevation: 0, rgb: [86, 156, 86] },
  { elevation: 500, rgb: [152, 196, 110] },
  { elevation: 1000, rgb: [214, 214, 130] },
  { elevation: 1500, rgb: [224, 190, 120] },
  { elevation: 2000, rgb: [200, 152, 96] },
  { elevation: 2500, rgb: [168, 118, 84] },
  { elevation: 3000, rgb: [146, 104, 92] },
  { elevation: 4000, rgb: [186, 168, 164] },
  { elevation: 5000, rgb: [226, 226, 226] },
  { elevation: 6000, rgb: [255, 255, 255] },
] as const;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Interpolated hypsometric colour for an elevation; null when unknown. */
export function elevationColor(elevationM: number | null | undefined): [number, number, number] | null {
  if (elevationM == null || !Number.isFinite(elevationM)) return null;
  const ramp = ELEVATION_RAMP;
  if (elevationM <= ramp[0].elevation) return [...ramp[0].rgb] as [number, number, number];
  const top = ramp[ramp.length - 1];
  if (elevationM >= top.elevation) return [...top.rgb] as [number, number, number];
  let hi = 1;
  while (ramp[hi].elevation < elevationM) hi += 1;
  const lo = hi - 1;
  const t = (elevationM - ramp[lo].elevation) / (ramp[hi].elevation - ramp[lo].elevation);
  return [
    Math.round(lerp(ramp[lo].rgb[0], ramp[hi].rgb[0], t)),
    Math.round(lerp(ramp[lo].rgb[1], ramp[hi].rgb[1], t)),
    Math.round(lerp(ramp[lo].rgb[2], ramp[hi].rgb[2], t)),
  ];
}

export function elevationCss(elevationM: number | null | undefined): string | null {
  const c = elevationColor(elevationM);
  return c ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : null;
}

export type ElevationBandId = 'lowland' | 'submontane' | 'montane' | 'upper-montane' | 'alpine';

export interface ElevationBand {
  id: ElevationBandId;
  label: string;
  minM: number;
  /** Exclusive upper bound; Infinity for the top band. */
  maxM: number;
}

/** Descriptive elevational bands commonly used for orchid habitat context. */
export const ELEVATION_BANDS: readonly ElevationBand[] = [
  { id: 'lowland', label: 'Lowland', minM: -Infinity, maxM: 500 },
  { id: 'submontane', label: 'Submontane', minM: 500, maxM: 1000 },
  { id: 'montane', label: 'Montane', minM: 1000, maxM: 2000 },
  { id: 'upper-montane', label: 'Upper montane', minM: 2000, maxM: 3000 },
  { id: 'alpine', label: 'Alpine', minM: 3000, maxM: Infinity },
] as const;

export function elevationBand(elevationM: number | null | undefined): ElevationBand | null {
  if (elevationM == null || !Number.isFinite(elevationM)) return null;
  for (const band of ELEVATION_BANDS) {
    if (elevationM >= band.minM && elevationM < band.maxM) return band;
  }
  return null;
}

export interface TileAddress {
  z: number;
  x: number;
  y: number;
  /** Pixel column within the tile, 0..TILE_SIZE-1. */
  px: number;
  /** Pixel row within the tile, 0..TILE_SIZE-1. */
  py: number;
}

/** Web-mercator tile + intra-tile pixel for a position at integer zoom. */
export function tileForPosition(lat: number, lng: number, z: number): TileAddress {
  const clampedLat = Math.min(MAX_MERCATOR_LAT, Math.max(-MAX_MERCATOR_LAT, lat));
  const n = 2 ** z;
  const xFloat = ((lng + 180) / 360) * n;
  const latRad = (clampedLat * Math.PI) / 180;
  const yFloat = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const x = Math.min(n - 1, Math.max(0, Math.floor(xFloat)));
  const y = Math.min(n - 1, Math.max(0, Math.floor(yFloat)));
  return {
    z,
    x,
    y,
    px: Math.min(TILE_SIZE - 1, Math.max(0, Math.floor((xFloat - x) * TILE_SIZE))),
    py: Math.min(TILE_SIZE - 1, Math.max(0, Math.floor((yFloat - y) * TILE_SIZE))),
  };
}

export function tileUrl(template: string, z: number, x: number, y: number): string {
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

/**
 * Decoded RGBA pixels of one terrarium tile (TILE_SIZE² × 4 bytes, row-major),
 * or null when the tile could not be loaded (network gap, ocean edge cases are
 * still valid PNGs — null means "no data", not "sea").
 */
export type TileLoader = (url: string, signal?: AbortSignal) => Promise<Uint8ClampedArray | null>;

export interface SampledPosition {
  lat: number;
  lng: number;
}

export interface ElevationSamplerOptions {
  /** Tile URL template containing {z}/{x}/{y}; defaults to the terrain source. */
  template?: string;
  loader: TileLoader;
  zoom?: number;
  maxCachedTiles?: number;
}

/**
 * Samples DEM elevations for shown occurrence positions.
 *
 * Tiles are fetched once per address (LRU-cached) and a batch call dedupes
 * positions sharing a tile, so a 2 000-point view at z10 typically costs a
 * few dozen tile requests — well inside the open service's fair use.
 */
export class ElevationSampler {
  private readonly template: string;
  private readonly loader: TileLoader;
  private readonly zoom: number;
  private readonly maxCachedTiles: number;
  private readonly cache = new Map<string, { data: Uint8ClampedArray | null; used: number }>();
  private readonly pending = new Map<string, Promise<Uint8ClampedArray | null>>();
  private tick = 0;

  constructor(options: ElevationSamplerOptions) {
    this.template = options.template ?? TERRAIN_SOURCE.tiles[0];
    this.loader = options.loader;
    this.zoom = Math.min(options.zoom ?? ELEVATION_SAMPLE_ZOOM, TERRAIN_SOURCE.maxzoom);
    this.maxCachedTiles = options.maxCachedTiles ?? MAX_CACHED_TILES;
  }

  private async tile(key: string, addr: TileAddress, signal?: AbortSignal): Promise<Uint8ClampedArray | null> {
    const hit = this.cache.get(key);
    if (hit !== undefined) {
      hit.used = ++this.tick;
      return hit.data;
    }
    let promise = this.pending.get(key);
    if (!promise) {
      promise = this.loader(tileUrl(this.template, addr.z, addr.x, addr.y), signal).catch(() => null);
      this.pending.set(key, promise);
      try {
        const data = await promise;
        this.remember(key, data);
        return data;
      } finally {
        this.pending.delete(key);
      }
    }
    return promise;
  }

  private remember(key: string, data: Uint8ClampedArray | null): void {
    this.cache.set(key, { data, used: ++this.tick });
    while (this.cache.size > this.maxCachedTiles) {
      let oldestKey: string | null = null;
      let oldest = Infinity;
      for (const [k, entry] of this.cache) {
        if (entry.used < oldest) {
          oldest = entry.used;
          oldestKey = k;
        }
      }
      if (oldestKey === null) break;
      this.cache.delete(oldestKey);
    }
  }

  /** Elevation in metres at the position's tile pixel, or null if unavailable. */
  async sample(lat: number, lng: number, signal?: AbortSignal): Promise<number | null> {
    const addr = tileForPosition(lat, lng, this.zoom);
    const data = await this.tile(`${addr.z}/${addr.x}/${addr.y}`, addr, signal);
    if (!data) return null;
    const i = (addr.py * TILE_SIZE + addr.px) * 4;
    const value = decodeTerrarium(data[i], data[i + 1], data[i + 2]);
    return Math.round(value * 10) / 10;
  }

  /** Batch sampling with per-tile dedupe; order matches the input. */
  async sampleMany(positions: readonly SampledPosition[], signal?: AbortSignal): Promise<(number | null)[]> {
    const byTile = new Map<string, { addr: TileAddress; indexes: number[] }>();
    positions.forEach((p, i) => {
      const addr = tileForPosition(p.lat, p.lng, this.zoom);
      const key = `${addr.z}/${addr.x}/${addr.y}`;
      const bucket = byTile.get(key);
      if (bucket) {
        bucket.indexes.push(i);
      } else {
        byTile.set(key, { addr, indexes: [i] });
      }
    });
    const out: (number | null)[] = new Array(positions.length).fill(null);
    await Promise.all(
      [...byTile.entries()].map(async ([key, { addr, indexes }]) => {
        const data = await this.tile(key, addr, signal);
        if (!data) return;
        for (const i of indexes) {
          const a = tileForPosition(positions[i].lat, positions[i].lng, this.zoom);
          const p = (a.py * TILE_SIZE + a.px) * 4;
          out[i] = Math.round(decodeTerrarium(data[p], data[p + 1], data[p + 2]) * 10) / 10;
        }
      }),
    );
    return out;
  }
}

/**
 * Browser tile loader: fetch the PNG, decode through an ImageBitmap onto a
 * canvas and read the RGBA pixels. Throws when no DOM/canvas is available so
 * the caller (ExplorerMap) can surface an "unavailable in this environment"
 * notice instead of silently drawing nothing.
 */
export function browserTileLoader(): TileLoader {
  return async (url, signal) => {
    if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
      throw new Error('Elevation sampling needs a browser canvas environment.');
    }
    const res = await fetch(url, { signal, mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, TILE_SIZE, TILE_SIZE);
      return ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
    } finally {
      bitmap.close();
    }
  };
}
