// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AtlasMiniMapProps } from '@/components/orchid/AtlasMiniMap';
import HomeAtlasContinuum from './HomepageAtlasExperience';
const { daily, capture } = vi.hoisted(() => ({ daily: { genus: 'Alpha' }, capture: vi.fn() }));
vi.mock('@/features/atlas-next/AtlasGlobe', () => ({ default: () => <div>Globe</div> }));
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));
vi.mock('@/lib/dailyGenusContext', () => ({ useDailyGenus: () => ({ genus: daily.genus, continuum: null }) }));
vi.mock('@/components/orchid/AtlasMiniMap', () => ({ default: (props: AtlasMiniMapProps) => { capture(props); return <div role="application">{props.points.length} mapped</div>; } }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
beforeEach(() => { vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} }); daily.genus = 'Alpha'; capture.mockClear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const render = () => act(async () => { root.render(<MemoryRouter><HomeAtlasContinuum /></MemoryRouter>); });
const mapView = () => act(() => { Array.from(host.querySelectorAll('button')).find(button => button.textContent === '2D map')!.click(); });

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(() => { throw Error('Unexpected database read'); }) } }));

const response = (value: unknown) => new Response(JSON.stringify(value));
const occurrence = (id: number, genus = 'Alpha') => ({
  id, genus, scientific_name: `${genus} fixture`, species: 'fixture', country: 'Testland',
  location: { cell_lat: 12.5, cell_lng: 45.5, cell_deg: 1, reason: 'iucn-threatened' },
  conservation_status: 'CR',
});

it('uses one bounded public page and retains only matching, server-projected records', async () => {
  const fetcher = vi.fn(async (_url: string) => response({
    items: [
      { ...occurrence(1), latitude: 12.34567, longitude: 45.67891, locality: 'withheld detail' },
      occurrence(2, 'Beta'),
      { ...occurrence(3), location: undefined, lat: 12.34567, lng: 45.67891 },
    ], scanned: 3, next_offset: 901,
  }));
  vi.stubGlobal('fetch', fetcher);
  await render();
  mapView();
  expect(fetcher).toHaveBeenCalledTimes(1);
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(url.pathname).toBe('/atlas/public/occurrences');
  expect(Object.fromEntries(url.searchParams)).toEqual({ offset: '0', limit: '500', genus: 'alpha' });
  const { points } = capture.mock.lastCall![0];
  expect(points).toHaveLength(1);
  expect(points[0]).toMatchObject({ id: '1', canonicalName: 'Alpha fixture', lat: 12.5, lng: 45.5 });
  expect(JSON.stringify(points)).not.toContain('withheld detail');
  expect(host.textContent).toContain('1 mapped record');
  expect(host.textContent).toContain('check the next page');
  expect(host.querySelector('a')?.getAttribute('href')).toBe('/atlas?genera=Alpha');
});

it('reports an empty successful page independently from service failure', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response({ items: [], scanned: 0, next_offset: null })));
  await render();
  expect(host.textContent).toContain('returned no mapped records');
  expect(host.textContent).not.toContain('Retry occurrence records');
});

it('distinguishes records withheld from display from an empty public response', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response({ items: [], scanned: 2, next_offset: 12 })));
  await render();
  expect(host.textContent).toContain('no displayable public locations');
  expect(host.textContent).toContain('check the next page');
});

it.each(['malformed page', 'HTTP 503'])('offers retry after %s and restores the map when the service recovers', async (failure) => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  let restored = false;
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (restored) return response({ items: [occurrence(1)] });
    return failure === 'HTTP 503' ? new Response(null, { status: 503 }) : response({ error: 'unavailable' });
  }));
  await render();
  await act(async () => { await vi.runAllTimersAsync(); });
  expect(host.textContent).not.toContain('returned no mapped records');
  restored = true;
  const retry = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Retry occurrence records')!;
  await act(async () => retry.click());
  expect(host.textContent).toContain('1 mapped record');
});

it('discards a late response when the selected genus changes', async () => {
  let complete!: (result: Response) => void;
  vi.stubGlobal('fetch', vi.fn((input) => String(input).includes('genus=alpha')
    ? new Promise<Response>(resolve => { complete = resolve; })
    : Promise.resolve(response({ items: [occurrence(2, 'Beta')] }))));
  await render();
  expect(host.textContent).toContain('Loading occurrence records');
  daily.genus = 'Beta';
  await render();
  await act(async () => complete(response({ items: [occurrence(1)] })));
  mapView();
  expect(capture.mock.lastCall![0].points[0].canonicalName).toBe('Beta fixture');
  expect(host.textContent).not.toContain('Alpha fixture');
});

it.each([
  ['CR', 1, 12.5, 45.5],
  ['EN', 0.5, 12.25, 45.75],
  ['LC', 0.1, 12.35, 45.65],
  ['DD', 0.1, 12.35, 45.65],
])('preserves the public cell for %s', async (assessment, cell, lat, lng) => {
  vi.stubGlobal('fetch', vi.fn(async () => response({ items: [{
    ...occurrence(1), conservation_status: assessment, assessment_resolved: assessment !== 'DD',
    location: { cell_lat: lat, cell_lng: lng, cell_deg: cell },
  }] })));
  await render();
  mapView();
  const [point] = capture.mock.lastCall![0].points;
  expect(point.lat).toBeCloseTo(Number(lat), 8);
  expect(point.lng).toBeCloseTo(Number(lng), 8);
});
