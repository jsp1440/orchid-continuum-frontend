import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEntry, measureLexiconCoverage, mergeCanonicalAndFallback, type CanonicalLexiconResponse } from './lexiconService';
import { entries as famousBaseEntries } from '@/data/lexiconEntries';
import { famousLexiconSupplement } from '@/data/famousLexiconSupplement';
import type { LexiconEntry } from '@/data/types';

function response(status: number, payload: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => payload } as Response;
}

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

  it('keeps every recovered record explicitly draft and migration-sourced', () => {
    expect(famousLexiconSupplement).toHaveLength(10);
    for (const entry of famousLexiconSupplement) {
      expect(entry.review_state).toBe('draft');
      expect(entry.source_system).toContain('migration fallback');
      expect(entry.provenance?.validation_status).toBe('draft');
    }
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

  it('does not let recovered Famous aliases, relationships or cautions inherit canonical review status', () => {
    const recoveredNonResupination = [...famousBaseEntries, ...famousLexiconSupplement].find(
      (entry) => entry.slug === 'non-resupination',
    );
    expect(recoveredNonResupination).toBeDefined();
    expect(recoveredNonResupination?.synonyms).toContain('non-resupinate condition');
    expect(recoveredNonResupination?.identification_cautions?.length).toBeGreaterThan(0);

    const canonicalNonResupination: LexiconEntry = {
      id: 'canonical-non-resupination',
      concept_id: 'canonical-non-resupination',
      slug: 'non-resupination',
      preferred_term: 'Non-resupination',
      quick_definition: 'Canonical definition only.',
      review_state: 'expert_reviewed',
      source_system: 'oc_concepts',
      provenance: { source: 'Orchid Continuum Core Concept Registry' },
    };

    const merged = mergeCanonicalAndFallback(
      [canonicalNonResupination],
      [recoveredNonResupination as LexiconEntry],
    )[0];

    expect(merged.quick_definition).toBe('Canonical definition only.');
    expect(merged.synonyms).toBeUndefined();
    expect(merged.related_terminology).toBeUndefined();
    expect(merged.identification_cautions).toBeUndefined();
    expect(merged.certainty_summary).toBeUndefined();
    expect(merged.review_state).toBe('expert_reviewed');
    expect(merged.source_system).toBe('oc_concepts');
  });

  it('retains unmatched Famous records as an explicit read-only fallback', () => {
    const merged = mergeCanonicalAndFallback(canonical.entries, fallback);
    const pollinium = merged.find((entry) => entry.slug === 'pollinium');

    expect(pollinium?.id).toBe('fallback-pollinium');
    expect(pollinium?.source_system).toBe('famous-migration');
  });
});

describe('getEntry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the direct canonical entry route rather than loading the bulk list', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      response(200, {
        release: 'CALYX-LEXICON-LIVE-002',
        entry: { id: 'canonical-resupination', slug: 'resupination', preferred_term: 'Resupination', quick_definition: 'Canonical', source_system: 'oc_concepts' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const entry = await getEntry('resupination');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/lexicon/entries/resupination');
    expect(entry?.id).toBe('canonical-resupination');
    expect(entry?.quick_definition).toBe('Canonical');
  });

  it('merges the canonical entry over the local Famous fallback record for the same slug', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      response(200, {
        entry: { id: 'canonical-resupination', slug: 'resupination', preferred_term: 'Resupination', quick_definition: 'Canonical reviewed definition', source_system: 'oc_concepts' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const entry = await getEntry('resupination');

    // A real Famous fallback record exists for this slug - canonical must
    // win the id/definition, not be silently dropped.
    expect(entry?.id).toBe('canonical-resupination');
    expect(entry?.quick_definition).toBe('Canonical reviewed definition');
  });

  it('falls back to the local Famous record on a clean 404 without loading the bulk list', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(404, { code: 'LEXICON_APPROVED_ENTRY_NOT_FOUND' }));
    vi.stubGlobal('fetch', fetchMock);

    const entry = await getEntry('resupination');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(entry?.slug).toBe('resupination');
    expect(entry?.source_system).not.toBe('oc_concepts');
  });

  it('returns undefined for a slug that exists in neither canonical nor the fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(404, { code: 'LEXICON_APPROVED_ENTRY_NOT_FOUND' }));
    vi.stubGlobal('fetch', fetchMock);

    const entry = await getEntry('definitely-not-a-real-slug-xyz');

    expect(entry).toBeUndefined();
  });

  it('falls back to the bulk list lookup on a network/server error, not just a 404', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        response(200, {
          entries: [{ id: 'canonical-bulk-hit', slug: 'resupination', preferred_term: 'Resupination', quick_definition: 'From the bulk list', source_system: 'oc_concepts' }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const entry = await getEntry('resupination');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(entry?.id).toBe('canonical-bulk-hit');
  });
});

describe('measureLexiconCoverage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports a real, measured 0% coverage rather than "unavailable" when the canonical API is unreachable but Famous fallback entries exist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')));

    const report = await measureLexiconCoverage();

    expect(report.status).toBe('measured');
    expect(report.canonicalReachable).toBe(false);
    expect(report.canonicalServedEntries).toBe(0);
    expect(report.totalEntries).toBe(45);
    expect(report.famousFallbackOnlyEntries).toBe(45);
    expect(report.canonicalCoverageRatio).toBe(0);
    expect(report.reason).toMatch(/Famous fallback content only/);
  });

  it('measures the real ratio of canonical-served entries against the full fallback catalogue', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        response(200, {
          release: 'CALYX-LEXICON-LIVE-003',
          count: 2,
          entries: [
            { id: 'canonical-form', slug: 'form', preferred_term: 'Form', quick_definition: 'Canonical form', source_system: 'oc_concepts' },
            { id: 'canonical-symmetry', slug: 'symmetry', preferred_term: 'Symmetry', quick_definition: 'Canonical symmetry', source_system: 'oc_concepts' },
          ],
        }),
      ),
    );

    const report = await measureLexiconCoverage();

    expect(report.status).toBe('measured');
    expect(report.canonicalReachable).toBe(true);
    expect(report.totalEntries).toBe(45);
    expect(report.canonicalServedEntries).toBe(2);
    expect(report.famousFallbackOnlyEntries).toBe(43);
    expect(report.canonicalCoverageRatio).toBeCloseTo(2 / 45);
    expect(report.reason).toBeUndefined();
  });

  it('reports 0% coverage, never fabricating a partial number, when the canonical API returns zero entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(response(200, { release: 'CALYX-LEXICON-LIVE-004', count: 0, entries: [] })),
    );

    const report = await measureLexiconCoverage();

    expect(report.status).toBe('measured');
    expect(report.canonicalReachable).toBe(true);
    expect(report.canonicalServedEntries).toBe(0);
    expect(report.canonicalCoverageRatio).toBe(0);
  });
});
