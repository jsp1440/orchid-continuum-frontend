// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AtlasMiniMapProps } from './AtlasMiniMap';
import HomeAtlasContinuum from './HomeAtlasContinuum';
const { daily, capture } = vi.hoisted(() => ({ daily: { genus: 'Alpha' }, capture: vi.fn() }));
vi.mock('@/lib/dailyGenusContext', () => ({ useDailyGenus: () => ({ genus: daily.genus, continuum: null }) }));
vi.mock('./AtlasMiniMap', () => ({ default: (props: AtlasMiniMapProps) => { capture(props); return <div role="application">{props.points.length} mapped</div>; } }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
beforeEach(() => { daily.genus = 'Alpha'; capture.mockClear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const render = () => act(async () => { root.render(<MemoryRouter><HomeAtlasContinuum /></MemoryRouter>); });
it('requests the real /api/atlas route and maps only the current genus with public coordinates', async () => { const fetcher = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({ items: [{ id: '1', scientific_name: 'Alpha fixture', lat: 12.34567, lng: 45.67891, conservation_status: 'CR' }, { id: '2', scientific_name: 'Beta other', lat: 10, lng: 20 }] }))); vi.stubGlobal('fetch', fetcher); await render(); expect(String(fetcher.mock.calls[0][0])).toContain('/api/atlas/occurrences?genus=Alpha&limit=500'); const point = capture.mock.lastCall![0].points[0]; expect(point.lat).not.toBe(12.34567); expect(point.canonicalName).toBe('Alpha fixture'); expect(capture.mock.lastCall![0].points).toHaveLength(1); expect(host.querySelector('a')?.getAttribute('href')).toBe('/atlas?genera=Alpha'); });
it('does not label a late Alpha result as Beta', async () => { let resolveOld!: (r: Response) => void; vi.stubGlobal('fetch', vi.fn((input) => String(input).includes('genus=Alpha') ? new Promise<Response>(r => { resolveOld = r; }) : Promise.resolve(new Response(JSON.stringify({ items: [] }))))); await render(); daily.genus = 'Beta'; await render(); await act(async () => resolveOld(new Response(JSON.stringify({ items: [{ scientific_name: 'Alpha fixture', lat: 1, lng: 2 }] })))); expect(capture.mock.lastCall![0].points).toEqual([]); expect(host.textContent).toContain('Beta'); expect(host.textContent).not.toContain('Alpha fixture'); });

it.each<[string, number | undefined, number, number]>([
  ['CR', undefined, 12.5, 45.5],
  ['EN', undefined, 12.25, 45.75],
  ['LC', 9000, 12.35, 45.65],
  ['LC', undefined, 12.35, 45.65],
  ['DD', undefined, 12.35, 45.65],
])('preserves the public cell for assessment %s and uncertainty %s', async (status, uncertainty, lat, lng) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [{
    scientific_name: 'Alpha fixture', lat: 12.34567, lng: 45.67891,
    conservation_status: status, coordinate_uncertainty_in_meters: uncertainty,
  }] }))));
  await render();
  const points = capture.mock.lastCall![0].points;
  expect(points).toHaveLength(1);
  expect(points[0].lat).toBeCloseTo(lat, 8);
  expect(points[0].lng).toBeCloseTo(lng, 8);
});
