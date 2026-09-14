import { describe, expect, it } from 'vitest';

import { parseCalyxRouteContext } from '@/lib/calyxConversation';
import { rejectsCalyxNavigationContext } from '@/lib/calyxRouteTrustBoundary';
import {
  ATLAS_NEXT_CALYX_CONTEXT_IS_EVIDENCE,
  ATLAS_NEXT_CALYX_ORIGIN,
  ATLAS_NEXT_RESEARCH_CONTEXT_IS_EVIDENCE,
  ATLAS_NEXT_RESEARCH_ORIGIN,
  atlasNextCalyxHref,
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

  it('refuses the handoff outright when a supplied project identity is malformed', () => {
    // This used to drop the project and hand off the genus alone. Both
    // choices keep locality out of the route, which is what the assertion
    // below is for, but they differ on continuity: silently dropping the
    // project widens "this genus in this research project" into an unrelated
    // genus-only session, and the arriving reader cannot see that it happened.
    // Refusing says so instead of quietly changing which project they are in.
    expect(
      atlasNextResearchHref({
        genus: 'Phalaenopsis',
        projectId: 'project?lat=1&lng=2',
      }),
    ).toBeNull();
  });

  it('still hands off the genus when no project was supplied at all', () => {
    // Absent is not malformed. A grower arriving from a genus with no project
    // context has nothing to lose by continuing, so the stricter rule above
    // must not swallow the ordinary case.
    expect(atlasNextResearchHref({ genus: 'Phalaenopsis' }))
      .toBe('/research?genus=Phalaenopsis&origin=atlas-next&context_is_evidence=false');
    expect(atlasNextResearchHref({ genus: 'Phalaenopsis', projectId: null }))
      .toBe('/research?genus=Phalaenopsis&origin=atlas-next&context_is_evidence=false');
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

describe('Atlas Next → Calyx handoff', () => {
  it('carries only the active canonical genus as non-evidentiary navigation context', () => {
    const href = atlasNextCalyxHref({ genus: 'Phalaenopsis' });
    expect(href).toBe('/calyx?genus=Phalaenopsis&origin=atlas-next&context_is_evidence=false');

    const url = new URL(href!, 'https://orchidcontinuum.org');
    expect(Array.from(url.searchParams.keys()).sort()).toEqual([
      'context_is_evidence',
      'genus',
      'origin',
    ]);
    expect(url.searchParams.get('genus')).toBe('Phalaenopsis');
    expect(url.searchParams.get('origin')).toBe(ATLAS_NEXT_CALYX_ORIGIN);
    expect(url.searchParams.get('context_is_evidence')).toBe('false');
    expect(ATLAS_NEXT_CALYX_CONTEXT_IS_EVIDENCE).toBe(false);
  });

  it('round-trips through the Calyx receiver only with the explicit non-evidence declaration', () => {
    const href = atlasNextCalyxHref({ genus: 'Phalaenopsis' })!;
    const search = href.slice('/calyx'.length);

    expect(rejectsCalyxNavigationContext(search)).toBe(false);
    expect(parseCalyxRouteContext(search)).toEqual({
      origin: ATLAS_NEXT_CALYX_ORIGIN,
      featuredTaxon: { rank: 'genus', name: 'Phalaenopsis' },
      questionContext: null,
    });

    expect(
      rejectsCalyxNavigationContext('?genus=Phalaenopsis&origin=atlas-next'),
    ).toBe(true);
    expect(
      rejectsCalyxNavigationContext(
        '?genus=Phalaenopsis&origin=atlas-next&context_is_evidence=true',
      ),
    ).toBe(true);
  });

  it('fails closed for malformed or oversized genus context', () => {
    expect(atlasNextCalyxHref({ genus: '' })).toBeNull();
    expect(atlasNextCalyxHref({ genus: 'Phalaenopsis amabilis' })).toBeNull();
    expect(atlasNextCalyxHref({ genus: 'phalaenopsis' })).toBeNull();
    expect(atlasNextCalyxHref({ genus: 'Phalaenopsis?lat=34.1' })).toBeNull();
    expect(atlasNextCalyxHref({ genus: `P${'x'.repeat(120)}` })).toBeNull();
  });

  it('exposes no route channel for Atlas occurrence, locality, project, or evidence material', () => {
    const href = atlasNextCalyxHref({ genus: 'Phalaenopsis' }) ?? '';
    const parameters = Array.from(new URL(href, 'https://orchidcontinuum.org').searchParams.keys());

    // Parameter names, not substrings of the whole address. Searching the
    // address for 'evidence=' matches inside `context_is_evidence=false`,
    // which is the flag that marks this context as *not* evidence — the
    // opposite of the leak this test exists to catch.
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
      'project',
      'evidence',
      'confidence',
      'conclusion',
    ]) {
      expect(parameters).not.toContain(forbidden);
    }

    // And nothing beyond the three the handoff is allowed to carry, so a
    // parameter nobody thought to forbid cannot slip through either.
    expect(parameters.sort()).toEqual(['context_is_evidence', 'genus', 'origin']);
  });
});
