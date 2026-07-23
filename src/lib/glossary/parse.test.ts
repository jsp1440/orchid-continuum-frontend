import { describe, expect, it } from 'vitest';
import { detectFormat, parseCsv, parseCsvRows, parseJson } from '@/lib/glossary/parse';
import { GlossaryParseError } from '@/lib/glossary/types';

describe('parseCsvRows', () => {
  it('handles quoted fields with embedded commas and newlines', () => {
    const rows = parseCsvRows('a,"b,c","line1\nline2"\nx,y,z');
    expect(rows).toEqual([
      ['a', 'b,c', 'line1\nline2'],
      ['x', 'y', 'z'],
    ]);
  });

  it('handles doubled quotes as an escaped quote', () => {
    const rows = parseCsvRows('term\n"a ""quoted"" term"');
    expect(rows[1][0]).toBe('a "quoted" term');
  });

  it('throws GlossaryParseError on an unterminated quoted field (malformed CSV)', () => {
    expect(() => parseCsvRows('term\n"unterminated')).toThrow(GlossaryParseError);
  });
});

describe('parseCsv', () => {
  it('maps header aliases to canonical fields', () => {
    const records = parseCsv('Name,Meaning,Related Terms\nVelamen,Spongy layer,root; epiphyte');
    expect(records).toHaveLength(1);
    expect(records[0].term).toBe('Velamen');
    expect(records[0].definition).toBe('Spongy layer');
    expect(records[0].relatedTerms).toBe('root; epiphyte');
    expect(records[0].sourceRecordNumber).toBe(1);
  });

  it('throws when no term column is present', () => {
    expect(() => parseCsv('definition,category\nfoo,bar')).toThrow(GlossaryParseError);
  });

  it('pads short rows rather than failing', () => {
    const records = parseCsv('term,definition,category\nVelamen,Spongy');
    expect(records[0].category).toBe('');
  });
});

describe('parseJson', () => {
  it('accepts a top-level array', () => {
    const records = parseJson('[{"term":"Velamen","definition":"Spongy layer"}]');
    expect(records[0].term).toBe('Velamen');
    expect(records[0].sourceRecordNumber).toBe(1);
  });

  it('accepts an object wrapping entries/terms/glossary/records', () => {
    expect(parseJson('{"entries":[{"term":"A","definition":"d"}]}')).toHaveLength(1);
    expect(parseJson('{"terms":[{"term":"A","definition":"d"}]}')).toHaveLength(1);
    expect(parseJson('{"glossary":[{"term":"A","definition":"d"}]}')).toHaveLength(1);
  });

  it('maps camelCase and aliased keys', () => {
    const records = parseJson('[{"name":"V","meaning":"m","see also":"x, y"}]');
    expect(records[0].term).toBe('V');
    expect(records[0].definition).toBe('m');
    expect(records[0].relatedTerms).toBe('x, y');
  });

  it('preserves non-object entries positionally for later rejection', () => {
    const records = parseJson('[42, {"term":"A","definition":"d"}]');
    expect(records[0].sourceRecordNumber).toBe(1);
    expect(records[0].term).toBeUndefined();
    expect(records[1].term).toBe('A');
  });

  it('throws GlossaryParseError on invalid JSON (malformed JSON)', () => {
    expect(() => parseJson('{ not valid ')).toThrow(GlossaryParseError);
  });

  it('throws GlossaryParseError on an unrecognizable shape', () => {
    expect(() => parseJson('{"foo":1}')).toThrow(GlossaryParseError);
  });
});

describe('detectFormat', () => {
  it('detects by extension, case-insensitively', () => {
    expect(detectFormat('a.CSV')).toBe('csv');
    expect(detectFormat('a.json')).toBe('json');
    expect(detectFormat('a.txt')).toBeNull();
  });
});
