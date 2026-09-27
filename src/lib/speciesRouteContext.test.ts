import { describe, expect, it } from 'vitest';
import {
  SPECIES_QUERY_MAX_LENGTH,
  resolveSpeciesGenusFilter,
  resolveSpeciesQueryParam,
  speciesRouteQuery,
  speciesSearchHref,
  speciesSearchParamsForQuery,
  speciesQueryAfterGenusRouteChange,
  speciesQueryPreservesGenusFilter,
} from './speciesRouteContext';

describe('resolveSpeciesGenusFilter', () => {
  it('preserves one bounded canonical genus', () => {
    expect(resolveSpeciesGenusFilter('Phalaenopsis')).toBe('Phalaenopsis');
    expect(resolveSpeciesGenusFilter('  Phalaenopsis  ')).toBe('Phalaenopsis');
  });

  it('treats an absent genus filter as an ordinary unfiltered Species search', () => {
    expect(resolveSpeciesGenusFilter(null)).toBe('');
    expect(resolveSpeciesGenusFilter(undefined)).toBe('');
  });

  it.each([
    '',
    '   ',
    'phalaenopsis',
    'Phalaenopsis amabilis',
    '/atlas?genera=Phalaenopsis',
    '35.2,-120.7',
    'Phalaenopsis/secret-locality',
    'P'.repeat(121),
  ])('fails closed on malformed route-derived genus context: %s', (value) => {
    expect(resolveSpeciesGenusFilter(value)).toBe('');
  });
});

describe('speciesQueryPreservesGenusFilter', () => {
  it('keeps the route-derived genus only while the search still names that genus', () => {
    expect(speciesQueryPreservesGenusFilter('Phalaenopsis', 'Phalaenopsis')).toBe(true);
    expect(speciesQueryPreservesGenusFilter('Phalaenopsis', '  Phalaenopsis  ')).toBe(true);
  });

  it.each(['Dracula', 'Phalaenopsis amabilis', '', '   '])(
    'clears the route-derived genus when the visitor changes the search to %s',
    (query) => {
      expect(speciesQueryPreservesGenusFilter('Phalaenopsis', query)).toBe(false);
    },
  );

  it('never invents a filter when no route-derived genus is active', () => {
    expect(speciesQueryPreservesGenusFilter('', 'Phalaenopsis')).toBe(false);
  });
});

describe('speciesQueryAfterGenusRouteChange', () => {
  it('hydrates a newly arrived canonical genus into the search box', () => {
    expect(speciesQueryAfterGenusRouteChange('', 'Phalaenopsis', 'Dracula')).toBe('Phalaenopsis');
    expect(speciesQueryAfterGenusRouteChange('Dracula', 'Phalaenopsis', 'Dracula')).toBe('Phalaenopsis');
  });

  it('clears an old route-owned genus when browser navigation removes the filter', () => {
    expect(speciesQueryAfterGenusRouteChange('Phalaenopsis', '', 'Phalaenopsis')).toBe('');
    expect(speciesQueryAfterGenusRouteChange('Phalaenopsis', '', '  Phalaenopsis  ')).toBe('');
  });

  it('does not erase an independent free-text query when the route filter disappears', () => {
    expect(speciesQueryAfterGenusRouteChange('Phalaenopsis', '', 'Dracula')).toBe('Dracula');
    expect(speciesQueryAfterGenusRouteChange('', '', 'Vanilla')).toBe('Vanilla');
  });
});

