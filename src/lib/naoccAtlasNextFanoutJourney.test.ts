import { describe, expect, it } from 'vitest';

import { resolveAtlasNextIncomingGenus } from '@/features/atlas-next/incomingGenus';
import { atlasNextContinuumActions } from '@/features/atlas-next/researchHandoff';
import { parseCalyxRouteContext } from '@/lib/calyxConversation';
import { featuredTaxonAtlasNextHref } from '@/lib/featuredTaxonNavigation';
import { parseResearchRouteContext } from '@/lib/researchRouteContext';

const DEMO_GENUS = 'Phalaenopsis';
const FORBIDDEN_ROUTE_KEYS = [
  'lat',
  'lon',
  'lng',
  'locality',
  'occurrence_id',
  'occurrenceId',
  'record_id',
  'recordId',
  'collector',
  'catalogue',
  'catalogNumber',
  'evidence',
  'confidence',
  'conclusion',
];

describe('NAOCC Genus of the Day → Atlas Next → Research/Calyx/Species fan-out', () => {
  it('preserves one canonical featured genus through Atlas Next into all governed receivers', () => {
    const atlasUrl = new URL(
      featuredTaxonAtlasNextHref(DEMO_GENUS),
      'https://orchidcontinuum.org',
    );

    expect(atlasUrl.pathname).toBe('/atlas-next');
    expect(atlasUrl.searchParams.getAll('genera')).toEqual([DEMO_GENUS]);

    const incomingGenus = resolveAtlasNextIncomingGenus(atlasUrl.searchParams.getAll('genera'));
    expect(incomingGenus).toBe(DEMO_GENUS);

    const actions = atlasNextContinuumActions({ genus: incomingGenus as string });
    expect(actions.map((action) => action.id)).toEqual(['research', 'calyx', 'species']);

    const researchAction = actions.find((action) => action.id === 'research');
    const calyxAction = actions.find((action) => action.id === 'calyx');
    const speciesAction = actions.find((action) => action.id === 'species');
    expect(researchAction).toBeDefined();
    expect(calyxAction).toBeDefined();
    expect(speciesAction).toBeDefined();

    const researchUrl = new URL(researchAction!.href, 'https://orchidcontinuum.org');
    expect(parseResearchRouteContext(researchUrl.search)).toEqual({
      origin: 'atlas-next',
      genus: DEMO_GENUS,
      projectId: null,
      contextIsEvidence: false,
    });

    const calyxUrl = new URL(calyxAction!.href, 'https://orchidcontinuum.org');
    expect(parseCalyxRouteContext(calyxUrl.search)).toEqual({
      origin: 'atlas-next',
      featuredTaxon: { rank: 'genus', name: DEMO_GENUS },
      questionContext: null,
    });

    const speciesUrl = new URL(speciesAction!.href, 'https://orchidcontinuum.org');
    expect(speciesUrl.pathname).toBe('/species');
    expect([...speciesUrl.searchParams.keys()]).toEqual(['genus']);
    expect(speciesUrl.searchParams.get('genus')).toBe(DEMO_GENUS);

    expect(researchUrl.searchParams.get('context_is_evidence')).toBe('false');
    expect(calyxUrl.searchParams.get('context_is_evidence')).toBe('false');
    expect(calyxUrl.searchParams.has('project')).toBe(false);
    expect(speciesUrl.searchParams.has('project')).toBe(false);

    for (const key of FORBIDDEN_ROUTE_KEYS) {
      expect(researchUrl.searchParams.has(key), `Research must not receive ${key}`).toBe(false);
      expect(calyxUrl.searchParams.has(key), `Calyx must not receive ${key}`).toBe(false);
      expect(speciesUrl.searchParams.has(key), `Species must not receive ${key}`).toBe(false);
    }
  });

  it('does not choose a genus from ambiguous or malformed incoming Atlas context', () => {
    expect(resolveAtlasNextIncomingGenus(['Phalaenopsis', 'Laelia'])).toBeNull();
    expect(resolveAtlasNextIncomingGenus(['Phalaenopsis amabilis'])).toBeNull();
    expect(resolveAtlasNextIncomingGenus(['phalaenopsis'])).toBeNull();
    expect(resolveAtlasNextIncomingGenus([])).toBeNull();

    expect(atlasNextContinuumActions({ genus: 'Phalaenopsis amabilis' })).toEqual([]);
    expect(atlasNextContinuumActions({ genus: 'phalaenopsis' })).toEqual([]);
  });
});
