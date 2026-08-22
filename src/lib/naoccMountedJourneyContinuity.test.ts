import { describe, expect, it } from 'vitest';

import { parseCalyxRouteContext } from '@/lib/calyxConversation';
import {
  ATLAS_WORKSPACE_ORIGIN,
  atlasWorkspaceCalyxHref,
  atlasWorkspaceResearchHref,
  atlasWorkspaceSpeciesHref,
} from '@/lib/featuredTaxonNavigation';
import { GENUS_PROFILE_ORIGIN, genusProfileAtlasHref } from '@/lib/genusProfileNavigation';
import { parseResearchRouteContext } from '@/lib/researchRouteContext';

const DEMO_GENUS = 'Phalaenopsis';

describe('NAOCC mounted genus journey continuity', () => {
  it('carries a Genus Profile subject into canonical Atlas without borrowing homepage provenance', () => {
    const href = genusProfileAtlasHref(DEMO_GENUS);
    const url = new URL(href, 'https://orchidcontinuum.org');

    expect(url.pathname).toBe('/atlas');
    expect(url.searchParams.get('genera')).toBe(DEMO_GENUS);
    expect(url.searchParams.get('origin')).toBe(GENUS_PROFILE_ORIGIN);
    expect(url.searchParams.get('context_is_evidence')).toBe('false');
    expect([...url.searchParams.keys()].sort()).toEqual([
      'context_is_evidence',
      'genera',
      'origin',
    ]);
  });

  it('keeps the Atlas genus when the demo continues into Species dossiers', () => {
    const href = atlasWorkspaceSpeciesHref(DEMO_GENUS);
    const url = new URL(href, 'https://orchidcontinuum.org');

    expect(url.pathname).toBe('/species');
    expect(url.searchParams.get('genus')).toBe(DEMO_GENUS);
    expect([...url.searchParams.keys()]).toEqual(['genus']);
  });

  it('keeps the Atlas genus when the demo continues into Research as non-evidentiary context', () => {
    const href = atlasWorkspaceResearchHref(DEMO_GENUS);
    const url = new URL(href, 'https://orchidcontinuum.org');
    const routeContext = parseResearchRouteContext(url.search);

    expect(url.pathname).toBe('/research');
    expect(routeContext).toEqual({
      origin: ATLAS_WORKSPACE_ORIGIN,
      genus: DEMO_GENUS,
      projectId: null,
      contextIsEvidence: false,
    });
    expect([...url.searchParams.keys()].sort()).toEqual([
      'context_is_evidence',
      'genus',
      'origin',
    ]);
  });

  it('keeps the same Atlas genus when the demo continues into Calyx', () => {
    const href = atlasWorkspaceCalyxHref(DEMO_GENUS);
    const url = new URL(href, 'https://orchidcontinuum.org');
    const routeContext = parseCalyxRouteContext(url.search);

    expect(url.pathname).toBe('/calyx');
    expect(routeContext).toEqual({
      origin: ATLAS_WORKSPACE_ORIGIN,
      featuredTaxon: { rank: 'genus', name: DEMO_GENUS },
      questionContext: null,
    });
  });

  it('does not let protected Atlas record material hitchhike across the mounted demo joins', () => {
    const urls = [
      genusProfileAtlasHref(DEMO_GENUS),
      atlasWorkspaceSpeciesHref(DEMO_GENUS),
      atlasWorkspaceResearchHref(DEMO_GENUS),
      atlasWorkspaceCalyxHref(DEMO_GENUS),
    ].map((href) => new URL(href, 'https://orchidcontinuum.org'));

    for (const url of urls) {
      for (const forbidden of [
        'lat',
        'lon',
        'latitude',
        'longitude',
        'locality',
        'occurrence_id',
        'occurrenceId',
        'record_id',
        'recordId',
        'collector',
        'catalogue',
        'catalogNumber',
        'confidence',
        'conclusion',
        'evidence',
      ]) {
        expect(url.searchParams.has(forbidden)).toBe(false);
      }
    }
  });
});
