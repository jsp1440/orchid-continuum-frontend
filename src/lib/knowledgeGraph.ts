import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

export const KNOWLEDGE_GRAPH_DOMAINS = [
  'taxonomy',
  'media',
  'occurrences',
  'traits',
  'literature',
  'pollinators',
  'conservation',
] as const;

export const ECOLOGICAL_KNOWLEDGE_GRAPH_DOMAINS = [
  'geography',
  'habitat',
  'climate',
  'elevation',
  'mycorrhiza',
] as const;

export type KnowledgeGraphDomain = (typeof KNOWLEDGE_GRAPH_DOMAINS)[number];
export type EcologicalKnowledgeGraphDomain = (typeof ECOLOGICAL_KNOWLEDGE_GRAPH_DOMAINS)[number];

export type DomainEvidence = {
  domain: KnowledgeGraphDomain;
  nodes: number;
  edges: number;
};

export type EcologicalDomainEvidence = {
  domain: EcologicalKnowledgeGraphDomain;
  nodes: number;
  edges: number;
};

export type GenusGraphEvidence = {
  genus: string;
  domains: DomainEvidence[];
  /**
   * Canonical ecological coverage returned by the backend graph vocabulary.
   * Optional only for compatibility with older deterministic fixtures; live
   * normalized responses always populate all five entries, using zero for an
   * unlinked domain rather than silently dropping it.
   */
  ecologicalDomains?: EcologicalDomainEvidence[];
  nodeCount: number;
  edgeCount: number;
  truncated: boolean;
  nextOffset: number | null;
};

export type GenusGraphResult =
  | { status: 'ok'; evidence: GenusGraphEvidence }
  | { status: 'not_found' }
  | { status: 'unavailable' }
  | { status: 'invalid' };

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function normalizeDomainCoverage<TDomain extends string>(
  payload: JsonRecord,
  domains: readonly TDomain[],
): Array<{ domain: TDomain; nodes: number; edges: number }> | null {
  const normalized: Array<{ domain: TDomain; nodes: number; edges: number }> = [];

  for (const domain of domains) {
    const rawCoverage = payload[domain];
    if (rawCoverage === undefined) {
      normalized.push({ domain, nodes: 0, edges: 0 });
      continue;
    }
    if (!isRecord(rawCoverage)) return null;
    const nodes = nonNegativeInteger(rawCoverage.nodes);
    const edges = nonNegativeInteger(rawCoverage.edges);
    if (nodes === null || edges === null) return null;
    normalized.push({ domain, nodes, edges });
  }

  return normalized;
}

export function normalizeGenusGraphEvidence(payload: unknown): GenusGraphEvidence | null {
  if (!isRecord(payload) || !isRecord(payload.focal_node) || !isRecord(payload.graph)) return null;
  if (!isRecord(payload.pagination) || !isRecord(payload.domain_coverage)) return null;

  const genus = payload.focal_node.label;
  const nodeCount = nonNegativeInteger(payload.graph.node_count);
  const edgeCount = nonNegativeInteger(payload.graph.edge_count);
  const truncated = payload.pagination.truncated;
  const rawNextOffset = payload.pagination.next_offset;
  const nextOffset = rawNextOffset === null ? null : nonNegativeInteger(rawNextOffset);

  if (typeof genus !== 'string' || !genus.trim() || nodeCount === null || edgeCount === null) return null;
  if (typeof truncated !== 'boolean' || (rawNextOffset !== null && nextOffset === null)) return null;

  const domains = normalizeDomainCoverage(payload.domain_coverage, KNOWLEDGE_GRAPH_DOMAINS);
  const ecologicalDomains = normalizeDomainCoverage(
    payload.domain_coverage,
    ECOLOGICAL_KNOWLEDGE_GRAPH_DOMAINS,
  );
  if (!domains || !ecologicalDomains) return null;

  return {
    genus: genus.trim(),
    domains,
    ecologicalDomains,
    nodeCount,
    edgeCount,
    truncated,
    nextOffset,
  };
}

export async function fetchGenusGraphEvidence(
  genus: string,
  signal?: AbortSignal,
  timeoutMs = 8_000,
): Promise<GenusGraphResult> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = new URL(
      `${CALYX_BACKEND_BASE_URL}/api/knowledge-graph/genus/${encodeURIComponent(genus)}`,
    );
    url.searchParams.set('depth', '2');
    url.searchParams.set('limit', '500');
    url.searchParams.set('offset', '0');

    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    if (response.status === 404) return { status: 'not_found' };
    if (!response.ok) return { status: 'unavailable' };

    const evidence = normalizeGenusGraphEvidence(await response.json());
    return evidence ? { status: 'ok', evidence } : { status: 'invalid' };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { status: 'unavailable' };
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}
