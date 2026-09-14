import { describe, expect, it } from 'vitest';

import {
  calyxNavigationContextIsExplicitlyNonEvidentiary,
  rejectsCalyxNavigationContext,
} from '@/lib/calyxRouteTrustBoundary';

const GOVERNED_ORIGINS = [
  'homepage-featured-taxon',
  'atlas-workspace',
  'genus-profile',
  'atlas-next',
];

describe('governed Calyx genus boundary', () => {
  it.each(GOVERNED_ORIGINS)('accepts one bounded canonical genus from %s', (origin) => {
    const search = `?genus=Phalaenopsis&origin=${origin}&context_is_evidence=false`;

    expect(rejectsCalyxNavigationContext(search)).toBe(false);
    expect(calyxNavigationContextIsExplicitlyNonEvidentiary(search)).toBe(true);
  });

  it.each([
    'phalaenopsis',
    'Phalaenopsis amabilis',
    '/species/Phalaenopsis',
    '34.42,-119.69',
    'Phalaenopsis%2Famabilis',
    'A'.repeat(121),
  ])('fails closed on malformed carried genus %s', (genus) => {
    const search = `?genus=${encodeURIComponent(genus)}&origin=homepage-featured-taxon&context_is_evidence=false`;

    expect(rejectsCalyxNavigationContext(search)).toBe(true);
    expect(calyxNavigationContextIsExplicitlyNonEvidentiary(search)).toBe(false);
  });

  it('fails closed when the non-evidence declaration is absent or promoted', () => {
    expect(
      rejectsCalyxNavigationContext('?genus=Phalaenopsis&origin=homepage-featured-taxon'),
    ).toBe(true);
    expect(
      rejectsCalyxNavigationContext(
        '?genus=Phalaenopsis&origin=homepage-featured-taxon&context_is_evidence=true',
      ),
    ).toBe(true);
  });

  it('does not apply the generic genus rule to unrelated dedicated origins', () => {
    // A canonical genus under a dedicated origin (research-station) is deferred
    // to that origin's own adapter, not rejected and not promoted by the generic
    // rule. (A malformed/lowercase genus is a separate concern and fails closed
    // regardless of origin; see the malformed-genus cases above.)
    expect(
      rejectsCalyxNavigationContext(
        '?genus=Phalaenopsis&origin=research-station&context_is_evidence=false',
      ),
    ).toBe(false);
  });
});
