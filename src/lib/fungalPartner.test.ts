import { describe, expect, it } from 'vitest';
import { binomialOf, genusOf, resolveEvidence, splitCitation, type FungalPartnerRow } from './fungalPartner';

const vanilla: FungalPartnerRow = {
  scientific_name: 'Vanilla planifolia',
  fungal_taxon: 'Ceratobasidium',
  fungal_family: 'Ceratobasidiaceae',
  association_type: 'orchid mycorrhiza',
  note: 'Ceratobasidium isolates supported symbiotic germination of V. planifolia seed.',
  source:
    'Porras-Alfaro A, Bayman P (2007). Mycorrhizal fungi of Vanilla. Mycologia 99:510-525. https://doi.org/10.3852/mycologia.99.4.510',
};

describe('genusOf / binomialOf', () => {
  it('drops the authority from a full scientific name', () => {
    expect(binomialOf('Vanilla planifolia Andrews')).toBe('Vanilla planifolia');
    expect(genusOf('Vanilla planifolia Andrews')).toBe('Vanilla');
  });
});

describe('resolveEvidence', () => {
  it('reports species-level evidence when the displayed species matches the record', () => {
    const e = resolveEvidence([vanilla], 'Vanilla', 'Vanilla planifolia Andrews');
    expect(e.scope).toBe('species');
    expect(e.evidenceSpecies).toBe('Vanilla planifolia');
    expect(e.fungalTaxon).toBe('Ceratobasidium');
  });

  it('never promotes a congener to the displayed species', () => {
    // The graph knows V. planifolia. The visitor is shown V. pompona. The
    // partnership must be reported as genus-level and still attributed to the
    // species it was actually recorded for.
    const e = resolveEvidence([vanilla], 'Vanilla', 'Vanilla pompona Schiede');
    expect(e.scope).toBe('genus');
    expect(e.evidenceSpecies).toBe('Vanilla planifolia');
    expect(e.displayedSpecies).toBe('Vanilla pompona Schiede');
  });

  it('reports unrecorded when the genus has no rows, inventing nothing', () => {
    const e = resolveEvidence([], 'Cattleya', 'Cattleya labiata');
    expect(e.scope).toBe('unrecorded');
    expect(e.fungalTaxon).toBeNull();
    expect(e.source).toBeNull();
    expect(e.evidenceSpecies).toBeNull();
  });

  it('falls back to genus scope when no species is resolved from the photograph', () => {
    const e = resolveEvidence([vanilla], 'Vanilla', null);
    expect(e.scope).toBe('genus');
  });
});

describe('splitCitation', () => {
  it('separates the trailing DOI url from the citation text', () => {
    const { text, url } = splitCitation(vanilla.source);
    expect(url).toBe('https://doi.org/10.3852/mycologia.99.4.510');
    expect(text.endsWith('Mycologia 99:510-525.')).toBe(true);
  });

  it('handles a citation with no url', () => {
    expect(splitCitation('Some study, 1999.')).toEqual({ text: 'Some study, 1999.', url: null });
  });

  it('handles a null source', () => {
    expect(splitCitation(null)).toEqual({ text: '', url: null });
  });
});
