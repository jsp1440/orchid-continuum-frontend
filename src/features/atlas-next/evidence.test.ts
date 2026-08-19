import { describe, expect, it } from 'vitest';
import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';
import { coverage, displayName, resolveOccurrenceEvidence } from './evidence';

const point = (over: Partial<AtlasOccurrencePoint> = {}): AtlasOccurrencePoint => ({
  id: 'x',
  lat: 1,
  lng: 2,
  genus: 'Dracula',
  species: 'vampira',
  canonicalName: 'Dracula vampira',
  country: 'Ecuador',
  countries: ['Ecuador'],
  pollinators: [],
  dataset: 'GBIF',
  verified: true,
  ...over,
});

describe('resolveOccurrenceEvidence', () => {
  it('marks an absent field as not recorded rather than omitting it', () => {
    const e = resolveOccurrenceEvidence(point());
    expect(e.habitat.state).toBe('unknown');
    expect(e.habitat.value).toBeNull();
    expect(e.elevation.state).toBe('unknown');
  });

  it('treats a literal "Unknown" string as not recorded', () => {
    const e = resolveOccurrenceEvidence(point({ habitat: 'unknown' }));
    expect(e.habitat.state).toBe('unknown');
  });

  it('reports a recorded field as observed', () => {
    const e = resolveOccurrenceEvidence(point({ elevation_m: 1800, habitat: 'Cloud forest' }));
    expect(e.elevation.state).toBe('observed');
    expect(e.elevation.value).toBe(1800);
    expect(e.habitat.value).toBe('Cloud forest');
  });

  it('calls a cited fungal partner a documented relationship and keeps the citation', () => {
    const e = resolveOccurrenceEvidence(
      point({
        mycorrhizal: {
          taxon: 'Ceratobasidium',
          family: 'Ceratobasidiaceae',
          source: 'Porras-Alfaro & Bayman 2007',
        },
      }),
    );
    expect(e.mycorrhizal.state).toBe('documented_relationship');
    expect(e.mycorrhizal.attribution).toBe('Porras-Alfaro & Bayman 2007');
  });

  it('downgrades an uncited fungal partner to inferred, not documented', () => {
    const e = resolveOccurrenceEvidence(point({ mycorrhizal: { taxon: 'Tulasnella' } }));
    expect(e.mycorrhizal.state).toBe('inferred');
  });

  it('does not claim a pollinator relationship from an empty pollinator entry', () => {
    const e = resolveOccurrenceEvidence(point({ pollinators: [{ mechanism: 'unspecified' }] }));
    expect(e.pollinator.state).toBe('unknown');
  });

  it('reports an unverified record as unverified rather than as false', () => {
    const e = resolveOccurrenceEvidence(point({ verified: false }));
    expect(e.recordVerification.state).toBe('unknown');
  });
});

describe('coverage', () => {
  it('counts how much of the record is actually populated', () => {
    const bare = coverage(resolveOccurrenceEvidence(point()));
    const rich = coverage(
      resolveOccurrenceEvidence(
        point({ elevation_m: 100, habitat: 'Cloud forest', year: 1998, locality: 'Ridge' }),
      ),
    );
    expect(rich.recorded).toBeGreaterThan(bare.recorded);
    expect(bare.total).toBe(rich.total);
  });
});

describe('displayName', () => {
  it('prefers the accepted name when the source supplies one', () => {
    expect(displayName(point({ acceptedName: 'Dracula vampira (Luer) Luer' }))).toBe(
      'Dracula vampira (Luer) Luer',
    );
  });

  it('falls back to the canonical binomial', () => {
    expect(displayName(point())).toBe('Dracula vampira');
  });
});
