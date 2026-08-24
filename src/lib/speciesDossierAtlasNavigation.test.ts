import { describe, expect, it } from 'vitest';
import { speciesDossierAtlasHref } from './speciesDossierAtlasNavigation';

describe('speciesDossierAtlasHref', () => {
  it('preserves exactly one bounded canonical species identity', () => {
    const href = speciesDossierAtlasHref('Phalaenopsis amabilis');

    expect(href).toBe('/atlas?species=Phalaenopsis+amabilis');

    const url = new URL(href!, 'https://continuum.example');
    expect([...url.searchParams.keys()]).toEqual(['species']);
    expect(url.searchParams.get('species')).toBe('Phalaenopsis amabilis');
  });

  it.each([
    '',
    'Phalaenopsis',
    'phalaenopsis amabilis',
    'Phalaenopsis Amabilis',
    'Phalaenopsis amabilis extra',
    '/species/Phalaenopsis-amabilis',
    '35.2,-120.8',
    'Los Osos',
    'P. amabilis',
    'Phalaenopsis amabilis?lat=35.2',
    'Phalaenopsis amabilis#occurrence',
    'Phalaenopsis ' + 'a'.repeat(181),
    null,
    undefined,
  ])('fails closed for noncanonical or route-shaped species input: %s', (value) => {
    expect(speciesDossierAtlasHref(value)).toBeNull();
  });

  it('does not create channels for route ids, evidence, locality or occurrence material', () => {
    const href = speciesDossierAtlasHref('Phalaenopsis amabilis');
    const url = new URL(href!, 'https://continuum.example');

    for (const forbidden of [
      'taxonomy_id',
      'taxon_id',
      'origin',
      'context_is_evidence',
      'evidence',
      'confidence',
      'conclusion',
      'lat',
      'lng',
      'latitude',
      'longitude',
      'locality',
      'occurrence_id',
      'record_id',
      'collector',
      'catalogue_number',
    ]) {
      expect(url.searchParams.has(forbidden)).toBe(false);
    }
  });
});
