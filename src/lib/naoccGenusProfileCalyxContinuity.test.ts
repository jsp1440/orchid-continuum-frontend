import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseCalyxRouteContext } from '@/lib/calyxConversation';
import {
  GENUS_PROFILE_ORIGIN,
  genusProfileCalyxHref,
} from '@/lib/genusProfileNavigation';

const DEMO_GENUS = 'Phalaenopsis';
const genusDetailSource = readFileSync(resolve(process.cwd(), 'src/pages/GenusDetail.tsx'), 'utf8');

describe('NAOCC Genus Profile → Calyx continuity', () => {
  it('carries the exact profile genus into Calyx under dedicated non-evidentiary provenance', () => {
    const url = new URL(genusProfileCalyxHref(DEMO_GENUS), 'https://orchidcontinuum.org');
    const routeContext = parseCalyxRouteContext(url.search);

    expect(url.pathname).toBe('/calyx');
    expect([...url.searchParams.keys()].sort()).toEqual([
      'context_is_evidence',
      'genus',
      'origin',
    ]);
    expect(url.searchParams.get('genus')).toBe(DEMO_GENUS);
    expect(url.searchParams.get('origin')).toBe(GENUS_PROFILE_ORIGIN);
    expect(url.searchParams.get('context_is_evidence')).toBe('false');
    expect(routeContext).toEqual({
      origin: GENUS_PROFILE_ORIGIN,
      featuredTaxon: { rank: 'genus', name: DEMO_GENUS },
      questionContext: null,
    });
  });

  it('does not borrow Genus of the Day provenance or gain a locality/evidence route channel', () => {
    const url = new URL(genusProfileCalyxHref(DEMO_GENUS), 'https://orchidcontinuum.org');
    expect(url.searchParams.get('origin')).not.toBe('homepage-featured-taxon');

    for (const forbidden of [
      'lat',
      'lon',
      'latitude',
      'longitude',
      'locality',
      'occurrence_id',
      'record_id',
      'collector',
      'catalogue',
      'evidence',
      'confidence',
      'conclusion',
    ]) {
      expect(url.searchParams.has(forbidden)).toBe(false);
    }
  });

  it('pins the mounted Genus Profile consumer to the canonical Calyx producer', () => {
    expect(genusDetailSource).toContain('genusProfileCalyxHref');
    expect(genusDetailSource).toContain("{ label: 'Ask Calyx', to: genusProfileCalyxHref(genus) }");
    expect(genusDetailSource).toContain('PLATFORM_LINKS(entry.genus)');
  });
});
