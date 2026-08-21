import { describe, expect, it } from 'vitest';

import {
  RESEARCH_STATION_ORIGIN,
  researchStationAtlasHref,
} from '@/lib/researchStationNavigation';

describe('Research Station → mounted Atlas taxon rank continuity', () => {
  it('uses the canonical genus filter for an unambiguous genus subject', () => {
    const url = new URL(
      researchStationAtlasHref({ taxon: 'Vanda', projectId: 'proj-1' }),
      'https://orchid.test',
    );

    expect(url.pathname).toBe('/atlas');
    expect(url.searchParams.get('genera')).toBe('Vanda');
    expect(url.searchParams.has('species')).toBe(false);
    expect(url.searchParams.has('taxon')).toBe(false);
    expect(url.searchParams.get('project')).toBe('proj-1');
    expect(url.searchParams.get('origin')).toBe(RESEARCH_STATION_ORIGIN);
  });

  it('uses the canonical species filter for an unambiguous binomial subject', () => {
    const url = new URL(
      researchStationAtlasHref({ taxon: 'Phalaenopsis amabilis', projectId: 'proj-1' }),
      'https://orchid.test',
    );

    expect(url.pathname).toBe('/atlas');
    expect(url.searchParams.get('species')).toBe('Phalaenopsis amabilis');
    expect(url.searchParams.has('genera')).toBe(false);
    expect(url.searchParams.has('taxon')).toBe(false);
  });

  it('does not promote an opaque or rank-ambiguous taxon id into a genus claim', () => {
    const url = new URL(
      researchStationAtlasHref({ taxon: 'taxon-12345', projectId: 'proj-1' }),
      'https://orchid.test',
    );

    expect(url.searchParams.get('taxon')).toBe('taxon-12345');
    expect(url.searchParams.has('genera')).toBe(false);
    expect(url.searchParams.has('species')).toBe(false);
  });
});