describe('resolveSpeciesQueryParam', () => {
  it('treats an absent query as no query', () => {
    expect(resolveSpeciesQueryParam(null)).toBe('');
    expect(resolveSpeciesQueryParam(undefined)).toBe('');
    expect(resolveSpeciesQueryParam('   ')).toBe('');
  });

  it('trims and keeps interior spaces, diacritics and the hybrid sign', () => {
    expect(resolveSpeciesQueryParam('  Dracula vampira  ')).toBe('Dracula vampira');
    expect(resolveSpeciesQueryParam('Épidendrum ñandú')).toBe('Épidendrum ñandú');
    expect(resolveSpeciesQueryParam('Cattleya × guatemalensis')).toBe('Cattleya × guatemalensis');
  });

  it('turns control characters into spaces instead of carrying them into a search', () => {
    expect(resolveSpeciesQueryParam('Dracula\u0000\nvampira\t')).toBe('Dracula  vampira');
  });

  it('keeps markup as the literal text it is (rendering escapes it)', () => {
    expect(resolveSpeciesQueryParam('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>');
  });

  it(`bounds the query to ${SPECIES_QUERY_MAX_LENGTH} characters without splitting a surrogate pair`, () => {
    expect(resolveSpeciesQueryParam('a'.repeat(500))).toBe('a'.repeat(SPECIES_QUERY_MAX_LENGTH));
    const astral = '\u{1F33A}'.repeat(300);
    const bounded = resolveSpeciesQueryParam(astral);
    expect(Array.from(bounded)).toHaveLength(SPECIES_QUERY_MAX_LENGTH);
    expect(bounded).toBe('\u{1F33A}'.repeat(SPECIES_QUERY_MAX_LENGTH));
  });
});

describe('speciesSearchHref', () => {
  it('prefills the Species search with a URL-encoded name', () => {
    expect(speciesSearchHref('Notagenus fakeus')).toBe('/species?q=Notagenus%20fakeus');
    expect(speciesSearchHref('Cattleya × guatemalensis')).toBe('/species?q=Cattleya%20%C3%97%20guatemalensis');
    expect(speciesSearchHref('Épidendrum')).toBe('/species?q=%C3%89pidendrum');
  });

  it('round-trips through the Species route exactly', () => {
    for (const name of ['Notagenus fakeus', 'Cattleya × guatemalensis', 'Épidendrum ñandú', 'a&b=c#d?e+f%']) {
      const url = new URL(speciesSearchHref(name), 'https://continuum.local');
      expect(url.pathname).toBe('/species');
      expect(url.searchParams.get('q')).toBe(name);
      expect([...url.searchParams.keys()]).toEqual(['q']);
    }
  });

  it('carries markup only as encoded text', () => {
    const href = speciesSearchHref('<script>alert(1)</script>');
    expect(href).not.toMatch(/[<>]/);
    expect(new URL(href, 'https://continuum.local').searchParams.get('q')).toBe('<script>alert(1)</script>');
  });

  it('bounds the carried name', () => {
    const url = new URL(speciesSearchHref(`Notagenus ${'x'.repeat(400)}`), 'https://continuum.local');
    expect(Array.from(url.searchParams.get('q') ?? '')).toHaveLength(SPECIES_QUERY_MAX_LENGTH);
  });

  it.each(['', '   ', null, undefined, '987654321', 'taxon:world-plants:phalaenopsis-amabilis'])(
    'links to the unfilled search page for an empty name or bare identifier: %s',
    (value) => {
      expect(speciesSearchHref(value)).toBe('/species');
    },
  );
});

describe('speciesSearchParamsForQuery', () => {
  const params = (search: string) => new URLSearchParams(search);

  it('sets a normalised q and keeps every other parameter', () => {
    const next = speciesSearchParamsForQuery(params('ref=home&view=grid'), '  Dracula ');
    expect(next.get('q')).toBe('Dracula');
    expect(next.get('ref')).toBe('home');
    expect(next.get('view')).toBe('grid');
  });

  it('removes q when the query is emptied', () => {
    expect(speciesSearchParamsForQuery(params('q=Dracula&ref=home'), '  ').toString()).toBe('ref=home');
  });

  it('keeps a genus filter that still describes the query, without a redundant q', () => {
    expect(speciesSearchParamsForQuery(params('genus=Phalaenopsis'), 'Phalaenopsis').toString()).toBe(
      'genus=Phalaenopsis',
    );
  });

  it('drops a genus filter the query no longer describes', () => {
    const next = speciesSearchParamsForQuery(params('genus=Phalaenopsis&ref=home'), 'Dracula');
    expect(next.has('genus')).toBe(false);
    expect(next.get('q')).toBe('Dracula');
    expect(next.get('ref')).toBe('home');
  });
});

describe('speciesRouteQuery', () => {
  it('prefers an explicit q, then a valid genus, then nothing', () => {
    expect(speciesRouteQuery(new URLSearchParams('q=Dracula&genus=Phalaenopsis'))).toBe('Dracula');
    expect(speciesRouteQuery(new URLSearchParams('genus=Phalaenopsis'))).toBe('Phalaenopsis');
    expect(speciesRouteQuery(new URLSearchParams('genus=not-a-genus'))).toBe('');
    expect(speciesRouteQuery(new URLSearchParams(''))).toBe('');
  });
});
