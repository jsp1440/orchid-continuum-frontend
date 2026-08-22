import { describe, expect, it } from 'vitest';

import {
  SPECIES_DOSSIER_CALYX_ORIGIN,
  speciesDossierCalyxHref,
} from '@/lib/speciesDossierCalyxNavigation';

describe('Species Dossier → Calyx navigation', () => {
  it('carries exact species identity as explicitly non-evidentiary navigation context', () => {
    const href = speciesDossierCalyxHref({
      genus: 'Phalaenopsis',
      taxon: 'Phalaenopsis amabilis',
    });

    expect(href).not.toBeNull();
    const url = new URL(href!, 'https://orchidcontinuum.org');
    expect(url.pathname).toBe('/calyx');
    expect(url.searchParams.get('genus')).toBe('Phalaenopsis');
    expect(url.searchParams.get('taxon')).toBe('Phalaenopsis amabilis');
    expect(url.searchParams.get('origin')).toBe(SPECIES_DOSSIER_CALYX_ORIGIN);
    expect(url.searchParams.get('context_is_evidence')).toBe('false');
  });

  it('exposes only the bounded subject-context keys', () => {
    const href = speciesDossierCalyxHref({
      genus: 'Phalaenopsis',
      taxon: 'Phalaenopsis amabilis',
    });
    const url = new URL(href!, 'https://orchidcontinuum.org');

    expect([...url.searchParams.keys()].sort()).toEqual(
      ['context_is_evidence', 'genus', 'origin', 'taxon'].sort(),
    );
    for (const forbidden of [
      'lat',
      'lng',
      'latitude',
      'longitude',
      'locality',
      'occurrence_id',
      'collector',
      'catalogue_number',
      'site',
      'grid',
      'gps',
      'elevation',
      'evidence',
      'confidence',
    ]) {
      expect(url.searchParams.has(forbidden)).toBe(false);
    }
  });

  it('fails closed on malformed or mismatched species identity', () => {
    expect(
      speciesDossierCalyxHref({ genus: 'Phalaenopsis', taxon: 'Cattleya labiata' }),
    ).toBeNull();
    expect(
      speciesDossierCalyxHref({ genus: 'Phalaenopsis', taxon: '<script>' }),
    ).toBeNull();
    expect(
      speciesDossierCalyxHref({ genus: 'Phalaenopsis amabilis', taxon: 'Phalaenopsis amabilis' }),
    ).toBeNull();
    expect(speciesDossierCalyxHref({ genus: 'Phalaenopsis', taxon: null })).toBeNull();
  });
});
