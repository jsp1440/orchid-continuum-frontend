import { describe, expect, it } from 'vitest';
import {
  SPECIES_QUERY_MAX_LENGTH,
  resolveSpeciesGenusFilter,
  resolveSpeciesQueryParam,
  speciesRouteQuery,
  speciesRouteSearchParams,
  speciesSearchHref,
  speciesSearchParamsForQuery,
  speciesQueryAfterRouteQueryChange,
  speciesQueryPreservesGenusFilter,
  stripSpeciesQueryFormatCharacters,
} from './speciesRouteContext';

// Every bidirectional control a shared link could use to reorder page copy:
// LRM, RLM, ALM, the embeddings/overrides LRE…RLO and the isolates LRI…PDI.
const BIDI_CONTROLS = [
  '\u200E', '\u200F', '\u061C',
  '\u202A', '\u202B', '\u202C', '\u202D', '\u202E',
  '\u2066', '\u2067', '\u2068', '\u2069',
];
const BIDI_PATTERN = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/;

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

describe('speciesQueryAfterRouteQueryChange', () => {
  it('hydrates a newly arrived canonical genus into the search box', () => {
    expect(speciesQueryAfterRouteQueryChange('', 'Phalaenopsis', 'Dracula')).toBe('Phalaenopsis');
    expect(speciesQueryAfterRouteQueryChange('Dracula', 'Phalaenopsis', 'Dracula')).toBe('Phalaenopsis');
  });

  it('clears an old route-owned genus when browser navigation removes the filter', () => {
    expect(speciesQueryAfterRouteQueryChange('Phalaenopsis', '', 'Phalaenopsis')).toBe('');
    expect(speciesQueryAfterRouteQueryChange('Phalaenopsis', '', '  Phalaenopsis  ')).toBe('');
  });

  it('does not erase an independent free-text query when the route filter disappears', () => {
    expect(speciesQueryAfterRouteQueryChange('Phalaenopsis', '', 'Dracula')).toBe('Dracula');
    expect(speciesQueryAfterRouteQueryChange('', '', 'Vanilla')).toBe('Vanilla');
  });

  it('treats a free-text ?q= route query the same way as a genus', () => {
    expect(speciesQueryAfterRouteQueryChange('', 'Notagenus fakeus', 'Dracula')).toBe('Notagenus fakeus');
    expect(speciesQueryAfterRouteQueryChange('Notagenus fakeus', '', 'Notagenus fakeus')).toBe('');
    expect(speciesQueryAfterRouteQueryChange('Notagenus fakeus', '', 'Vanilla')).toBe('Vanilla');
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

  it.each(BIDI_CONTROLS.map((c) => [`U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`, c]))(
    'strips the bidirectional control %s wherever it appears',
    (_label, control) => {
      expect(resolveSpeciesQueryParam(`${control}ABC`)).toBe('ABC');
      expect(resolveSpeciesQueryParam(`Dracula${control} vampira${control}`)).toBe('Dracula vampira');
      expect(resolveSpeciesQueryParam(`  ${control}  `)).toBe('');
    },
  );

  it('strips the reversing payload from a shared link, leaving the visible text', () => {
    const payload = '\u202EABC \u2066try another\u2069\u202C';
    const resolved = resolveSpeciesQueryParam(payload);
    expect(resolved).toBe('ABC try another');
    expect(resolved).not.toMatch(BIDI_PATTERN);
  });

  it('removes other invisible format characters without splitting the word they sit in', () => {
    // Soft hyphen, zero-width space/non-joiner/joiner, word joiner, BOM, a tag character.
    expect(resolveSpeciesQueryParam('Phalae\u00ADnopsis')).toBe('Phalaenopsis');
    expect(resolveSpeciesQueryParam('Dra\u200Bcu\u200Cl\u200Da\u2060')).toBe('Dracula');
    expect(resolveSpeciesQueryParam('\uFEFFVanilla\u{E0041}')).toBe('Vanilla');
  });

  it('turns Unicode line and paragraph separators into spaces', () => {
    expect(resolveSpeciesQueryParam('Dracula\u2028vampira\u2029')).toBe('Dracula vampira');
  });

  it('bounds the query after stripping, so invisible padding cannot push visible text out', () => {
    const resolved = resolveSpeciesQueryParam(`${'\u202E'.repeat(300)}Dracula`);
    expect(resolved).toBe('Dracula');
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

describe('stripSpeciesQueryFormatCharacters', () => {
  it('removes bidi and other format characters but keeps spacing exactly as typed', () => {
    expect(stripSpeciesQueryFormatCharacters(' Dracula\u202E ')).toBe(' Dracula ');
    expect(stripSpeciesQueryFormatCharacters(BIDI_CONTROLS.join(''))).toBe('');
    expect(stripSpeciesQueryFormatCharacters('Cattleya × guatemalensis')).toBe('Cattleya × guatemalensis');
    expect(stripSpeciesQueryFormatCharacters('Épidendrum ñandú \u{1F33A}')).toBe('Épidendrum ñandú \u{1F33A}');
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

  it('never carries a bidirectional control into the link', () => {
    const href = speciesSearchHref('Notagenus\u202E fakeus\u2067');
    expect(href).toBe('/species?q=Notagenus%20fakeus');
    expect(decodeURIComponent(href)).not.toMatch(BIDI_PATTERN);
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
  it('reads a shared q without its bidirectional controls', () => {
    const params = new URLSearchParams(`q=${encodeURIComponent('\u202EABC\u200F')}`);
    expect(speciesRouteQuery(params)).toBe('ABC');
    expect(speciesSearchParamsForQuery(params, speciesRouteQuery(params)).toString()).toBe('q=ABC');
  });

  it('prefers an explicit q, then a valid genus, then nothing', () => {
    expect(speciesRouteQuery(new URLSearchParams('q=Dracula&genus=Phalaenopsis'))).toBe('Dracula');
    expect(speciesRouteQuery(new URLSearchParams('genus=Phalaenopsis'))).toBe('Phalaenopsis');
    expect(speciesRouteQuery(new URLSearchParams('genus=not-a-genus'))).toBe('');
    expect(speciesRouteQuery(new URLSearchParams(''))).toBe('');
  });
});

describe('speciesRouteSearchParams', () => {
  const params = (search: string) => new URLSearchParams(search);
  const enc = encodeURIComponent;

  it('leaves an address with no format characters as it is', () => {
    for (const search of ['', 'genus=Phalaenopsis', 'genus=phalaenopsis', 'q=Dracula&ref=home', 'ref=home&view=grid']) {
      expect(speciesRouteSearchParams(params(search)).toString()).toBe(params(search).toString());
    }
  });

  it('rejects and removes a genus carrying format characters instead of repairing it', () => {
    expect(resolveSpeciesGenusFilter('Dracula\u200B')).toBe('');
    expect(speciesRouteSearchParams(params(`genus=${enc('Dracula\u200B')}`)).toString()).toBe('');
    expect(speciesRouteSearchParams(params(`genus=${enc('\u202EDracula')}&ref=home`)).toString()).toBe('ref=home');
  });

  it('normalises q and strips format characters from other values', () => {
    const next = speciesRouteSearchParams(params(`q=${enc(' \u202EABC ')}&ref=${enc('ho\u2066me')}`));
    expect(next.get('q')).toBe('ABC');
    expect(next.get('ref')).toBe('home');
    expect(next.toString()).not.toMatch(/%E2%80%AE|%E2%81%A6/i);
  });

  it('removes a parameter whose name carries format characters', () => {
    expect(speciesRouteSearchParams(params(`${enc('ref\u202E')}=x&q=Dracula`)).toString()).toBe('q=Dracula');
  });
});
