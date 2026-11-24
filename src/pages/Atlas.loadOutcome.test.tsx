// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AtlasFilterProvider } from '@/contexts/AtlasFilterContext';
import Atlas from './Atlas';

vi.mock('@/components/orchid/Navbar', () => ({ default: () => null }));
vi.mock('@/components/orchid/Footer', () => ({ default: () => null }));
vi.mock('@/components/atlas/LiveAtlasMap', () => ({
  default: ({ points }: { points: unknown[] }) => <div role="application">{points.length} map records</div>,
}));
vi.mock('@/components/atlas/AtlasDebugPanel', () => ({ default: () => null }));
vi.mock('@/components/atlas/GrandTour', () => ({ default: () => null }));

const data = vi.hoisted(() => ({
  points: [] as unknown[],
  failed: false,
  incomplete: false,
  resets: 0,
}));
const point = (i: number) => ({
  id: String(i), canonicalName: `Masdevallia fixture${i}`, genus: 'Masdevallia', species: `fixture${i}`,
  lat: 1, lng: 2, country: 'Peru', countries: [], pollinators: [], dataset: 'Fixture', verified: false,
  assessmentResolved: false,
});
vi.mock('@/lib/orchidContinuum', async (original) => ({
  ...(await original<typeof import('@/lib/orchidContinuum')>()),
  fetchAtlasOccurrencePointsProgressive: async (
    onUpdate?: (points: unknown[], progress: { loaded: number; total: number | null; done: boolean }) => void,
  ) => {
    onUpdate?.(data.points, { loaded: data.points.length, total: data.points.length, done: true });
    return data.points;
  },
  fetchAtlasFacets: async () => ({
    genera: ['Masdevallia'], tribes: [], countries: ['Peru'], growthForms: [], habitats: [], iucnCodes: [],
    pollinatorTaxa: [], datasets: [], totals: {},
  }),
  didAtlasLoadFail: () => data.failed,
  didAtlasLoadIncomplete: () => data.incomplete,
  resetOrchidContinuumCaches: () => { data.resets += 1; },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;

beforeEach(() => {
  data.points = [];
  data.failed = false;
  data.incomplete = false;
  data.resets = 0;
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

async function renderAtlas() {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <MemoryRouter initialEntries={['/atlas']}><AtlasFilterProvider><Atlas /></AtlasFilterProvider></MemoryRouter>,
  ));
  return host;
}

it('says the occurrence service failed instead of showing an unexplained empty map', async () => {
  data.failed = true;
  const host = await renderAtlas();
  const alert = host.querySelector('[data-testid="atlas-load-outcome"]');
  expect(alert?.textContent).toContain('could not be loaded');
  expect(alert?.textContent).toContain('not evidence that no orchids were recorded');
  expect(host.textContent).toContain('0 map records');
});

it('retry clears the cached failure and reloads; a recovered load removes the alert', async () => {
  data.failed = true;
  const host = await renderAtlas();
  data.failed = false;
  data.points = Array.from({ length: 3 }, (_, i) => point(i));
  const retry = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Retry')!;
  await act(async () => retry.click());
  expect(data.resets).toBe(1);
  expect(host.querySelector('[data-testid="atlas-load-outcome"]')).toBeNull();
  expect(host.textContent).toContain('3 map records');
});

it('marks a partial load as incomplete rather than complete', async () => {
  data.failed = true;
  data.points = [point(1)];
  const host = await renderAtlas();
  expect(host.querySelector('[data-testid="atlas-load-outcome"]')?.textContent).toContain('map below is incomplete');
});

it('shows no alert for a complete load', async () => {
  data.points = [point(1), point(2)];
  const host = await renderAtlas();
  expect(host.querySelector('[data-testid="atlas-load-outcome"]')).toBeNull();
  expect(host.textContent).toContain('2 map records');
});

it('marks a load that stopped after a later page failed as incomplete (#973 review)', async () => {
  data.incomplete = true;
  data.points = [point(1), point(2)];
  const host = await renderAtlas();
  const alert = host.querySelector('[data-testid="atlas-load-outcome"]');
  expect(alert?.textContent).toContain('map below is incomplete');
  expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'Retry')).toBe(true);
});
