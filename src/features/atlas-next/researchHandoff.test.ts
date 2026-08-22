import { describe, expect, it } from 'vitest';

import {
  ATLAS_NEXT_RESEARCH_CONTEXT_IS_EVIDENCE,
  ATLAS_NEXT_RESEARCH_ORIGIN,
  atlasNextResearchHref,
} from './researchHandoff';

describe('Atlas Next → Research Center handoff', () => {
  it('carries only canonical genus and optional project identity', () => {
    const href = atlasNextResearchHref({
      genus: 'Phalaenopsis',
      projectId: 'naocc-phalaenopsis',
    });
    expect(href).toBe(
      '/research?genus=Phalaenopsis&origin=atlas-next&context_is_evidence=false&project=naocc-phalaenopsis',
    );

    const url = new URL(href!, 'https://orchidcontinuum.org');
    expect(url.searchParams.get('genus')).toBe('Phalaenopsis');
    expect(url.searchParams.get('project')).toBe('naocc-phalaenopsis');
    expect(url.searchParams.get('origin')).toBe(ATLAS_NEXT_RESEARCH_ORIGIN);
    expect(url.searchParams.get('context_is_evidence')).toBe('false');
    expect(ATLAS_NEXT_RESEARCH_CONTEXT_IS_EVIDENCE).toBe(false);
  });

  it('keeps the handoff explicitly non-evidentiary even without a project', () => {
    expect(atlasNextResearchHref({ genus: 'Phalaenopsis' })).toBe(
      '/research?genus=Phalaenopsis&origin=atlas-next&context_is_evidence=false',
    );
  });

  it('fails closed for malformed or oversized taxon context', () => {
    expect(atlasNextResearchHref({ genus: '' })).toBeNull();
    expect(atlasNextResearchHref({ genus: 'Phalaenopsis amabilis' })).toBeNull();
    expect(atlasNextResearchHref({ genus: '<script>' })).toBeNull();
    expect(atlasNextResearchHref({ genus: `P${'x'.repeat(120)}` })).toBeNull();
  });

  it('drops malformed project identity rather than forwarding arbitrary route material', () => {
    expect(
      atlasNextResearchHref({
        genus: 'Phalaenopsis',
        projectId: 'project?lat=1&lng=2',
      }),
    ).toBe('/research?genus=Phalaenopsis&origin=atlas-next&context_is_evidence=false');
  });

  it('has no route channel for locality, occurrence, collector, or elevation data', () => {
    const href = atlasNextResearchHref({
      genus: 'Phalaenopsis',
      projectId: 'naocc-phalaenopsis',
    }) ?? '';

    for (const forbidden of [
      'lat',
      'lng',
      'latitude',
      'longitude',
      'locality',
      'location',
      'occurrence',
      'record',
      'collector',
      'catalog',
      'site',
      'grid',
      'gps',
      'elevation',
    ]) {
      expect(href.toLowerCase()).not.toContain(`${forbidden}=`);
    }
  });
});
