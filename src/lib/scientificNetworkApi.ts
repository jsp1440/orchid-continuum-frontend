import { normalizeNetworkNode, normalizeScientificNetwork, NETWORK_LIMITS, type NetworkNode, type ScientificNetwork } from './scientificNetwork';

export class NetworkReadError extends Error {
  constructor(message: string, public readonly status: number | null = null) { super(message); }
}
async function read(base: string, path: string, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController(); const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 9000);
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/api/knowledge-graph${path}`, { method: 'GET', credentials: 'include', signal: controller.signal });
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403 ? 'This graph view requires authorized access.'
        : response.status === 404 ? 'No matching graph record was found. It may not be projected yet.'
          : 'The graph service is unavailable. No scientific result is inferred.';
      throw new NetworkReadError(message, response.status);
    }
    return await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof NetworkReadError) throw error;
    throw new NetworkReadError('The graph request did not complete. No scientific result is inferred.');
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}

export type NetworkSearch = { nodes: NetworkNode[]; truncated: boolean };
export type NetworkSourceRecord = { sourceId: number; label: string; fungus: string; doi: string | null };
export function createScientificNetworkClient(base: string) {
  return {
    async sourceSearch(query: string, signal?: AbortSignal): Promise<{ records: NetworkSourceRecord[]; truncated: boolean }> {
      const raw = await read(base, `/source-search?${new URLSearchParams({ q: query.trim(), limit: '20' })}`, signal);
      if (!raw || typeof raw !== 'object') throw new NetworkReadError('The source search response is invalid.');
      const payload = raw as { records?: unknown; truncated?: unknown };
      if (!Array.isArray(payload.records) || typeof payload.truncated !== 'boolean') throw new NetworkReadError('The source search response is invalid.');
      const records: NetworkSourceRecord[] = [];
      for (const item of payload.records) {
        const record = item as Record<string, unknown>;
        if (!record || !Number.isSafeInteger(record.source_id) || Number(record.source_id) <= 0 || typeof record.label !== 'string' || typeof record.fungus_name !== 'string') throw new NetworkReadError('The source search returned an invalid record.');
        records.push({ sourceId: Number(record.source_id), label: record.label.slice(0, 2000), fungus: record.fungus_name.slice(0, 2000), doi: typeof record.doi === 'string' ? record.doi.slice(0, 200) : null });
      }
      return { records: records.slice(0, 20), truncated: payload.truncated || records.length > 20 };
    },
    async sourceNetwork(sourceId: number, signal?: AbortSignal): Promise<ScientificNetwork> {
      if (!Number.isSafeInteger(sourceId) || sourceId <= 0) throw new NetworkReadError('A stable source record ID is required.');
      const raw = await read(base, `/source-network?${new URLSearchParams({ source_id: String(sourceId) })}`, signal);
      const graph = normalizeScientificNetwork(raw); if (!graph) throw new NetworkReadError('The source network response is invalid.');
      return graph;
    },
    async search(query: string, signal?: AbortSignal): Promise<NetworkSearch> {
      const raw = await read(base, `/search?${new URLSearchParams({ q: query.trim(), limit: '30' })}`, signal);
      if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { nodes?: unknown }).nodes) || typeof (raw as { truncated?: unknown }).truncated !== 'boolean') throw new NetworkReadError('The graph search returned an invalid response.');
      const payload = raw as { nodes: unknown[]; truncated: boolean }; const nodes = payload.nodes.map(normalizeNetworkNode);
      if (nodes.some(n => n === null)) throw new NetworkReadError('The graph search returned an invalid node.');
      return { nodes: (nodes as NetworkNode[]).slice(0, 30), truncated: payload.truncated || nodes.length > 30 };
    },
    async neighborhood(nodeId: string, signal?: AbortSignal, includeInactive = false): Promise<ScientificNetwork> {
      if (!/^\d+$/.test(nodeId)) throw new NetworkReadError('A stable graph node ID is required.');
      const query = new URLSearchParams({ node_id: nodeId, depth: '2', direction: 'both', limit: String(NETWORK_LIMITS.neighborhood), include_inactive: String(includeInactive) });
      const raw = await read(base, `/network?${query}`, signal); const graph = normalizeScientificNetwork(raw);
      if (!graph) throw new NetworkReadError('The graph service returned an invalid subgraph.');
      return graph;
    },
    async edge(edgeId: string, signal?: AbortSignal, includeInactive = false): Promise<ScientificNetwork> {
      if (!/^\d+$/.test(edgeId)) throw new NetworkReadError('A stable graph edge ID is required.');
      const raw = await read(base, `/edge/${encodeURIComponent(edgeId)}?include_inactive=${includeInactive}`, signal);
      if (!raw || typeof raw !== 'object') throw new NetworkReadError('The evidence response is invalid.');
      const payload = raw as { edge?: unknown; nodes?: unknown };
      const graph = normalizeScientificNetwork({ nodes: payload.nodes, edges: [payload.edge], pagination: { truncated: false } });
      if (!graph) throw new NetworkReadError('The evidence response is invalid.');
      return graph;
    },
  };
}
export type ScientificNetworkClient = ReturnType<typeof createScientificNetworkClient>;
