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
export type NetworkExplanation = {
  state: string; coverage: string; summary: string; missing: string[]; citations: string[];
  paths: Array<{ nodes: string[]; steps: Array<{ predicate: string; classification: string; status: string; evidenceIds: string[]; againstDirection: boolean }> }>;
};
function normalizeExplanation(raw: unknown): NetworkExplanation {
  if (!raw || typeof raw !== 'object') throw new NetworkReadError('The Brain evidence response is invalid.');
  const payload = raw as Record<string, unknown>;
  if (payload.answer_state === 'SOURCE_ACCESS_UNAVAILABLE') throw new NetworkReadError('The existing reader cannot access this source scope.');
  if (payload.automatic_publication !== false || payload.human_review_required !== true || payload.reasoning_ledger_written === true || !Array.isArray(payload.paths) || !Array.isArray(payload.relationships) || !Array.isArray(payload.missing_evidence)) throw new NetworkReadError('The Brain evidence response did not preserve scientific review safeguards.');
  const safeText = (value: unknown, fallback = 'unknown') => typeof value === 'string' ? value.slice(0, 2000) : fallback;
  const paths: NetworkExplanation['paths'] = [];
  for (const rawPath of payload.paths.slice(0, 100)) {
    const path = rawPath as Record<string, unknown>;
    if (!path || !Array.isArray(path.node_ids) || !Array.isArray(path.steps)) throw new NetworkReadError('The Brain evidence path is invalid.');
    const steps: NetworkExplanation['paths'][number]['steps'] = [];
    for (const rawStep of path.steps.slice(0, 6)) {
      const step = rawStep as Record<string, unknown>;
      if (!step || typeof step !== 'object') throw new NetworkReadError('The Brain evidence step is invalid.');
      steps.push({ predicate: safeText(step.predicate), classification: safeText(step.classification), status: safeText(step.validation_status), againstDirection: step.traversed_against_direction === true,
        evidenceIds: Array.isArray(step.evidence_ids) ? step.evidence_ids.slice(0, 30).map(value => safeText(typeof value === 'number' ? String(value) : value)) : [],
      });
    }
    paths.push({ nodes: path.node_ids.slice(0, 7).map(value => safeText(typeof value === 'number' ? String(value) : value)), steps });
  }
  const citations: string[] = [];
  for (const rawEdge of payload.relationships.slice(0, 200)) {
    const edge = rawEdge as Record<string, unknown>;
    if (!edge || !Array.isArray(edge.evidence)) continue;
    for (const rawEvidence of edge.evidence.slice(0, 30)) {
      const evidence = rawEvidence as Record<string, unknown>; const citation = evidence?.citation as Record<string, unknown> | null;
      if (citation && citation.withheld !== true && typeof citation.text === 'string') citations.push(safeText(citation.text));
    }
  }
  return { state: safeText(payload.answer_state), coverage: safeText(payload.coverage), summary: safeText(payload.summary, 'No scientific conclusion is inferred.'), paths,
    missing: payload.missing_evidence.slice(0, 100).map(value => safeText(value)), citations: [...new Set(citations)] };
}
export function createScientificNetworkClient(base: string) {
  return {
    async explain(mode: 'materialized' | 'source', identifier: number, signal?: AbortSignal): Promise<NetworkExplanation> {
      if (!Number.isSafeInteger(identifier) || identifier <= 0) throw new NetworkReadError('A stable evidence root is required.');
      const controller = new AbortController(); const abort = () => controller.abort();
      if (signal?.aborted) controller.abort(); signal?.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(abort, 20000);
      try {
        const response = await fetch(`${base.replace(/\/$/, '')}/brain/missions/${mode === 'source' ? 'source-evidence' : 'graph-evidence'}`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify(mode === 'source' ? { source_id: identifier, limit: 20 } : { root_node_id: identifier, depth: 2, limit: 100 }),
        });
        if (!response.ok) {
          let code = ''; try { const payload = await response.json() as { detail?: { code?: unknown } }; if (typeof payload.detail?.code === 'string') code = payload.detail.code; } catch { /* No raw refusal payload is displayed. */ }
          const message = response.status === 401 || response.status === 403 ? 'Owner authorization is required for Brain graph evidence.'
            : response.status === 409 && code === 'MCP_GRAPH_EVIDENCE_DISABLED' ? 'Brain graph evidence is disabled. This control does not enable it.'
              : response.status === 503 && code === 'MCP_EVIDENCE_DSN_NOT_CONFIGURED' ? 'The restricted Brain evidence reader is not configured in this runtime.'
                : response.status === 503 && code === 'SOURCE_ACCESS_UNAVAILABLE' ? 'The existing reader cannot access this source scope.'
                  : 'Brain evidence retrieval is unavailable. No scientific conclusion is inferred.';
          throw new NetworkReadError(message, response.status);
        }
        return normalizeExplanation(await response.json());
      } catch (error) { if (signal?.aborted || error instanceof NetworkReadError) throw error; throw new NetworkReadError('Brain evidence retrieval did not complete. No scientific conclusion is inferred.'); }
      finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
    },
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
