/**
 * Relationship reads: a failed `species` / `species_mycorrhizal` read must stay
 * distinguishable from a read that succeeded with no rows, and a failed
 * mycorrhizal read must not be cached as an empty success.
 *
 * Every row here is SYNTHETIC ("fixture" names); no real taxon, partner or
 * count is asserted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown[] | null; error: { message: string } | null };

const plan = vi.hoisted(() => ({
  species: { data: [], error: null } as Result,
  myco: { data: [], error: null } as Result,
  speciesThrows: false,
  mycoThrows: false,
  queries: [] as string[],
}));

vi.mock('./supabase', () => {
  const builder = (table: string) => {
    plan.queries.push(table);
    const result = (): Result =>
      table === 'species' ? plan.species : table === 'species_mycorrhizal' ? plan.myco : { data: [], error: null };
    const throws = () => (table === 'species' && plan.speciesThrows) || (table === 'species_mycorrhizal' && plan.mycoThrows);
    const query = {
      select: () => query,
      order: () => query,
      not: () => query,
      limit: () => query,
      range: () => query,
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        (throws() ? Promise.reject(new Error('synthetic transport failure')) : Promise.resolve(result())).then(
          resolve,
          reject,
        ),
    };
    return query;
  };
  return { supabase: { from: (table: string) => builder(table) } };
});

import {
  didRelationshipReadFail,
  fetchMycorrhiza,
  fetchMycorrhizalAggregates,
  fetchPollinator,
  fetchPollinatorAggregates,
  resetOrchidContinuumCaches,
} from './orchidContinuum';

const speciesRow = {
  id: 'sp-fixture-1',
  slug: 'fixturea-exempli',
  genus: 'Fixturea',
  epithet: 'exempli',
  pollinators: [{ taxon: 'Fixture pollinator', name: 'Fixture pollinator' }],
};
const mycoRow = {
  id: 'myco-fixture-1',
  species_id: 'sp-fixture-1',
  scientific_name: 'Fixturea exempli',
  fungal_taxon: 'Fixture fungus',
  fungal_family: null,
  association_type: null,
  note: null,
  source: null,
};

const ok = (data: unknown[]): Result => ({ data, error: null });
const failed = (): Result => ({ data: null, error: { message: 'synthetic upstream error' } });
const count = (table: string) => plan.queries.filter((t) => t === table).length;

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  resetOrchidContinuumCaches();
  plan.species = ok([]);
  plan.myco = ok([]);
  plan.speciesThrows = false;
  plan.mycoThrows = false;
  plan.queries = [];
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // The atlas and curated-occurrence loaders read backend URLs; answer both
  // with an empty, complete page so only the relationship reads vary.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ total: 0, offset: 0, limit: 0, scanned: 0, returned: 0, next_offset: null, items: [] })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('mycorrhizal relationship read', () => {
  it('a successful read with no rows is an empty result, not a failure', async () => {
    plan.species = ok([speciesRow]);
    expect(await fetchMycorrhizalAggregates()).toEqual([]);
    expect(didRelationshipReadFail('mycorrhiza')).toBe(false);
  });

  it('a read that returns an error yields no rows and is flagged as failed', async () => {
    plan.species = ok([speciesRow]);
    plan.myco = failed();
    expect(await fetchMycorrhizalAggregates()).toEqual([]);
    expect(didRelationshipReadFail('mycorrhiza')).toBe(true);
    // The species read succeeded, so the pollinator side is not implicated.
    expect(didRelationshipReadFail('pollinators')).toBe(false);
  });

  it('a read that throws is flagged as failed', async () => {
    plan.species = ok([speciesRow]);
    plan.mycoThrows = true;
    expect(await fetchMycorrhizalAggregates()).toEqual([]);
    expect(didRelationshipReadFail('mycorrhiza')).toBe(true);
  });

  it('does not cache a failure: the next call retries and a recovered read clears the flag', async () => {
    plan.species = ok([speciesRow]);
    plan.myco = failed();
    await fetchMycorrhizalAggregates();
    expect(count('species_mycorrhizal')).toBe(1);

    plan.myco = ok([mycoRow]);
    const rows = await fetchMycorrhizalAggregates();
    expect(count('species_mycorrhizal')).toBe(2);
    expect(rows).toHaveLength(1);
    expect(rows[0].taxon).toBe('Fixture fungus');
    expect(rows[0].species.map((s) => s.id)).toEqual(['sp-fixture-1']);
    expect(didRelationshipReadFail('mycorrhiza')).toBe(false);
    expect((await fetchMycorrhiza('fixture-fungus'))?.taxon).toBe('Fixture fungus');
  });

  it('still caches a successful read', async () => {
    plan.species = ok([speciesRow]);
    plan.myco = ok([mycoRow]);
    await fetchMycorrhizalAggregates();
    await fetchMycorrhizalAggregates();
    expect(count('species_mycorrhizal')).toBe(1);
  });

  it('a failed species read also marks the mycorrhizal join as unchecked', async () => {
    plan.species = failed();
    plan.myco = ok([mycoRow]);
    // The association row cannot be joined to a species that was never read.
    expect(await fetchMycorrhizalAggregates()).toEqual([]);
    expect(didRelationshipReadFail('mycorrhiza')).toBe(true);
  });
});

describe('pollinator relationship read', () => {
  it('a successful read with no pollinator rows is not a failure', async () => {
    expect(await fetchPollinatorAggregates()).toEqual([]);
    expect(didRelationshipReadFail('pollinators')).toBe(false);
  });

  it('a successful read yields the linked pollinator and no failure flag', async () => {
    plan.species = ok([speciesRow]);
    const all = await fetchPollinatorAggregates();
    expect(all.map((p) => p.taxon)).toEqual(['Fixture pollinator']);
    expect(didRelationshipReadFail('pollinators')).toBe(false);
  });

  it('a species read error yields no relationships and is flagged as failed', async () => {
    plan.species = failed();
    expect(await fetchPollinatorAggregates()).toEqual([]);
    expect(await fetchPollinator('fixture-pollinator')).toBeNull();
    expect(didRelationshipReadFail('pollinators')).toBe(true);
  });

  it('a species read that throws is flagged as failed', async () => {
    plan.speciesThrows = true;
    expect(await fetchPollinatorAggregates()).toEqual([]);
    expect(didRelationshipReadFail('pollinators')).toBe(true);
  });
});

describe('resetOrchidContinuumCaches', () => {
  it('clears both relationship failure flags', async () => {
    plan.species = failed();
    plan.myco = failed();
    await fetchMycorrhizalAggregates();
    expect(didRelationshipReadFail('pollinators')).toBe(true);
    expect(didRelationshipReadFail('mycorrhiza')).toBe(true);

    resetOrchidContinuumCaches();
    expect(didRelationshipReadFail('pollinators')).toBe(false);
    expect(didRelationshipReadFail('mycorrhiza')).toBe(false);
  });

  it('a read superseded by a reset cannot set a flag afterwards', async () => {
    plan.species = failed();
    plan.myco = failed();
    const superseded = fetchMycorrhizalAggregates();
    resetOrchidContinuumCaches();
    await superseded;
    expect(didRelationshipReadFail('pollinators')).toBe(false);
    expect(didRelationshipReadFail('mycorrhiza')).toBe(false);
  });
});
