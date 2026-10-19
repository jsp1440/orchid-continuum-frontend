import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ATLAS_OCCURRENCES_PROBE_URL, ATLAS_OCCURRENCES_URL as CONFIG_URL } from './backendConfig';
import { ATLAS_OCCURRENCES_URL, fetchAtlasOccurrences, fetchGenusOccurrences } from './ocBackend';

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
