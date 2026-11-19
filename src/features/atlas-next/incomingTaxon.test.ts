import { describe, expect, it } from 'vitest';

import {
  parseAtlasInfraspecificQualifier,
  parseAtlasNothospeciesName,
  parseAtlasTaxonName,
  resolveAtlasNextIncomingSubject,
} from './incomingTaxon';

describe('parseAtlasTaxonName', () => {
  it('parses a canonical genus', () => {
    expect(parseAtlasTaxonName('Cattleya')).toEqual({
      rank: 'genus',
      genus: 'Cattleya',
      name: 'Cattleya',
    });
  });

  it('parses a canonical binomial', () => {
    expect(parseAtlasTaxonName(' Cattleya purpurata ')).toEqual({
      rank: 'species',
      genus: 'Cattleya',
      epithet: 'purpurata',
      binomial: 'Cattleya purpurata',
      name: 'Cattleya purpurata',
    });
  });

  it.each(['subsp.', 'var.', 'subvar.', 'f.'])('parses one infraspecific rank (%s)', (marker) => {
    expect(parseAtlasTaxonName(`Cattleya walkeriana ${marker} alba`)).toEqual({
      rank: 'infraspecific',
      genus: 'Cattleya',
      epithet: 'walkeriana',
      binomial: 'Cattleya walkeriana',
      qualifier: { marker, epithet: 'alba', label: `${marker} alba` },
      name: `Cattleya walkeriana ${marker} alba`,
    });
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['non-string', 42],
    ['null', null],
    ['lower-case genus', 'cattleya purpurata'],
    ['capitalised epithet', 'Cattleya Purpurata'],
    ['authority suffix', 'Cattleya purpurata Lindl.'],
    ['parenthetical authority', 'Cattleya purpurata (Lindl.) Van den Berg'],
    ['hybrid formula', 'Cattleya × hardyana'],
    ['unknown rank marker', 'Cattleya walkeriana cv. alba'],
    ['rank marker without epithet', 'Cattleya walkeriana var.'],
    ['two infraspecific ranks', 'Cattleya walkeriana var. alba f. semialba'],
    ['double space', 'Cattleya  purpurata'],
    ['tab separator', 'Cattleya\tpurpurata'],
    ['newline separator', 'Cattleya\npurpurata'],
    ['pipe (multi-value injection)', 'Cattleya purpurata|Cattleya labiata'],
    ['query injection', 'Cattleya purpurata&genera=Vanda'],
    ['sql-shaped', "Cattleya purpurata'; DROP TABLE species;--"],
    ['markup', '<script>alert(1)</script>'],
    ['route-shaped', '/species/cattleya-purpurata'],
    ['locality-shaped', 'Cattleya purpurata -22.9,-43.2'],
    ['opaque id', 'taxon-12345'],
    ['oversize', `Cattleya ${'a'.repeat(200)}`],
    ['upper-case genus', 'CATTLEYA'],
    ['upper-case genus in a binomial', 'CATTLEYA purpurata'],
    ['mixed-case genus', 'CattLeya purpurata'],
    ['mixed-case epithet', 'Cattleya pUrpurata'],
    ['trailing capital in epithet', 'Cattleya purpuratA'],
    ['mixed-case infraspecific epithet', 'Cattleya walkeriana var. aLba'],
    ['digit in genus', 'Catt1eya purpurata'],
    ['leading hyphen epithet', 'Cattleya -purpurata'],
    ['trailing hyphen genus', 'Cattleya- purpurata'],
    ['single-letter genus', 'C purpurata'],
    ['single-letter epithet', 'Cattleya p'],
    ['abbreviated genus', 'C. purpurata'],
    ['intergeneric hybrid', '× Brassolaeliocattleya'],
  ])('rejects %s', (_label, value) => {
    expect(parseAtlasTaxonName(value)).toBeNull();
  });

  it.each([
    ['hyphenated epithet', 'Neottia nidus-avis', 'species'],
    ['hyphenated genus', 'Alpha-beta', 'genus'],
  ])('still accepts a canonical %s', (_label, value, rank) => {
    expect(parseAtlasTaxonName(value)?.rank).toBe(rank);
  });
});

