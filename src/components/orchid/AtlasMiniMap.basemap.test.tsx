// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import AtlasMiniMap from './AtlasMiniMap';

// Replace only the remote Leaflet script loader; execute the actual installed
// Leaflet map and tile layer against the DOM. No map/component/tile mocks.
vi.mock('@/hooks/useLeaflet', async () => ({
  useLeaflet: () => ({ ready: true, error: null, L: leaflet }),
}));
const leaflet = await import('leaflet');
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => { if (root) act(() => root!.unmount()); document.body.innerHTML = ''; vi.restoreAllMocks(); });

it('renders geographic tile requests without a retired CARTO key and retains attribution and Atlas handoff', async () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(320);
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<MemoryRouter><AtlasMiniMap points={[]} atlasHref="/atlas?genera=Masdevallia" /></MemoryRouter>));
  const tiles = [...host.querySelectorAll<HTMLImageElement>('img.leaflet-tile')];
  expect(tiles.length).toBeGreaterThan(0);
  for (const tile of tiles) {
    const url = new URL(tile.src);
    expect(url.hostname).toBe('tile.openstreetmap.org');
    expect(url.pathname).toMatch(/^\/\d+\/\d+\/\d+\.png$/);
  }
  expect(host.querySelector('.leaflet-control-attribution')?.textContent).toContain('OpenStreetMap');
  expect(host.querySelector<HTMLAnchorElement>('a[href="/atlas?genera=Masdevallia"]')).not.toBeNull();
  act(() => root!.unmount());
  root = undefined;
  expect(host.querySelectorAll('.leaflet-tile')).toHaveLength(0);
});
