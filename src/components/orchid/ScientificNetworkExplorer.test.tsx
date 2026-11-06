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
const envelope = (nodes: unknown[], edges: unknown[]) => ({ nodes, edges, pagination: { truncated: true }, scope: { depth: 2 }, warnings: ['SYNTHETIC_TEST_ONLY'] });
let container: HTMLDivElement; let root: Root; let calls: string[];
const response = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container); calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    calls.push(String(input)); const url = new URL(String(input));
    if (url.pathname.endsWith('/source-search')) return response({ records: [{ source_id: 3, label: 'Fixture source orchid', fungus_name: 'Fixture fungus', doi: null, validation_status: 'UNVERIFIED', canonical_crosswalk: 'UNRESOLVED' }], truncated: false });
    if (url.pathname.endsWith('/source-network')) return response(envelope([{ id: 'source:concept:3', label: 'Fixture source orchid', node_type: 'source_concept' }, { id: 'source:assertion:3', label: 'Fixture unverified assertion', node_type: 'assertion' }], [{ ...interaction, id: 'source:edge:3', from: 'source:concept:3', to: 'source:assertion:3', classification: 'literature_assertion', is_active: false }]));
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
    const before = calls.length; await click(container.querySelector('[aria-label="Inspect Fixture source orchid #source:concept:3"]'));
    expect(calls).toHaveLength(before); expect(container.textContent).toContain('Show loaded neighborhood');
    await click(container.querySelector('[aria-label="Inspect relationship synthetic_visitation #source:edge:3"]'));
    expect(container.textContent).toContain('literature_assertion'); expect(container.textContent).toContain('Inactive historical assertion');
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
});
