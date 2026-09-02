import { describe, expect, it } from 'vitest';

import {
  calyxNavigationContextIsExplicitlyNonEvidentiary,
  governedCalyxGenusTurnContext,
  rejectsCalyxNavigationContext,
} from '@/lib/calyxRouteTrustBoundary';
import { relationshipMatrixCalyxHref } from '@/lib/featuredTaxonNavigation';

describe('Relationship Matrix → Calyx trust boundary', () => {
  it('accepts only the producer-authenticated canonical genus handoff', () => {
    const href = relationshipMatrixCalyxHref('Phalaenopsis');
    const search = new URL(href, 'https://orchidcontinuum.org').search;

    expect(governedCalyxGenusTurnContext(search)).toEqual({
      origin: 'relationship-matrix',
      featured_taxon: {
        rank: 'genus',
        accepted_name: 'Phalaenopsis',
      },
      featured_taxon_is_evidence: false,
    });
    expect(calyxNavigationContextIsExplicitlyNonEvidentiary(search)).toBe(true);
    expect(rejectsCalyxNavigationContext(search)).toBe(false);
  });

  it.each([
    '?genus=Phalaenopsis&origin=relationship-matrix',
    '?genus=Phalaenopsis&origin=relationship-matrix&context_is_evidence=true',
    '?genus=phalaenopsis&origin=relationship-matrix&context_is_evidence=false',
    '?genus=Phalaenopsis%20aphrodite&origin=relationship-matrix&context_is_evidence=false',
    '?origin=relationship-matrix&context_is_evidence=false',
  ])('fails closed for malformed Matrix context: %s', (search) => {
    expect(governedCalyxGenusTurnContext(search)).toBeNull();
    expect(calyxNavigationContextIsExplicitlyNonEvidentiary(search)).toBe(false);
    expect(rejectsCalyxNavigationContext(search)).toBe(true);
  });

  it('fails closed when Matrix evidence-shaped query parameters are smuggled into the governed genus context', () => {
    const search =
      '?genus=Phalaenopsis&origin=relationship-matrix&context_is_evidence=false' +
      '&state=present&confidence=0.98&citation=secret&latitude=-12.4&longitude=-77.1&locality=protected';

    // Evidence-, confidence-, and locality-shaped keys are rejected outright
    // rather than silently stripped, so a producer regression or crafted URL
    // cannot promote Matrix scientific state into a Calyx genus turn. This
    // mirrors the dedicated smuggling matrix in
    // calyxGenericGenusRouteSmuggling.test.ts.
    expect(governedCalyxGenusTurnContext(search)).toBeNull();
    expect(calyxNavigationContextIsExplicitlyNonEvidentiary(search)).toBe(false);
    expect(rejectsCalyxNavigationContext(search)).toBe(true);
  });
});
