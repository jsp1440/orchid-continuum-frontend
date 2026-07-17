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

export type KnowledgeGraphDomain = (typeof KNOWLEDGE_GRAPH_DOMAINS)[number];

export type DomainEvidence = {
  domain: KnowledgeGraphDomain;
  nodes: number;
  edges: number;
};

export type GenusGraphEvidence = {
  genus: string;
  domains: DomainEvidence[];
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

  const domains: DomainEvidence[] = [];
  for (const domain of KNOWLEDGE_GRAPH_DOMAINS) {
    const rawCoverage = payload.domain_coverage[domain];
    if (rawCoverage === undefined) {
      domains.push({ domain, nodes: 0, edges: 0 });
      continue;
    }
    if (!isRecord(rawCoverage)) return null;
    const nodes = nonNegativeInteger(rawCoverage.nodes);
    const edges = nonNegativeInteger(rawCoverage.edges);
    if (nodes === null || edges === null) return null;
    domains.push({ domain, nodes, edges });
  }

  return { genus: genus.trim(), domains, nodeCount, edgeCount, truncated, nextOffset };
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
