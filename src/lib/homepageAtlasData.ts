import { ATLAS_OCCURRENCES_URL } from '@/lib/ocBackend';

export interface HomepageAtlasPoint {
  id: string;
  lat: number;
  lng: number;
  species: string;
  country: string | null;
  year: number | null;
  elevationM: number | null;
  habitat: string | null;
  biome: string | null;
}

export type HomepageAtlasLoadState =
  | { status: 'ok'; points: HomepageAtlasPoint[]; httpStatus: number }
  | { status: 'empty'; points: []; httpStatus: number }
  | { status: 'error'; points: []; httpStatus: number | null; message: string };

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function rowsFrom(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  for (const key of ['results', 'occurrences', 'features', 'data', 'items', 'records', 'rows', 'points']) {
    const value = record[key];
    if (Array.isArray(value)) return value.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }
  return [];
}

function normalizeRow(row: Record<string, unknown>, index: number): HomepageAtlasPoint | null {
  const properties = row.properties && typeof row.properties === 'object'
    ? row.properties as Record<string, unknown>
    : {};

  const lat = numberValue(row.decimal_latitude) ?? numberValue(row.decimalLatitude) ?? numberValue(row.latitude) ?? numberValue(row.lat) ?? numberValue(row.y)
    ?? numberValue(properties.decimal_latitude) ?? numberValue(properties.latitude) ?? numberValue(properties.lat);
  const lng = numberValue(row.decimal_longitude) ?? numberValue(row.decimalLongitude) ?? numberValue(row.longitude) ?? numberValue(row.lng) ?? numberValue(row.lon) ?? numberValue(row.x)
    ?? numberValue(properties.decimal_longitude) ?? numberValue(properties.longitude) ?? numberValue(properties.lng);

  if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) return null;

  const species = stringValue(row.species) ?? stringValue(row.canonical_name) ?? stringValue(row.scientific_name)
    ?? stringValue(properties.species) ?? stringValue(properties.canonical_name) ?? stringValue(properties.scientific_name)
    ?? 'Orchidaceae';

  return {
    id: String(row.id ?? row.taxonomy_id ?? properties.id ?? `atlas-${index}`),
    lat,
    lng,
    species,
    country: stringValue(row.country) ?? stringValue(properties.country),
    year: numberValue(row.year) ?? numberValue(row.event_year) ?? numberValue(properties.year),
    elevationM: numberValue(row.elevation_m) ?? numberValue(row.elevation) ?? numberValue(properties.elevation_m) ?? numberValue(properties.elevation),
    habitat: stringValue(row.habitat) ?? stringValue(properties.habitat),
    biome: stringValue(row.biome) ?? stringValue(properties.biome),
  };
}

/**
 * Homepage-only adapter for the canonical public Atlas endpoint established in
 * PR #161. Unlike the older convenience helper, this preserves the distinction
 * between a successful empty response and a transport/backend failure.
 */
export async function loadHomepageAtlasGenus(
  genus: string,
  signal?: AbortSignal,
  limit = 1200,
): Promise<HomepageAtlasLoadState> {
  const requested = genus.trim();
  if (!requested) return { status: 'empty', points: [], httpStatus: 200 };

  const url = `${ATLAS_OCCURRENCES_URL}?genus=${encodeURIComponent(requested)}&limit=${limit}`;
  try {
    const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) {
      return {
        status: 'error',
        points: [],
        httpStatus: response.status,
        message: `Atlas service returned HTTP ${response.status}.`,
      };
    }

    const payload = await response.json() as unknown;
    const points = rowsFrom(payload)
      .map(normalizeRow)
      .filter((point): point is HomepageAtlasPoint => point != null);

    if (points.length === 0) return { status: 'empty', points: [], httpStatus: response.status };
    return { status: 'ok', points, httpStatus: response.status };
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    return {
      status: 'error',
      points: [],
      httpStatus: null,
      message: 'Atlas occurrence service could not be reached.',
    };
  }
}
