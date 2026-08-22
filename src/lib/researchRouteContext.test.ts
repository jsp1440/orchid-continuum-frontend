import { describe, expect, it } from 'vitest';

import { ATLAS_NEXT_RESEARCH_ORIGIN } from '@/features/atlas-next/researchHandoff';
import { FEATURED_TAXON_ORIGIN } from '@/lib/featuredTaxonNavigation';
import { parseResearchRouteContext } from '@/lib/researchRouteContext';

describe('Research Center route context', () => {
  it('accepts bounded Atlas Next genus/project navigation context as non-evidentiary', () => {
    expect(
      parseResearchRouteContext(
        '?genus=Phalaenopsis&origin=atlas-next&context_is_evidence=false&project=naocc-phalaenopsis',
      ),
    ).toEqual({
      origin: ATLAS_NEXT_RESEARCH_ORIGIN,
      genus: 'Phalaenopsis',
      projectId: 'naocc-phalaenopsis',
      contextIsEvidence: false,
    });
  });

  it('retains the existing featured-taxon genus handoff as navigation context', () => {
    expect(parseResearchRouteContext('?genus=Phalaenopsis&origin=featured-taxon')).toEqual({
      origin: FEATURED_TAXON_ORIGIN,
      genus: 'Phalaenopsis',
      projectId: null,
      contextIsEvidence: false,
    });
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
});
