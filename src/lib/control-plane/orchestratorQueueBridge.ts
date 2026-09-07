export type QueueSourceKind =
  | 'autonomous-orchestrator'
  | 'brain-knowledge-gap'
  | 'self-audit'
  | 'connector-queue'
  | 'bounded-engineering-executor';

export interface QueueBridgeCandidate {
  sourceRepo: string;
  sourceKind: QueueSourceKind;
  sourceId: string;
  title: string;
  body: string;
  priority: 'oc-p0' | 'oc-p1' | 'oc-p2' | 'oc-p3' | 'oc-p4' | 'oc-p5';
  unfinished: boolean;
  dependencies?: string[];
  protectedClasses?: string[];
  /**
   * Authoritative evidence that an implementation PR for this source was merged into
   * the integration branch. This is needed because GitHub close keywords do not
   * necessarily close source issues when the merge target is a non-default branch.
   */
  integratedCompletion?: boolean;
  /** Explicit source-level request for new work after a prior integration. */
  explicitRequeue?: boolean;
}

export interface ExistingWorkRef {
  sourceKey?: string;
  title: string;
  state: 'open' | 'closed';
  kind: 'issue' | 'pr';
}

export interface PreparedWork {
  sourceKey: string;
  title: string;
  body: string;
  labels: string[];
  protected: boolean;
  blockedReasons: string[];
}

export interface QueueBridgePlan {
  create: PreparedWork[];
  retire: Array<{ sourceKey: string; reason: 'source-completed' }>;
  suppressed: Array<{ sourceKey: string; reason: string }>;
  protected: PreparedWork[];
  eligibleCount: number;
  preparedOpenCount: number;
  targetDepth: number;
}

const PROTECTED_CLASSES = new Set([
  'production-deploy',
  'production-db-migration',
  'canonical-taxonomy-mutation',
  'knowledge-graph-publication',
  'scientific-publication',
  'sensitive-locality-exposure',
  'credential-or-secret-change',
  'material-spending',
  'destructive-operation',
  'security-governance-weakening',
  'protected-path',
]);

const PRIORITY_RANK: Record<QueueBridgeCandidate['priority'], number> = {
  'oc-p0': 0,
  'oc-p1': 1,
  'oc-p2': 2,
  'oc-p3': 3,
  'oc-p4': 4,
  'oc-p5': 5,
};

export function sourceKey(candidate: QueueBridgeCandidate): string {
  return `${candidate.sourceRepo}|${candidate.sourceKind}|${candidate.sourceId}`.toLowerCase();
}

export function sourceMarker(key: string): string {
  return `<!-- oc-queue-bridge:${key} -->`;
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

function classifyProtected(candidate: QueueBridgeCandidate): string[] {
  return [...new Set(candidate.protectedClasses ?? [])]
    .filter((value) => PROTECTED_CLASSES.has(value))
    .sort();
}

/**
 * Integration completion outranks a syntactically-open source issue. An explicit
 * requeue is the only source-level signal that revives work after that completion.
 */
function isEffectivelyUnfinished(candidate: QueueBridgeCandidate): boolean {
  if (candidate.explicitRequeue) return true;
  if (candidate.integratedCompletion) return false;
  return candidate.unfinished;
}

function reconcileCandidateStates(candidates: QueueBridgeCandidate[]): QueueBridgeCandidate[] {
  const byKey = new Map<string, QueueBridgeCandidate>();

  for (const candidate of candidates) {
    const key = sourceKey(candidate);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, candidate);
      continue;
    }

    // An explicit requeue is authoritative new-work evidence and must survive stale
    // completion observations. Otherwise, merged integration evidence suppresses a
    // merely syntactically-open issue. With neither signal, conflicts fail toward
    // unfinished work as before.
    if (current.explicitRequeue || candidate.explicitRequeue) {
      byKey.set(key, current.explicitRequeue ? current : candidate);
      continue;
    }
    if (current.integratedCompletion || candidate.integratedCompletion) {
      byKey.set(key, current.integratedCompletion ? current : candidate);
      continue;
    }
    if (!current.unfinished && candidate.unfinished) {
      byKey.set(key, candidate);
    }
  }

  return [...byKey.values()].sort((a, b) => sourceKey(a).localeCompare(sourceKey(b)));
}

