// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ScientificNetworkExplorer from './ScientificNetworkExplorer';
import { createScientificNetworkClient } from '@/lib/scientificNetworkApi';

vi.mock('@/lib/backendConfig', () => ({ CALYX_BACKEND_BASE_URL: 'http://graph-fixture.test' }));

// Isolated synthetic HTTP response fixtures, never production science.
const node = (id: number, label: string, node_type: string) => ({ id, label, node_type });
const orchid = node(1, 'Fixture orchid', 'taxon'); const bee = node(2, 'Fixture bee', 'pollinator');
const trait = node(3, 'Fixture fragrance', 'trait'); const paper = node(4, 'Fixture paper', 'publication');
const evidence = [
  { id: 'source:a', provenance: { source_table: 'fixture.observations', source_pk: 'a' }, classification: 'observed', validation_status: 'DISPUTED', citation: { text: 'Synthetic study A' } },
  { id: 'source:b', provenance: { source_table: 'fixture.observations', source_pk: 'b' }, classification: 'hypothesis', validation_status: 'REJECTED', citation: { text: 'Synthetic study B' } },
];
const relation = (id: number, from: number, to: number, edge_type: string) => ({ id, from, to, edge_type, is_active: true, evidence_class: 'observed', validation_status: 'UNVERIFIED', classification: 'hypothesis', provenance: { source_table: 'fixture.observations' }, evidence });
const interaction = relation(11, 1, 2, 'synthetic_visitation'); const scent = relation(12, 2, 3, 'synthetic_trait_association'); const supports = relation(13, 3, 4, 'synthetic_citation');
const sourceConcept = `source_concept:oc_mycorrhiza.orchid_fungal_associations:orchid_name:${'a'.repeat(64)}`;
const sourceAssertion = 'source_assertion:oc_mycorrhiza.orchid_fungal_associations:3';
const envelope = (nodes: unknown[], edges: unknown[]) => ({ nodes, edges, pagination: { truncated: true }, scope: { depth: 2 }, warnings: ['SYNTHETIC_TEST_ONLY'] });
let container: HTMLDivElement; let root: Root; let calls: string[];
const response = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container); calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    calls.push(String(input)); const url = new URL(String(input));
    if (url.pathname.endsWith('/source-search')) return response({ records: [{ source_id: 3, label: 'Fixture source orchid', fungus_name: 'Fixture fungus', doi: null, validation_status: 'UNVERIFIED', canonical_crosswalk: 'UNRESOLVED' }], truncated: false });
    if (url.pathname.endsWith('/source-network')) return response(envelope([{ id: sourceConcept, label: 'Fixture source orchid', node_type: 'source_concept' }, { id: sourceAssertion, label: 'Fixture unverified assertion', node_type: 'assertion' }], [{ ...interaction, id: `${sourceAssertion}:subject`, from: sourceConcept, to: sourceAssertion, classification: 'literature_assertion', is_active: false }]));
    if (url.pathname.endsWith('/graph-evidence')) return response({ automatic_publication: false, human_review_required: true, answer_state: 'EVIDENCE_NETWORK_RETURNED', coverage: 'PARTIAL_GRAPH_VIEW', summary: 'Synthetic traversal explanation, not scientific entailment.', relationships: [{ evidence }], missing_evidence: ['SYNTHETIC_VALIDATION_INCOMPLETE'], paths: [{ node_ids: [1, 2], steps: [{ predicate: 'synthetic_visitation', classification: 'hypothesis', validation_status: 'UNVERIFIED', evidence_ids: ['source:a'], traversed_against_direction: false }] }], raw_packet: { contributor_email: 'private@example.invalid' } });
    if (url.pathname.endsWith('/search')) return response({ nodes: [orchid, { ...orchid, id: 5, label: 'Fixture orchid historical name' }], truncated: false });
    if (url.pathname.endsWith('/network')) return response(url.searchParams.get('node_id') === '2' ? envelope([orchid, bee, trait, paper], [interaction, scent, supports]) : envelope([orchid, bee], [interaction]));
    if (url.pathname.endsWith('/edge/11')) return response({ edge: interaction, nodes: [orchid, bee], scope: {} });
    return response({}, 404);
  }));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function mount() { await act(async () => root.render(<ScientificNetworkExplorer initialQuery="Fixture" />)); }
