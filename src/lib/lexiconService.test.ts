import { describe, expect, it } from 'vitest';
import { mergeCanonicalAndFallback, type CanonicalLexiconResponse } from './lexiconService';
import { entries as famousBaseEntries } from '@/data/lexiconEntries';
import { famousLexiconSupplement } from '@/data/famousLexiconSupplement';
import type { LexiconEntry } from '@/data/types';

const fallback: LexiconEntry[] = [
  {
    id: 'fallback-resupination',
    slug: 'resupination',
    preferred_term: 'Resupination',
    quick_definition: 'Fallback definition',
    expanded_definition: 'Fallback expanded definition',
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
    certainty_summary: 'literature_review_pending',
    import_batch: 'famous-demo-batch',
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

describe('complete Famous export migration inventory', () => {
  it('restores all 45 exported terms without duplicate slugs', () => {
    const complete = [...famousBaseEntries, ...famousLexiconSupplement];
    const slugs = complete.map((entry) => entry.slug);

    expect(complete).toHaveLength(45);
    expect(new Set(slugs).size).toBe(45);
    expect(slugs).toEqual(
      expect.arrayContaining([
        'form',
        'symmetry',
        'texture',
        'substance',
        'sensu-lato',
        'sensu-stricto',
        'pollinator-syndrome',
        'deceptive-pollination',
        'keiki',
        'bark-mix',
      ]),
    );
  });
});

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

  it('preserves only allowed Famous presentation fields when canonical equivalents are empty', () => {
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

  it('treats nested empty canonical objects as empty for allowed presentation fields', () => {
    const canonicalWithEmptyEtymology: LexiconEntry = {
      ...canonical.entries[0],
      etymology: { segments: [] },
    };

    const merged = mergeCanonicalAndFallback([canonicalWithEmptyEtymology], fallback);
    const resupination = merged.find((entry) => entry.slug === 'resupination');

    expect(resupination?.etymology?.segments?.[0].form).toBe('re-');
    expect(resupination?.migration_overlay?.fields).toContain('etymology');
  });

  it('never fills an empty canonical definition with Famous migration prose', () => {
    const canonicalWithoutDefinition: LexiconEntry = {
      ...canonical.entries[0],
      quick_definition: undefined,
      expanded_definition: undefined,
      definition_versions: [],
    };

    const merged = mergeCanonicalAndFallback([canonicalWithoutDefinition], fallback);
    const resupination = merged.find((entry) => entry.slug === 'resupination');

    expect(resupination?.review_state).toBe('expert_reviewed');
    expect(resupination?.quick_definition).toBeUndefined();
    expect(resupination?.expanded_definition).toBeUndefined();
    expect(resupination?.migration_overlay?.fields).not.toEqual(
      expect.arrayContaining(['quick_definition', 'expanded_definition']),
    );
  });

  it('does not promote Famous maturity, certainty, or import identity into canonical state', () => {
    const merged = mergeCanonicalAndFallback(canonical.entries, fallback);
    const resupination = merged.find((entry) => entry.slug === 'resupination');

    expect(resupination?.maturity).toEqual([]);
    expect(resupination?.certainty_summary).toBeUndefined();
    expect(resupination?.import_batch).toBeUndefined();
    expect(resupination?.migration_overlay?.fields).not.toContain('maturity');
  });

  it('retains unmatched Famous records as an explicit read-only fallback', () => {
    const merged = mergeCanonicalAndFallback(canonical.entries, fallback);
    const pollinium = merged.find((entry) => entry.slug === 'pollinium');

    expect(pollinium?.id).toBe('fallback-pollinium');
    expect(pollinium?.source_system).toBe('famous-migration');
  });
});
