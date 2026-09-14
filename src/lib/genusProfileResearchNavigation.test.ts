import { describe, expect, it } from 'vitest';
import {
  GENUS_PROFILE_ORIGIN,
  genusProfileResearchHref,
} from '@/lib/genusProfileNavigation';
import { parseResearchRouteContext } from '@/lib/researchRouteContext';

describe('Genus Profile → Research Center navigation', () => {
  it('preserves only the canonical genus as explicitly non-evidentiary profile context', () => {
    const href = genusProfileResearchHref('Phalaenopsis');
    const url = new URL(href, 'https://orchidcontinuum.test');

    expect(url.pathname).toBe('/research');
    expect([...url.searchParams.keys()].sort()).toEqual([
      'context_is_evidence',
      'genus',
      'origin',
    ]);
    expect(url.searchParams.get('genus')).toBe('Phalaenopsis');
    expect(url.searchParams.get('origin')).toBe(GENUS_PROFILE_ORIGIN);
    expect(url.searchParams.get('context_is_evidence')).toBe('false');

    expect(parseResearchRouteContext(url.searchParams)).toEqual({
      origin: GENUS_PROFILE_ORIGIN,
      genus: 'Phalaenopsis',
      projectId: null,
      contextIsEvidence: false,
    });
  });

  it('fails closed if profile context is promoted to evidence', () => {
    const url = new URL(genusProfileResearchHref('Phalaenopsis'), 'https://orchidcontinuum.test');
    url.searchParams.set('context_is_evidence', 'true');
    expect(parseResearchRouteContext(url.searchParams)).toBeNull();
  });

  it('does not create a route channel for protected Atlas or evidence material', () => {
    const url = new URL(genusProfileResearchHref('Phalaenopsis'), 'https://orchidcontinuum.test');
    for (const key of [
      'lat', 'lng', 'latitude', 'longitude', 'locality', 'occurrence_id',
      'record_id', 'collector', 'catalogue', 'evidence', 'confidence', 'conclusion',
    ]) {
      expect(url.searchParams.has(key)).toBe(false);
    }
  });
});
