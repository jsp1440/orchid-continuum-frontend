import { describe, expect, it } from 'vitest';
import { normalizeFeaturedTaxonGenus } from './featuredTaxonContinuum';

describe('featured taxon canonical read boundary', () => {
  it('accepts the canonical Genus of the Day subject', () => {
    expect(normalizeFeaturedTaxonGenus(' Phalaenopsis ')).toBe('Phalaenopsis');
  });

  it.each([
    '',
    'phalaenopsis',
    'Phalaenopsis amabilis',
    '/species/Phalaenopsis',
    'Phalaenopsis?lat=34.1',
    '34.1,-120.7',
    'Phalaenopsis<script>',
  ])('fails closed for non-genus route or subject material: %s', (value) => {
    expect(() => normalizeFeaturedTaxonGenus(value)).toThrow(
      'A bounded canonical featured-taxon genus is required',
    );
  });

  it('fails closed on unexpected runtime values instead of leaking a trim error', () => {
    expect(() => normalizeFeaturedTaxonGenus(null)).toThrow(
      'A bounded canonical featured-taxon genus is required',
    );
  });

  it('rejects overlong genus-shaped values', () => {
    expect(() => normalizeFeaturedTaxonGenus(`A${'a'.repeat(120)}`)).toThrow(
      'A bounded canonical featured-taxon genus is required',
    );
  });
});
