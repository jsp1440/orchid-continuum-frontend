/**
 * Atlas occurrence loader: the backend's generalised public route, loaded
 * progressively.
 *
 * #973 review: a successful first page followed by a page that exhausts its
 * retries must be reported as an INCOMPLETE load, not as complete and not as a
 * total failure. Part 2 (2026-11-24): the first page paints at once, later
 * pages are fetched at most ATLAS_PAGE_CONCURRENCY at a time, and progress
 * reports an honest total. Every coordinate here is SYNTHETIC.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const plan = vi.hoisted(() => ({
  total: 2500,
  failFrom: Number.POSITIVE_INFINITY,
  calls: [] as string[],
  inFlight: 0,
  maxInFlight: 0,
  supabaseTables: [] as string[],
}));

vi.mock('./supabase', () => {
  const builder = (table: string) => {
    plan.supabaseTables.push(table);
    const query = {
      select: () => query,
      order: () => query,
      not: () => query,
      limit: () => query,
      range: () => query,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return query;
  };
  return { supabase: { from: (table: string) => builder(table) } };
});

import { ATLAS_PUBLIC_OCCURRENCES_URL } from './backendConfig';
import {
  ATLAS_PAGE_CONCURRENCY,
  ATLAS_PAGE_SIZE,
  didAtlasLoadFail,
  didAtlasLoadIncomplete,
  fetchAtlasOccurrencePoints,
  fetchAtlasOccurrencePointsProgressive,
  resetOrchidContinuumCaches,
  type AtlasLoadProgress,
} from './orchidContinuum';

function item(i: number) {
  return {
    id: `occ-${i}`,
    scientific_name: 'Cattleya fixture',
    genus: 'Cattleya',
    species: 'fixture',
    country: 'Testland',
    region: 'North',
    year: 2001,
    source_dataset: 'GBIF',
    source_record_id: `src-${i}`,
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
      notice: 'Location generalised to about 11 km because the Continuum could not resolve a conservation assessment for this name.',
    },
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  resetOrchidContinuumCaches();
  plan.total = 2500;
  plan.failFrom = Number.POSITIVE_INFINITY;
  plan.calls = [];
  plan.inFlight = 0;
  plan.maxInFlight = 0;
  plan.supabaseTables = [];
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/curated-occurrences')) return json({ total: 0, items: [] });
      plan.calls.push(url.search);
      const offset = Number(url.searchParams.get('offset'));
      const limit = Number(url.searchParams.get('limit'));
      plan.inFlight += 1;
      plan.maxInFlight = Math.max(plan.maxInFlight, plan.inFlight);
      await new Promise((r) => setTimeout(r, 5));
      plan.inFlight -= 1;
      if (offset >= plan.failFrom) return json({ detail: 'upstream' }, 502);
      const count = Math.max(0, Math.min(limit, plan.total - offset));
      const items = Array.from({ length: count }, (_, i) => item(offset + i));
      const next = offset + count < plan.total ? offset + count : null;
      return json({ total: plan.total, offset, limit, scanned: count, returned: count, next_offset: next, items });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('atlas loader', () => {
  it('reads the backend public route, never the raw Supabase table', async () => {
    const points = await fetchAtlasOccurrencePoints();
    expect(points).toHaveLength(2500);
    expect(plan.supabaseTables).not.toContain('atlas_occurrences');
    expect(plan.calls[0]).toBe(`?offset=0&limit=${ATLAS_PAGE_SIZE}`);
    expect(ATLAS_PUBLIC_OCCURRENCES_URL).toMatch(/\/atlas\/public\/occurrences$/);
    // Cell centres only; no locality text; the server's notice travels with the point.
    expect(points.every((p) => p.lat === 1.05 && p.lng === 2.05)).toBe(true);
    expect(points.every((p) => p.locality === undefined && p.coordinateUncertaintyM === undefined)).toBe(true);
    expect(points[0].publicCellDeg).toBe(0.1);
    expect(points[0].locationNotice).toMatch(/11 km/);
  }, 15_000);

  it('paints the first page before the rest arrive and reports honest progress', async () => {
    plan.total = 10_500;
    const updates: { count: number; progress: AtlasLoadProgress }[] = [];
    const points = await fetchAtlasOccurrencePointsProgressive((pts, progress) => {
      updates.push({ count: pts.length, progress });
    });
    expect(points).toHaveLength(10_500);
    expect(updates[0].count).toBe(ATLAS_PAGE_SIZE);
    expect(updates[0].progress).toEqual({ loaded: ATLAS_PAGE_SIZE, total: 10_500, done: false });
    expect(updates.at(-1)!.progress).toEqual({ loaded: 10_500, total: 10_500, done: true });
    // Counts only grow; no update claims more than it has.
    for (let i = 1; i < updates.length; i++) {
      expect(updates[i].count).toBeGreaterThanOrEqual(updates[i - 1].count);
      expect(updates[i].progress.loaded).toBeLessThanOrEqual(10_500);
    }
    // Remaining pages are fetched concurrently, but never more than the limit.
    expect(plan.calls).toHaveLength(11);
    expect(plan.maxInFlight).toBeGreaterThan(1);
    expect(plan.maxInFlight).toBeLessThanOrEqual(ATLAS_PAGE_CONCURRENCY);
  }, 15_000);

  it('flags a load that stopped after a later page failed as incomplete', async () => {
    plan.failFrom = 1000;
    const points = await fetchAtlasOccurrencePoints();
    expect(points.length).toBe(1000);
    expect(didAtlasLoadIncomplete()).toBe(true);
    expect(didAtlasLoadFail()).toBe(false);
    // page 1, then pages 2 and 3 with their retries (3 attempts each)
    expect(plan.calls.length).toBe(1 + 3 + 3);
  }, 15_000);

  it('a total failure is a failure, not merely incomplete', async () => {
    plan.failFrom = 0;
    const points = await fetchAtlasOccurrencePoints();
    expect(points).toEqual([]);
    expect(didAtlasLoadFail()).toBe(true);
    expect(didAtlasLoadIncomplete()).toBe(false);
  }, 15_000);

  it('reset clears the incomplete flag', async () => {
    plan.failFrom = 1000;
    await fetchAtlasOccurrencePoints();
    resetOrchidContinuumCaches();
    expect(didAtlasLoadIncomplete()).toBe(false);
  }, 15_000);
});
