// @vitest-environment jsdom
/**
 * The Atlas page against the REAL data layer: occurrences come from the
 * backend's generalised public route (fetch is stubbed), the first page paints
 * before the rest, the loading indicator is honest, and the selected-record
 * card never shows locality text or a 3-decimal coordinate.
 * Every coordinate here is SYNTHETIC.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AtlasFilterProvider } from '@/contexts/AtlasFilterContext';

const tables = vi.hoisted(() => [] as string[]);

vi.mock('@/components/orchid/Navbar', () => ({ default: () => null }));
vi.mock('@/components/orchid/Footer', () => ({ default: () => null }));
vi.mock('@/components/atlas/LiveAtlasMap', () => ({
  default: ({ points }: { points: { lat: number; lng: number }[] }) => (
    <div role="application" data-coords={points.slice(0, 3).map((p) => `${p.lat},${p.lng}`).join(';')}>
      {points.length} map records
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
  return { supabase: { from: (table: string) => { tables.push(table); return query; } } };
});

import Atlas from './Atlas';
import { resetOrchidContinuumCaches } from '@/lib/orchidContinuum';

const SECRET = 'Hidden ridge above the old quarry';
const TOTAL = 1500;
let releaseRest: () => void = () => undefined;

function item(i: number) {
  return {
    id: `occ-${i}`,
    scientific_name: `Masdevallia fixture${i}`,
    genus: 'Masdevallia',
    species: `fixture${i}`,
    country: 'Peru',
    region: 'Cusco',
    year: 1999,
    source_dataset: 'GBIF',
    source_record_id: `src-${i}`,
    verified: true,
    conservation_status: null,
    iucn_code: null,
    assessment_resolved: false,
    // A misbehaving payload: the client must not show these even if sent.
    locality: SECRET,
    location: {
      cell_lat: -13.45,
      cell_lng: -71.95,
      cell_deg: 0.1,
      cell_km: 11,
      generalised: true,
      reason: 'unresolved-assessment',
      notice: 'Location generalised to about 11 km because the Continuum could not resolve a conservation assessment for this name. This precaution is not a claim that the taxon is threatened.',
    },
  };
}

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;

beforeEach(() => {
  resetOrchidContinuumCaches();
  tables.length = 0;
  const gate: Promise<void> = new Promise((resolve) => { releaseRest = resolve; });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/curated-occurrences')) return new Response(JSON.stringify({ total: 0, items: [] }));
    if (!url.pathname.endsWith('/atlas/public/occurrences')) throw new Error(`Unexpected network: ${url}`);
    const offset = Number(url.searchParams.get('offset'));
    const limit = Number(url.searchParams.get('limit'));
    if (offset > 0) await gate;
    const count = Math.max(0, Math.min(limit, TOTAL - offset));
    return new Response(JSON.stringify({
      total: TOTAL, offset, limit, scanned: count, returned: count,
      next_offset: offset + count < TOTAL ? offset + count : null,
      items: Array.from({ length: count }, (_, i) => item(offset + i)),
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

const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); }); };

it('paints the first page from the public route, shows honest progress, and never shows locality text or precise coordinates', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <MemoryRouter initialEntries={['/atlas']}><AtlasFilterProvider><Atlas /></AtlasFilterProvider></MemoryRouter>,
  ));
  await flush();

  // First page painted while the rest are still pending.
  expect(host.textContent).toContain('1000 map records');
  const progress = host.querySelector('[data-testid="atlas-load-progress"]');
  expect(progress?.textContent).toContain('Loading 1,000 of 1,500 records');
  expect(progress?.textContent).toContain('showing 1,000 while loading');

  await act(async () => { releaseRest(); });
  await flush();
  expect(host.textContent).toContain('1500 map records');
  expect(host.querySelector('[data-testid="atlas-load-progress"]')).toBeNull();

  // The browser never read the raw table.
  expect(tables).not.toContain('atlas_occurrences');
  // Map coordinates are the server's cell centres.
  const [lat, lng] = (host.querySelector('[role="application"]')?.getAttribute('data-coords') ?? '').split(';')[0].split(',').map(Number);
  expect(lat).toBeCloseTo(-13.45, 9);
  expect(lng).toBeCloseTo(-71.95, 9);

  // Open a record card.
  const row = [...host.querySelectorAll('ul li button')][0] as HTMLButtonElement;
  await act(async () => row.click());
  await flush();
  const text = document.body.textContent ?? '';
  expect(text).toContain('Peru · Cusco');
  expect(document.querySelector('[data-testid="atlas-location-notice"]')?.textContent).toBe('Location generalised to ~11 km');
  expect(text).not.toContain(SECRET);
  expect(text).not.toMatch(/-?\d{1,3}\.\d{3}\s*,\s*-?\d{1,3}\.\d{3}/);
  expect(text).not.toMatch(/-13\.450|-71\.950/);
});
