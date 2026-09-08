// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AtlasNextShell from './AtlasNextShell';

const atlasFilterState = vi.hoisted(() => ({
  genera: ['Phalaenopsis'] as string[] | undefined,
  setFilters: vi.fn(),
}));

vi.mock('@/contexts/AtlasFilterContext', () => ({
  useAtlasFilters: () => ({
    filters: { genera: atlasFilterState.genera },
    setFilters: atlasFilterState.setFilters,
  }),
}));

vi.mock('./useAtlasData', () => ({
  useAtlasData: () => ({ kind: 'ready', points: [], complete: true }),
}));

vi.mock('./mapboxConfig', () => ({
  mapboxConfig: () => ({
    configured: false,
    envVar: 'VITE_MAPBOX_ACCESS_TOKEN',
  }),
}));

vi.mock('./AtlasGlobe', () => ({
  default: () => <div data-testid="atlas-globe" />,
}));

vi.mock('./RegionalMap', () => ({
  default: () => <div data-testid="regional-map" />,
}));

vi.mock('./OccurrenceCard', () => ({
  default: () => null,
}));

vi.mock('./GuidePanel', () => ({
  default: () => null,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  atlasFilterState.genera = ['Phalaenopsis'];
  atlasFilterState.setFilters.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount() {
  act(() => {
    root.render(
      <MemoryRouter>
        <AtlasNextShell />
      </MemoryRouter>,
    );
  });
}

function researchLink(): HTMLAnchorElement | null {
  return Array.from(container.querySelectorAll<HTMLAnchorElement>('a')).find(
    (link) => link.textContent?.trim() === 'Continue in Research Station',
  ) ?? null;
}

describe('AtlasNextShell Research Station handoff', () => {
  it('renders the governed handoff for one valid incoming genus', () => {
    mount();

    const link = researchLink();
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe(
      '/research?genus=Phalaenopsis&origin=atlas-next&context_is_evidence=false',
    );
  });

  it.each([
    ['no genus', undefined],
    ['multiple genera', ['Phalaenopsis', 'Cattleya']],
    ['malformed genus', ['not a genus']],
  ] as const)('omits the handoff for %s', (_label, genera) => {
    atlasFilterState.genera = genera;
    mount();

    expect(researchLink()).toBeNull();
  });
});
