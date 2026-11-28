import { describe, expect, it } from 'vitest';
import { projectPublicTraversal } from './publicTraversal';

describe('public graph exploration', () => {
  const raw = {
    focal_node: { id: 1, label: 'Epidendrum secundum', node_type: 'taxon' },
    nodes: [
      { id: 2, label: 'Ceratobasidium', node_type: 'organism' },
      { id: 3, label: 'Private locality', node_type: 'occurrence' },
    ],
    edges: [
      { id: 4, from: 1, to: 2, edge_type: 'mycorrhizal_association_with', provenance: { source_table: 'oc_mycorrhiza.orchid_fungal_associations', source_pk: '1' }, payload: { doi: '10.1016/j.sajb.2019.06.029', latitude: 1 } },
      { id: 5, from: 1, to: 3, edge_type: 'recorded_at' },
    ],
    pagination: { truncated: true },
  };
  it('uses the focal node and keeps only approved scientific endpoints and provenance', () => {
    const graph = projectPublicTraversal(raw);
    expect(graph.nodes.map(n => n.id)).toEqual([1, 2]);
    expect(graph.edges).toEqual([{ id: 4, from: 1, to: 2, predicate: 'mycorrhizal_association_with', source: 'oc_mycorrhiza.orchid_fungal_associations', record: '1', doi: '10.1016/j.sajb.2019.06.029' }]);
    expect(graph.truncated).toBe(true);
    expect(JSON.stringify(graph)).not.toMatch(/locality|latitude/i);
  });
  it('rejects an unavailable payload instead of returning an empty graph', () => {
    expect(() => projectPublicTraversal({ detail: 'upstream unavailable' })).toThrow();
  });
});
