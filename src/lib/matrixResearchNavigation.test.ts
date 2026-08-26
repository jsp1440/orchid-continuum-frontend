import { describe, expect, it } from 'vitest';

import { matrixResearchHref, parseMatrixResearchContext } from '@/lib/matrixResearchNavigation';
import { parseResearchRouteContext } from '@/lib/researchRouteContext';

describe('Matrix → Research navigation boundary', () => {
  it('round-trips Phalaenopsis amabilis as non-evidentiary, non-identification context', () => {
    const href = matrixResearchHref('Phalaenopsis amabilis');
    expect(href).not.toBeNull();

    const search = new URL(href!, 'https://orchidcontinuum.org').search;
    expect(parseMatrixResearchContext(search)).toEqual({
      origin: 'matrix-identification',
      genus: 'Phalaenopsis',
      taxon: 'Phalaenopsis amabilis',
      contextIsEvidence: false,
      contextIsIdentification: false,
    });
    expect(parseResearchRouteContext(search)).toEqual({
      origin: 'matrix-identification',
      genus: 'Phalaenopsis',
      taxon: 'Phalaenopsis amabilis',
      projectId: null,
      contextIsEvidence: false,
      contextIsIdentification: false,
    });
  });

  it('fails closed if route material tries to promote the candidate to evidence or identification', () => {
    const base = new URL(matrixResearchHref('Phalaenopsis amabilis')!, 'https://orchidcontinuum.org');

    base.searchParams.set('context_is_evidence', 'true');
    expect(parseResearchRouteContext(base.search)).toBeNull();

    base.searchParams.set('context_is_evidence', 'false');
    base.searchParams.set('context_is_identification', 'true');
    expect(parseResearchRouteContext(base.search)).toBeNull();
  });

  it('does not ingest hostile locality, coordinates, occurrence/catalogue, elevation, GPS, grid, or site material', () => {
    const url = new URL(matrixResearchHref('Phalaenopsis amabilis')!, 'https://orchidcontinuum.org');
    url.searchParams.set('latitude', '14.5995');
    url.searchParams.set('longitude', '120.9842');
    url.searchParams.set('locality', 'private limestone ravine');
    url.searchParams.set('occurrenceID', 'GBIF:SECRET-991');
    url.searchParams.set('catalogNumber', 'PH-AMAB-PRIVATE');
    url.searchParams.set('elevation', '1842');
    url.searchParams.set('gps', '11Q 0448000 3812000');
    url.searchParams.set('grid', 'sensitive-grid-7');
    url.searchParams.set('site', 'restricted-site');

    const context = parseResearchRouteContext(url.search);
    const serialized = JSON.stringify(context);
    for (const protectedValue of [
      '14.5995',
      '120.9842',
      'private limestone ravine',
      'GBIF:SECRET-991',
      'PH-AMAB-PRIVATE',
      '1842',
      '11Q 0448000 3812000',
      'sensitive-grid-7',
      'restricted-site',
    ]) {
      expect(serialized).not.toContain(protectedValue);
    }
  });

  it('rejects malformed or mismatched taxon/genus identity', () => {
    expect(matrixResearchHref('not a governed taxon <script>')).toBeNull();

    const url = new URL(matrixResearchHref('Phalaenopsis amabilis')!, 'https://orchidcontinuum.org');
    url.searchParams.set('genus', 'Paphiopedilum');
    expect(parseResearchRouteContext(url.search)).toBeNull();
  });
});
