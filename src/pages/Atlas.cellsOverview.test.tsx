// @vitest-environment jsdom
/**
 * The Atlas overview against the real data layer (fetch is stubbed): the world
 * view is one request to the cell summary, per-record points are fetched only
 * after a genus filter or a zoom past ATLAS_RECORDS_ZOOM, and hitting the page
 * cap is said out loud. Every coordinate here is SYNTHETIC.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AtlasFilterProvider } from '@/contexts/AtlasFilterContext';

vi.mock('@/components/orchid/Navbar', () => ({ default: () => null }));
vi.mock('@/components/orchid/Footer', () => ({ default: () => null }));
vi.mock('@/components/atlas/LiveAtlasMap', () => ({
  default: ({
    points,
    cells,
    onZoomChange,
  }: {
    points: unknown[];
    cells?: { count: number }[] | null;
    onZoomChange?: (zoom: number) => void;
  }) => (
    <div role="application">
      <span data-testid="map-mode">{cells ? `${cells.length} cells` : `${points.length} map records`}</span>
      <button type="button" onClick={() => onZoomChange?.(6)}>zoom in</button>
      <button type="button" onClick={() => onZoomChange?.(2)}>zoom out</button>
    </div>
  ),
}));
vi.mock('@/components/atlas/AtlasDebugPanel', () => ({ default: () => null }));
vi.mock('@/components/atlas/GrandTour', () => ({ default: () => null }));
vi.mock('@/components/atlas/AtlasTour', () => ({ default: () => null }));
vi.mock('@/lib/supabase', () => {
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

import Atlas from './Atlas';
import { ATLAS_MAX_PAGES, resetOrchidContinuumCaches } from '@/lib/orchidContinuum';

const plan = vi.hoisted(() => ({ calls: [] as URL[], records: 3, cellsStatus: 200 }));

function item(i: number, genus: string) {
  return {
    id: `occ-${i}`,
    scientific_name: `${genus} fixture${i}`,
    genus,
    species: `fixture${i}`,
    country: 'Peru',
    region: 'Cusco',
    year: 1999,
    source_dataset: 'GBIF',
    source_record_id: null,
    verified: true,
    conservation_status: null,
    iucn_code: null,
    assessment_resolved: false,
    location: {
      cell_lat: -13.45,
      cell_lng: -71.95,
      cell_deg: 0.1,
      cell_km: 11,
      generalised: true,
      reason: 'unresolved-assessment',
      notice: 'Location generalised to about 11 km because the Continuum could not resolve a conservation assessment for this name.',
    },
  };
}

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;

beforeEach(() => {
  resetOrchidContinuumCaches();
  plan.calls = [];
  plan.records = 3;
  plan.cellsStatus = 200;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    plan.calls.push(url);
    if (url.pathname.endsWith('/curated-occurrences')) return new Response(JSON.stringify({ items: [] }));
    if (url.pathname.endsWith('/atlas/public/cells')) {
      if (plan.cellsStatus !== 200) return new Response('{}', { status: plan.cellsStatus });
      return new Response(JSON.stringify({
        resolution_deg: Number(url.searchParams.get('resolution')),
        truncated: false,
        cells: [
          { cell_lat: -13, cell_lng: -71, cell_deg: 2, cell_km: 222, count: 1200, taxa: 40 },
          { cell_lat: 9, cell_lng: -83, cell_deg: 2, cell_km: 222, count: 34, taxa: 7 },
        ],
      }));
    }
    if (!url.pathname.endsWith('/atlas/public/occurrences')) throw new Error(`Unexpected network: ${url}`);
    const offset = Number(url.searchParams.get('offset'));
    const genus = url.searchParams.get('genus') ?? 'Masdevallia';
    const more = offset + 1 < plan.records;
    return new Response(JSON.stringify({
      total: null, offset, limit: 1000, scanned: 1, returned: 1,
      next_offset: more ? offset + 1 : null,
      items: [item(offset, genus)],
    }));
  }));
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const flush = async () => { for (let i = 0; i < 20; i++) await act(async () => { await Promise.resolve(); }); };
const occurrenceCalls = () => plan.calls.filter((u) => u.pathname.endsWith('/atlas/public/occurrences'));
const mapMode = (host: HTMLElement) => host.querySelector('[data-testid="map-mode"]')?.textContent;

async function render(path: string) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <MemoryRouter initialEntries={[path]}><AtlasFilterProvider><Atlas /></AtlasFilterProvider></MemoryRouter>,
  ));
  await flush();
  return host;
}

it('draws the world view from one cell request and fetches no per-record page', async () => {
  const host = await render('/atlas');
  const cellCalls = plan.calls.filter((u) => u.pathname.endsWith('/atlas/public/cells'));
  expect(cellCalls).toHaveLength(1);
  expect(cellCalls[0].searchParams.get('resolution')).toBe('2');
  expect(occurrenceCalls()).toHaveLength(0);
  expect(mapMode(host)).toBe('2 cells');
  expect(host.querySelector('[data-testid="atlas-overview-summary"]')?.textContent).toBe('1,234 records in 2 grid cells');
  expect(host.querySelector('[data-testid="atlas-overview-hint"]')).not.toBeNull();
  expect(host.textContent).toContain('Records in the Atlas');
  expect(host.querySelector('[data-testid="atlas-load-capped"]')).toBeNull();
});

it('a genus filter loads that genus through the genus route and keeps the generalised-location text', async () => {
  const host = await render('/atlas?genera=Masdevallia');
  expect(occurrenceCalls().length).toBeGreaterThan(0);
  expect(occurrenceCalls().every((u) => u.searchParams.get('genus') === 'Masdevallia')).toBe(true);
  expect(mapMode(host)).toBe('3 map records');
  expect(host.querySelector('[data-testid="atlas-load-capped"]')).toBeNull();

  const row = [...host.querySelectorAll('ul li button')][0] as HTMLButtonElement;
  await act(async () => row.click());
  await flush();
  expect(document.querySelector('[data-testid="atlas-location-notice"]')?.textContent).toBe('Location generalised to ~11 km');
});

it('zooming in past the threshold loads records, and the page cap is announced', async () => {
  plan.records = ATLAS_MAX_PAGES + 20;
  const host = await render('/atlas');
  expect(occurrenceCalls()).toHaveLength(0);

  const zoomIn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'zoom in')!;
  await act(async () => zoomIn.click());
  await flush();
  await flush();
  expect(occurrenceCalls()).toHaveLength(ATLAS_MAX_PAGES);
  expect(occurrenceCalls().every((u) => u.searchParams.get('genus') === null)).toBe(true);
  expect(mapMode(host)).toBe(`${ATLAS_MAX_PAGES} map records`);
  expect(host.querySelector('[data-testid="atlas-load-capped"]')?.textContent).toBe(
    `Showing the first ${ATLAS_MAX_PAGES} records; filter by genus to see all.`,
  );

  // Zooming back out returns to the count cells; no cell request was made while zoomed in.
  expect(plan.calls.filter((u) => u.pathname.endsWith('/atlas/public/cells'))).toHaveLength(1);
  const zoomOut = [...host.querySelectorAll('button')].find((b) => b.textContent === 'zoom out')!;
  await act(async () => zoomOut.click());
  await flush();
  expect(mapMode(host)).toBe('2 cells');
  expect(host.querySelector('[data-testid="atlas-load-capped"]')).toBeNull();
});

it('falls back to per-record points when the cell route is unavailable', async () => {
  plan.cellsStatus = 404;
  const host = await render('/atlas');
  expect(occurrenceCalls().length).toBeGreaterThan(0);
  expect(mapMode(host)).toBe('3 map records');
});
