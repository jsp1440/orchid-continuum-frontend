import { describe, expect, it } from 'vitest';

import {
  ATLAS_NEXT_RESEARCH_ORIGIN,
  atlasNextResearchHref,
} from '@/features/atlas-next/researchHandoff';
import { FEATURED_TAXON_ORIGIN, featuredTaxonResearchHref } from '@/lib/featuredTaxonNavigation';
import { parseResearchRouteContext } from '@/lib/researchRouteContext';

/** The query portion of a producer's href, as the router would hand it over. */
function searchOf(href: string | null): string {
  if (!href) throw new Error('handoff builder refused to produce an href');
  const index = href.indexOf('?');
  return index === -1 ? '' : href.slice(index);
}

describe('Research Center route context', () => {
  it('accepts bounded Atlas Next genus/project navigation context as non-evidentiary', () => {
    // Driven through the real builder so the two halves of the contract cannot
    // drift apart unnoticed.
    expect(parseResearchRouteContext(searchOf(atlasNextResearchHref({
      genus: 'Phalaenopsis',
      projectId: 'naocc-phalaenopsis',
    })))).toEqual({
      origin: ATLAS_NEXT_RESEARCH_ORIGIN,
      genus: 'Phalaenopsis',
      projectId: 'naocc-phalaenopsis',
      contextIsEvidence: false,
    });
  });

  it('retains the existing featured-taxon genus handoff as navigation context', () => {
    // Regression: this case previously hand-wrote `origin=featured-taxon`,
    // which no producer emits — the canonical value is `homepage-featured-taxon`.
    // The parser was never broken; the literal had drifted from the constant.
    expect(parseResearchRouteContext(searchOf(featuredTaxonResearchHref('Phalaenopsis')))).toEqual({
      origin: FEATURED_TAXON_ORIGIN,
      genus: 'Phalaenopsis',
      projectId: null,
      contextIsEvidence: false,
    });
  });

  it('requires the homepage featured genus to declare itself non-evidentiary', () => {
    const href = featuredTaxonResearchHref('Phalaenopsis');
    const params = new URLSearchParams(searchOf(href));
    expect(params.get('context_is_evidence')).toBe('false');

    expect(
      parseResearchRouteContext('?genus=Phalaenopsis&origin=homepage-featured-taxon'),
    ).toBeNull();
    expect(
      parseResearchRouteContext(
        '?genus=Phalaenopsis&origin=homepage-featured-taxon&context_is_evidence=true',
      ),
    ).toBeNull();
  });

  it('fails closed if Atlas attempts to assert evidentiary context', () => {
    expect(
      parseResearchRouteContext(
        '?genus=Phalaenopsis&origin=atlas-next&context_is_evidence=true&project=naocc-phalaenopsis',
      ),
    ).toBeNull();
    expect(parseResearchRouteContext('?genus=Phalaenopsis&origin=atlas-next')).toBeNull();
  });

  it('drops malformed project identity without dropping the safe genus context', () => {
    expect(
      parseResearchRouteContext(
        '?genus=Phalaenopsis&origin=atlas-next&context_is_evidence=false&project=project%3Flat%3D1%26lng%3D2',
      ),
    ).toEqual({
      origin: ATLAS_NEXT_RESEARCH_ORIGIN,
      genus: 'Phalaenopsis',
      projectId: null,
      contextIsEvidence: false,
    });
  });

  it('does not admit locality or occurrence material into the parsed context', () => {
    const parsed = parseResearchRouteContext(
      '?genus=Phalaenopsis&origin=atlas-next&context_is_evidence=false&project=naocc-phalaenopsis&lat=34.1&lng=-120.4&locality=secret&occurrence_id=123&collector=someone&elevation=400',
    );

    expect(parsed).toEqual({
      origin: ATLAS_NEXT_RESEARCH_ORIGIN,
      genus: 'Phalaenopsis',
      projectId: 'naocc-phalaenopsis',
      contextIsEvidence: false,
    });
    expect(Object.keys(parsed ?? {})).toEqual(['origin', 'genus', 'projectId', 'contextIsEvidence']);
  });

  it('rejects malformed genera and unknown origins', () => {
    expect(parseResearchRouteContext('?genus=Phalaenopsis%20amabilis&origin=atlas-next&context_is_evidence=false')).toBeNull();
    expect(parseResearchRouteContext('?genus=%3Cscript%3E&origin=atlas-next&context_is_evidence=false')).toBeNull();
    expect(parseResearchRouteContext('?genus=Phalaenopsis&origin=unknown')).toBeNull();
  });

  it('round-trips both governed origins, so neither can break the other', () => {
    // One test that fails if EITHER producer stops matching the parser. The
    // previous per-origin literals could each drift independently and silently.
    const featured = parseResearchRouteContext(searchOf(featuredTaxonResearchHref('Phalaenopsis')));
    const atlas = parseResearchRouteContext(
      searchOf(atlasNextResearchHref({ genus: 'Phalaenopsis', projectId: 'naocc-phalaenopsis' })),
    );

    expect(featured?.origin).toBe(FEATURED_TAXON_ORIGIN);
    expect(atlas?.origin).toBe(ATLAS_NEXT_RESEARCH_ORIGIN);

    // Distinct origins, one shared subject, and neither is evidence.
    expect(featured?.origin).not.toBe(atlas?.origin);
    expect(featured?.genus).toBe('Phalaenopsis');
    expect(atlas?.genus).toBe('Phalaenopsis');
    expect(featured?.contextIsEvidence).toBe(false);
    expect(atlas?.contextIsEvidence).toBe(false);
  });

  it('never lets a producer emit a locality channel', () => {
    // Asserted on the built hrefs themselves, not just the parsed result: the
    // parser ignoring a field is not the same as the contract never offering it.
    const hrefs = [
      featuredTaxonResearchHref('Phalaenopsis'),
      atlasNextResearchHref({ genus: 'Phalaenopsis', projectId: 'naocc-phalaenopsis' }),
    ];
    for (const href of hrefs) {
      const keys = [...new URLSearchParams(searchOf(href)).keys()];
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(['genus', 'origin', 'project', 'context_is_evidence']).toContain(key);
      }
    }
  });
});
