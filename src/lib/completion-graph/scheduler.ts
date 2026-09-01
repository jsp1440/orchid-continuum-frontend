/**
 * Graph-driven scheduler admission (OC-COMPLETE-004 / issue #301).
 *
 * Binds ordinary autonomous capacity to the canonical completion graph
 * (#296/#281) so it selects the highest-priority unmet acceptance leaf
 * instead of inventing broad speculative work. This module is pure and
 * deterministic: it takes the graph plus a small explicit context (current
 * time, already-open issue/PR refs, recent lane history) and returns a
 * ranked admission decision — it never calls Date.now(), the GitHub API, or
 * any provider (Claude/Gemini/OpenAI) SDK. Provider choice must never reach
 * this file.
 */

import { flattenGraph, getLeaves, listBlockers, listOwnerActions } from './graphOps';
import type { CompletionLevelState, CompletionNode, CompletionStatus, ExecutionLane } from './types';
import { DEFAULT_PRIORITY } from './types';

/**
 * Statuses eligible for admission: MISSING/PARTIAL are ordinary unmet work.
 * BLOCKED is included because it represents an *internally repairable*
 * blocker (failing CI, merge conflict, stale branch) — distinct from
 * OWNER_ACTION and EXTERNAL_BLOCKER, which name a genuine external/owner
 * dependency and must be surfaced, never bypassed by admitting them anyway.
 */
const ELIGIBLE_STATUSES: CompletionStatus[] = ['MISSING', 'PARTIAL', 'BLOCKED'];

const LANE_ORDER: Record<ExecutionLane, number> = {
  PRODUCT_COMPLETION: 0,
  INTEGRATION_COMPLETION: 1,
  SCIENTIFIC_DATA_COMPLETION: 2,
  RELEASE_ACCEPTANCE: 3,
};

export type SchedulerContext = {
  /** ISO timestamp treated as "now" for staleness scoring. Passed explicitly for determinism. */
  now: string;
  /**
   * Issue/PR references (e.g. "#301", "jsp1440/x#12") currently open and
   * already tracking work. A leaf whose own `issues`/`prs` intersect this
   * set is suppressed from admission — it already has active tracked work,
   * so admitting it again would create a duplicate.
   */
  openWorkRefs?: ReadonlySet<string>;
  /**
   * Graph node ids that are live but not executable in this pulse (for
   * example because their representing issue is in runtime/repair backoff).
   * Exclusion is supplied explicitly by the GitHub adapter so the pure graph
   * scheduler can rank the next eligible leaf without learning provider or
   * lease policy.
   */
  excludedNodeIds?: ReadonlySet<string>;
  /**
   * Execution lanes admitted recently, most-recent-first. Used only to keep
   * lane fairness from starving a lane that hasn't run in a while; it never
   * overrides explicit priority.
   */
  recentLaneHistory?: ExecutionLane[];
};

export type AdmissionDecision = {
  node: CompletionNode;
  lane: ExecutionLane | null;
  unlockValue: number;
  acceptanceDeficit: number;
  stalenessDays: number;
  reasons: string[];
};

export type AdmissionResult = {
  /** The single highest-ranked admissible leaf, or null if nothing is admissible right now. */
  selected: AdmissionDecision | null;
  /** OWNER_ACTION / EXTERNAL_BLOCKER leaves — surfaced explicitly, never silently dropped or bypassed. */
  surfacedBlockers: CompletionNode[];
  /** Eligible leaves suppressed this pass because open tracked work already covers them. */
  suppressedDuplicates: CompletionNode[];
};

/** A leaf's own id counts as resolving to itself for self-referential graphs; unresolved ids fail closed. */
function isDependencySatisfied(root: CompletionNode, node: CompletionNode): boolean {
  if (!node.dependsOn || node.dependsOn.length === 0) return true;
  const byId = new Map(flattenGraph(root).map((n) => [n.id, n]));
  return node.dependsOn.every((depId) => {
    const dep = byId.get(depId);
    if (!dep) return false; // unresolved dependency id — fail closed, never assume satisfied
    return dep.status === 'DONE';
  });
}

/** How many other nodes in the graph declare a direct dependency on this node — a proxy for critical-path/unlock value. */
function computeUnlockValue(root: CompletionNode, node: CompletionNode): number {
  return flattenGraph(root).filter((n) => n.dependsOn?.includes(node.id)).length;
}

const STAGE_GAP: Record<CompletionLevelState, number> = {
  MET: 0,
  PARTIAL: 1,
  NOT_MET: 2,
  UNKNOWN: 2,
  NOT_APPLICABLE: 0,
};

/**
 * How far a leaf remains from full acceptance across the three levels of
 * done. Smaller deficit means the leaf is closer to finished — the scheduler
 * prefers converging nearly-complete work over starting fresh work at the
 * same priority, consistent with "prefer convergence over invention".
 */
function acceptanceStageDeficit(node: CompletionNode): number {
  const t = node.threeLevels;
  return STAGE_GAP[t.codeComplete] + STAGE_GAP[t.integratedComplete] + STAGE_GAP[t.productComplete];
}

