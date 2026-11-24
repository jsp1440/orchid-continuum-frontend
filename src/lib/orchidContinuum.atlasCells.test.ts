/**
 * Atlas overview data layer: the public cell summary, the per-genus record
 * load, and the page cap of the whole-table load. Every coordinate here is
 * SYNTHETIC (two decimals at most).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => {
  const query = {
    select: () => query,
    order: () => query,
    not: () => query,
    limit: () => query,
    range: () => query,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return { supabase: { from: () => query } };
});

import { ATLAS_PUBLIC_CELLS_URL } from './backendConfig';
import {
  ATLAS_MAX_PAGES,
  didAtlasLoadCapped,
  fetchAtlasCells,
  fetchAtlasGenusPoints,
  fetchAtlasOccurrencePoints,
  resetOrchidContinuumCaches,
} from './orchidContinuum';

function item(i: number, genus = 'Cattleya') {
  return {
    id: `occ-${i}`,
    scientific_name: `${genus} fixture`,
    genus,
    species: 'fixture',
    country: 'Testland',
    region: 'North',
    year: 2001,
    source_dataset: 'GBIF',
    source_record_id: null,
    verified: false,
    conservation_status: null,
    iucn_code: null,
    assessment_resolved: false,
    location: {
      cell_lat: 1.05,
      cell_lng: 2.05,
      cell_deg: 0.1,
      cell_km: 11,
      generalised: true,
      reason: 'unresolved-assessment',
      notice: 'Location generalised to about 11 km.',
    },
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let calls: URL[] = [];

beforeEach(() => {
  resetOrchidContinuumCaches();
  calls = [];
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchAtlasCells', () => {
  it('requests the cell route at the chosen resolution and keeps counts only', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      calls.push(url);
      return json({
        resolution_deg: 2,
        truncated: false,
        cells: [
          { cell_lat: 13, cell_lng: -45, cell_deg: 2, cell_km: 222, count: 12, taxa: 4, name: 'leak' },
          { cell_lat: 1, cell_lng: 3, cell_deg: 2, cell_km: 222, count: 3, taxa: 1 },
          { cell_lat: 1.05, cell_lng: 3.05, cell_deg: 0.05, cell_km: 6, count: 1, taxa: 1 }, // finer than the floor
          { cell_lat: 'x', cell_lng: 3, cell_deg: 2, count: 1, taxa: 1 },
        ],
      });
    }));
    const summary = await fetchAtlasCells({ resolution: 2, genus: 'Cattleya' });
    expect(calls).toHaveLength(1);
    expect(`${calls[0].origin}${calls[0].pathname}`).toBe(ATLAS_PUBLIC_CELLS_URL);
    expect(calls[0].searchParams.get('resolution')).toBe('2');
    expect(calls[0].searchParams.get('genus')).toBe('Cattleya');
    expect(summary).toEqual({
      cells: [
        { lat: 13, lng: -45, cellDeg: 2, cellKm: 222, count: 12, taxa: 4 },
        { lat: 1, lng: 3, cellDeg: 2, cellKm: 222, count: 3, taxa: 1 },
      ],
      recordCount: 15,
      truncated: false,
      resolution: 2,
    });
    // Cached per parameter set.
    await fetchAtlasCells({ resolution: 2, genus: 'Cattleya' });
    expect(calls).toHaveLength(1);
  });

  it('resolves to null when the route is unavailable, and asks again next time', async () => {
    const fetchMock = vi.fn(async () => json({ detail: 'Not Found' }, 404));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchAtlasCells({ resolution: 1 })).toBeNull();
    await Promise.resolve();
    expect(await fetchAtlasCells({ resolution: 1 })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('fetchAtlasGenusPoints', () => {
  it('loads every page of one genus through the server-side genus filter', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      calls.push(url);
      if (url.pathname.endsWith('/curated-occurrences')) return json({ items: [] });
      const offset = Number(url.searchParams.get('offset'));
      const next = offset < 2 ? offset + 1 : null;
      return json({ total: null, offset, scanned: 1, next_offset: next, items: [item(offset, 'Masdevallia')] });
    }));
    const load = await fetchAtlasGenusPoints('Masdevallia');
    const pages = calls.filter((u) => u.pathname.endsWith('/atlas/public/occurrences'));
    expect(pages.map((u) => u.searchParams.get('genus'))).toEqual(['Masdevallia', 'Masdevallia', 'Masdevallia']);
    expect(pages.map((u) => u.searchParams.get('offset'))).toEqual(['0', '1', '2']);
    expect(load).toMatchObject({ capped: false, failed: false, incomplete: false });
    expect(load.points.map((p) => p.id)).toEqual(['occ-0', 'occ-1', 'occ-2']);
    expect(load.points.every((p) => p.genus === 'Masdevallia' && p.locality === undefined)).toBe(true);
  });

  it('reports a genus that holds more than the page cap', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/curated-occurrences')) return json({ items: [] });
      const offset = Number(url.searchParams.get('offset'));
      return json({ total: null, offset, scanned: 1, next_offset: offset + 1, items: [item(offset)] });
    }));
    const load = await fetchAtlasGenusPoints('Cattleya');
    expect(load.capped).toBe(true);
    expect(load.points).toHaveLength(ATLAS_MAX_PAGES);
  });
});

describe('the whole-table load says when it stops at the page cap', () => {
  const stub = (total: number | null, records: number) =>
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/curated-occurrences')) return json({ items: [] });
      const offset = Number(url.searchParams.get('offset'));
      const count = offset < records ? 1 : 0;
      return json({
        total,
        offset,
        scanned: total === null ? count : 1000,
        next_offset: offset + 1 < records ? offset + 1 : null,
        items: count ? [item(offset)] : [],
      });
    }));

  it('keyset paging (no total) past the cap', async () => {
    stub(null, ATLAS_MAX_PAGES + 50);
    const points = await fetchAtlasOccurrencePoints();
    expect(points).toHaveLength(ATLAS_MAX_PAGES);
    expect(didAtlasLoadCapped()).toBe(true);
  });

  it('keyset paging that ends before the cap', async () => {
    stub(null, 5);
    const points = await fetchAtlasOccurrencePoints();
    expect(points).toHaveLength(5);
    expect(didAtlasLoadCapped()).toBe(false);
  });

  it('a counted total larger than the cap allows', async () => {
    stub(10_000_000, 10_000_000);
    await fetchAtlasOccurrencePoints();
    expect(didAtlasLoadCapped()).toBe(true);
  });
});
