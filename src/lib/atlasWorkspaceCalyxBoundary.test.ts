import { describe, expect, it } from 'vitest';

import { parseCalyxRouteContext } from '@/lib/calyxConversation';
import {
  ATLAS_WORKSPACE_ORIGIN,
  atlasWorkspaceCalyxHref,
} from '@/lib/featuredTaxonNavigation';

describe('Atlas workspace → Calyx evidence boundary', () => {
  it('carries only the active genus as explicitly non-evidentiary navigation context', () => {
    const href = atlasWorkspaceCalyxHref('Phalaenopsis');
    const url = new URL(href, 'https://orchidcontinuum.org');

    expect(url.pathname).toBe('/calyx');
    expect(Object.fromEntries(url.searchParams.entries())).toEqual({
      genus: 'Phalaenopsis',
      origin: ATLAS_WORKSPACE_ORIGIN,
      context_is_evidence: 'false',
    });

    expect(parseCalyxRouteContext(url.search)).toEqual({
      origin: ATLAS_WORKSPACE_ORIGIN,
      featuredTaxon: { rank: 'genus', name: 'Phalaenopsis' },
      questionContext: null,
    });
  });

  it('does not create a channel for Atlas locality or occurrence material', () => {
    const url = new URL(atlasWorkspaceCalyxHref('Phalaenopsis'), 'https://orchidcontinuum.org');
    const keys = [...url.searchParams.keys()];

    expect(keys).toEqual(['genus', 'origin', 'context_is_evidence']);
    for (const forbidden of [
      'lat',
      'lon',
      'locality',
      'occurrence_id',
      'record_id',
      'collector',
      'catalogue_number',
      'confidence',
      'conclusion',
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
