// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AtlasFilterProvider } from '@/contexts/AtlasFilterContext';
import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';
import AtlasNextShell from './AtlasNextShell';
import type { AtlasDataState } from './useAtlasData';

/**
 * Atlas Next draw guards, exercised with the occurrence reader REPLACED by a
 * controllable state. The points below are SYNTHETIC TEST SHAPES, not captured
 * occurrence records: their coordinates are round placeholder numbers chosen
 * only so the shell has something drawable, and they say nothing about where
 * any orchid grows. They exist to prove that a rejected subject draws nothing
 * even when the reader DOES hand the shell records.
 */

const dataState: { current: AtlasDataState } = { current: { kind: 'loading' } };
vi.mock('./useAtlasData', () => ({ useAtlasData: () => dataState.current }));

vi.mock('./mapboxConfig', () => ({
  mapboxConfig: () => ({ configured: false, envVar: 'VITE_MAPBOX_ACCESS_TOKEN' }),
}));

/** Every `marks` array the globe was asked to draw, latest last. */
const drawnMarks: unknown[][] = [];
vi.mock('./AtlasGlobe', () => ({
  default: ({ marks }: { marks: unknown[] }) => {
    drawnMarks.push(marks);
    return <div data-testid="atlas-globe" data-mark-count={marks.length} />;
  },
}));
vi.mock('./RegionalMap', () => ({ default: () => <div data-testid="regional-map" /> }));
vi.mock('./OccurrenceCard', () => ({ default: () => null }));
vi.mock('./GuidePanel', () => ({ default: () => null }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

/** Synthetic test shape — NOT an occurrence record (see file header). */
const syntheticPoint = (id: string, canonicalName: string, lat: number, lng: number) =>
  ({
    id: `synthetic-${id}`,
    lat,
    lng,
    genus: canonicalName.split(' ')[0],
    species: canonicalName,
    canonicalName,
    country: 'Synthetic',
    countries: ['Synthetic'],
    pollinators: [],
    dataset: 'synthetic-test-shape',
    verified: false,
  }) as AtlasOccurrencePoint;

const SYNTHETIC_POINTS: AtlasOccurrencePoint[] = [
  syntheticPoint('a', 'Cattleya purpurata', 10, 20),
  syntheticPoint('b', 'Cattleya purpurata', 11, 21),
  syntheticPoint('c', 'Cattleya labiata', 12, 22),
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  drawnMarks.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mountAt(href: string, state: AtlasDataState) {
  dataState.current = state;
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[href]}>
        <AtlasFilterProvider>
          <AtlasNextShell />
        </AtlasFilterProvider>
      </MemoryRouter>,
    );
  });
}

const latestMarkCount = () =>
  Number(container.querySelector<HTMLElement>('[data-testid="atlas-globe"]')?.dataset.markCount);

describe('Atlas Next draws nothing for a rejected subject, even with records in hand', () => {
  const ready: AtlasDataState = { kind: 'ready', points: SYNTHETIC_POINTS, complete: true };

  it('control: the same synthetic points ARE drawn for a well-formed species subject', () => {
    mountAt('/atlas-next?species=Cattleya%20purpurata', ready);

    expect(
      container.querySelector<HTMLElement>('[data-testid="atlas-next-subject"]')?.dataset
        .subjectRank,
    ).toBe('species');
    expect(latestMarkCount()).toBeGreaterThan(0);
  });

  it.each([
    ['malformed species', `/atlas-next?species=${encodeURIComponent("Cattleya purpurata'; --")}`],
    ['mixed-case species', '/atlas-next?species=Cattleya%20pUrpurata'],
    ['hybrid name as species', `/atlas-next?species=${encodeURIComponent('Cattleya × hardyana')}`],
    ['species contradicting genus', '/atlas-next?genera=Vanda&species=Cattleya%20purpurata'],
  ])('%s: the reader returns records but no mark is drawn', (_label, href) => {
    mountAt(href, ready);

    expect(
      container.querySelector<HTMLElement>('[data-testid="atlas-next-subject"]')?.dataset
        .subjectRank,
    ).toBe('rejected');
    expect(drawnMarks.length).toBeGreaterThan(0);
    for (const marks of drawnMarks) expect(marks).toHaveLength(0);
    // No record count leaks from the withheld points either.
    expect(container.textContent).not.toMatch(/\b[1-9]\d* records?\b/);
  });
});

describe('Atlas Next says why a species view is empty', () => {
  const noSpeciesRecords = 'No records for this species in the occurrence store';
  const noCoordinates = 'The occurrence store returned no usable coordinates';

  it('names the species when its filter matched zero records', () => {
    mountAt('/atlas-next?species=Cattleya%20purpurata', { kind: 'empty', matched: 0 });

    const message = container.querySelector('[data-testid="atlas-next-species-no-records"]');
    expect(message?.textContent).toContain(noSpeciesRecords);
    expect(message?.textContent).toContain('Cattleya purpurata');
    expect(message?.textContent).toContain('not evidence that the orchid is absent');
    expect(container.textContent).not.toContain(noCoordinates);
  });

  it('keeps the coordinate message when the species matched records without usable coordinates', () => {
    mountAt('/atlas-next?species=Cattleya%20purpurata', { kind: 'empty', matched: 4 });

    expect(container.textContent).toContain(noCoordinates);
    expect(container.textContent).not.toContain(noSpeciesRecords);
  });

  it.each([
    ['genus-level view', '/atlas-next?genera=Cattleya'],
    ['unfiltered view', '/atlas-next'],
  ])('keeps the generic message for a %s', (_label, href) => {
    mountAt(href, { kind: 'empty', matched: 0 });

    expect(container.textContent).toContain(noCoordinates);
    expect(container.textContent).not.toContain(noSpeciesRecords);
  });
});
