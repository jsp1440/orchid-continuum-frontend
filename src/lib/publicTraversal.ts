import { CALYX_BACKEND_BASE_URL } from './backendConfig';
import { fetchWithColdStartRetry } from './coldStartFetch';

export type TraversalNode = { id: number; label: string; type: string };
export type TraversalEdge = {
  id: number; from: number; to: number; predicate: string; source: string; record: string; doi?: string;
};
export type Traversal = { nodes: TraversalNode[]; edges: TraversalEdge[]; truncated: boolean };

const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const publicSources: Record<string, string> = {
  genus_contains_species: 'public.taxonomy_species',
  species_belongs_to_genus: 'public.taxonomy_species',
  mycorrhizal_association_with: 'oc_mycorrhiza.orchid_fungal_associations',
};

export function projectPublicTraversal(raw: unknown): Traversal {
  if (!record(raw) || !record(raw.focal_node) || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges) ||
      !record(raw.pagination) || typeof raw.pagination.truncated !== 'boolean') throw new Error('Unverified graph response.');
  const nodes = new Map<number, TraversalNode>();
  for (const n of [raw.focal_node, ...raw.nodes]) {
    if (record(n) && id(n.id) && typeof n.node_type === 'string' && ['genus','taxon','organism'].includes(n.node_type) &&
        typeof n.label === 'string' && /^[\p{L}×][\p{L}× .-]{0,99}$/u.test(n.label)) {
      nodes.set(n.id, { id: n.id, type: n.node_type, label: n.label });
    }
  }
  const edges: TraversalEdge[] = [];
  for (const e of raw.edges) {
    if (!record(e) || !id(e.id) || !id(e.from) || !id(e.to) || !nodes.has(e.from) || !nodes.has(e.to) ||
        typeof e.edge_type !== 'string' || !Object.prototype.hasOwnProperty.call(publicSources, e.edge_type) ||
        !record(e.provenance) || e.provenance.source_table !== publicSources[e.edge_type] ||
        typeof e.provenance.source_pk !== 'string' || !/^\d{1,20}$/.test(e.provenance.source_pk)) continue;
    const doi = record(e.payload) && typeof e.payload.doi === 'string' && /^10\.\d{4,9}\/[a-z\d./()-]{1,130}$/i.test(e.payload.doi) ? e.payload.doi : undefined;
    edges.push({ id: e.id, from: e.from, to: e.to, predicate: e.edge_type, source: publicSources[e.edge_type], record: e.provenance.source_pk, doi });
  }
  const included = new Set([raw.focal_node.id, ...edges.flatMap(e => [e.from, e.to])]);
  return { nodes: [...nodes.values()].filter(n => included.has(n.id)), edges, truncated: raw.pagination.truncated };
}

export async function readPublicTraversal(root: number, signal: AbortSignal) {
  if (!id(root)) throw new Error('Invalid node identifier.');
  const url = new URL(`${CALYX_BACKEND_BASE_URL}/api/knowledge-graph/node/${root}`);
  url.search = new URLSearchParams({ depth: '1', limit: '12', edge_types: Object.keys(publicSources).join(',') }).toString();
  const response = await fetchWithColdStartRetry(url, { method: 'GET' }, signal);
  if (!response?.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Graph read unavailable.');
  return projectPublicTraversal(await response.json());
}
