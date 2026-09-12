export type MeasurementClass = 'MEASURED' | 'CALCULATED' | 'ESTIMATED' | 'UNAVAILABLE';

export type WorkflowIntelligenceItem = {
  workflowId: string;
  workflowType: string;
  correlationId: string;
  displayState: 'ACTIVE' | 'BLOCKED' | 'RECENTLY_FAILED' | 'AWAITING_REVIEW' | 'TERMINAL';
  currentState: string;
  retryCount: number;
  reworkCount: number;
  evidenceRefs: string[];
  blockerRefs: string[];
  findingCodes: string[];
  stale: { classification: MeasurementClass; value: boolean | null };
  score: number | null;
  factorCoverage: { available: number; total: number; ratio: number };
  unavailableFactors: string[];
  reasonCodes: string[];
  requiresHumanApproval: boolean;
  costState: MeasurementClass;
  capabilityState: 'BACKEND_ONLY' | 'INTEGRATED' | 'TESTED' | 'BLOCKED' | 'AWAITING_REVIEW' | 'UNAVAILABLE';
  hasReviewableRunbook: boolean;
};

export type WorkflowIntelligence = {
  contractVersion: 'workflow-intelligence-mission-control-v1';
  generatedAt: string | null;
  workflows: WorkflowIntelligenceItem[];
  advisoryOnly: true;
  humanReviewRequired: true;
};

const CLASSES: MeasurementClass[] = ['MEASURED', 'CALCULATED', 'ESTIMATED', 'UNAVAILABLE'];
const DISPLAY_STATES = ['ACTIVE', 'BLOCKED', 'RECENTLY_FAILED', 'AWAITING_REVIEW', 'TERMINAL'] as const;
const CAPABILITY_STATES = ['BACKEND_ONLY', 'INTEGRATED', 'TESTED', 'BLOCKED', 'AWAITING_REVIEW', 'UNAVAILABLE'] as const;
const FORBIDDEN_KEYS = ['api_key', 'password', 'secret', 'token', 'raw_prompt', 'prompt_text', 'latitude', 'longitude', 'coordinate', 'exact_locality'];
const SECRET_MARKERS = ['sk-', 'BEGIN PRIVATE KEY', 'Bearer '];

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeStrings(value: unknown, limit = 50): string[] | null {
  if (!Array.isArray(value) || value.length > limit || value.some((item) => typeof item !== 'string')) return null;
  return [...new Set(value as string[])];
}

function containsSensitive(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitive);
  const object = record(value);
  if (object) {
    return Object.entries(object).some(([key, nested]) =>
      FORBIDDEN_KEYS.some((forbidden) => key.toLowerCase().includes(forbidden)) || containsSensitive(nested));
  }
  return typeof value === 'string' && SECRET_MARKERS.some((marker) => value.includes(marker));
}

