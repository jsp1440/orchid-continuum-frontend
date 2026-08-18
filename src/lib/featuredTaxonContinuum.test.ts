import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchFeaturedTaxonContinuum } from '@/lib/featuredTaxonContinuum';
import * as mediaModule from '@/lib/genusMediaResolver';
import * as graphModule from '@/lib/knowledgeGraph';

vi.mock('@/lib/genusMediaResolver', async () => {
  const actual = await vi.importActual<typeof import('@/lib/genusMediaResolver')>('@/lib/genusMediaResolver');
  return { ...actual, fetchCalyxGenusMedia: vi.fn() };
});
vi.mock('@/lib/knowledgeGraph', async () => {
  const actual = await vi.importActual<typeof import('@/lib/knowledgeGraph')>('@/lib/knowledgeGraph');
  return { ...actual, fetchGenusGraphEvidence: vi.fn() };
});

const emptyMedia: mediaModule.GenusMediaResponse = {
  status: 'no_approved_media', requested_genus: 'Vanilla', accepted_genus: 'Vanilla', generated_at: null,
  items: [], summary: { eligible_count: 0, returned_count: 0, exclusion_counts: {} },
};

describe('fetchFeaturedTaxonContinuum', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps zero graph coverage as unknown rather than biological absence', async () => {
    vi.mocked(mediaModule.fetchCalyxGenusMedia).mockResolvedValue(emptyMedia);
    vi.mocked(graphModule.fetchGenusGraphEvidence).mockResolvedValue({
      status: 'ok',
      evidence: {
        genus: 'Vanilla', nodeCount: 2, edgeCount: 1, truncated: false, nextOffset: null,
        domains: [
          { domain: 'taxonomy', nodes: 1, edges: 0 }, { domain: 'media', nodes: 0, edges: 0 },
          { domain: 'occurrences', nodes: 0, edges: 0 }, { domain: 'traits', nodes: 0, edges: 0 },
          { domain: 'literature', nodes: 1, edges: 1 }, { domain: 'pollinators', nodes: 0, edges: 0 },
          { domain: 'conservation', nodes: 0, edges: 0 },
        ],
      },
    });

    const result = await fetchFeaturedTaxonContinuum('Vanilla');
    expect(result.domains.find((d) => d.domain === 'pollinators')?.state).toBe('unknown');
    expect(result.gaps).toContain('pollinators');
    expect(result.domains.find((d) => d.domain === 'taxonomy')?.state).toBe('known');
  });

  it('marks graph domains unavailable when the Continuum graph cannot be read', async () => {
    vi.mocked(mediaModule.fetchCalyxGenusMedia).mockResolvedValue(emptyMedia);
    vi.mocked(graphModule.fetchGenusGraphEvidence).mockResolvedValue({ status: 'unavailable' });
    const result = await fetchFeaturedTaxonContinuum('Vanilla');
    expect(result.domains.every((d) => d.state === 'unavailable')).toBe(true);
    expect(result.gaps).toEqual([]);
  });
});
