// @vitest-environment jsdom
/**
 * /mycorrhizae/:taxa reads the relationship records twice in one effect: once
 * for the index and once for the profile. A failed `species_mycorrhizal` read
 * is retried by the next consumer, so the second read can succeed after the
 * first failed. The page must then describe the read that produced what it
 * shows: no "could not be checked" alert beside a rendered profile.
 *
 * This runs the real orchidContinuum loaders over a mocked Supabase client.
 * Every row is SYNTHETIC ("fixture" names); no real taxon or partner.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/components/orchid/Navbar', () => ({ default: () => null }));
vi.mock('@/components/orchid/Footer', () => ({ default: () => null }));

type Result = { data: unknown[] | null; error: { message: string } | null };

const plan = vi.hoisted(() => ({
  species: { data: [], error: null } as Result,
  /** One entry per `species_mycorrhizal` read, in order; the last one repeats. */
  myco: [] as Result[],
  mycoReads: 0,
}));

vi.mock('@/lib/supabase', () => {
  const builder = (table: string) => {
    let result: Result = { data: [], error: null };
    if (table === 'species') result = plan.species;
    if (table === 'species_mycorrhizal') {
      result = plan.myco[Math.min(plan.mycoReads, plan.myco.length - 1)];
      plan.mycoReads += 1;
    }
    const query = {
      select: () => query,
      order: () => query,
      not: () => query,
      limit: () => query,
      range: () => query,
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return query;
  };
  return { supabase: { from: (table: string) => builder(table) } };
});

import { resetOrchidContinuumCaches } from '@/lib/orchidContinuum';
import MycorrhizaProfile from './MycorrhizaProfile';

const speciesRow = { id: 'sp-fixture-1', slug: 'fixturea-exempli', genus: 'Fixturea', epithet: 'exempli' };
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

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;

beforeEach(() => {
  resetOrchidContinuumCaches();
  plan.species = ok([speciesRow]);
  plan.myco = [ok([])];
  plan.mycoReads = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // The curated-occurrence step of the species loader reads a backend URL;
  // answer it with an empty, complete page so only the relationship reads vary.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify({ total: 0, offset: 0, limit: 0, scanned: 0, returned: 0, next_offset: null, items: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ),
  );
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderAt(path: string) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/mycorrhizae" element={<MycorrhizaProfile />} />
        <Route path="/mycorrhizae/:taxa" element={<MycorrhizaProfile />} />
      </Routes>
    </MemoryRouter>,
  ));
  for (let i = 0; i < 20 && host.textContent?.includes('Loading mycorrhizal layer'); i += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  return host;
}
const outcome = (host: HTMLElement) => host.querySelector('[data-testid="relationship-read-outcome"]');

it('first read fails, retry in the same effect succeeds: profile is shown with no "could not be checked" alert', async () => {
  plan.myco = [failed(), ok([mycoRow])];
  const host = await renderAt('/mycorrhizae/fixture-fungus');
  expect(plan.mycoReads).toBe(2);
  expect(host.textContent).toContain('Fixture fungus');
  expect(host.textContent).toContain('Fixturea exempli');
  expect(outcome(host)).toBeNull();
  expect(host.textContent).not.toContain('could not be checked');
  expect(host.textContent).not.toContain('not evidence that no association exists');
  expect(host.textContent).not.toContain('Awaiting Orchid Continuum Record');
});

it('first read fails, retry succeeds with no rows: the honest "Awaiting" state, not the alert', async () => {
  plan.myco = [failed(), ok([])];
  const host = await renderAt('/mycorrhizae/fixture-fungus');
  expect(plan.mycoReads).toBe(2);
  expect(outcome(host)).toBeNull();
  expect(host.textContent).toContain('Awaiting Orchid Continuum Record');
});

it('both reads fail: the alert stays, with no profile and no "Awaiting" state', async () => {
  plan.myco = [failed()];
  const host = await renderAt('/mycorrhizae/fixture-fungus');
  expect(plan.mycoReads).toBe(2);
  expect(outcome(host)?.getAttribute('role')).toBe('alert');
  expect(outcome(host)?.textContent).toContain('Mycorrhizal relationship records could not be checked');
  expect(outcome(host)?.textContent).toContain('not evidence that no association exists');
  expect(host.textContent).not.toContain('Fixturea exempli');
  expect(host.textContent).not.toContain('Awaiting Orchid Continuum Record');
});

it('first read succeeds: one read serves the index and the profile, no alert', async () => {
  plan.myco = [ok([mycoRow])];
  const host = await renderAt('/mycorrhizae/fixture-fungus');
  expect(plan.mycoReads).toBe(1);
  expect(outcome(host)).toBeNull();
  expect(host.textContent).toContain('Fixturea exempli');
});
