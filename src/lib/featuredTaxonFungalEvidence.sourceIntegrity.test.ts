import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(resolve(here, '../components/orchid/FungalDependency.tsx'), 'utf8');
const contractSource = readFileSync(resolve(here, './featuredTaxonContinuum.ts'), 'utf8');

describe('mounted fungal dependency scientific boundary', () => {
  it('uses the canonical featured-taxon adapter instead of the domain fetch directly', () => {
    expect(componentSource).toContain("from '@/lib/featuredTaxonContinuum'");
    expect(componentSource).toContain('fetchFeaturedTaxonFungalEvidence(genus, heroSpecies)');
    expect(componentSource).not.toMatch(/\bfetchFungalEvidence\s*\(/);
  });

  it('keeps species, genus, unrecorded, unavailable, and citation semantics visible', () => {
    expect(componentSource).toContain("evidence?.scope === 'species'");
    expect(componentSource).toContain("evidence?.scope === 'genus'");
    expect(componentSource).toContain('Nobody has recorded it here yet.');
    expect(componentSource).toContain("state.kind === 'unavailable'");
    expect(componentSource).toContain('splitCitation(evidence?.source ?? null)');
  });

  it('keeps the canonical adapter species-aware and preserves the domain evidence object unchanged', () => {
    expect(contractSource).toContain('fetchFeaturedTaxonFungalEvidence');
    expect(contractSource).toContain('displayedSpecies: string | null');
    expect(contractSource).toContain('return fetchFungalEvidence(requested, displayedSpecies);');
  });
});
