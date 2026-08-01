import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

export const CALYX_INFERENCE_TYPES = [
  'habitat_similarity',
  'pollinator_similarity',
  'cultivation_similarity',
  'conservation_risk',
  'evolutionary_relationship',
  'probable_mycorrhizal_partner',
  'missing_ecological_interaction',
  'climate_compatibility',
  'restoration_suitability',
  'hybrid_compatibility',
  'likely_flowering_period',
  'geographic_expansion',
  'undiscovered_population',
] as const;

export type CalyxInferenceType = typeof CALYX_INFERENCE_TYPES[number];

export type CalyxNode = {
  id: number;
  node_type: string;
  canonical_key: string;
  label?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
};

export type CalyxEdge = {
  id: number;
  from_node_id: number;
  to_node_id: number;
  edge_type: string;
  confidence_score?: number | null;
  evidence_class?: string | null;
  source_table?: string | null;
  source_pk?: string | null;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
};

export type CalyxCitation = {
  edge_id: number;
  source_table?: string | null;
  source_pk?: string | null;
  doi?: string | null;
  citation?: string | null;
  evidence_class?: string | null;
};

export type CalyxInferenceResult = {
  candidate_node_id: number;
  confidence: number;
  proposed_relationship: {
    predicate: string;
    object_node_id: number;
    object_canonical_key: string;
  };
  rule_id: string;
  rule_version: string;
  rule_trace: Array<{ step: number; kind: string; value: unknown }>;
  evidence_edge_ids: number[];
  evidence: CalyxEdge[];
  citations: CalyxCitation[];
  supporting_citations?: CalyxCitation[];
  source_hashes: string[];
  literature_evidence_references: Array<Record<string, unknown>>;
  originating_connector_ids: string[];
  inference_content_hash: string;
};

export type CalyxInferenceResponse = {
  subject: CalyxNode;
  inference_type: CalyxInferenceType;
  rule: {
    rule_id: string;
    version: string;
    mode: string;
    edge_types: string[];
    weight: number;
  };
  results: CalyxInferenceResult[];
  governance: {
    status: string;
    automatically_published: boolean;
    human_review_required: boolean;
  };
};

export type CalyxGraphQueryResponse = {
  nodes: CalyxNode[];
  edges: CalyxEdge[];
  limit: number;
  read_only: boolean;
};

type JsonRecord = Record<string, unknown>;

async function requestJson<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${CALYX_BACKEND_BASE_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json', 'X-Orchid-Actor': 'mission-control-owner' } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as T : {} as T;
  if (!response.ok) {
    const raw = payload as JsonRecord;
    const detail = raw && typeof raw === 'object' && 'detail' in raw
      ? JSON.stringify(raw.detail)
      : response.statusText;
    throw new Error(`Calyx backend ${response.status}: ${detail}`);
  }
  return payload;
}

export async function queryCalyxGraph(params: {
  canonicalKey?: string;
  nodeType?: string;
  edgeType?: string;
  limit?: number;
}): Promise<CalyxGraphQueryResponse> {
  return requestJson<CalyxGraphQueryResponse>('/brain/query', {
    method: 'POST',
    body: JSON.stringify({
      canonical_key: params.canonicalKey || null,
      node_type: params.nodeType || null,
      edge_type: params.edgeType || null,
      limit: params.limit ?? 50,
    }),
  });
}

export async function fetchCalyxNode(nodeId: number): Promise<CalyxNode> {
  return requestJson<CalyxNode>(`/brain/node/${nodeId}`);
}

export async function fetchCalyxRelationships(nodeId: number, edgeType?: string): Promise<CalyxEdge[]> {
  const query = new URLSearchParams({ limit: '250' });
  if (edgeType) query.set('edge_type', edgeType);
  const response = await requestJson<{ node_id: number; relationships: CalyxEdge[] }>(
    `/brain/relationships/${nodeId}?${query.toString()}`,
  );
  return response.relationships ?? [];
}

export async function runCalyxInference(
  subjectNodeId: number,
  inferenceType: CalyxInferenceType,
  limit = 25,
): Promise<CalyxInferenceResponse> {
  return requestJson<CalyxInferenceResponse>('/brain/infer', {
    method: 'POST',
    body: JSON.stringify({ subject_node_id: subjectNodeId, inference_type: inferenceType, limit }),
  });
}

export async function submitCalyxInferenceToLedger(input: {
  subjectNodeId: number;
  ledgerId: string;
  projectId: string;
  expectedVersion: number;
  inferenceType: CalyxInferenceType;
  candidateNodeId: number;
  inferenceContentHash: string;
}): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>(
    `/brain/inferences/${input.subjectNodeId}/submit-to-ledger`,
    {
      method: 'POST',
      body: JSON.stringify({
        ledger_id: input.ledgerId,
        project_id: input.projectId,
        expected_version: input.expectedVersion,
        inference_type: input.inferenceType,
        candidate_node_id: input.candidateNodeId,
        inference_content_hash: input.inferenceContentHash,
      }),
    },
  );
}
