import { describe, expect, it } from 'vitest';
import { featuredTaxonAtlasNextHref } from '@/lib/featuredTaxonNavigation';
import { resolveAtlasNextIncomingGenus } from '@/features/atlas-next/incomingGenus';
import { atlasNextResearchHref, ATLAS_NEXT_RESEARCH_ORIGIN } from '@/features/atlas-next/researchHandoff';
import { parseResearchRouteContext } from '@/lib/researchRouteContext';

const GENUS = 'Phalaenopsis';

function queryOf(href: string): URLSearchParams {
  const index = href.indexOf('?');
  return new URLSearchParams(index === -1 ? '' : href.slice(index + 1));
}

describe('Genus of the Day → Atlas Next → Research continuity', () => {
  it('preserves the exact genus across producer, Atlas Next hydration, and Research receiver', () => {
    const atlasHref = featuredTaxonAtlasNextHref(GENUS);
    expect(atlasHref).toBe('/atlas-next?genera=Phalaenopsis');

    const incoming = queryOf(atlasHref).getAll('genera');
    const activeGenus = resolveAtlasNextIncomingGenus(incoming);
    expect(activeGenus).toBe(GENUS);

    const researchHref = atlasNextResearchHref({ genus: activeGenus! });
    expect(researchHref).toBe(
      '/research?genus=Phalaenopsis&origin=atlas-next&context_is_evidence=false',
    );

    const received = parseResearchRouteContext(queryOf(researchHref!));
    expect(received).toEqual({
      origin: ATLAS_NEXT_RESEARCH_ORIGIN,
      genus: GENUS,
      projectId: null,
      contextIsEvidence: false,
    });
  });

  it('does not silently select a subject from multi-genus or malformed Atlas context', () => {
    expect(resolveAtlasNextIncomingGenus(['Phalaenopsis', 'Cattleya'])).toBeNull();
    expect(resolveAtlasNextIncomingGenus(['Phalaenopsis amabilis'])).toBeNull();
    expect(resolveAtlasNextIncomingGenus(['phalaenopsis'])).toBeNull();
  });

  it('keeps locality, occurrence, evidence, and conclusion material out of both route boundaries', () => {
    const atlasKeys = [...queryOf(featuredTaxonAtlasNextHref(GENUS)).keys()];
    expect(atlasKeys).toEqual(['genera']);

    const researchKeys = [
      ...queryOf(atlasNextResearchHref({ genus: GENUS })!).keys(),
    ];
    expect(researchKeys).toEqual(['genus', 'origin', 'context_is_evidence']);

    for (const forbidden of [
      'locality',
      'lat',
      'lon',
      'coordinates',
      'occurrence',
      'occurrence_id',
      'record_id',
      'evidence',
      'confidence',
      'conclusion',
    ]) {
      expect(atlasKeys).not.toContain(forbidden);
      expect(researchKeys).not.toContain(forbidden);
    }
  });
});
