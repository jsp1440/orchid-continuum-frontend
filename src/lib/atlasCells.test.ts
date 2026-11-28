import { describe, expect, it } from 'vitest';
import { ATLAS_RECORDS_ZOOM, cellFill, cellLabel, cellResolutionForZoom, hasActiveAtlasFilters } from './atlasCells';

describe('atlas overview helpers', () => {
  it('picks a coarser cell for the whole world and switches to records past the threshold', () => {
    expect(cellResolutionForZoom(2)).toBe(2);
    expect(cellResolutionForZoom(4)).toBe(1);
    expect(ATLAS_RECORDS_ZOOM).toBeGreaterThan(4);
  });

  it('treats any narrowing filter as active', () => {
    expect(hasActiveAtlasFilters({})).toBe(false);
    expect(hasActiveAtlasFilters({ genera: [] })).toBe(false);
    expect(hasActiveAtlasFilters({ genera: ['Masdevallia'] })).toBe(true);
    expect(hasActiveAtlasFilters({ verifiedOnly: true })).toBe(true);
  });

  it('shades by log count and labels a cell with counts only', () => {
    expect(cellFill(1, 1000).opacity).toBeCloseTo(0.25, 5);
    expect(cellFill(1000, 1000).opacity).toBeCloseTo(0.8, 5);
    expect(cellLabel({ lat: 13, lng: -45, cellDeg: 1, cellKm: 111, count: 1, taxa: 1 })).toBe(
      '1 record · 1 taxon · area of about 111 km',
    );
  });
});
