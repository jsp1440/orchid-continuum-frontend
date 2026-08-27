import { describe, expect, it } from 'vitest';

import { buildCalyxTurnContext } from '@/lib/calyxConversation';
import {
  atlasWorkspaceMatrixHref,
  featuredTaxonAtlasHref,
  relationshipMatrixCalyxHref,
} from '@/lib/featuredTaxonNavigation';

const FORBIDDEN_ROUTE_KEYS = [
  'latitude',
  'longitude',
  'locality',
  'occurrence_id',
  'record_id',
  'project_id',
  'state',
  'evidence',
  'confidence',
  'conclusion',
  'citation',
  'provenance',
] as const;

function routeParams(href: string): URLSearchParams {
  return new URL(href, 'https://orchidcontinuum.org').searchParams;
}

function expectNoScientificStateInRoute(href: string): void {
  const params = routeParams(href);
  for (const key of FORBIDDEN_ROUTE_KEYS) {
    expect(params.has(key), `${href} must not carry ${key}`).toBe(false);
  }
}

describe('Canonical Continuum genus demo continuity', () => {
  it('keeps one canonical genus across Homepage → Atlas → Matrix → Calyx without promoting navigation context to evidence', () => {
    const genus = 'Phalaenopsis';

    const atlasHref = featuredTaxonAtlasHref(genus);
    expect(atlasHref).toBe('/atlas?genera=Phalaenopsis');
    expect(routeParams(atlasHref).get('genera')).toBe(genus);

    const matrixHref = atlasWorkspaceMatrixHref(genus);
    expect(matrixHref).toBe('/relationship-matrix?genus=Phalaenopsis');
    expect(routeParams(matrixHref).get('genus')).toBe(genus);

    const calyxHref = relationshipMatrixCalyxHref(genus);
    expect(calyxHref).toBe(
      '/calyx?genus=Phalaenopsis&origin=relationship-matrix&context_is_evidence=false',
    );

    for (const href of [atlasHref, matrixHref, calyxHref]) {
      expectNoScientificStateInRoute(href);
    }

    const calyxTurn = buildCalyxTurnContext({
      projectId: 'continuum-demo',
      uploadedFiles: [],
      routeSearch: new URL(calyxHref, 'https://orchidcontinuum.org').search,
    });

    expect(calyxTurn.route_context).toEqual({
      origin: 'relationship-matrix',
      featured_taxon: {
        rank: 'genus',
        accepted_name: genus,
      },
      featured_taxon_is_evidence: false,
    });
  });

  it.each([
    'phalaenopsis',
    'Phalaenopsis amabilis',
    'Phalaenopsis?latitude=-12.4',
    'Phalaenopsis/locality',
    '',
  ])('fails the canonical demo journey closed for malformed genus %j', (genus) => {
    expect(() => featuredTaxonAtlasHref(genus)).toThrow();
    expect(() => atlasWorkspaceMatrixHref(genus)).toThrow();
    expect(() => relationshipMatrixCalyxHref(genus)).toThrow();
  });

  it('rejects a Matrix → Calyx arrival if scientific/locality state is appended to the governed route', () => {
    const legitimate = relationshipMatrixCalyxHref('Phalaenopsis');
    const poisoned = `${legitimate}&provenance=matrix-cell&confidence=0.98&locality=protected`;

    const calyxTurn = buildCalyxTurnContext({
      projectId: 'continuum-demo',
      uploadedFiles: [],
      routeSearch: new URL(poisoned, 'https://orchidcontinuum.org').search,
    });

    expect(calyxTurn).not.toHaveProperty('route_context');
  });
});
