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
    const source = 'source_assertion:oc_mycorrhiza.orchid_fungal_associations:3';
    const g = normalizeScientificNetwork({ nodes: [{ id: source, node_type: 'assertion', label: 'Synthetic source record' }], edges: [], pagination: { truncated: false } })!;
    expect(g.nodes[0].id).toBe(source);
    const article = normalizeScientificNetwork({ nodes: [{ id: 'publication:doi:10.1016/S0304-4238(00)00100-0', node_type: 'publication', label: 'Synthetic DOI namespace' }], edges: [], pagination: { truncated: false } });
    expect(article?.nodes[0].id).toBe('publication:doi:10.1016/S0304-4238(00)00100-0');
  });
  it('preserves privacy-projected license and taxonomy text while honoring withheld fields', () => {
    const raw = syntheticNetworkPayload(); Object.assign(raw.nodes[0], { taxonomic_version: { text: 'Synthetic release v1', withheld: false } });
    raw.edges[0].evidence = [{ id: 'study:fixture', license: { text: 'CC-BY-4.0', withheld: false }, taxonomic_version: { text: 'Private version', withheld: true } }] as never[];
    const g = normalizeScientificNetwork(raw)!; expect(g.nodes[0].taxonomicVersion).toBe('Synthetic release v1');
    expect(g.edges[0].evidence[0].license).toBe('CC-BY-4.0'); expect(g.edges[0].evidence[0].taxonomicVersion).toBeNull();
  });
  it('retains disputed assertion linkage and review state while withholding restricted conflict IDs', () => {
    const raw = syntheticNetworkPayload(); raw.edges[0].evidence = [
      { id: 'evidence:fixture', assertion_id: 'assertion:fixture', conflicting_assertion_ids: ['assertion:other'], conflict_declaration: { present: true, truncated: true, withheld: false }, review_state: 'DISPUTED', verification_state: 'UNVERIFIED' },
      { id: 'evidence:restricted', conflicting_assertion_ids: ['private:record:99'], conflict_declaration: { present: true, withheld: true } },
    ] as never[];
    const g = normalizeScientificNetwork(raw)!; const evidence = g.edges[0].evidence;
    expect(evidence[0].conflictingAssertionIds).toEqual(['assertion:other']); expect(evidence[0].assertionId).toBe('assertion:fixture');
    expect(evidence[0].reviewState).toBe('DISPUTED'); expect(evidence[0].conflict.truncated).toBe(true);
    expect(evidence[1].conflict.withheld).toBe(true); expect(exportScientificNetwork(g)).not.toContain('private:record:99');
  });
  it('preserves unknown experimental flags and historical validity without treating null as false', () => {
    const raw = syntheticNetworkPayload(); raw.edges[0].evidence = [{ id: 'study:history', experimental_scope: { germination_confirmed: null, protocorm_confirmed: false, adult_root_confirmed: true }, temporal_context: { temporal_status: 'HISTORICAL', valid_from: { text: '2001-01-01', withheld: false }, valid_to: { text: '2002-01-01', withheld: false } } }] as never[];
    const evidence = normalizeScientificNetwork(raw)!.edges[0].evidence[0];
    expect(evidence.experimentalScope).toBe('germination_confirmed=unknown; protocorm_confirmed=false; adult_root_confirmed=true');
    expect(evidence.temporalStatus).toBe('HISTORICAL'); expect(evidence.validFrom).toBe('2001-01-01'); expect(evidence.validTo).toBe('2002-01-01');
  });
  it('filters taxonomic identity status without dropping non-taxonomic ecological context', () => {
    const raw = syntheticNetworkPayload(); Object.assign(raw.nodes[0], { taxonomic_status: 'accepted' });
    const g = filterScientificNetwork(normalizeScientificNetwork(raw)!, { ...EMPTY_FILTERS, taxonomicStatus: 'accepted' });
    expect(g.nodes.map(node => node.type)).toContain('pollinator'); expect(g.edges.some(edge => edge.source === '1' && edge.target === '2')).toBe(true);
  });
});