function classification(value: unknown): MeasurementClass | null {
  return CLASSES.includes(value as MeasurementClass) ? value as MeasurementClass : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function parseWorkflowIntelligence(value: unknown): WorkflowIntelligence | null {
  const root = record(value);
  if (!root || containsSensitive(root)) return null;
  if (root.contract_version !== 'workflow-intelligence-mission-control-v1') return null;
  if (
    root.advisory_only !== true ||
    root.human_review_required !== true ||
    root.dispatch_authority !== false ||
    root.mutation_authority !== false ||
    root.publication_authority !== false ||
    root.spending_authority !== false
  ) return null;
  if (!Array.isArray(root.workflows) || root.workflows.length > 50) return null;

  const workflows: WorkflowIntelligenceItem[] = [];
  const identities = new Set<string>();
  for (const raw of root.workflows) {
    const item = record(raw);
    const ranking = record(item?.ranking);
    const coverage = record(ranking?.factor_coverage);
    const context = record(item?.agent_context);
    const stale = record(item?.stale);
    const findings = Array.isArray(item?.findings) ? item.findings : null;
    if (!item || !ranking || !coverage || !context || !stale || !findings) return null;
    if (
      ranking.formula_version !== 'automation-opportunity-ranking-v1' ||
      ranking.advisory_only !== true ||
      ranking.dispatch_authority !== false ||
      ranking.mutation_authority !== false ||
      ranking.publication_authority !== false ||
      ranking.spending_authority !== false ||
      context.contract_version !== 'governed-agent-context-v1' ||
      context.dispatch_authority !== false ||
      context.credential_authority !== false ||
      context.mutation_authority !== false ||
      context.publication_authority !== false ||
      context.spending_authority !== false
    ) return null;

    const workflowId = typeof item.workflow_id === 'string' ? item.workflow_id : '';
    const correlationId = typeof item.correlation_id === 'string' ? item.correlation_id : '';
    const displayState = item.display_state;
    const capabilityState = item.capability_state;
    const staleClass = classification(stale.classification);
    const unavailableFactors = safeStrings(ranking.unavailable_factors);
    const reasonCodes = safeStrings(ranking.reason_codes);
    const evidenceRefs = safeStrings(item.evidence_refs);
    const blockerRefs = safeStrings(item.blocker_refs);
    if (
      !workflowId || !correlationId || identities.has(workflowId) ||
      !DISPLAY_STATES.includes(displayState as typeof DISPLAY_STATES[number]) ||
      !CAPABILITY_STATES.includes(capabilityState as typeof CAPABILITY_STATES[number]) ||
      !staleClass || !unavailableFactors || !reasonCodes || !evidenceRefs || !blockerRefs
    ) return null;
    identities.add(workflowId);

    const retryCount = finiteNumber(item.retry_count);
    const reworkCount = finiteNumber(item.rework_count);
    const available = finiteNumber(coverage.available);
    const total = finiteNumber(coverage.total);
    const ratio = finiteNumber(coverage.ratio);
    if (
      retryCount === null || retryCount < 0 ||
      reworkCount === null || reworkCount < 0 ||
      available === null || total === null || ratio === null
    ) return null;

    const runbook = item.runbook === null ? null : record(item.runbook);
    if (item.runbook !== null && !runbook) return null;
    if (runbook && (
      runbook.contract_version !== 'reviewable-runbook-v1' ||
      runbook.generated !== true ||
      runbook.review_required !== true ||
      runbook.authoritative !== false ||
      runbook.approved !== false ||
      runbook.dispatch_authority !== false ||
      runbook.mutation_authority !== false ||
      runbook.publication_authority !== false ||
      runbook.spending_authority !== false
    )) return null;

    const constraints = record(context.risk_cost_constraints);
    const costState = classification(constraints?.cost_state) ?? 'UNAVAILABLE';
    const findingCodes = findings.map((finding) => {
      const entry = record(finding);
      return typeof entry?.reason_code === 'string' ? entry.reason_code : null;
    });
    if (findingCodes.some((code) => code === null)) return null;

    workflows.push({
      workflowId,
      workflowType: String(item.workflow_type ?? 'unknown'),
      correlationId,
      displayState: displayState as WorkflowIntelligenceItem['displayState'],
      currentState: String(item.current_state ?? 'unknown'),
      retryCount,
      reworkCount,
      evidenceRefs,
      blockerRefs,
      findingCodes: findingCodes as string[],
      stale: {
        classification: staleClass,
        value: typeof stale.value === 'boolean' ? stale.value : null,
      },
      score: finiteNumber(ranking.score),
      factorCoverage: { available, total, ratio },
      unavailableFactors,
      reasonCodes,
      requiresHumanApproval: ranking.requires_human_approval === true,
      costState,
      capabilityState: capabilityState as WorkflowIntelligenceItem['capabilityState'],
      hasReviewableRunbook: Boolean(runbook),
    });
  }

  return {
    contractVersion: 'workflow-intelligence-mission-control-v1',
    generatedAt: typeof root.generated_at === 'string' ? root.generated_at : null,
    workflows,
    advisoryOnly: true,
    humanReviewRequired: true,
  };
}
