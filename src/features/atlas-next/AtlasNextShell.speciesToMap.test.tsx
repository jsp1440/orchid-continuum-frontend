// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AtlasFilterProvider } from '@/contexts/AtlasFilterContext';
import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';
import AtlasNextShell from './AtlasNextShell';
import type { GlobeMark } from './AtlasGlobe';
import { UNRESOLVED_FLOOR_DEG } from './sensitivity';
import { SCALES } from './types';

/**
 * ATLAS-001 acceptance: species arrival -> data reader -> locality policy -> map marks.
 *
 * EVIDENCE CLASS: SYNTHETIC TEST SHAPES, mounted through the REAL
 * AtlasFilterProvider, the REAL useAtlasData reader, the REAL AtlasNextShell and
 * the REAL locality policy. Only the network occurrence contract and the
 * rendering engines are replaced. The rows below are placeholder numbers, not
 * captured records, so this proves nothing about the deployed Render service or
 * its occurrence store, and nothing about where any species occurs.
 *
 * It complements, and does not duplicate: the hook-only species narrowing
 * (#905), the subject disclosure with an empty reader
 * (AtlasNextShell.subjectRank.test.tsx), the policy unit tests
 * (sensitivity.test.ts), and the browser handoff
 * (e2e/research-station-atlas-next-species.spec.ts, whose reference backend
 * serves no occurrences). What is new is the end-to-end assertion that what
 * reaches the map is narrowed AND never more precise than policy allows.
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

const drawn: { marks: GlobeMark[] } = { marks: [] };
vi.mock('./AtlasGlobe', () => ({
  default: ({ marks }: { marks: GlobeMark[] }) => {
    drawn.marks = marks;
    return <div data-testid="atlas-globe" />;
  },
}));
vi.mock('./RegionalMap', () => ({ default: () => <div data-testid="regional-map" /> }));
vi.mock('./OccurrenceCard', () => ({ default: () => null }));
vi.mock('./GuidePanel', () => ({ default: () => null }));
vi.mock('./mapboxConfig', () => ({
  mapboxConfig: () => ({ configured: false, envVar: 'VITE_MAPBOX_ACCESS_TOKEN' }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

/** Synthetic test shape — NOT an occurrence record. */
const synthetic = (
  id: string,
  canonicalName: string,
  lat: number,
  lng: number,
  extra: Partial<AtlasOccurrencePoint> = {},
) =>
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
    ...extra,
  }) as AtlasOccurrencePoint;

// Deliberately precise, off-grid values: if one reaches a mark, the test fails.
const PRECISE = { lat: 12.34567, lng: 56.78901 };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  drawn.marks = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function arriveAt(href: string, points: AtlasOccurrencePoint[]) {
  fixture.points = points;
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[href]}>
        <AtlasFilterProvider>
          <AtlasNextShell />
        </AtlasFilterProvider>
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

/** Individual marks are drawn from the Country rung down; Earth/World/Continent aggregate. */
async function openCountryScale() {
  const nav = container.querySelector('nav[aria-label="Scale"]');
  const button = Array.from(nav?.querySelectorAll('button') ?? []).find((b) =>
    b.textContent?.startsWith('Country'),
  );
  expect(button, 'Country scale button').toBeTruthy();
  expect((button as HTMLButtonElement).disabled).toBe(false);
  await act(async () => {
    (button as HTMLButtonElement).click();
  });
}

const EXACT = 1e-6;
/** A mark within `tolerance` degrees of a point; never an exact-coordinate claim. */
const markNear = (lat: number, lng: number, tolerance: number) =>
  drawn.marks.some((m) => Math.abs(m.lat - lat) <= tolerance && Math.abs(m.lng - lng) <= tolerance);

describe('Atlas Next species-to-map journey (synthetic fixture, real component stack)', () => {
  it('draws only the arriving species and never its congener', async () => {
    await arriveAt('/atlas-next?species=Cattleya%20purpurata', [
      synthetic('target', 'Cattleya purpurata', PRECISE.lat, PRECISE.lng, {
        assessmentResolved: true,
      }),
      synthetic('congener', 'Cattleya labiata', -40.5, 150.5, { assessmentResolved: true }),
    ]);
    await openCountryScale();

    expect(container.querySelector('[data-testid="atlas-next-subject"]')?.textContent).toContain(
      'Cattleya purpurata',
    );
    expect(drawn.marks.length).toBeGreaterThan(0);
    // The congener's synthetic position (other hemisphere) is nowhere on the map.
    expect(drawn.marks.every((m) => m.lat > 0 && m.lng > 0)).toBe(true);
  });

  it('control: an assessed, not-threatened record is drawn near its coordinate, with no locality generalisation', async () => {
    // Guards the privacy assertions below against vacuity: if nothing is ever
    // drawn near its true position, "not drawn precisely" would prove nothing.
    // The scale contract lets a scale coarsen a record to its aggregationDeg, so
    // this asserts proximity within that bound, not an exact coordinate.
    await arriveAt('/atlas-next?species=Cattleya%20purpurata', [
      synthetic('ok', 'Cattleya purpurata', PRECISE.lat, PRECISE.lng, {
        assessmentResolved: true,
      }),
    ]);
    await openCountryScale();

    expect(drawn.marks.length).toBe(1);
    expect(markNear(PRECISE.lat, PRECISE.lng, SCALES.country.aggregationDeg)).toBe(true);
    // No locality-protection halo: nothing was withheld for this record.
    expect(drawn.marks[0].haloDeg ?? 0).toBe(0);
  });

  it('never draws the precise coordinate of a threatened record', async () => {
    await arriveAt('/atlas-next?species=Cattleya%20purpurata', [
      synthetic('cr', 'Cattleya purpurata', PRECISE.lat, PRECISE.lng, {
        iucnCode: 'CR',
        assessmentResolved: true,
      }),
    ]);
    await openCountryScale();

    expect(drawn.marks.length).toBe(1);
    expect(markNear(PRECISE.lat, PRECISE.lng, EXACT)).toBe(false);
    // Policy applied: the CR tier's 1 degree cell (sensitivity.ts TIER_CELL_DEG.CR),
    // independent of any scale floor.
    expect(drawn.marks[0].haloDeg).toBeGreaterThanOrEqual(1);
    expect(container.textContent).toContain('precise site');
    expect(container.textContent).toContain('withheld');
  });

  it('fails closed: an unassessed species is not drawn at its precise coordinate either', async () => {
    await arriveAt('/atlas-next?species=Cattleya%20purpurata', [
      synthetic('unresolved', 'Cattleya purpurata', PRECISE.lat, PRECISE.lng, {
        assessmentResolved: false,
      }),
    ]);
    await openCountryScale();

    expect(drawn.marks.length).toBe(1);
    expect(markNear(PRECISE.lat, PRECISE.lng, EXACT)).toBe(false);
    // Policy applied: at least the precautionary cell for an unreachable assessment.
    expect(drawn.marks[0].haloDeg).toBeGreaterThanOrEqual(UNRESOLVED_FLOOR_DEG);
  });

  it('says so, and draws nothing, when the store holds only a congener', async () => {
    await arriveAt('/atlas-next?species=Cattleya%20purpurata', [
      synthetic('congener', 'Cattleya labiata', 10.5, 20.5),
    ]);

    expect(drawn.marks).toEqual([]);
    const notice = container.querySelector('[data-testid="atlas-next-species-no-records"]');
    expect(notice?.textContent).toContain('No records for this species');
    expect(notice?.textContent).toContain('not evidence that the orchid is absent');
  });
});
