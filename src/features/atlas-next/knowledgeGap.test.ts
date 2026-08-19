import { describe, expect, it } from 'vitest';
import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';
import { gapSentences, profileOf, recordEvidence, tierOf, TIER_COPY } from './knowledgeGap';

const p = (over: Partial<AtlasOccurrencePoint> = {}): AtlasOccurrencePoint => ({
  id: Math.random().toString(36).slice(2),
  lat: 4,
  lng: -74,
  genus: 'Lepanthes',
  species: 'sp',
  canonicalName: 'Lepanthes sp',
  country: 'Colombia',
  countries: ['Colombia'],
  pollinators: [],
  dataset: 'GBIF',
  verified: true,
  assessmentResolved: true,
  ...over,
});

describe('tiers', () => {
  it('a bare coordinate is occurrence-only', () => {
    expect(tierOf(recordEvidence(p()))).toBe('occurrence-only');
  });

  it('habitat or elevation earns context, but not a relationship', () => {
    expect(tierOf(recordEvidence(p({ habitat: 'Cloud forest' })))).toBe('context-no-relationship');
    expect(tierOf(recordEvidence(p({ elevation_m: 1800 })))).toBe('context-no-relationship');
  });

  it('a documented partner is the only thing that reaches the top tier', () => {
    expect(tierOf(recordEvidence(p({ mycorrhizal: { taxon: 'Tulasnella' } })))).toBe(
      'relationship-documented',
    );
    expect(tierOf(recordEvidence(p({ pollinators: [{ taxon: 'Xylocopa' }] })))).toBe(
      'relationship-documented',
    );
  });

  it('an unnamed pollinator entry does not reach the top tier', () => {
    expect(tierOf(recordEvidence(p({ pollinators: [{ mechanism: 'unspecified' }] })))).toBe(
      'occurrence-only',
    );
  });
});

describe('profileOf', () => {
  it('counts each dimension separately rather than producing one score', () => {
    const g = profileOf([
      p({ habitat: 'Cloud forest', year: 1998 }),
      p({ mycorrhizal: { taxon: 'Tulasnella' }, year: 2015 }),
      p(),
    ]);
    expect(g.records).toBe(3);
    expect(g.withFungalPartner).toBe(1);
    expect(g.withHabitat).toBe(1);
    expect(g.withYear).toBe(2);
    expect(g.undated).toBe(1);
  });

  it('does not call undated records historical', () => {
    // A pile of undated records is not old. It is undated.
    const g = profileOf([p(), p(), p()]);
    expect(g.historicalOnly).toBe(false);
    expect(g.mostRecentYear).toBeNull();
  });

  it('reports historical-only when everything dated is old', () => {
    const g = profileOf([p({ year: 1961 }), p({ year: 1972 })]);
    expect(g.historicalOnly).toBe(true);
    expect(g.mostRecentYear).toBe(1972);
  });

  it('counts records whose conservation assessment could not be reached', () => {
    const g = profileOf([p({ assessmentResolved: false }), p({ assessmentResolved: true })]);
    expect(g.unassessed).toBe(1);
    // ...and failing closed also makes that record imprecise.
    expect(g.imprecise).toBe(1);
  });

  it('counts a record with no source identifier as weak provenance', () => {
    expect(profileOf([p({ sourceRecordId: undefined })]).weakProvenance).toBe(1);
    expect(profileOf([p({ sourceRecordId: 'gbif:1' })]).weakProvenance).toBe(0);
  });
});

describe('public language', () => {
  it('states a missing fungal partner as a gap in the literature, not in the orchid', () => {
    const s = gapSentences(profileOf([p(), p()])).join(' ');
    expect(s).toMatch(/Every orchid has one/i);
    expect(s).toMatch(/nobody has published one into the Continuum/i);
  });

  it('never describes an old record as an absence', () => {
    const s = gapSentences(profileOf([p({ year: 1955 })])).join(' ');
    expect(s).toMatch(/measures collecting effort, not whether the orchid is still there/i);
    expect(s).not.toMatch(/extinct|extirpat|disappeared|no longer/i);
  });

  it('every tier says what IS known before what is not', () => {
    for (const copy of Object.values(TIER_COPY)) {
      expect(copy.known.length).toBeGreaterThan(0);
      expect(copy.known).toMatch(/observed/i);
    }
  });

  it('the middle tier names the dependency it cannot show', () => {
    expect(TIER_COPY['context-no-relationship'].caution).toMatch(/Every orchid depends on a fungus/i);
  });
});
