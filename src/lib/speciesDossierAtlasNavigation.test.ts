import { describe, expect, it } from 'vitest';
import {
  speciesDossierAtlasHref,
  speciesDossierAtlasHrefFromIdentity,
} from './speciesDossierAtlasNavigation';

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

describe('speciesDossierAtlasHrefFromIdentity', () => {
  it('uses the dossier accepted name before lower-priority identity fields', () => {
    expect(
      speciesDossierAtlasHrefFromIdentity({
        acceptedName: 'Phalaenopsis amabilis',
        canonicalName: 'Phalaenopsis aphrodite',
      }),
    ).toBe('/atlas?species=Phalaenopsis+amabilis');
  });

  it('uses the next identity source only when higher-priority identity is absent', () => {
    expect(
      speciesDossierAtlasHrefFromIdentity({
        acceptedName: null,
        fullScientificName: undefined,
        canonicalName: 'Phalaenopsis amabilis',
      }),
    ).toBe('/atlas?species=Phalaenopsis+amabilis');
  });

  it('fails closed when the first supplied identity is malformed instead of skipping to a different taxon', () => {
    expect(
      speciesDossierAtlasHrefFromIdentity({
        acceptedName: '/species/opaque-route-id',
        canonicalName: 'Phalaenopsis amabilis',
      }),
    ).toBeNull();
  });

  it('never invents an Atlas subject when canonical identity is unavailable', () => {
    expect(speciesDossierAtlasHrefFromIdentity({})).toBeNull();
    expect(
      speciesDossierAtlasHrefFromIdentity({
        acceptedName: null,
        fullScientificName: null,
        canonicalName: null,
        scientificName: null,
      }),
    ).toBeNull();
  });
});
