import { describe, expect, it } from 'vitest';
import { toPublicAtlasOccurrence } from '@/lib/atlasLocalitySafety';
import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';

function point(overrides: Partial<AtlasOccurrencePoint> = {}): AtlasOccurrencePoint {
  return {
    id: 'occ-1',
    lat: 4.612345,
    lng: -74.076543,
    genus: 'Masdevallia',
    species: 'veitchiana',
    canonicalName: 'Masdevallia veitchiana',
    country: 'Colombia',
    countries: ['Colombia'],
    locality: 'Sensitive ridge trail, exact collecting site',
    pollinators: [],
    dataset: 'GBIF',
    verified: true,
    ...overrides,
  };
}

describe('toPublicAtlasOccurrence', () => {
  it('generalises threatened taxa and removes free-text locality', () => {
    const source = point({ iucnCode: 'EN', assessmentResolved: true });
    const result = toPublicAtlasOccurrence(source);

    expect(result.id).toBe(source.id);
    expect(result.canonicalName).toBe(source.canonicalName);
    expect(result.lat).not.toBe(source.lat);
    expect(result.lng).not.toBe(source.lng);
    expect(result.locality).toBeUndefined();
    expect(source.locality).toContain('Sensitive ridge trail');
  });

  it('fails closed when conservation assessment is unresolved', () => {
    const source = point({ assessmentResolved: false });
    const result = toPublicAtlasOccurrence(source);

    expect(result.lat).not.toBe(source.lat);
    expect(result.lng).not.toBe(source.lng);
    expect(result.locality).toBeUndefined();
  });

  it('preserves allowed locality while respecting source coordinate uncertainty', () => {
    const source = point({
      assessmentResolved: true,
      iucnCode: 'LC',
      coordinateUncertaintyM: 20_000,
    });
    const result = toPublicAtlasOccurrence(source);

    expect(result.locality).toBe(source.locality);
    expect(result.lat).not.toBe(source.lat);
    expect(result.lng).not.toBe(source.lng);
  });

  it('does not mutate the source record', () => {
    const source = point({ iucnCode: 'CR', assessmentResolved: true });
    const original = { ...source };
    toPublicAtlasOccurrence(source);
    expect(source).toEqual(original);
  });
});
