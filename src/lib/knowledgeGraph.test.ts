import { describe, expect, it } from 'vitest';
import { normalizeGenusGraphEvidence } from '@/lib/knowledgeGraph';

const validPayload = {
  focal_node: { label: 'Cattleya' },
  graph: { node_count: 8, edge_count: 7 },
  pagination: { truncated: true, next_offset: 500 },
  domain_coverage: {
    taxonomy: { nodes: 2, edges: 1 },
    traits: { nodes: 1, edges: 2 },
    geography: { nodes: 2, edges: 1 },
    elevation: { nodes: 1, edges: 1 },
    mycorrhiza: { nodes: 1, edges: 1 },
  },
};

describe('normalizeGenusGraphEvidence', () => {
  it('normalizes authorized domains and makes absent evidence explicit', () => {
    const result = normalizeGenusGraphEvidence(validPayload);

    expect(result).toMatchObject({
      genus: 'Cattleya',
      nodeCount: 8,
      edgeCount: 7,
      truncated: true,
      nextOffset: 500,
    });
    expect(result?.domains.find(({ domain }) => domain === 'traits')).toEqual({
      domain: 'traits', nodes: 1, edges: 2,
    });
    expect(result?.domains.find(({ domain }) => domain === 'conservation')).toEqual({
      domain: 'conservation', nodes: 0, edges: 0,
    });
  });

  it('preserves canonical ecological graph coverage used by Atlas and featured-genus consumers', () => {
    const result = normalizeGenusGraphEvidence(validPayload);

    expect(result?.ecologicalDomains).toEqual([
      { domain: 'geography', nodes: 2, edges: 1 },
      { domain: 'habitat', nodes: 0, edges: 0 },
      { domain: 'climate', nodes: 0, edges: 0 },
      { domain: 'elevation', nodes: 1, edges: 1 },
      { domain: 'mycorrhiza', nodes: 1, edges: 1 },
    ]);
  });

  it('rejects malformed graph counts instead of presenting invented evidence', () => {
    expect(normalizeGenusGraphEvidence({
      ...validPayload,
      graph: { node_count: '8', edge_count: 7 },
    })).toBeNull();
  });

  it('rejects malformed domain coverage', () => {
    expect(normalizeGenusGraphEvidence({
      ...validPayload,
      domain_coverage: { taxonomy: { nodes: -1, edges: 1 } },
    })).toBeNull();
  });

  it('rejects malformed ecological coverage rather than dropping it silently', () => {
    expect(normalizeGenusGraphEvidence({
      ...validPayload,
      domain_coverage: {
        ...validPayload.domain_coverage,
        elevation: { nodes: '1', edges: 1 },
      },
    })).toBeNull();
  });
});
