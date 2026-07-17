import { describe, expect, it } from 'vitest';
import { normalizeGenusGraphEvidence } from '@/lib/knowledgeGraph';

const validPayload = {
  focal_node: { label: 'Cattleya' },
  graph: { node_count: 4, edge_count: 3 },
  pagination: { truncated: true, next_offset: 500 },
  domain_coverage: {
    taxonomy: { nodes: 2, edges: 1 },
    traits: { nodes: 1, edges: 2 },
  },
};

describe('normalizeGenusGraphEvidence', () => {
  it('normalizes authorized domains and makes absent evidence explicit', () => {
    const result = normalizeGenusGraphEvidence(validPayload);

    expect(result).toMatchObject({
      genus: 'Cattleya',
      nodeCount: 4,
      edgeCount: 3,
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

  it('rejects malformed graph counts instead of presenting invented evidence', () => {
    expect(normalizeGenusGraphEvidence({
      ...validPayload,
      graph: { node_count: '4', edge_count: 3 },
    })).toBeNull();
  });

  it('rejects malformed domain coverage', () => {
    expect(normalizeGenusGraphEvidence({
      ...validPayload,
      domain_coverage: { taxonomy: { nodes: -1, edges: 1 } },
    })).toBeNull();
  });
});
