import { describe, expect, it } from 'vitest';
import { parseCalyxRouteContext } from '@/lib/calyxConversation';
import {
  FEATURED_TAXON_ORIGIN,
  featuredTaxonAtlasHref,
  featuredTaxonCalyxHref,
} from '@/lib/featuredTaxonNavigation';

describe('featured taxon navigation contracts', () => {
  it('hands the featured genus to Atlas through the canonical genera filter', () => {
    const href = featuredTaxonAtlasHref('Vanilla');
    const url = new URL(href, 'https://orchidcontinuum.org');
    expect(url.pathname).toBe('/atlas');
    expect(url.searchParams.get('genera')).toBe('Vanilla');
  });

  it('produces Calyx route context that the canonical turn-context parser consumes', () => {
    const href = featuredTaxonCalyxHref('Vanilla');
    const url = new URL(href, 'https://orchidcontinuum.org');
    const parsed = parseCalyxRouteContext(url.search);

    expect(url.pathname).toBe('/calyx');
    expect(parsed.featuredTaxon).toEqual({ rank: 'genus', name: 'Vanilla' });
    expect(parsed.origin).toBe(FEATURED_TAXON_ORIGIN);
  });

  it('encodes taxon names rather than interpolating raw query syntax', () => {
    expect(featuredTaxonAtlasHref('Paphiopedilum')).toBe('/atlas?genera=Paphiopedilum');
    expect(featuredTaxonCalyxHref('Paphiopedilum')).toBe(
      `/calyx?genus=Paphiopedilum&origin=${FEATURED_TAXON_ORIGIN}`,
    );
  });

  it('fails closed when no featured genus is available', () => {
    expect(() => featuredTaxonAtlasHref('   ')).toThrow('Featured taxon genus is required');
    expect(() => featuredTaxonCalyxHref('')).toThrow('Featured taxon genus is required');
  });
});
