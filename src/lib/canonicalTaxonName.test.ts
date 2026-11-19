import { describe, expect, it } from 'vitest';
import { boundedCanonicalTaxon, CANONICAL_TAXON_NAME } from '@/lib/canonicalTaxonName';

describe('boundedCanonicalTaxon', () => {
  it('accepts a binomial, a hybrid with its sign, and one infraspecific rank, and names the rank', () => {
    expect(boundedCanonicalTaxon('Cattleya labiata')).toEqual({ genus: 'Cattleya', taxon: 'Cattleya labiata', rank: 'species' });
    expect(boundedCanonicalTaxon('Phalaenopsis × intermedia')).toEqual({
      genus: 'Phalaenopsis',
      taxon: 'Phalaenopsis × intermedia',
      rank: 'hybrid',
    });
    expect(boundedCanonicalTaxon('Phalaenopsis x intermedia')?.rank).toBe('hybrid');
    expect(boundedCanonicalTaxon('Dendrobium nobile var. alba')).toEqual({
      genus: 'Dendrobium',
      taxon: 'Dendrobium nobile var. alba',
      rank: 'variety',
    });
    expect(boundedCanonicalTaxon('Ophrys apifera subsp. jurana')?.rank).toBe('subspecies');
    expect(boundedCanonicalTaxon('Ophrys apifera f. flavescens')?.rank).toBe('form');
    expect(boundedCanonicalTaxon('  Dendrobium   nobile  var.  alba ')?.taxon).toBe('Dendrobium nobile var. alba');
  });

  it('accepts a rank marker in any case, as the backend does, but nothing else', () => {
    // The backend matches markers with token.lower(), so a source row spelled
    // VAR. keeps its accepted name there; the frontend must not drop every
    // continuation for it.
    expect(boundedCanonicalTaxon('Dendrobium nobile VAR. alba')).toEqual({
      genus: 'Dendrobium',
      taxon: 'Dendrobium nobile VAR. alba',
      rank: 'variety',
    });
    expect(boundedCanonicalTaxon('Ophrys apifera SubSp. jurana')?.rank).toBe('subspecies');
    // Case tolerance stops at the marker: a capitalised epithet is not an
    // epithet, and a lowercase genus is not a genus.
    expect(boundedCanonicalTaxon('Dendrobium nobile VAR. Alba')).toBeNull();
    expect(boundedCanonicalTaxon('dendrobium nobile var. alba')).toBeNull();
  });

  it('accepts conventionally capitalised cultivars only at cv.', () => {
    expect(boundedCanonicalTaxon('Cattleya labiata cv. Alba')).toEqual({
      genus: 'Cattleya',
      taxon: 'Cattleya labiata cv. Alba',
      rank: 'cultivar',
    });
    expect(boundedCanonicalTaxon('Cattleya labiata CV. Alba')?.rank).toBe('cultivar');
    expect(boundedCanonicalTaxon('Cattleya labiata cv. alba')).toBeNull();
    expect(boundedCanonicalTaxon('Cattleya labiata var. Alba')).toBeNull();
  });

  it('rejects author connectives where a real infraspecific epithet is required', () => {
    for (const connective of ['ex', 'et', 'in', 'and', 'nec', 'non', 'emend', 'sensu']) {
      expect(boundedCanonicalTaxon(`Dendrobium nobile f. ${connective}`)).toBeNull();
    }
    expect(boundedCanonicalTaxon('Dendrobium nobile var. al-ba')?.rank).toBe('variety');
  });

  it('fails closed on everything that is not exactly a canonical name', () => {
    for (const rejected of [
      'Cattleya labiata Lindl.', // authorship is not part of the name
      'Dendrobium nobile var.', // rank marker without its epithet
      'Dendrobium nobile var. Alba', // an epithet is lowercase
      'Dendrobium nobile var. alba var. rubra', // one rank level only
      'Cattleya', // a genus alone is not a species identity
      'cattleya labiata',
      'taxon:world-plants:phalaenopsis-amabilis',
      'Cattleya labiata; lat=-8.1 lng=-35.6',
      'Cattleya labiata <script>',
      '',
      null,
      undefined,
      42,
      `Cattleya ${'a'.repeat(200)}`,
    ]) {
      expect(boundedCanonicalTaxon(rejected)).toBeNull();
    }
  });

  it('exposes the matcher so other guards can share the exact same shape', () => {
    expect(CANONICAL_TAXON_NAME.test('Cattleya labiata')).toBe(true);
    expect(CANONICAL_TAXON_NAME.test('Cattleya labiata Lindl.')).toBe(false);
  });
});
