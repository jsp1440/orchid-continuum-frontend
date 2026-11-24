// @vitest-environment jsdom
/**
 * /atlas/ecuador is retired: it embedded an external Render service that no
 * longer exists. The route now redirects to the Atlas with the Grand Tour open
 * at its Andes stop ("The Mountains That Multiply Species").
 */
import React, { act } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ALL_PANELS,
  ANDES_TOUR_STOP_NUMBER,
  grandTourStopPath,
  tourPanelIndexFromParam,
  tourStopSlug,
} from '@/lib/grandTour';

const captured = vi.hoisted(() => ({ props: [] as { open: boolean; initialIndex?: number | null }[] }));
vi.mock('@/components/orchid/Navbar', () => ({ default: () => null }));
vi.mock('@/components/orchid/Footer', () => ({ default: () => null }));
vi.mock('@/components/atlas/LiveAtlasMap', () => ({ default: () => null }));
vi.mock('@/components/atlas/AtlasDebugPanel', () => ({ default: () => null }));
vi.mock('@/components/atlas/AtlasTour', () => ({ default: () => null }));
vi.mock('@/components/atlas/GrandTour', () => ({
  default: (props: { open: boolean; initialIndex?: number | null }) => {
    captured.props.push(props);
    return null;
  },
}));
vi.mock('@/lib/orchidContinuum', async (original) => ({
  ...(await original<typeof import('@/lib/orchidContinuum')>()),
  fetchAtlasOccurrencePointsProgressive: async () => [],
  fetchAtlasFacets: async () => ({
    genera: [], tribes: [], countries: [], growthForms: [], habitats: [], iucnCodes: [],
    pollinatorTaxa: [], datasets: [], totals: {},
  }),
}));

import Atlas from './Atlas';
import { AtlasFilterProvider } from '@/contexts/AtlasFilterContext';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  document.body.innerHTML = '';
  captured.props = [];
});

function Where() {
  const location = useLocation();
  return <div data-testid="where">{`${location.pathname}${location.search}`}</div>;
}

describe('Andes tour stop deep link', () => {
  it('stop 3 is the Andes stop, addressable by number or slug', () => {
    const index = tourPanelIndexFromParam(String(ANDES_TOUR_STOP_NUMBER));
    expect(index).not.toBeNull();
    const stop = ALL_PANELS[index!];
    expect(stop.title).toBe('The Mountains That Multiply Species');
    expect(stop.subtitle).toContain('Ecuador & Colombia');
    expect(tourPanelIndexFromParam(tourStopSlug(stop))).toBe(index);
    expect(tourPanelIndexFromParam('the-mountains-that-multiply-species')).toBe(index);
    expect(tourPanelIndexFromParam('99')).toBeNull();
    expect(tourPanelIndexFromParam('nowhere')).toBeNull();
    expect(tourPanelIndexFromParam(null)).toBeNull();
    expect(grandTourStopPath(ANDES_TOUR_STOP_NUMBER)).toBe('/atlas?tour=3');
  });

  it('App mounts /atlas/ecuador as a redirect to that stop and no longer embeds the external service', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    expect(app).toContain('<Route path="/atlas/ecuador" element={<Navigate to={grandTourStopPath(ANDES_TOUR_STOP_NUMBER)} replace />} />');
    expect(app).not.toContain('EcuadorExpedition');
    const config = readFileSync(resolve(process.cwd(), 'src/lib/backendConfig.ts'), 'utf8');
    expect(config).not.toMatch(/ECUADOR_EMBED|ecuador-expedition/);
  });

  it('/atlas/ecuador lands on /atlas?tour=3 with the Grand Tour open at the Andes stop', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(
      <MemoryRouter initialEntries={['/atlas/ecuador']}>
        <AtlasFilterProvider>
          <Routes>
            <Route path="/atlas/ecuador" element={<Navigate to={grandTourStopPath(ANDES_TOUR_STOP_NUMBER)} replace />} />
            <Route path="/atlas" element={<><Where /><Atlas /></>} />
          </Routes>
        </AtlasFilterProvider>
      </MemoryRouter>,
    ));
    expect(host.querySelector('[data-testid="where"]')?.textContent).toBe('/atlas?tour=3');
    const last = captured.props.at(-1)!;
    expect(last.open).toBe(true);
    expect(ALL_PANELS[last.initialIndex!].title).toBe('The Mountains That Multiply Species');
  });
});
