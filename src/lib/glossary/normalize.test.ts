import { describe, expect, it } from 'vitest';
import {
  capitalizeDefinition,
  duplicateKey,
  normalizeList,
  normalizeMultiLine,
  normalizeSingleLine,
  slugify,
} from '@/lib/glossary/normalize';

describe('normalizeSingleLine', () => {
  it('trims, collapses internal whitespace, and unifies newlines', () => {
    expect(normalizeSingleLine('  Velamen   radicum \t stuff ')).toBe('Velamen radicum stuff');
    expect(normalizeSingleLine('line1\r\nline2\rline3')).toBe('line1 line2 line3');
  });

  it('applies NFC Unicode normalization (decomposed → composed)', () => {
    const decomposed = 'Velámen'; // a + combining acute accent
    const composed = normalizeSingleLine(decomposed);
    expect(composed).toBe('Velámen');
    expect(composed.normalize('NFC')).toBe(composed);
  });
});

describe('normalizeMultiLine', () => {
  it('preserves newlines but collapses spaces and trims each line', () => {
    expect(normalizeMultiLine('  first  line \n\n\n  second   line  ')).toBe('first line\n\nsecond line');
  });
});

describe('capitalizeDefinition', () => {
  it('capitalizes only the first alphabetic character', () => {
    expect(capitalizeDefinition('the lip of a flower')).toEqual({ value: 'The lip of a flower', changed: true });
  });

  it('leaves already-capitalized text unchanged', () => {
    expect(capitalizeDefinition('The lip')).toEqual({ value: 'The lip', changed: false });
  });

  it('does not alter interior scientific casing', () => {
    const result = capitalizeDefinition('measured at pH 5 in Cattleya');
    expect(result.value).toBe('Measured at pH 5 in Cattleya');
  });
});

describe('normalizeList', () => {
  it('splits on commas, semicolons, pipes, and newlines', () => {
    expect(normalizeList('a, b; c | d\ne')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('trims, drops empties, dedupes case-insensitively, and sorts', () => {
    // dedup keeps the first-seen spelling; sort is case-insensitive.
    expect(normalizeList('Root, root ,  , Epiphyte, epiphyte')).toEqual(['Epiphyte', 'Root']);
  });

  it('accepts arrays as well as delimited strings', () => {
    expect(normalizeList(['column', 'pollinia', 'column'])).toEqual(['column', 'pollinia']);
  });
});

describe('slugify', () => {
  it('produces stable, ascii, hyphenated slugs', () => {
    expect(slugify('Velamen radicum')).toBe('velamen-radicum');
    expect(slugify('  Column / Gynostemium ')).toBe('column-gynostemium');
  });

  it('strips accents deterministically', () => {
    expect(slugify('Ophrys ×hybrida')).toBe('ophrys-hybrida');
    expect(slugify('Æglé')).toBe(slugify('Æglé'));
  });

  it('never returns an empty slug', () => {
    expect(slugify('   ')).toBe('term');
    expect(slugify('———')).toBe('term');
  });
});

describe('duplicateKey', () => {
  it('is case- and whitespace-insensitive', () => {
    expect(duplicateKey('  Velamen ')).toBe(duplicateKey('velamen'));
  });
});