export function prepareCandidate(candidate: QueueBridgeCandidate): PreparedWork {
  const key = sourceKey(candidate);
  const blockedReasons = classifyProtected(candidate);
  const protectedWork = blockedReasons.length > 0;
  const dependencyText = (candidate.dependencies ?? []).length
    ? `\n\nDependencies: ${(candidate.dependencies ?? []).join(', ')}`
    : '';
  const protectionText = protectedWork
    ? `\n\nFail-closed protected classes: ${blockedReasons.join(', ')}. This item is inventory-only and MUST NOT be autonomously executed.`
    : '';

  return {
    sourceKey: key,
    title: candidate.title.trim(),
    body: `${sourceMarker(key)}\n\nSource: ${candidate.sourceRepo} / ${candidate.sourceKind} / ${candidate.sourceId}\n\n${candidate.body.trim()}${dependencyText}${protectionText}`,
    labels: protectedWork
      ? ['oc-prepared', candidate.priority, 'oc-owner-gate']
      : ['oc-prepared', candidate.priority],
    protected: protectedWork,
    blockedReasons,
  };
}

/**
 * Deterministic reconciliation only. It never invokes a provider and never performs
 * GitHub writes itself. A caller may materialize `create`/`retire` actions after
 * rechecking repository truth. Protected items are returned separately and never
 * count toward executable prepared depth.
 */
export function planQueueBridge(
  candidates: QueueBridgeCandidate[],
  existing: ExistingWorkRef[],
  targetDepth: number,
): QueueBridgePlan {
  const boundedTarget = Math.max(0, Math.floor(targetDepth));
  const reconciledCandidates = reconcileCandidateStates(candidates);
  const completedSourceKeys = new Set(
    reconciledCandidates
      .filter((candidate) => !isEffectivelyUnfinished(candidate))
      .map((candidate) => sourceKey(candidate)),
  );
  const openSourceKeys = new Set(
    existing.filter((item) => item.state === 'open' && item.sourceKey).map((item) => item.sourceKey!.toLowerCase()),
  );
  const retire = [...openSourceKeys]
    .filter((key) => completedSourceKeys.has(key))
    .sort()
    .map((key) => ({ sourceKey: key, reason: 'source-completed' as const }));
  const retiringKeys = new Set(retire.map((item) => item.sourceKey));
  const openTitles = new Set(
    existing
      .filter(
        (item) => item.state === 'open' && !(item.sourceKey && retiringKeys.has(item.sourceKey.toLowerCase())),
      )
      .map((item) => normalizeTitle(item.title)),
  );
  const preparedOpenCount = existing.filter(
    (item) => item.state === 'open' && Boolean(item.sourceKey) && !retiringKeys.has(item.sourceKey!.toLowerCase()),
  ).length;
  const slots = Math.max(0, boundedTarget - preparedOpenCount);

  const suppressed: QueueBridgePlan['suppressed'] = [];
  const safe: Array<{ candidate: QueueBridgeCandidate; prepared: PreparedWork }> = [];
  const protectedWork: PreparedWork[] = [];

  for (const candidate of reconciledCandidates.filter((candidate) => isEffectivelyUnfinished(candidate))) {
    const key = sourceKey(candidate);

    if ((openSourceKeys.has(key) && !retiringKeys.has(key)) || openTitles.has(normalizeTitle(candidate.title))) {
      suppressed.push({ sourceKey: key, reason: 'existing-open-lineage' });
      continue;
    }

    const prepared = prepareCandidate(candidate);
    if (prepared.protected) {
      protectedWork.push(prepared);
      continue;
    }
    safe.push({ candidate, prepared });
  }

  // Refill must be both deterministic and useful: highest portfolio priority wins,
  // while source identity provides a stable tie-breaker independent of discovery order.
  safe.sort(
    (a, b) =>
      PRIORITY_RANK[a.candidate.priority] - PRIORITY_RANK[b.candidate.priority] ||
      a.prepared.sourceKey.localeCompare(b.prepared.sourceKey),
  );

  return {
    create: safe.slice(0, slots).map((item) => item.prepared),
    retire,
    suppressed,
    protected: protectedWork,
    eligibleCount: safe.length,
    preparedOpenCount,
    targetDepth: boundedTarget,
  };
}
