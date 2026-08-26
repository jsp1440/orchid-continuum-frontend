import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchFeaturedTaxonContinuum } from '@/lib/featuredTaxonContinuum';
import * as mediaModule from '@/lib/genusMediaResolver';
import * as graphModule from '@/lib/knowledgeGraph';
import * as ocModule from '@/lib/ocBackend';

vi.mock('@/lib/genusMediaResolver', async () => {
  const actual = await vi.importActual<typeof import('@/lib/genusMediaResolver')>('@/lib/genusMediaResolver');
  return { ...actual, fetchCalyxGenusMedia: vi.fn() };
});
vi.mock('@/lib/knowledgeGraph', async () => {
  const actual = await vi.importActual<typeof import('@/lib/knowledgeGraph')>('@/lib/knowledgeGraph');
  return { ...actual, fetchGenusGraphEvidence: vi.fn() };
});
vi.mock('@/lib/ocBackend', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ocBackend')>('@/lib/ocBackend');
  return { ...actual, fetchContinuumGraph: vi.fn() };
});

const emptyMedia: mediaModule.GenusMediaResponse = {
  status: 'no_approved_media', requested_genus: 'Vanilla', accepted_genus: 'Vanilla', generated_at: null,
  items: [], summary: { eligible_count: 0, returned_count: 0, exclusion_counts: {} },
};

const relationshipGraph: ocModule.ContinuumGraphData = {
  genus: 'Vanilla',
  speciesCount: 110,
  description: 'Daily featured orchid genus from the Continuum taxonomy.',
  isFallback: false,
  fungi: { count: 2, summary: '2 partnerships', items: ['Tulasnella'], hasData: true },
  pollinators: { count: 1, summary: '1 link', items: ['Melipona'], hasData: true },
  climate: { count: null, summary: 'No data yet', items: [], hasData: false },
  geography: { count: 10, summary: '10 records', items: ['Mexico'], hasData: true },
  conservation: { count: null, summary: 'No data yet', items: [], hasData: false },
  cultivation: { count: null, summary: 'No data yet', items: [], hasData: false },
  knowledge: { count: 3, summary: '3 species', items: ['Reference A'], hasData: true },
};

describe('fetchFeaturedTaxonContinuum', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ocModule.fetchContinuumGraph).mockResolvedValue(relationshipGraph);
  });

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
    expect(result.relationships?.pollinators.items).toEqual(['Melipona']);
    expect(result.relationships?.fungi.items).toEqual(['Tulasnella']);
    expect(result.conservation.state).toBe('unknown');
    expect(result.conservation.nodes).toBe(0);
    expect(result.conservation.edges).toBe(0);
    expect(result.conservation.relationship).toEqual(relationshipGraph.conservation);
  });

  it('exposes known conservation graph coverage without inventing an assessment', async () => {
    vi.mocked(mediaModule.fetchCalyxGenusMedia).mockResolvedValue(emptyMedia);
    vi.mocked(graphModule.fetchGenusGraphEvidence).mockResolvedValue({
      status: 'ok',
      evidence: {
        genus: 'Vanilla', nodeCount: 4, edgeCount: 2, truncated: false, nextOffset: null,
        domains: [
          { domain: 'taxonomy', nodes: 1, edges: 0 }, { domain: 'media', nodes: 0, edges: 0 },
          { domain: 'occurrences', nodes: 1, edges: 0 }, { domain: 'traits', nodes: 0, edges: 0 },
          { domain: 'literature', nodes: 0, edges: 0 }, { domain: 'pollinators', nodes: 0, edges: 0 },
          { domain: 'conservation', nodes: 2, edges: 2 },
        ],
      },
    });
    vi.mocked(ocModule.fetchContinuumGraph).mockResolvedValue({
      ...relationshipGraph,
      conservation: { count: 2, summary: '2 conservation records', items: ['Record A', 'Record B'], hasData: true },
    });

    const result = await fetchFeaturedTaxonContinuum('Vanilla');
    expect(result.conservation).toEqual({
      state: 'known',
      nodes: 2,
      edges: 2,
      relationship: { count: 2, summary: '2 conservation records', items: ['Record A', 'Record B'], hasData: true },
    });
  });

  it('marks graph domains unavailable when the Continuum graph cannot be read', async () => {
    vi.mocked(mediaModule.fetchCalyxGenusMedia).mockResolvedValue(emptyMedia);
    vi.mocked(graphModule.fetchGenusGraphEvidence).mockResolvedValue({ status: 'unavailable' });
    const result = await fetchFeaturedTaxonContinuum('Vanilla');
    expect(result.domains.every((d) => d.state === 'unavailable')).toBe(true);
    expect(result.gaps).toEqual([]);
    expect(result.relationships?.genus).toBe('Vanilla');
    expect(result.conservation.state).toBe('unavailable');
    expect(result.conservation.relationship).toEqual(relationshipGraph.conservation);
  });

  it('keeps relationship endpoint failure separate from graph evidence', async () => {
    vi.mocked(mediaModule.fetchCalyxGenusMedia).mockResolvedValue(emptyMedia);
    vi.mocked(graphModule.fetchGenusGraphEvidence).mockResolvedValue({ status: 'unavailable' });
    vi.mocked(ocModule.fetchContinuumGraph).mockRejectedValue(new Error('offline'));
    const result = await fetchFeaturedTaxonContinuum('Vanilla');
    expect(result.relationships).toBeNull();
    expect(result.conservation.relationship).toBeNull();
    expect(result.genus).toBe('Vanilla');
  });
});
