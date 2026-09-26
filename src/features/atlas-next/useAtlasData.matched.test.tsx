// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AtlasFilterProvider } from '@/contexts/AtlasFilterContext';
import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';
import { useAtlasData, type AtlasDataState } from './useAtlasData';

/**
 * The reader's `empty` state must say how many records the filter matched
 * before the coordinate check, so Atlas Next can tell "this species has no
 * records in the store" from "its records have no usable coordinates".
 *
 * The occurrence contract is replaced by SYNTHETIC TEST SHAPES (placeholder
 * numbers, not captured records); the real AtlasFilterProvider applies the
 * species filter from the URL.
 */

const fixture: { points: AtlasOccurrencePoint[] } = { points: [] };
vi.mock('@/lib/orchidContinuum', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/orchidContinuum')>()),
  didAtlasLoadFail: () => false,
  fetchAtlasOccurrencePointsLazy: async () => ({
    initial: [],
    full: Promise.resolve(fixture.points),
  }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

/** Synthetic test shape — NOT an occurrence record. */
const synthetic = (id: string, canonicalName: string, lat: number, lng: number) =>
  ({
    id: `synthetic-${id}`,
    lat,
    lng,
    genus: canonicalName.split(' ')[0],
    species: canonicalName,
    canonicalName,
    country: 'Synthetic',
    countries: [],
    pollinators: [],
    dataset: 'synthetic-test-shape',
    verified: false,
  }) as AtlasOccurrencePoint;

let container: HTMLDivElement;
let root: Root;
let observed: AtlasDataState | null = null;

const Probe = () => {
  observed = useAtlasData();
  return null;
};

beforeEach(() => {
  observed = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function readAt(href: string, points: AtlasOccurrencePoint[]) {
  fixture.points = points;
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[href]}>
        <AtlasFilterProvider>
          <Probe />
        </AtlasFilterProvider>
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useAtlasData empty state', () => {
  it('reports matched 0 when the species filter matches no record', async () => {
    await readAt('/atlas-next?species=Cattleya%20purpurata', [
      synthetic('a', 'Cattleya labiata', 10, 20),
    ]);
    expect(observed).toEqual({ kind: 'empty', matched: 0 });
  });

  it('reports the matched count when matching records have no usable coordinates', async () => {
    await readAt('/atlas-next?species=Cattleya%20purpurata', [
      synthetic('a', 'Cattleya purpurata', 0, 0),
      synthetic('b', 'Cattleya purpurata', Number.NaN, 20),
      synthetic('c', 'Cattleya labiata', 10, 20),
    ]);
    expect(observed).toEqual({ kind: 'empty', matched: 2 });
  });
});
