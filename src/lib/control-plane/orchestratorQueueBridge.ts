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
 * GitHub writes itself. A caller may materialize `create` items after rechecking
 * repository truth. Protected items are returned separately and never count toward
 * executable prepared depth.
 */
export function planQueueBridge(
  candidates: QueueBridgeCandidate[],
  existing: ExistingWorkRef[],
  targetDepth: number,
): QueueBridgePlan {
  const boundedTarget = Math.max(0, Math.floor(targetDepth));
  const openSourceKeys = new Set(
    existing.filter((item) => item.state === 'open' && item.sourceKey).map((item) => item.sourceKey!.toLowerCase()),
  );
  const openTitles = new Set(existing.filter((item) => item.state === 'open').map((item) => normalizeTitle(item.title)));
  const preparedOpenCount = existing.filter((item) => item.state === 'open' && Boolean(item.sourceKey)).length;
  const slots = Math.max(0, boundedTarget - preparedOpenCount);

  const seenCandidateKeys = new Set<string>();
  const suppressed: QueueBridgePlan['suppressed'] = [];
  const safe: PreparedWork[] = [];
  const protectedWork: PreparedWork[] = [];

  const ordered = [...candidates]
    .filter((candidate) => candidate.unfinished)
    .sort((a, b) => sourceKey(a).localeCompare(sourceKey(b)));

  for (const candidate of ordered) {
    const key = sourceKey(candidate);
    if (seenCandidateKeys.has(key)) {
      suppressed.push({ sourceKey: key, reason: 'duplicate-source-candidate' });
      continue;
    }
    seenCandidateKeys.add(key);

    if (openSourceKeys.has(key) || openTitles.has(normalizeTitle(candidate.title))) {
      suppressed.push({ sourceKey: key, reason: 'existing-open-lineage' });
      continue;
    }

    const prepared = prepareCandidate(candidate);
    if (prepared.protected) {
      protectedWork.push(prepared);
      continue;
    }
    safe.push(prepared);
  }

  return {
    create: safe.slice(0, slots),
    suppressed,
    protected: protectedWork,
    eligibleCount: safe.length,
    preparedOpenCount,
    targetDepth: boundedTarget,
  };
}
