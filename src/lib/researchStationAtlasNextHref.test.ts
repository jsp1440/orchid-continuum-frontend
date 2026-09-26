import { describe, expect, it } from 'vitest';

import {
  RESEARCH_STATION_ORIGIN,
  researchStationAtlasNextHref,
  researchStationAtlasNextLink,
} from '@/lib/researchStationNavigation';
import {
  ATLAS_INFRASPECIFIC_PARAM,
  resolveAtlasNextIncomingSubject,
} from '@/features/atlas-next/incomingTaxon';

/**
 * Research Station → Atlas Next round trip.
 *
 * The receiving half reads the query exactly the way the shared
 * AtlasFilterContext deserialises it (`|`-separated multi-values), then
 * resolves the Atlas Next subject from those filters. A change to either half
 * of the join fails here.
 */
function arrive(href: string) {
  const url = new URL(href, 'https://orchid.test');
  const multi = (key: string) => url.searchParams.get(key)?.split('|').filter(Boolean);
  return {
    url,
    subject: resolveAtlasNextIncomingSubject({
      genera: multi('genera'),
      species: multi('species'),
      infraspecific: url.searchParams.get(ATLAS_INFRASPECIFIC_PARAM),
    }),
  };
}

describe('Research Station → Atlas Next species round trip', () => {
  it('carries a binomial as the canonical species filter and resolves it as the species', () => {
    const href = researchStationAtlasNextHref({
      taxon: 'Cattleya purpurata',
      projectId: 'proj-77',
    });
    expect(href).not.toBeNull();

    const { url, subject } = arrive(href!);
    expect(url.pathname).toBe('/atlas-next');
    expect([...url.searchParams.keys()].sort()).toEqual(['origin', 'project', 'species']);
    expect(url.searchParams.get('species')).toBe('Cattleya purpurata');
    expect(url.searchParams.get('origin')).toBe(RESEARCH_STATION_ORIGIN);
    expect(url.searchParams.get('project')).toBe('proj-77');
    expect(url.searchParams.has('genera')).toBe(false);

    expect(subject).toEqual({
      kind: 'species',
      genus: 'Cattleya',
      binomial: 'Cattleya purpurata',
      qualifier: null,
      name: 'Cattleya purpurata',
    });
  });

  it('round-trips an infraspecific name as binomial filter plus disclosed qualifier', () => {
    const href = researchStationAtlasNextHref({ taxon: 'Cattleya walkeriana var. alba' });
    const { url, subject } = arrive(href!);

    expect([...url.searchParams.keys()].sort()).toEqual(['infraspecific', 'origin', 'species']);
    expect(url.searchParams.get('species')).toBe('Cattleya walkeriana');
    expect(url.searchParams.get(ATLAS_INFRASPECIFIC_PARAM)).toBe('var. alba');
    expect(subject.kind).toBe('species');
    expect(subject.kind === 'species' && subject.name).toBe('Cattleya walkeriana var. alba');
    expect(subject.kind === 'species' && subject.binomial).toBe('Cattleya walkeriana');
  });

  it('carries a bare genus as the genus filter and resolves it as genus-level', () => {
    const { url, subject } = arrive(researchStationAtlasNextHref({ taxon: 'Vanda' })!);

    expect(url.searchParams.get('genera')).toBe('Vanda');
    expect(url.searchParams.has('species')).toBe(false);
    expect(subject).toEqual({ kind: 'genus', genus: 'Vanda' });
  });

  it.each([
    'taxon-12345',
    '× Brassolaeliocattleya',
    '×Brassolaeliocattleya',
    'Cattleya × hardyana Rchb.f.',
    'CATTLEYA purpurata',
    'Cattleya pUrpurata',
    'Cattleya purpurata Lindl.',
    'Cattleya purpurata|Vanda coerulea',
    'Cattleya purpurata&lat=-22.9',
    "Cattleya purpurata'; DROP TABLE species;--",
    '<img src=x onerror=alert(1)>',
    '',
  ])('emits no link for a malformed or non-canonical name %j', (taxon) => {
    expect(researchStationAtlasNextHref({ taxon })).toBeNull();
  });

  it.each(['Cattleya × hardyana', 'Cattleya ×hardyana', 'Cattleya x hardyana'])(
    'gives the nothospecies %j an explicitly labelled genus-level fallback link',
    (taxon) => {
      const link = researchStationAtlasNextLink({ taxon, projectId: 'proj-77' });
      expect(link).not.toBeNull();
      expect(link!.fallback).toEqual({
        rank: 'genus',
        genus: 'Cattleya',
        hybridName: 'Cattleya × hardyana',
        label: 'Genus-level fallback · Cattleya (hybrid name not filterable)',
      });

      const { url, subject } = arrive(link!.href);
      expect(url.pathname).toBe('/atlas-next');
      expect([...url.searchParams.keys()].sort()).toEqual(['genera', 'origin', 'project']);
      expect(url.searchParams.get('genera')).toBe('Cattleya');
      // The hybrid name is never sent as a species filter.
      expect(url.searchParams.has('species')).toBe(false);
      expect(subject).toEqual({ kind: 'genus', genus: 'Cattleya' });
      expect(researchStationAtlasNextHref({ taxon, projectId: 'proj-77' })).toBe(link!.href);
    },
  );

  it.each(['Cattleya purpurata', 'Cattleya', 'Cattleya walkeriana var. alba'])(
    'labels no fallback when the link is the subject\'s own view (%s)',
    (taxon) => {
      expect(researchStationAtlasNextLink({ taxon })?.fallback).toBeNull();
    },
  );

  it('never carries locality context', () => {
    const href = researchStationAtlasNextHref({ taxon: 'Cattleya purpurata', projectId: 'p' })!;
    const keys = [...new URL(href, 'https://orchid.test').searchParams.keys()];
    for (const forbidden of ['lat', 'lng', 'lon', 'locality', 'coordinates', 'site', 'gps', 'taxon']) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
