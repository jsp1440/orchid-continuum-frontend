// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AtlasFilterProvider, useAtlasFilters } from '@/contexts/AtlasFilterContext';
import { researchStationAtlasNextHref } from '@/lib/researchStationNavigation';
import AtlasNextShell from './AtlasNextShell';

/**
 * Mounted Atlas Next subject disclosure, driven through the REAL shared
 * AtlasFilterProvider from a Research Station href. Only the occurrence reader
 * and rendering engines are replaced; the reader returns no records, so no
 * occurrence data (and no coordinates) is fabricated here.
 */

vi.mock('./useAtlasData', () => ({
  useAtlasData: () => ({ kind: 'ready', points: [], complete: true }),
}));

vi.mock('./mapboxConfig', () => ({
  mapboxConfig: () => ({ configured: false, envVar: 'VITE_MAPBOX_ACCESS_TOKEN' }),
}));

vi.mock('./AtlasGlobe', () => ({ default: () => <div data-testid="atlas-globe" /> }));
vi.mock('./RegionalMap', () => ({ default: () => <div data-testid="regional-map" /> }));
vi.mock('./OccurrenceCard', () => ({ default: () => null }));
vi.mock('./GuidePanel', () => ({ default: () => null }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;
let observedFilters: ReturnType<typeof useAtlasFilters>['filters'] | null = null;

const FilterProbe = () => {
  observedFilters = useAtlasFilters().filters;
  return null;
};

beforeEach(() => {
  observedFilters = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mountAt(href: string) {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[href]}>
        <AtlasFilterProvider>
          <FilterProbe />
          <AtlasNextShell />
        </AtlasFilterProvider>
      </MemoryRouter>,
    );
  });
}

function subjectLine(): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-testid="atlas-next-subject"]');
}

function linkLabels(): string[] {
  return Array.from(container.querySelectorAll('a')).map((a) => a.textContent?.trim() ?? '');
}

describe('AtlasNextShell subject rank from a Research Station handoff', () => {
  it('applies and names the arriving binomial as the species filter', () => {
    mountAt(researchStationAtlasNextHref({ taxon: 'Cattleya purpurata', projectId: 'proj-77' })!);

    expect(observedFilters?.species).toEqual(['Cattleya purpurata']);
    expect(observedFilters?.genera).toBeUndefined();

    const line = subjectLine();
    expect(line?.dataset.subjectRank).toBe('species');
    expect(line?.textContent).toContain('Species filter');
    expect(line?.textContent).toContain('Cattleya purpurata');
    expect(container.textContent).not.toContain('Genus-level fallback');
    // Genus-only onward handoffs would widen the species to its congeners.
    expect(linkLabels()).not.toContain('Continue in Research Station');
    expect(linkLabels()).not.toContain('Ask Calyx about this genus');
  });

  it('discloses that an infraspecific rank resolves only to its binomial', () => {
    mountAt(researchStationAtlasNextHref({ taxon: 'Cattleya walkeriana var. alba' })!);

    expect(observedFilters?.species).toEqual(['Cattleya walkeriana']);
    const line = subjectLine();
    expect(line?.dataset.subjectRank).toBe('species');
    expect(line?.textContent).toContain('Cattleya walkeriana var. alba');
    expect(line?.textContent).toContain('var. alba cannot be isolated');
  });

  it('labels a genus-only arrival explicitly as the genus-level fallback', () => {
    mountAt(researchStationAtlasNextHref({ taxon: 'Vanda' })!);

    expect(observedFilters?.genera).toEqual(['Vanda']);
    const line = subjectLine();
    expect(line?.dataset.subjectRank).toBe('genus');
    expect(line?.textContent).toContain('Genus-level fallback');
    expect(line?.textContent).toContain('Vanda');
    expect(linkLabels()).toContain('Continue in Research Station');
  });

  it('rejects a malformed species filter and draws nothing instead of an empty-looking map', () => {
    mountAt(`/atlas-next?species=${encodeURIComponent("Cattleya purpurata'; --")}`);

    const line = subjectLine();
    expect(line?.dataset.subjectRank).toBe('rejected');
    expect(line?.textContent).toContain('Taxon filter rejected');
    expect(container.textContent).not.toContain('The occurrence store returned no usable coordinates');
    expect(linkLabels()).not.toContain('Continue in Research Station');
  });

  it('rejects a species that contradicts the genus filter', () => {
    mountAt('/atlas-next?genera=Vanda&species=Cattleya%20purpurata');

    expect(subjectLine()?.dataset.subjectRank).toBe('rejected');
  });

  it('names no subject when the Atlas is opened without a taxon', () => {
    mountAt('/atlas-next');

    expect(subjectLine()).toBeNull();
  });
});
