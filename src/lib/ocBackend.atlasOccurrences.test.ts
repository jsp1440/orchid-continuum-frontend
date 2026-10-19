import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ATLAS_OCCURRENCES_PROBE_URL, ATLAS_OCCURRENCES_URL as CONFIG_URL } from './backendConfig';
import { atlasLayerToEducationalRows } from './appliedAiDataScience';
import { adaptOccurrenceResult, ATLAS_OCCURRENCES_PATH } from './atlas';
import { hasThreatAssessment, redactLocality } from './atlasLocalitySafety';
import {
  ATLAS_OCCURRENCES_URL,
  fetchAtlasOccurrences,
  fetchGenusOccurrences,
  occurrencePayloadToAtlasLayer,
} from './ocBackend';

/**
 * #931: the Atlas data calls used `/atlas/occurrences`, which 404s on the public
 * API, while the health probe checked `/api/atlas/occurrences`, which works — so
 * the probe stayed green while every map drew zero records.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Atlas occurrences route (#931)', () => {
  it('every Atlas data constant uses the /api route the probe checks', () => {
    expect(ATLAS_OCCURRENCES_URL.endsWith('/api/atlas/occurrences')).toBe(true);
    expect(CONFIG_URL.endsWith('/api/atlas/occurrences')).toBe(true);
    expect(ATLAS_OCCURRENCES_PROBE_URL).toBe(`${CONFIG_URL}?limit=1`);
  });

  it('no source file builds the bare /atlas/occurrences path again', () => {
    const root = resolve(process.cwd(), 'src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) {
          readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
            // a URL template or string ending in /atlas/occurrences without the /api prefix
            const code = line.trim();
            if (code.startsWith('*') || code.startsWith('//') || code.startsWith('/*')) return;
            if (/[}'"`]\/atlas\/occurrences/.test(line)) offenders.push(`${path}:${i + 1}`);
          });
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });

  it('the map fetch calls the /api route and returns its rows', async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      jsonResponse({ results: [{ id: 1, decimal_latitude: 10.01, decimal_longitude: -75.01, scientific_name: 'Phragmipedium kovachii', iucn_code: 'LC' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const points = await fetchGenusOccurrences('Phragmipedium', 5);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${ATLAS_OCCURRENCES_URL}?genus=Phragmipedium&limit=5`);
    expect(points).toHaveLength(1);
    expect(points[0].species).toBe('Phragmipedium kovachii');
  });

  it('a 404 still yields an empty list rather than an error or invented points', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: 'Not Found' }, 404)));
    await expect(fetchAtlasOccurrences(5)).resolves.toEqual([]);
  });
});

describe('Atlas occurrences locality projection (#931 acceptance: locality safeguards)', () => {
  async function pointFor(row: Record<string, unknown>) {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([{ id: 1, decimal_latitude: 12.3456, decimal_longitude: -77.6543, ...row }])));
    const [point] = await fetchAtlasOccurrences(1);
    return point;
  }

  it('a point with no conservation assessment is generalised to the precaution cell', async () => {
    const p = await pointFor({});
    expect(p.lat).toBeCloseTo(12.325, 6);
    expect(p.lng).toBeCloseTo(-77.675, 6);
  });

  it('a threatened taxon is generalised to its tier cell', async () => {
    const p = await pointFor({ iucn_code: 'EN' });
    expect(p.lat).toBeCloseTo(12.25, 6);
    expect(p.lng).toBeCloseTo(-77.75, 6);
  });

  it('stated coordinate uncertainty widens the cell', async () => {
    const p = await pointFor({ iucn_code: 'LC', coordinate_uncertainty_in_meters: 20000 });
    expect(p.lat).toBeCloseTo(12.375, 6);
  });

  it('an assessed, non-threatened point with no stated uncertainty keeps its coordinates', async () => {
    const p = await pointFor({ conservation_status: 'Least Concern' });
    expect([p.lat, p.lng]).toEqual([12.3456, -77.6543]);
  });
});

describe('checker round 10 (#931)', () => {
  async function pointFor(row: Record<string, unknown>) {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([{ id: 1, decimal_latitude: 12.3456, decimal_longitude: -77.6543, ...row }])));
    const [point] = await fetchAtlasOccurrences(1);
    return point;
  }

  it.each([
    { iucn_code: 'NE' },
    { iucn_code: 'DD' },
    { conservation_status: 'Not Evaluated' },
    { conservation_status: 'Data Deficient' },
    { conservation_status: 'unknown' },
    { properties: { conservation_status: 'Data Deficient' } },
  ])('F3: a non-assessment value %o is unresolved, not precise', async (row) => {
    const p = await pointFor(row);
    expect(p.lat).toBeCloseTo(12.325, 6);
    expect(p.lng).toBeCloseTo(-77.675, 6);
  });

  it('F3: the shared rule', () => {
    expect(hasThreatAssessment(undefined, undefined)).toBe(false);
    expect(hasThreatAssessment('NE', 'Data Deficient')).toBe(false);
    expect(hasThreatAssessment('LC', undefined)).toBe(true);
    expect(hasThreatAssessment(undefined, 'Endangered')).toBe(true);
    expect(hasThreatAssessment('DD', 'Vulnerable')).toBe(true);
  });

  it('F4: GeoJSON features are read and projected', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      type: 'FeatureCollection',
      features: [{ id: 'f1', geometry: { type: 'Point', coordinates: [-77.6543, 12.3456] }, properties: { scientific_name: 'Masdevallia veitchiana' } }],
    })));
    const [p] = await fetchAtlasOccurrences(1);
    expect(p.species).toBe('Masdevallia veitchiana');
    expect(p.lat).toBeCloseTo(12.325, 6);
  });

  it.each([
    ['an array', [{ id: 7, decimal_latitude: 12.3456, decimal_longitude: -77.6543, scientific_name: 'Phragmipedium kovachii', locality: 'secret valley', country: 'PE' }]],
    ['{total, items}', { total: 1, items: [{ id: 7, latitude: 12.3456, longitude: -77.6543, scientific_name: 'Phragmipedium kovachii', locality: 'secret valley', country: 'PE' }] }],
    ['a FeatureCollection', { features: [{ id: 7, geometry: { coordinates: [-77.6543, 12.3456] }, properties: { scientific_name: 'Phragmipedium kovachii', locality: 'secret valley', country: 'PE' } }] }],
  ])('F2: %s becomes a locality-safe AtlasLayer the lab can read', (_label, payload) => {
    const layer = occurrencePayloadToAtlasLayer(payload);
    expect(layer?.features).toHaveLength(1);
    const [f] = layer!.features;
    expect(f.lat).toBeCloseTo(12.325, 6);
    expect(JSON.stringify(f.properties)).not.toMatch(/secret valley|12\.3456|77\.6543|latitude|longitude|geometry|locality/);
    const rows = atlasLayerToEducationalRows(layer!, 10);
    expect(rows[0].scientific_name).toBe('Phragmipedium kovachii');
    expect(rows[0].country_code).toBe('PE');
  });

  it('F2: an unrecognised payload is not a layer', () => {
    expect(occurrencePayloadToAtlasLayer({ detail: 'oops' })).toBeNull();
    expect(occurrencePayloadToAtlasLayer('text')).toBeNull();
  });

  it('F2: the lab adapter turns an unknown payload into an error and rows into a layer', () => {
    const bad = adaptOccurrenceResult({ data: { detail: 'oops' }, error: null, unconfigured: false });
    expect(bad.data).toBeNull();
    expect(bad.error?.message).toMatch(/unrecognised/);
    const good = adaptOccurrenceResult({
      data: [{ id: 1, lat: 1.01, lng: 2.02, scientific_name: 'Vanilla planifolia' }], error: null, unconfigured: false,
    });
    expect(good.error).toBeNull();
    expect(good.data?.features[0].properties?.scientific_name).toBe('Vanilla planifolia');
    const unconfigured = adaptOccurrenceResult({ data: null, error: null, unconfigured: true });
    expect(unconfigured).toEqual({ data: null, error: null, unconfigured: true });
  });

  it('F2: atlasApi.occurrences passes a path, not an absolute URL, to apiRequest', () => {
    expect(ATLAS_OCCURRENCES_PATH).toBe('/api/atlas/occurrences');
    const source = readFileSync(resolve(process.cwd(), 'src/lib/atlas.ts'), 'utf8');
    expect(source).toMatch(/apiRequest<unknown>\(ATLAS_OCCURRENCES_PATH,/);
    expect(source).not.toMatch(/apiRequest[^(]*\(ATLAS_OCCURRENCES_URL/);
  });

  it('F1: diagnostics samples withhold coordinates and place text, keep the rest', () => {
    const sample = redactLocality({
      count: 2,
      results: [{ id: 1, decimal_latitude: 12.3456, decimal_longitude: -77.6543, locality: 'secret valley',
        geometry: { coordinates: [-77.6543, 12.3456] }, scientific_name: 'Masdevallia veitchiana' }],
    });
    const text = JSON.stringify(sample);
    expect(text).not.toMatch(/12\.3456|77\.6543|secret valley/);
    expect(text).toContain('Masdevallia veitchiana');
    expect(text).toContain('"count":2');
  });

  it('F1: the diagnostics page redacts every printed sample', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/pages/DailyGenusDiagnostics.tsx'), 'utf8');
    expect(page).toMatch(/function samplePayload\(payload: unknown\): unknown \{\s*\/\/[^\n]*\n\s*return redactLocality\(/);
  });
});
