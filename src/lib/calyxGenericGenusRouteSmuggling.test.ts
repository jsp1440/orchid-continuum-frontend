import { describe, expect, it } from 'vitest';

import {
  governedCalyxGenusTurnContext,
  rejectsCalyxNavigationContext,
} from '@/lib/calyxRouteTrustBoundary';

const BASE =
  '?genus=Phalaenopsis&origin=relationship-matrix&context_is_evidence=false';

describe('governed Calyx generic-genus route boundary', () => {
  it('accepts the bounded relationship-matrix identity-only handoff', () => {
    expect(governedCalyxGenusTurnContext(BASE)).toEqual({
      origin: 'relationship-matrix',
      featured_taxon: {
        rank: 'genus',
        accepted_name: 'Phalaenopsis',
      },
      featured_taxon_is_evidence: false,
    });
    expect(rejectsCalyxNavigationContext(BASE)).toBe(false);
  });

  it.each([
    'latitude=-12.4',
    'longitude=-77.1',
    'locality=protected-site',
    'occurrence_id=secret-1',
    'state=present',
    'evidence=matrix-cell',
    'confidence=0.95',
    'conclusion=supported',
    'citation=doi%3A10.1000%2Fexample',
    'provenance=canonical-source',
  ])('fails closed when generic genus context carries %s', (parameter) => {
    const search = `${BASE}&${parameter}`;
    expect(governedCalyxGenusTurnContext(search)).toBeNull();
    expect(rejectsCalyxNavigationContext(search)).toBe(true);
  });

  it('fails closed even when a forbidden evidence-shaped key has an empty value', () => {
    const search = `${BASE}&evidence=`;
    expect(governedCalyxGenusTurnContext(search)).toBeNull();
    expect(rejectsCalyxNavigationContext(search)).toBe(true);
  });
});
