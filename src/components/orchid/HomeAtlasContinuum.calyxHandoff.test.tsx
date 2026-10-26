// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import HomeAtlasContinuum from './HomeAtlasContinuum';

const { daily } = vi.hoisted(() => ({ daily: { genus: 'Alpha' } }));
vi.mock('@/lib/dailyGenusContext', () => ({
  useDailyGenus: () => ({ genus: daily.genus, continuum: null }),
}));
vi.mock('./AtlasMiniMap', () => ({ default: () => <div>Fixture map</div> }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
function Destination() {
  const location = useLocation();
  return <output>{location.pathname}{location.search}</output>;
}
const render = () => act(async () => {
  root.render(<MemoryRouter><Routes>
    <Route path="/" element={<HomeAtlasContinuum />} />
    <Route path="/calyx" element={<Destination />} />
  </Routes></MemoryRouter>);
});
beforeEach(() => {
  daily.genus = 'Alpha';
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [{
    id: 'private-fixture-record', scientific_name: 'Alpha fixture',
    lat: 12.34567, lng: 45.67891, country: 'Fixture country',
  }] }))));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function calyxLink() {
  const anchor = [...host.querySelectorAll('a')].find(a => a.pathname === '/calyx');
  expect(anchor, 'homepage Atlas must provide a visible Calyx continuation').toBeDefined();
  return anchor!;
}
function assertBoundedContext(anchor: HTMLAnchorElement, genus: string) {
  const url = new URL(anchor.href);
  expect(url.pathname).toBe('/calyx');
  expect([...url.searchParams.entries()].sort()).toEqual([
    ['context_is_evidence', 'false'], ['genus', genus], ['origin', 'homepage-featured-taxon'],
  ]);
  expect(anchor.textContent).toContain(genus);
  expect(anchor.href).not.toContain('private-fixture-record');
  expect(anchor.href).not.toContain('12.34567');
}
it('navigates from homepage Atlas to Calyx carrying only bounded genus context', async () => {
  await render();
  const link = calyxLink();
  assertBoundedContext(link, 'Alpha');
  expect(host.querySelector('a[href="/atlas?genera=Alpha"]')).not.toBeNull();
  expect(host.querySelector('a[href="/relationship-matrix?genus=Alpha"]')).not.toBeNull();
  await act(async () => { link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); });
  expect(host.querySelector('output')?.textContent).toBe('/calyx?genus=Alpha&origin=homepage-featured-taxon&context_is_evidence=false');
});
it('uses the new daily genus after a rerender without retaining prior map evidence', async () => {
  await render();
  daily.genus = 'Beta';
  await render();
  assertBoundedContext(calyxLink(), 'Beta');
  expect(calyxLink().href).not.toContain('Alpha');
});
