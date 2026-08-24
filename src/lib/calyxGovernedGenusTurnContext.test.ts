import { describe, expect, it } from 'vitest';

import { ATLAS_NEXT_CALYX_ORIGIN } from '@/features/atlas-next/researchHandoff';
import {
  governedCalyxGenusTurnContext,
} from '@/lib/calyxRouteTrustBoundary';
import {
  ATLAS_WORKSPACE_ORIGIN,
  FEATURED_TAXON_ORIGIN,
} from '@/lib/featuredTaxonNavigation';
import { GENUS_PROFILE_ORIGIN } from '@/lib/genusProfileNavigation';

const GOVERNED_ORIGINS = [
  FEATURED_TAXON_ORIGIN,
  ATLAS_WORKSPACE_ORIGIN,
  GENUS_PROFILE_ORIGIN,
  ATLAS_NEXT_CALYX_ORIGIN,
];

describe('governed Calyx genus turn context', () => {
  it.each(GOVERNED_ORIGINS)('resolves %s into one explicit non-evidence backend-turn envelope', (origin) => {
    expect(
      governedCalyxGenusTurnContext(
        `?genus=Phalaenopsis&origin=${origin}&context_is_evidence=false`,
      ),
    ).toEqual({
      origin,
      featured_taxon: {
        rank: 'genus',
        accepted_name: 'Phalaenopsis',
      },
      featured_taxon_is_evidence: false,
    });
  });

  it.each(GOVERNED_ORIGINS)('fails %s closed when its evidence declaration is missing or promoted', (origin) => {
    expect(governedCalyxGenusTurnContext(`?genus=Phalaenopsis&origin=${origin}`)).toBeNull();
    expect(
      governedCalyxGenusTurnContext(
        `?genus=Phalaenopsis&origin=${origin}&context_is_evidence=true`,
      ),
    ).toBeNull();
  });

  it.each([
    'phalaenopsis',
    'Phalaenopsis amabilis',
    '/genus/Phalaenopsis',
    '34.2,-120.4',
    'Phalaenopsis/secret',
    'P'.repeat(121),
  ])('fails malformed governed genus context closed: %s', (genus) => {
    expect(
      governedCalyxGenusTurnContext(
        `?genus=${encodeURIComponent(genus)}&origin=${FEATURED_TAXON_ORIGIN}&context_is_evidence=false`,
      ),
    ).toBeNull();
  });

  it('does not claim unrelated dedicated Calyx adapters', () => {
    expect(
      governedCalyxGenusTurnContext(
        '?genus=Phalaenopsis&origin=research-station&context_is_evidence=false',
      ),
    ).toBeUndefined();
    expect(
      governedCalyxGenusTurnContext(
        '?genus=Phalaenopsis&origin=atlas-next-occurrence-evidence',
      ),
    ).toBeUndefined();
  });

  it('never forwards unrelated route material into the governed turn envelope', () => {
    const context = governedCalyxGenusTurnContext(
      `?genus=Phalaenopsis&origin=${FEATURED_TAXON_ORIGIN}&context_is_evidence=false` +
        '&latitude=34.2&longitude=-120.4&locality=protected&occurrence_id=secret-1' +
        '&project=private&evidence=asserted&confidence=1&conclusion=secret',
    ) as Record<string, unknown>;

    expect(Object.keys(context).sort()).toEqual([
      'featured_taxon',
      'featured_taxon_is_evidence',
      'origin',
    ]);
    expect(context).not.toHaveProperty('latitude');
    expect(context).not.toHaveProperty('longitude');
    expect(context).not.toHaveProperty('locality');
    expect(context).not.toHaveProperty('occurrence_id');
    expect(context).not.toHaveProperty('project');
    expect(context).not.toHaveProperty('evidence');
    expect(context).not.toHaveProperty('confidence');
    expect(context).not.toHaveProperty('conclusion');
  });
});
