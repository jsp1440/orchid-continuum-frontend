import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEntry, mergeCanonicalAndFallback, type CanonicalLexiconResponse } from './lexiconService';
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