describe('parseAtlasNothospeciesName', () => {
  it.each(['Cattleya × hardyana', 'Cattleya ×hardyana', 'Cattleya x hardyana'])(
    'parses the nothospecies %j to its parent genus',
    (value) => {
      expect(parseAtlasNothospeciesName(value)).toEqual({
        genus: 'Cattleya',
        epithet: 'hardyana',
        name: 'Cattleya × hardyana',
      });
    },
  );

  it.each([
    ['intergeneric with space', '× Brassolaeliocattleya'],
    ['intergeneric attached', '×Brassolaeliocattleya'],
    ['intergeneric with epithet', '× Brassolaeliocattleya hybrida'],
    ['ascii intergeneric', 'x Brassolaeliocattleya'],
    ['plain binomial', 'Cattleya purpurata'],
    ['plain genus', 'Cattleya'],
    ['hybrid formula of two species', 'Cattleya labiata × Cattleya warneri'],
    ['authority after hybrid', 'Cattleya × hardyana Rchb.f.'],
    ['rank after hybrid', 'Cattleya × hardyana var. alba'],
    ['upper-case genus', 'CATTLEYA × hardyana'],
    ['mixed-case epithet', 'Cattleya × hArdyana'],
    ['capital X sign', 'Cattleya X hardyana'],
    ['attached ascii x (ambiguous)', 'Cattleya xhardyana'],
    ['double space', 'Cattleya  × hardyana'],
    ['non-string', 42],
  ])('rejects %s', (_label, value) => {
    expect(parseAtlasNothospeciesName(value)).toBeNull();
  });

  it('never becomes a species filter in Atlas Next', () => {
    expect(resolveAtlasNextIncomingSubject({ species: ['Cattleya × hardyana'] })).toEqual({
      kind: 'rejected',
    });
  });
});

describe('parseAtlasInfraspecificQualifier', () => {
  it('parses a single rank marker and epithet', () => {
    expect(parseAtlasInfraspecificQualifier('var. alba')).toEqual({
      marker: 'var.',
      epithet: 'alba',
      label: 'var. alba',
    });
  });

  it.each(['alba', 'var.', 'var alba', 'var. Alba', 'var. alba extra', 'var.  alba'])(
    'rejects %j',
    (value) => {
      expect(parseAtlasInfraspecificQualifier(value)).toBeNull();
    },
  );
});

describe('resolveAtlasNextIncomingSubject', () => {
  it('names a single canonical binomial as the species subject', () => {
    expect(resolveAtlasNextIncomingSubject({ species: ['Cattleya purpurata'] })).toEqual({
      kind: 'species',
      genus: 'Cattleya',
      binomial: 'Cattleya purpurata',
      qualifier: null,
      name: 'Cattleya purpurata',
    });
  });

  it('accepts a species beside its own genus filter', () => {
    expect(
      resolveAtlasNextIncomingSubject({ genera: ['Cattleya'], species: ['Cattleya purpurata'] })
        .kind,
    ).toBe('species');
  });

  it('carries an infraspecific qualifier beside its binomial', () => {
    expect(
      resolveAtlasNextIncomingSubject({
        species: ['Cattleya walkeriana'],
        infraspecific: 'var. alba',
      }),
    ).toEqual({
      kind: 'species',
      genus: 'Cattleya',
      binomial: 'Cattleya walkeriana',
      qualifier: { marker: 'var.', epithet: 'alba', label: 'var. alba' },
      name: 'Cattleya walkeriana var. alba',
    });
  });

  it('names a single canonical genus as a genus-level subject', () => {
    expect(resolveAtlasNextIncomingSubject({ genera: ['Vanda'] })).toEqual({
      kind: 'genus',
      genus: 'Vanda',
    });
  });

  it('ignores an infraspecific qualifier that arrives without its binomial', () => {
    expect(
      resolveAtlasNextIncomingSubject({ genera: ['Vanda'], infraspecific: 'var. alba' }),
    ).toEqual({ kind: 'genus', genus: 'Vanda' });
  });

  it.each([
    ['no filter', {}],
    ['several genera', { genera: ['Vanda', 'Cattleya'] }],
    ['non-canonical genus', { genera: ['not a genus'] }],
  ])('names no subject for %s', (_label, filters) => {
    expect(resolveAtlasNextIncomingSubject(filters)).toEqual({ kind: 'none' });
  });

  it.each([
    ['a malformed species', { species: ["Cattleya purpurata'; --"] }],
    ['a genus in the species slot', { species: ['Cattleya'] }],
    ['an infraspecific name in the species slot', { species: ['Cattleya walkeriana var. alba'] }],
    ['several species', { species: ['Cattleya purpurata', 'Cattleya labiata'] }],
    ['a contradicting genus filter', { genera: ['Vanda'], species: ['Cattleya purpurata'] }],
    [
      'a multi-genus filter beside a species',
      { genera: ['Cattleya', 'Vanda'], species: ['Cattleya purpurata'] },
    ],
    [
      'a malformed infraspecific qualifier',
      { species: ['Cattleya walkeriana'], infraspecific: 'var. alba&species=Vanda' },
    ],
  ])('rejects %s rather than widening or narrowing it', (_label, filters) => {
    expect(resolveAtlasNextIncomingSubject(filters)).toEqual({ kind: 'rejected' });
  });
});