function stalenessDays(now: string, node: CompletionNode): number {
  const nowMs = Date.parse(now);
  const updatedMs = Date.parse(node.lastUpdated);
  if (Number.isNaN(nowMs) || Number.isNaN(updatedMs)) return 0;
  return Math.max(0, Math.round((nowMs - updatedMs) / (1000 * 60 * 60 * 24)));
}

function hasOpenTrackedWork(node: CompletionNode, openWorkRefs?: ReadonlySet<string>): boolean {
  if (!openWorkRefs || openWorkRefs.size === 0) return false;
  const refs = [...(node.issues ?? []), ...(node.prs ?? [])];
  return refs.some((ref) => openWorkRefs.has(ref));
}

/**
 * Fairness penalty for the leaf's lane: a lane admitted very recently gets a
 * high penalty (deprioritized at equal rank); a lane absent from recent
 * history gets zero penalty. Security/governance gates are exempt — a
 * cross-cutting acceptance gate must never be starved by lane rotation, per
 * the "security is not cosmetic lane work" requirement.
 */
function laneFairnessPenalty(lane: ExecutionLane | undefined, node: CompletionNode, recentLaneHistory?: ExecutionLane[]): number {
  if (node.securityGate) return 0;
  if (!lane || !recentLaneHistory || recentLaneHistory.length === 0) return 0;
  const index = recentLaneHistory.indexOf(lane);
  if (index === -1) return 0;
  return recentLaneHistory.length - index;
}

/**
 * Scheduler entry point. Ranks eligible leaves by: explicit portfolio
 * priority (ascending, lower = more urgent), then critical-path/unlock value
 * (descending), then acceptance-stage deficit (ascending — converge
 * nearly-done work first), then staleness (descending — longest-neglected
 * work first), then lane fairness (descending penalty deprioritizes a lane
 * that just ran), then lane declaration order as a final deterministic
 * tiebreak.
 */
export function selectAdmissibleLeaf(root: CompletionNode, ctx: SchedulerContext): AdmissionResult {
  const leaves = getLeaves(root);

  const surfacedBlockers = [...listBlockers(root), ...listOwnerActions(root)];

  const eligible = leaves.filter(
    (leaf) =>
      ELIGIBLE_STATUSES.includes(leaf.status) &&
      isDependencySatisfied(root, leaf) &&
      !ctx.excludedNodeIds?.has(leaf.id),
  );

  const suppressedDuplicates = eligible.filter((leaf) => hasOpenTrackedWork(leaf, ctx.openWorkRefs));
  const admissible = eligible.filter((leaf) => !hasOpenTrackedWork(leaf, ctx.openWorkRefs));

  if (admissible.length === 0) {
    return { selected: null, surfacedBlockers, suppressedDuplicates };
  }

  const decisions: AdmissionDecision[] = admissible.map((node) => ({
    node,
    lane: node.lane ?? null,
    unlockValue: computeUnlockValue(root, node),
    acceptanceDeficit: acceptanceStageDeficit(node),
    stalenessDays: stalenessDays(ctx.now, node),
    reasons: [],
  }));

  decisions.sort((a, b) => {
    const priorityDelta = (a.node.priority ?? DEFAULT_PRIORITY) - (b.node.priority ?? DEFAULT_PRIORITY);
    if (priorityDelta !== 0) return priorityDelta;

    const unlockDelta = b.unlockValue - a.unlockValue;
    if (unlockDelta !== 0) return unlockDelta;

    const deficitDelta = a.acceptanceDeficit - b.acceptanceDeficit;
    if (deficitDelta !== 0) return deficitDelta;

    const stalenessDelta = b.stalenessDays - a.stalenessDays;
    if (stalenessDelta !== 0) return stalenessDelta;

    const fairnessDelta =
      laneFairnessPenalty(a.lane ?? undefined, a.node, ctx.recentLaneHistory) -
      laneFairnessPenalty(b.lane ?? undefined, b.node, ctx.recentLaneHistory);
    if (fairnessDelta !== 0) return fairnessDelta;

    const laneDelta = (LANE_ORDER[a.lane ?? 'RELEASE_ACCEPTANCE'] ?? 9) - (LANE_ORDER[b.lane ?? 'RELEASE_ACCEPTANCE'] ?? 9);
    if (laneDelta !== 0) return laneDelta;

    return a.node.id.localeCompare(b.node.id);
  });

  const winner = decisions[0];
  winner.reasons = [
    `priority ${winner.node.priority ?? DEFAULT_PRIORITY}`,
    `unlocks ${winner.unlockValue} dependent node(s)`,
    `acceptance-stage deficit ${winner.acceptanceDeficit}`,
    `${winner.stalenessDays}d stale`,
    winner.lane ? `lane ${winner.lane}` : 'no declared lane',
    winner.node.securityGate ? 'cross-cutting security/governance gate' : undefined,
  ].filter((r): r is string => Boolean(r));

  return { selected: winner, surfacedBlockers, suppressedDuplicates };
}
