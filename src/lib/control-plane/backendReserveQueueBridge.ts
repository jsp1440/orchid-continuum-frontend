import {
  planQueueBridge,
  type ExistingWorkRef,
  type QueueBridgeCandidate,
  type QueueBridgePlan,
} from './orchestratorQueueBridge';

type BackendSourceKind = 'issue' | 'template' | 'objective';
type BackendPriority = QueueBridgeCandidate['priority'];

export interface BackendReserveProposal {
  source_ref: string;
  source_kind: BackendSourceKind;
  title?: string | null;
  labels?: string[];
  dependencies?: string[];
  material_fingerprint: string;
  semantic_key?: string | null;
  priority?: number | BackendPriority;
  source_repo?: string | null;
  source_payload?: unknown;
}

export interface BackendReservePlan {
  schema: string;
  reserve_depth: number;
  queued_count: number;
  deficit: number;
  status: string;
  proposals: BackendReserveProposal[];
  rejections?: unknown[];
}

export interface BackendReserveBridgeResult {
  plan: QueueBridgePlan;
  upstreamStatus: string;
  upstreamBlocked: boolean;
  rejected: Array<{ sourceRef: string | null; reason: string }>;
}

const SAFE_UPSTREAM_STATUSES = new Set([
  'reserve_satisfied',
  'refill_planned',
  'queue_empty_healthy',
  'reserve_below_target_no_eligible_candidates',
]);

const SOURCE_KIND_MAP: Record<BackendSourceKind, QueueBridgeCandidate['sourceKind']> = {
  issue: 'bounded-engineering-executor',
  template: 'autonomous-orchestrator',
  objective: 'autonomous-orchestrator',
};

const PRIORITIES = new Set<BackendPriority>([
  'oc-p0',
  'oc-p1',
  'oc-p2',
  'oc-p3',
  'oc-p4',
  'oc-p5',
]);

function priorityOf(value: BackendReserveProposal['priority']): BackendPriority {
  if (typeof value === 'string' && PRIORITIES.has(value as BackendPriority)) {
    return value as BackendPriority;
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5) {
    return `oc-p${value}` as BackendPriority;
  }
  return 'oc-p4';
}

function safeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function safeStringArray(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null;
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))].sort();
}

const KNOWLEDGE_GAP_PAYLOAD_KEYS = [
  'automatic_publication',
  'domain',
  'execution_mode',
  'knowledge_graph_mutation',
  'research_question',
  'review_required',
  'schema',
  'sensitive_locality_disclosure',
  'taxon_id',
  'taxon_name',
  'taxonomy_mutation',
] as const;

function missionText(value: unknown, maxLength: number): string | null {
  const text = safeText(value);
  if (!text || text.length > maxLength || /[\r\n\u0000-\u001f]/u.test(text)) return null;
  return text;
}

function sourcePayloadBody(value: unknown): { body: string; reason?: never } | { body?: never; reason: string } {
  if (value === undefined) return { body: '' };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { reason: 'invalid_source_payload' };
  }
  const payload = value as Record<string, unknown>;
  const keys = Object.keys(payload).sort();
  if (keys.length !== KNOWLEDGE_GAP_PAYLOAD_KEYS.length
    || keys.some((key, index) => key !== KNOWLEDGE_GAP_PAYLOAD_KEYS[index])) {
    return { reason: 'invalid_source_payload' };
  }

  const schema = missionText(payload.schema, 80);
  const taxonId = missionText(payload.taxon_id, 200);
  const taxonName = missionText(payload.taxon_name, 300);
  const domain = missionText(payload.domain, 100);
  const question = missionText(payload.research_question, 2000);
  if (!schema || schema !== 'oc.knowledge-gap-reserve-source.v1'
    || !taxonId || !taxonName || !domain || !question) {
    return { reason: 'invalid_source_payload' };
  }
  if (payload.execution_mode !== 'bounded_research_mission'
    || payload.review_required !== true
    || payload.automatic_publication !== false
    || payload.knowledge_graph_mutation !== false
    || payload.taxonomy_mutation !== false
    || payload.sensitive_locality_disclosure !== false) {
    return { reason: 'source_payload_authority_escalation' };
  }

  return {
    body: [
      '',
      'Canonical bounded research mission:',
      `- Taxon ID: ${taxonId}`,
      `- Taxon name: ${taxonName}`,
      `- Domain: ${domain}`,
      `- Research question: ${question}`,
      '- Human review required: yes',
      '- Automatic publication, KG/taxonomy mutation, and locality disclosure: disabled',
    ].join('\\n'),
  };
}

