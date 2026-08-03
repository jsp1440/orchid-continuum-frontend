import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchHomepageReadiness } from './homepageReadiness';

describe('fetchHomepageReadiness', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts the canonical live graph audit contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        contract: 'calyx-live-graph-audit-v1',
        generated_at: '2026-08-03T08:00:00Z',
        relational: {
          taxonomy_to_images: {
            state: 'available',
            total_taxa: 31840,
            total_images: 5070503,
          },
        },
        graph: {
          state: 'available',
          edge_table: 'oc_graph.kg_edges',
          total_edges: 70587,
          taxonomy_to_images: {
            state: 'available',
            value: 0,
            denominator: 70587,
            percentage: 0,
            detail: null,
          },
          integrity: { state: 'available', passed: true },
        },
        blockers: ['taxonomy_image_graph_edges_absent'],
        homepage_ready: false,
        warning: 'Relational and graph linkage are separate.',
      }),
    }));

    const result = await fetchHomepageReadiness();
    expect(result.status).toBe('live');
    if (result.status === 'live') {
      expect(result.audit.homepage_ready).toBe(false);
      expect(result.audit.graph.edge_table).toBe('oc_graph.kg_edges');
    }
  });

  it('rejects an unsupported contract instead of guessing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ contract: 'legacy-contract' }),
    }));

    await expect(fetchHomepageReadiness()).resolves.toEqual({
      status: 'unavailable',
      reason: 'Live graph-audit contract could not be verified.',
    });
  });
});
