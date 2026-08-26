import { describe, expect, it } from 'vitest';
import { parseCalyxRouteContext } from '@/lib/calyxConversation';
import {
  FEATURED_TAXON_ORIGIN,
  atlasWorkspaceCalyxHref,
  atlasWorkspaceResearchHref,
  atlasWorkspaceSpeciesHref,
  featuredTaxonAtlasHref,
  featuredTaxonCalyxHref,
  featuredTaxonResearchHref,
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
    expect(url.searchParams.get('context_is_evidence')).toBe('false');
  });

  it('encodes taxon names and marks the handoff explicitly non-evidentiary', () => {
    expect(featuredTaxonAtlasHref('Paphiopedilum')).toBe('/atlas?genera=Paphiopedilum');
    expect(featuredTaxonCalyxHref('Paphiopedilum')).toBe(
      `/calyx?genus=Paphiopedilum&origin=${FEATURED_TAXON_ORIGIN}&context_is_evidence=false`,
    );
  });

  it('never emits locality or record-level evidence channels into Calyx', () => {
    const url = new URL(featuredTaxonCalyxHref('Vanilla'), 'https://orchidcontinuum.org');
    const keys = [...url.searchParams.keys()];

    expect(keys).toEqual(['genus', 'origin', 'context_is_evidence']);
    expect(keys).not.toContain('lat');
    expect(keys).not.toContain('lng');
    expect(keys).not.toContain('locality');
    expect(keys).not.toContain('occurrence_id');
    expect(keys).not.toContain('collector');
    expect(keys).not.toContain('catalogue_number');
  });

  it('fails closed when no featured genus is available', () => {
    expect(() => featuredTaxonAtlasHref('   ')).toThrow('Featured taxon genus is required');
    expect(() => featuredTaxonCalyxHref('')).toThrow('Featured taxon genus is required');
  });

  it('accepts only a bounded canonical genus across homepage and Atlas handoffs', () => {
    const handoffs = [
      featuredTaxonAtlasHref,
      featuredTaxonCalyxHref,
      featuredTaxonResearchHref,
      atlasWorkspaceCalyxHref,
      atlasWorkspaceResearchHref,
      atlasWorkspaceSpeciesHref,
    ];

    for (const handoff of handoffs) {
      expect(() => handoff('Phalaenopsis amabilis')).toThrow('bounded canonical genus');
      expect(() => handoff('phalaenopsis')).toThrow('bounded canonical genus');
      expect(() => handoff('Phalaenopsis?locality=hidden')).toThrow('bounded canonical genus');
      expect(() => handoff(`A${'a'.repeat(120)}`)).toThrow('bounded canonical genus');
      expect(() => handoff(null as unknown as string)).toThrow('bounded canonical genus');
    }
  });
});
