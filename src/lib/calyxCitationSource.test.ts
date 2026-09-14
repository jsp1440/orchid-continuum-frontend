import { describe, expect, it } from 'vitest';
import { citationIdentifierParts } from './calyxCitationSource';
import type { CalyxCitation } from './calyxWorkspace';

function citation(overrides: Partial<CalyxCitation> = {}): CalyxCitation {
  return { title: 'A paper', ...overrides };
}

describe('citationIdentifierParts', () => {
  it('resolves a well-formed DOI to its canonical doi.org URL', () => {
    const parts = citationIdentifierParts(citation({ doi: '10.1234/orchid.2026.42' }));
    expect(parts).toEqual([
      { kind: 'doi', label: 'DOI 10.1234/orchid.2026.42', url: 'https://doi.org/10.1234/orchid.2026.42' },
    ]);
  });

  it('resolves PMID and PMCID to their NCBI resolvers, normalizing PMC casing', () => {
    const parts = citationIdentifierParts(citation({ pmid: '31234567', pmcid: 'pmc7654321' }));
    expect(parts).toEqual([
      { kind: 'pmid', label: 'PMID 31234567', url: 'https://pubmed.ncbi.nlm.nih.gov/31234567/' },
      { kind: 'pmcid', label: 'PMCID pmc7654321', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7654321/' },
    ]);
  });

  it('returns all present identifiers in DOI → PMID → PMCID order', () => {
    const parts = citationIdentifierParts(
      citation({ doi: '10.1/x', pmid: '1', pmcid: 'PMC2' }),
    );
    expect(parts.map((p) => p.kind)).toEqual(['doi', 'pmid', 'pmcid']);
  });

  it('keeps a malformed identifier as text with no link, rather than a broken or unsafe URL', () => {
    for (const bad of [
      'not-a-doi',
      'javascript:alert(1)',
      '10.x/nope',
      'https://evil.example/10.1/x',
      '10.1234/<script>',
      '10.1234/orchid>next',
    ]) {
      const [part] = citationIdentifierParts(citation({ doi: bad }));
      expect(part).toMatchObject({ kind: 'doi', url: null });
      expect(part.label).toBe(`DOI ${bad}`);
    }
    expect(citationIdentifierParts(citation({ pmid: '12a' }))[0].url).toBeNull();
    expect(citationIdentifierParts(citation({ pmcid: 'PMC' }))[0].url).toBeNull();
  });

  it('omits absent identifiers entirely', () => {
    expect(citationIdentifierParts(citation())).toEqual([]);
    expect(citationIdentifierParts(citation({ doi: '   ' }))).toEqual([]);
  });
});
