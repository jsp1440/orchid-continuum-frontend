import { describe, expect, it } from 'vitest';
import { mergeCanonicalAndFallback, type CanonicalLexiconResponse } from './lexiconService';
import type { LexiconEntry } from '@/data/types';

const fallback: LexiconEntry[] = [
  {
    id: 'fallback-resupination',
    slug: 'resupination',
    preferred_term: 'Resupination',
    quick_definition: 'Fallback definition',
    source_system: 'famous-migration',
  },
  {
    id: 'fallback-pollinium',
    slug: 'pollinium',
    preferred_term: 'Pollinium',
    quick_definition: 'Fallback pollinium',
    source_system: 'famous-migration',
  },
];

const canonical: CanonicalLexiconResponse = {
  release: 'CALYX-LEXICON-INTEGRATION-001',
  count: 1,
  source_of_truth: 'oc_concepts',
  automatic_publication: false,
  visibility: 'ACTIVE + APPROVED concepts only',
  entries: [
    {
      id: 'canonical-resupination',
      slug: 'resupination',
      preferred_term: 'Resupination',
      quick_definition: 'Canonical reviewed definition',
      source_system: 'oc_concepts',
    },
  ],
};

describe('mergeCanonicalAndFallback', () => {
  it('lets canonical reviewed concepts supersede Famous migration records by slug', () => {
    const merged = mergeCanonicalAndFallback(canonical.entries, fallback);
    expect(merged).toHaveLength(2);
    expect(merged.find((entry) => entry.slug === 'resupination')?.id).toBe('canonical-resupination');
    expect(merged.find((entry) => entry.slug === 'pollinium')?.id).toBe('fallback-pollinium');
  });
});
