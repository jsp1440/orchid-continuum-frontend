import { describe, expect, it } from 'vitest';
import {
  resolveSpeciesGenusFilter,
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
