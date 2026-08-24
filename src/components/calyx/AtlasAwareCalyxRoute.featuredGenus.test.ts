import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseCalyxRouteContext } from '@/lib/calyxConversation';
import { featuredTaxonCalyxHref, FEATURED_TAXON_ORIGIN } from '@/lib/featuredTaxonNavigation';
import { GENUS_PROFILE_ORIGIN, genusProfileCalyxHref } from '@/lib/genusProfileNavigation';

const mountedRouteSource = readFileSync(
  new URL('./AtlasAwareCalyxRoute.tsx', import.meta.url),
  'utf8',
);

const FORBIDDEN_KEYS = [
  'lat',
  'latitude',
  'lon',
  'longitude',
  'locality',
  'occurrence',
  'occurrence_id',
  'record_id',
  'evidence',
  'confidence',
  'conclusion',
];

describe('mounted governed genus arrivals in Calyx', () => {
  it('keeps Genus of the Day visible as non-evidentiary Phalaenopsis context', () => {
    const href = featuredTaxonCalyxHref('Phalaenopsis');
    const query = href.slice(href.indexOf('?'));
    const parsed = parseCalyxRouteContext(query);
    const params = new URLSearchParams(query);

    expect(parsed.origin).toBe(FEATURED_TAXON_ORIGIN);
    expect(parsed.featuredTaxon?.name).toBe('Phalaenopsis');
    expect(params.get('context_is_evidence')).toBe('false');
    expect(mountedRouteSource).toContain('Continuing from Genus of the Day');
    expect(mountedRouteSource).toContain('routeContext.origin === FEATURED_TAXON_ORIGIN');

    for (const key of FORBIDDEN_KEYS) expect(params.has(key)).toBe(false);
  });

  it('keeps Genus Profile arrivals visibly attributed to that origin', () => {
    const href = genusProfileCalyxHref('Phalaenopsis');
    const query = href.slice(href.indexOf('?'));
    const parsed = parseCalyxRouteContext(query);
    const params = new URLSearchParams(query);

    expect(parsed.origin).toBe(GENUS_PROFILE_ORIGIN);
    expect(parsed.featuredTaxon?.name).toBe('Phalaenopsis');
    expect(params.get('context_is_evidence')).toBe('false');
    expect(mountedRouteSource).toContain('Continuing from the Genus Profile');
    expect(mountedRouteSource).toContain('routeContext.origin === GENUS_PROFILE_ORIGIN');

    for (const key of FORBIDDEN_KEYS) expect(params.has(key)).toBe(false);
  });
});