async function click(element: Element | null | undefined) { expect(element).toBeTruthy(); await act(async () => element!.dispatchEvent(new MouseEvent('click', { bubbles: true }))); }
const button = (text: string) => Array.from(container.querySelectorAll('button')).find(b => b.textContent === text);

describe('mounted scientific network HTTP journey', () => {
  it('requires identity choice, expands a non-taxonomic node and inspects separate evidence', async () => {
    await mount(); expect(container.textContent).toContain('Fixture orchid historical name'); expect(calls.some(x => x.includes('/network?'))).toBe(false);
    await click(button('Fixture orchid · taxon · #1'));
    expect(container.querySelector('[aria-label="Expand Fixture bee #2"]')).toBeTruthy();
    expect(calls.find(x => x.includes('/network?'))).toContain('depth=2');
    await click(container.querySelector('[aria-label="Expand Fixture bee #2"]'));
    expect(container.querySelector('[aria-label="Expand Fixture fragrance #3"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Expand Fixture paper #4"]')).toBeTruthy();
    await click(container.querySelector('[aria-label="Inspect relationship synthetic_visitation #11"]'));
    expect(container.textContent).toContain('Supporting evidence records (2)'); expect(container.textContent).toContain('Synthetic study A'); expect(container.textContent).toContain('DISPUTED'); expect(container.textContent).toContain('REJECTED');
    expect(container.textContent).toContain('never the complete graph'); expect(container.textContent).toContain('Results are truncated');
  });
  it('exports the selected normalized subgraph and filters detached edges consistently', async () => {
    await mount(); await click(button('Fixture orchid · taxon · #1'));
    const createObjectURL = vi.fn(() => 'blob:fixture'); const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL; URL.revokeObjectURL = revokeObjectURL;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await click(button('Export selected view and provenance'));
    expect(createObjectURL).toHaveBeenCalledOnce(); expect(revokeObjectURL).toHaveBeenCalledWith('blob:fixture');
    const select = container.querySelector('[aria-label="Evidence quality"]') as HTMLSelectElement;
    await act(async () => { select.value = 'observed'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(container.querySelector('[aria-label="Expand Fixture bee #2"]')).toBeTruthy();
    await click(container.querySelector('[aria-label="Zoom in"]')); expect(container.querySelector('svg > g')?.getAttribute('transform')).toContain('scale(1.25)');
    await click(button('Reset network')); expect(container.querySelector('svg')).toBeNull();
  });
  it('keeps source-only identities and unverified assertions separate from numeric KG expansion', async () => {
    await mount(); const mode = container.querySelector('[aria-label="Graph evidence view"]') as HTMLSelectElement;
    await act(async () => { mode.value = 'source'; mode.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(container.textContent).toContain('unresolved canonical identity');
    await click(button('Fixture source orchid · Fixture fungus · source #3 · unverified'));
    const before = calls.length; await click(container.querySelector(`[aria-label="Inspect Fixture source orchid #${sourceConcept}"]`));
    expect(calls).toHaveLength(before); expect(container.textContent).toContain('Show loaded neighborhood');
    await click(container.querySelector(`[aria-label="Inspect relationship synthetic_visitation #${sourceAssertion}:subject"]`));
    expect(container.textContent).toContain('literature_assertion'); expect(container.textContent).toContain('Recorded source assertion (not materialized in KG)');
    expect(calls.some(x => /node_id=source/.test(x))).toBe(false);
  });
  it('shows authorization refusal without substituting synthetic or cached science', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({}, 403))); await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('requires authorized access'); expect(container.querySelector('svg')).toBeNull();
  });
  it('does not attach arbitrary graph IDs to numeric KG endpoints', async () => {
    const client = createScientificNetworkClient('http://graph-fixture.test');
    await expect(client.neighborhood('source:assertion:3')).rejects.toThrow('stable graph node ID');
    expect(calls).toEqual([]);
  });
  it('requests bounded authenticated deterministic Brain explanation and renders only safe paths, citations and gaps', async () => {
    await mount(); await click(button('Fixture orchid · taxon · #1')); await click(button('Explain retrieved paths with Brain'));
    const result = container.querySelector('[aria-label="Brain graph explanation"]'); expect(result).toBeTruthy();
    expect(result?.textContent).toContain('Human review required'); expect(result?.textContent).toContain('UNVERIFIED'); expect(result?.textContent).toContain('Synthetic study A');
    expect(result?.textContent).toContain('SYNTHETIC_VALIDATION_INCOMPLETE'); expect(result?.textContent).not.toContain('private@example.invalid');
    const call = vi.mocked(fetch).mock.calls.find(args => String(args[0]).endsWith('/brain/missions/graph-evidence'))!;
    expect(call[1]).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(String(call[1]?.body))).toEqual({ root_node_id: 1, depth: 2, limit: 100 });
  });
  it('preserves default-off Brain controls without enabling a provider or fabricating an explanation', async () => {
    await mount(); await click(button('Fixture orchid · taxon · #1'));
    vi.stubGlobal('fetch', vi.fn(async () => response({ detail: { code: 'MCP_GRAPH_EVIDENCE_DISABLED' } }, 409)));
    await click(button('Explain retrieved paths with Brain'));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('disabled. This control does not enable it');
    expect(container.querySelector('[aria-label="Brain graph explanation"]')).toBeNull();
  });
  it('uses the selected source record ID for authenticated source explanation without substituting a KG root', async () => {
    await mount(); const mode = container.querySelector('[aria-label="Graph evidence view"]') as HTMLSelectElement;
    await act(async () => { mode.value = 'source'; mode.dispatchEvent(new Event('change', { bubbles: true })); });
    await click(button('Fixture source orchid · Fixture fungus · source #3 · unverified'));
    vi.stubGlobal('fetch', vi.fn(async () => response({ automatic_publication: false, human_review_required: true, answer_state: 'EVIDENCE_NETWORK_RETURNED', coverage: 'PARTIAL_SOURCE_VIEW', relationships: [{ evidence }], missing_evidence: ['CANONICAL_CROSSWALK_UNRESOLVED'], paths: [] })));
    await click(button('Explain retrieved paths with Brain'));
    const call = vi.mocked(fetch).mock.calls[0]; expect(String(call[0])).toBe('http://graph-fixture.test/brain/missions/source-evidence');
    expect(call[1]).toMatchObject({ method: 'POST', credentials: 'include' }); expect(JSON.parse(String(call[1]?.body))).toEqual({ source_id: 3, limit: 20 });
    expect(container.querySelector('[aria-label="Brain graph explanation"]')?.textContent).toContain('CANONICAL_CROSSWALK_UNRESOLVED');
  });
  it.each([
    [503, { detail: { code: 'SOURCE_ACCESS_UNAVAILABLE' } }],
    [200, { automatic_publication: false, human_review_required: true, answer_state: 'SOURCE_ACCESS_UNAVAILABLE', nodes: [], relationships: [], paths: [], coverage: 'PARTIAL_SOURCE_VIEW', missing_evidence: ['SOURCE_EVIDENCE_READER_SCOPE_UNAVAILABLE'] }],
  ])('shows source reader refusal at HTTP %i without fabricated paths', async (status, payload) => {
    await mount(); const mode = container.querySelector('[aria-label="Graph evidence view"]') as HTMLSelectElement;
    await act(async () => { mode.value = 'source'; mode.dispatchEvent(new Event('change', { bubbles: true })); });
    await click(button('Fixture source orchid · Fixture fungus · source #3 · unverified'));
    vi.stubGlobal('fetch', vi.fn(async () => response(payload, status)));
    await click(button('Explain retrieved paths with Brain'));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('existing reader cannot access this source scope');
    expect(container.querySelector('[aria-label="Brain graph explanation"]')).toBeNull();
  });
});
