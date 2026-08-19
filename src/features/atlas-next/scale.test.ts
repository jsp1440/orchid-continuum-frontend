import { describe, expect, it } from 'vitest';
import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';
import { aggregate, focusFor, resolveScaleAvailability } from './scale';

const point = (over: Partial<AtlasOccurrencePoint> = {}): AtlasOccurrencePoint => ({
  id: Math.random().toString(36).slice(2),
  lat: 0,
  lng: 0,
  genus: 'Lepanthes',
  species: 'sp',
  canonicalName: 'Lepanthes sp',
  country: 'Ecuador',
  countries: ['Ecuador'],
  pollinators: [],
  dataset: 'GBIF',
  verified: true,
  ...over,
});

describe('resolveScaleAvailability', () => {
  it('offers a level only when the data carries the field it is organised by', () => {
    const avail = resolveScaleAvailability([point({ region: undefined, locality: undefined })]);
    const byLevel = Object.fromEntries(avail.map((a) => [a.level, a]));
    expect(byLevel.earth.available).toBe(true);
    expect(byLevel.country.available).toBe(true);
    expect(byLevel.continent.available).toBe(false);
    expect(byLevel.continent.reason).toMatch(/region/);
    expect(byLevel.locality.available).toBe(false);
  });

  it('opens the region-organised levels once regions appear in the data', () => {
    const avail = resolveScaleAvailability([point({ region: 'South America' })]);
    expect(avail.find((a) => a.level === 'continent')?.available).toBe(true);
  });

  it('does not count the placeholder country as a real value', () => {
    const avail = resolveScaleAvailability([point({ country: 'Unknown', countries: [] })]);
    expect(avail.find((a) => a.level === 'country')?.available).toBe(false);
  });
});

describe('aggregate', () => {
  it('tallies records into graticule cells and counts distinct species', () => {
    const cells = aggregate(
      [
        point({ lat: 0.1, lng: 0.1, canonicalName: 'A a' }),
        point({ lat: 0.9, lng: 0.9, canonicalName: 'B b' }),
        point({ lat: 40, lng: 40, canonicalName: 'C c' }),
      ],
      1,
    );
    expect(cells).toHaveLength(2);
    const big = cells.find((c) => c.recordCount === 2)!;
    expect(big.speciesCount).toBe(2);
    expect(big.lat).toBeCloseTo(0.5, 6);
  });

  it('flags a cell that contains a protected record without naming the record', () => {
    const cells = aggregate([point({ lat: 1.2, lng: 1.2, iucnCode: 'CR' })], 1);
    expect(cells[0].containsProtected).toBe(true);
  });

  it('reports countries actually recorded, and nothing else', () => {
    const cells = aggregate([point({ lat: 1, lng: 1, country: 'Unknown', countries: [] })], 5);
    expect(cells[0].countries).toEqual([]);
  });
});

describe('focusFor', () => {
  it('returns null when there is nothing to look at', () => {
    expect(focusFor([], 'world')).toBeNull();
  });

  it('uses the median so one outlier cannot drag the camera into the ocean', () => {
    const f = focusFor(
      [point({ lat: 1, lng: 1 }), point({ lat: 2, lng: 2 }), point({ lat: 80, lng: 170 })],
      'country',
    );
    expect(f!.lat).toBe(2);
    expect(f!.lng).toBe(2);
  });
});
