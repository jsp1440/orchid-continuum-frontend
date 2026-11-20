/**
 * #973 review: a successful first atlas page followed by a page that exhausts
 * its retries must be reported as an INCOMPLETE load, not as complete and not
 * as a total failure.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const plan = vi.hoisted(() => ({ failFrom: 1000, atlasCalls: 0 }));

vi.mock('./supabase', () => {
  const builder = (table: string) => {
    let rangeFrom = 0;
    const query = {
      select: () => query,
      order: () => query,
      not: () => query,
      limit: () => query,
      range: (from: number) => {
        rangeFrom = from;
        return query;
      },
      then: (resolve: (value: unknown) => unknown) => {
        if (table === 'atlas_occurrences') {
          plan.atlasCalls += 1;
          if (rangeFrom >= plan.failFrom) {
            return Promise.resolve({ data: null, error: { message: 'upstream 502' } }).then(resolve);
          }
          const rows = Array.from({ length: 1000 }, (_, i) => ({
            id: rangeFrom + i,
            scientific_name: 'Cattleya fixture',
            genus: 'Cattleya',
            lat: 1,
            lng: 2,
          }));
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve);
      },
    };
    return query;
  };
  return { supabase: { from: (table: string) => builder(table) } };
});

import {
  didAtlasLoadFail,
  didAtlasLoadIncomplete,
  fetchAtlasOccurrencePoints,
  resetOrchidContinuumCaches,
} from './orchidContinuum';

describe('atlas loader completeness', () => {
  beforeEach(() => {
    resetOrchidContinuumCaches();
    plan.atlasCalls = 0;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('flags a load that stopped after a later page failed as incomplete', async () => {
    plan.failFrom = 1000;
    const points = await fetchAtlasOccurrencePoints();
    expect(points.length).toBe(1000);
    expect(didAtlasLoadIncomplete()).toBe(true);
    expect(didAtlasLoadFail()).toBe(false);
    expect(plan.atlasCalls).toBe(1 + 3); // page 1, then page 2 with its retries
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