function emptyPlan(existing: ExistingWorkRef[], targetDepth: number): QueueBridgePlan {
  return planQueueBridge([], existing, targetDepth);
}

/**
 * Convert the backend's provider-free reserve plan into canonical frontend
 * persistence actions. Invalid, protected, duplicate, or failed upstream
 * proposals fail closed and never become prepared work.
 */
export function bridgeBackendReservePlan(
  upstream: BackendReservePlan,
  existing: ExistingWorkRef[],
  defaultSourceRepo = 'jsp1440/orchid-calyx-backend',
): BackendReserveBridgeResult {
  const targetDepth = Number.isInteger(upstream.reserve_depth) && upstream.reserve_depth >= 0
    ? upstream.reserve_depth
    : 0;
  const upstreamStatus = safeText(upstream.status) ?? 'invalid_status';
  const rejected: BackendReserveBridgeResult['rejected'] = [];

  if (
    upstream.schema !== 'oc.reserve-refill.v1'
    || !SAFE_UPSTREAM_STATUSES.has(upstreamStatus)
    || !Array.isArray(upstream.proposals)
    || targetDepth !== upstream.reserve_depth
  ) {
    return {
      plan: emptyPlan(existing, targetDepth),
      upstreamStatus,
      upstreamBlocked: true,
      rejected: [{ sourceRef: null, reason: 'invalid_or_failed_upstream_plan' }],
    };
  }

  const candidates: QueueBridgeCandidate[] = [];
  const seenFingerprints = new Set<string>();
  const seenSemanticKeys = new Set<string>();

  for (const proposal of upstream.proposals) {
    const sourceRef = safeText(proposal?.source_ref);
    const fingerprint = safeText(proposal?.material_fingerprint);
    const semanticKey = safeText(proposal?.semantic_key);
    const dependencies = safeStringArray(proposal?.dependencies);
    const labels = safeStringArray(proposal?.labels);
    const sourceRepo = safeText(proposal?.source_repo) ?? defaultSourceRepo;
    const sourcePayload = sourcePayloadBody(proposal?.source_payload);

    if (
      !sourceRef
      || !fingerprint
      || !sourceRepo
      || !proposal
      || !(proposal.source_kind in SOURCE_KIND_MAP)
      || dependencies === null
      || labels === null
      || sourcePayload.reason
    ) {
      rejected.push({ sourceRef, reason: sourcePayload.reason ?? 'invalid_proposal_contract' });
      continue;
    }

    if (labels.some((label) => label === 'oc-owner-gate' || label === 'oc-blocked')) {
      rejected.push({ sourceRef, reason: 'protected_proposal' });
      continue;
    }

    if (seenFingerprints.has(fingerprint)) {
      rejected.push({ sourceRef, reason: 'duplicate_fingerprint' });
      continue;
    }
    if (semanticKey && seenSemanticKeys.has(semanticKey)) {
      rejected.push({ sourceRef, reason: 'semantic_duplicate' });
      continue;
    }

    seenFingerprints.add(fingerprint);
    if (semanticKey) seenSemanticKeys.add(semanticKey);

    const fingerprintLine = `Material fingerprint: ${fingerprint}`;
    const semanticLine = semanticKey ? `\nSemantic key: ${semanticKey}` : '';

    candidates.push({
      sourceRepo,
      sourceKind: SOURCE_KIND_MAP[proposal.source_kind],
      sourceId: `${proposal.source_kind}:${sourceRef}`,
      title: safeText(proposal.title) ?? `Prepare ${sourceRef}`,
      body:
        'Prepared from the canonical backend reserve planner. ' +
        `${fingerprintLine}${semanticLine}${sourcePayload.body}`,
      priority: priorityOf(proposal.priority),
      unfinished: true,
      dependencies,
    });
  }

  return {
    plan: planQueueBridge(candidates, existing, targetDepth),
    upstreamStatus,
    upstreamBlocked: false,
    rejected,
  };
}
