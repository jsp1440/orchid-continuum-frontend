import { describe, expect, it } from 'vitest';
import { mergeCanonicalAndFallback, type CanonicalLexiconResponse } from './lexiconService';
import type { LexiconEntry } from '@/data/types';

const fallback: LexiconEntry[] = [
  {
    id: 'fallback-resupination',
    slug: 'resupination',
    preferred_term: 'Resupination',
    quick_definition: 'Fallback definition',
    category: 'Development',
    assets: [
      {
        id: 'famous-sequence',
        kind: 'scientific_diagram',
        title: 'Resupination sequence',
        status: 'available',
      },
    ],
    etymology: {
      segments: [{ form: 're-', language: 'Latin', gloss: 'again', role: 'prefix' }],
    },
    maturity: ['illustrated', 'etymology_added'],
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
      concept_id: 'canonical-resupination',
      slug: 'resupination',
      preferred_term: 'Resupination',
      quick_definition: 'Canonical reviewed definition',
      expanded_definition: 'Canonical scientific definition',
      category: undefined,
      assets: [],
      review_state: 'expert_reviewed',
      provenance: { source: 'Orchid Continuum Core Concept Registry' },
      source_system: 'oc_concepts',
    },
  ],
};

describe('mergeCanonicalAndFallback', () => {
  it('keeps canonical identity, reviewed definitions and provenance authoritative by slug', () => {
    const merged = mergeCanonicalAndFallback(canonical.entries, fallback);
    const resupination = merged.find((entry) => entry.slug === 'resupination');

    expect(merged).toHaveLength(2);
    expect(resupination?.id).toBe('canonical-resupination');
    expect(resupination?.quick_definition).toBe('Canonical reviewed definition');
    expect(resupination?.expanded_definition).toBe('Canonical scientific definition');
    expect(resupination?.source_system).toBe('oc_concepts');
    expect(resupination?.provenance?.source).toBe('Orchid Continuum Core Concept Registry');
  });

  it('does not let canonical empty migration fields erase Famous presentation content', () => {
    const merged = mergeCanonicalAndFallback(canonical.entries, fallback);
    const resupination = merged.find((entry) => entry.slug === 'resupination');

    expect(resupination?.category).toBe('Development');
    expect(resupination?.assets?.map((asset) => asset.id)).toEqual(['famous-sequence']);
    expect(resupination?.etymology?.segments?.[0].form).toBe('re-');
    expect(resupination?.migration_overlay?.fields).toEqual(
      expect.arrayContaining(['assets', 'category', 'etymology']),
    );
    expect(resupination?.migration_overlay?.source_system).toBe(
      'Famous AI Illustrated Orchid Lexicon migration',
    );
  });

  it('retains unmatched Famous records as an explicit resilient fallback', () => {
    const merged = mergeCanonicalAndFallback(canonical.entries, fallback);
    const pollinium = merged.find((entry) => entry.slug === 'pollinium');

    expect(pollinium?.id).toBe('fallback-pollinium');
    expect(pollinium?.source_system).toBe('famous-migration');
  });
});
