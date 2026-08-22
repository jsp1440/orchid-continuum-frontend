import { describe, expect, it } from 'vitest';
import {
  GENUS_PROFILE_ORIGIN,
  genusProfileAtlasHref,
  genusProfileCalyxHref,
} from '@/lib/genusProfileNavigation';

describe('Genus Profile navigation', () => {
  it('preserves the genus when continuing into Atlas', () => {
    const href = genusProfileAtlasHref('Phalaenopsis');
    const url = new URL(href, 'https://orchid-continuum.invalid');

    expect(url.pathname).toBe('/atlas');
    expect(url.searchParams.get('genera')).toBe('Phalaenopsis');
    expect(url.searchParams.get('origin')).toBe(GENUS_PROFILE_ORIGIN);
    expect(url.searchParams.get('context_is_evidence')).toBe('false');
  });

  it('preserves the genus when continuing directly into Calyx', () => {
    const href = genusProfileCalyxHref('Phalaenopsis');
    const url = new URL(href, 'https://orchid-continuum.invalid');

    expect(url.pathname).toBe('/calyx');
    expect(url.searchParams.get('genus')).toBe('Phalaenopsis');
    expect(url.searchParams.get('origin')).toBe(GENUS_PROFILE_ORIGIN);
    expect(url.searchParams.get('context_is_evidence')).toBe('false');
    expect([...url.searchParams.keys()].sort()).toEqual(
      ['context_is_evidence', 'genus', 'origin'].sort(),
    );
  });

  it('emits only bounded non-evidentiary Atlas navigation keys', () => {
    const url = new URL(genusProfileAtlasHref('Cattleya'), 'https://orchid-continuum.invalid');
    expect([...url.searchParams.keys()].sort()).toEqual(
      ['context_is_evidence', 'genera', 'origin'].sort(),
    );
  });

  it.each([
    '',
    'Phalaenopsis amabilis',
    'phalaenopsis',
    'Phalaenopsis?lat=1',
    '<script>',
  ])('fails closed on malformed genus %j', (genus) => {
    expect(() => genusProfileAtlasHref(genus)).toThrow();
    expect(() => genusProfileCalyxHref(genus)).toThrow();
  });
});
