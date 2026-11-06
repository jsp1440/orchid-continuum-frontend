import { describe, expect, it } from 'vitest';
import { boundedPaths, EMPTY_FILTERS, exportScientificNetwork, filterScientificNetwork, layoutScientificNetwork, mergeScientificNetworks, networkComponents, normalizeScientificNetwork } from './scientificNetwork';

// Entirely synthetic contract fixtures. No production biological claim.
const n = (id: number, node_type: string) => ({ id, node_type, label: `Synthetic ${node_type} ${id}`, payload: { latitude: 12, contributor_email: 'private@example.invalid' } });
const e = (id: number, from: number, to: number, edge_type = 'synthetic_association') => ({ id, from, to, edge_type, is_active: true, evidence_class: 'literature', validation_status: 'UNVERIFIED', classification: 'hypothesis', confidence: { score: null }, provenance: { source_table: 'fixture.assertions' }, evidence: [] });
export const syntheticNetworkPayload = () => ({ nodes: [n(1, 'taxon'), n(2, 'pollinator'), n(3, 'trait'), n(4, 'publication'), n(5, 'habitat')], edges: [e(11, 1, 2), e(12, 2, 3), e(13, 3, 4), e(14, 2, 4)], pagination: { truncated: false }, scope: { depth: 2 } });

describe('bounded scientific network projection', () => {
  it('traverses several types with no taxonomy intermediate and finds alternatives', () => {
    const g = normalizeScientificNetwork(syntheticNetworkPayload())!;
    expect(boundedPaths(g, '2', '4')).toEqual([['14'], ['12', '13']]);
    expect(g.edges.find(edge => edge.id === '12')?.classification).toBe('hypothesis');
  });
  it('keeps distinct evidence records and does not promote confidence or unknown status', () => {
    const raw = syntheticNetworkPayload();
    raw.edges[0].evidence = [
      { id: 'study:1', provenance: { source_table: 'fixture.study', source_pk: 'a' }, classification: 'observed', validation_status: 'DISPUTED', citation: { text: 'Synthetic citation one' } },
      { id: 'study:2', provenance: { source_table: 'fixture.study', source_pk: 'b' }, classification: 'inferred', validation_status: 'REJECTED', citation: { text: 'Synthetic citation two' } },
    ] as never[];
    const edge = normalizeScientificNetwork(raw)!.edges[0];
    expect(edge.evidence).toHaveLength(2); expect(edge.evidence.map(x => x.status)).toEqual(['DISPUTED', 'REJECTED']);
    expect(edge.confidence).toBeNull();
  });
  it('omits raw private fields and withheld citation contents from export', () => {
    const raw = syntheticNetworkPayload();
    raw.edges[0].evidence = [{ id: 'study:1', citation: { text: 'private exact locality', withheld: true }, contributor: 'private@example.invalid', raw_payload: { coordinates: [1, 2] } }] as never[];
    const out = exportScientificNetwork(normalizeScientificNetwork(raw)!);
    for (const secret of ['private exact locality', 'private@example.invalid', 'latitude', 'coordinates', 'raw_payload']) expect(out).not.toContain(secret);
    expect(out).toContain('never the complete graph');
  });
  it('does not relabel validation state as taxonomic status or resolve similar names implicitly', () => {
    const raw = syntheticNetworkPayload(); const g = normalizeScientificNetwork(raw)!;
    expect(g.nodes[0].status).toBe('unknown');
    expect(g.nodes.map(x => x.id)).toContain('1');
  });
  it('counts disconnected returned components, retains reverse and parallel assertions separately', () => {
    const raw = syntheticNetworkPayload(); raw.edges.push(e(15, 2, 1), e(16, 1, 2));
    const g = normalizeScientificNetwork(raw)!;
    expect(networkComponents(g).map(x => x.length).sort()).toEqual([1, 4]);
    expect(g.edges).toHaveLength(6);
  });
  it('filters endpoints consistently and never leaves detached SVG edges', () => {
    const g = normalizeScientificNetwork(syntheticNetworkPayload())!;
    const filtered = filterScientificNetwork(g, { ...EMPTY_FILTERS, relationship: 'missing' });
    expect(filtered.nodes).toEqual([]); expect(filtered.edges).toEqual([]);
  });
  it('merges expansion by stable IDs without inflating duplicate assertions', () => {
    const g = normalizeScientificNetwork(syntheticNetworkPayload())!;
    expect(mergeScientificNetworks(g, g).edges).toHaveLength(g.edges.length);
    expect(mergeScientificNetworks(g, { ...g, truncated: true }).truncated).toBe(true);
  });
  it('rejects malformed graph envelope and drops missing endpoint references explicitly', () => {
    expect(normalizeScientificNetwork({ nodes: [], edges: [] })).toBeNull();
    const raw = syntheticNetworkPayload(); raw.edges.push(e(77, 1, 999));
    expect(normalizeScientificNetwork(raw)!.dangling).toBe(1);
  });
  it('caps work and marks a larger response partial instead of claiming complete loading', () => {
    const raw = { ...syntheticNetworkPayload(), nodes: Array.from({ length: 300 }, (_, i) => n(i + 1, 'trait')), edges: [] };
    const g = normalizeScientificNetwork(raw)!;
    expect(g.nodes).toHaveLength(250); expect(g.truncated).toBe(true);
  });
  it('computes finite deterministic spring positions', () => {
    const g = normalizeScientificNetwork(syntheticNetworkPayload())!;
    const first = layoutScientificNetwork(g); expect(first).toEqual(layoutScientificNetwork(g));
    for (const position of first.values()) { expect(Number.isFinite(position.x)).toBe(true); expect(position.x).toBeGreaterThanOrEqual(55); expect(position.y).toBeLessThanOrEqual(545); }
  });
  it('preserves namespaced source-only identities without conflating them with KG nodes', () => {
    const g = normalizeScientificNetwork({ nodes: [{ id: 'source:fungal:3', node_type: 'assertion', label: 'Synthetic source record' }], edges: [], pagination: { truncated: false } })!;
    expect(g.nodes[0].id).toBe('source:fungal:3');
  });
});
