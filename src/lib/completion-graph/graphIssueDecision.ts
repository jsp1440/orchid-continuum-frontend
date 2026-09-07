/**
 * Graph-driven scheduler issue creation decision (issue #521).
 *
 * `selectAdmissibleLeaf` (scheduler.ts) picks the highest-priority unmet
 * completion-graph leaf. Until now nothing turned that pick into a real
 * GitHub issue except an inline, untested script (`scripts/graphAdmission.ts`).
 * This module is the pure, testable decision core that script now calls: given
 * the selected leaf and the currently open issues, decide whether to reuse an
 * existing live issue, create exactly one bounded issue, or refuse and say why.
 *
 * Pure and deterministic: no Date.now(), no GitHub API, no provider SDK. `now`
 * is passed in explicitly, matching the convention scheduler.ts already uses.
 */

import { graphNodeMarker, resolveExecutableIssue, type OpenIssueRef } from './executableIssue';
import type { CompletionNode, CompletionStatus } from './types';
import { DEFAULT_PRIORITY } from './types';

/**
 * Statuses that legitimately justify filing new automated work. `selectAdmissibleLeaf`
 * already filters to this set before selecting, but this module accepts a
 * plain `CompletionNode` from any caller — checking again here is
 * defense-in-depth against stale/contradictory data reaching issue creation
 * through a different or future selection path.
 */
const CREATABLE_STATUSES: CompletionStatus[] = ['MISSING', 'PARTIAL', 'BLOCKED', 'UNKNOWN'];

/**
 * How long a leaf's own `lastUpdated` may age before its data is too stale to
 * auto-file from. Deliberately looser than the Observatory's 7-day
 * build-freshness window (`evidenceFreshness.ts`), which governs whether
 * rollup *percentages* may be presented as current — that window is about the
 * whole census matching the running build. This one guards a narrower thing:
 * refusing to materialize an issue from a single leaf nobody has reconciled
 * in a very long time, regardless of how fresh the rest of the graph is.
 */
export const STALE_NODE_DATA_DAYS = 120;

export type GraphIssueDecision =
  | { action: 'no-admissible-node'; reason: string }
  | { action: 'reuse-existing'; issueNumber: number; reason: string }
  | { action: 'create'; title: string; body: string; labels: string[]; markerNodeId: string; reason: string }
  | { action: 'fail-closed'; reason: string };

const PRIORITY_TIER_MAX = [
  { max: 9, tier: 'P0' },
  { max: 19, tier: 'P1' },
  { max: 29, tier: 'P2' },
  { max: 39, tier: 'P3' },
  { max: 49, tier: 'P4' },
];

/** Node priority (lower = more urgent) mapped to the repository's P0..P5 title-prefix convention. */
export function priorityTier(priority: number): string {
  const found = PRIORITY_TIER_MAX.find((bucket) => priority <= bucket.max);
  return found ? found.tier : 'P5';
}

function ageInDays(now: string, lastUpdated: string): number | null {
  const nowMs = Date.parse(now);
  const updatedMs = Date.parse(lastUpdated);
  if (Number.isNaN(nowMs) || Number.isNaN(updatedMs)) return null;
  return Math.floor((nowMs - updatedMs) / 86_400_000);
}

/** Concrete reasons a selected node's own data is too stale/ambiguous/incomplete to auto-file from. */
function validateNode(node: CompletionNode, now: string): string[] {
  const problems: string[] = [];

  if (!node.id || !node.id.trim()) {
    problems.push('id is missing/blank');
  }
  if (node.children.length > 0) {
    problems.push('selected node is not a structural leaf (it has children)');
  }
  if (!CREATABLE_STATUSES.includes(node.status)) {
    problems.push(`status "${node.status}" does not justify automatic issue creation`);
  }
  if (!node.nextAction || !node.nextAction.trim()) {
    problems.push('nextAction is missing/blank — there is no acceptance criteria to draw from');
  }

  const updatedMs = Date.parse(node.lastUpdated);
  if (Number.isNaN(updatedMs)) {
    problems.push('lastUpdated is not a parseable date');
  } else {
    const age = ageInDays(now, node.lastUpdated);
    if (age !== null && age > STALE_NODE_DATA_DAYS) {
      problems.push(`lastUpdated is ${age}d old, beyond the ${STALE_NODE_DATA_DAYS}d staleness window`);
    }
  }

  return problems;
}

function buildIssueBody(node: CompletionNode, tier: string): string {
  return [
    'This bounded work item was materialized directly from the canonical completion graph because the selected admissible leaf had no live executable issue.',
    '',
    `Graph node: \`${node.id}\` (priority tier ${tier})`,
    `Lane: \`${node.lane ?? 'UNSPECIFIED'}\``,
    '',
    '## Acceptance criteria',
    node.nextAction,
    '',
    '## Completion discipline',
    '- The completion graph remains authoritative for WHAT work is selected.',
    '- Update the graph evidence/status when acceptance evidence changes so the scheduler can advance naturally.',
    '- Do not infer scientific absence from unavailable evidence and do not weaken provenance or sensitive-locality protections.',
    '- Production deployment, production data/KG mutation, taxonomy activation, publication, credentials, spending, and destructive operations remain owner-gated.',
    '',
    graphNodeMarker(node.id),
  ].join('\n');
}

/**
 * Decide what the scheduler should do about the selected leaf this cycle.
 * `openIssues` must already be the live (state=open) issue list; dedup against
 * pull requests happens earlier, at selection time, via `openWorkRefs`
 * (scheduler.ts) — this function only re-checks issues, because only issues
 * can be "reused" as a lease.
 */
export function decideGraphIssueAction(
  node: CompletionNode | null,
  openIssues: OpenIssueRef[],
  now: string,
): GraphIssueDecision {
  if (!node) {
    return { action: 'no-admissible-node', reason: 'No admissible completion-graph leaf was selected this cycle.' };
  }

  const problems = validateNode(node, now);
  if (problems.length > 0) {
    return {
      action: 'fail-closed',
      reason: `Refusing to auto-file an issue for graph node ${node.id || '(unknown id)'}: ${problems.join('; ')}.`,
    };
  }

  const existing = resolveExecutableIssue(node, openIssues);
  if (existing !== null) {
    return {
      action: 'reuse-existing',
      issueNumber: existing,
      reason: `Node ${node.id} already has a live tracked issue (#${existing}); not creating a duplicate.`,
    };
  }

  const tier = priorityTier(node.priority ?? DEFAULT_PRIORITY);
  return {
    action: 'create',
    title: `${tier} Graph leaf: ${node.name}`,
    body: buildIssueBody(node, tier),
    labels: ['oc-queued', 'oc-auto-generated'],
    markerNodeId: node.id,
    reason: `Node ${node.id} (${tier}) has no live tracked issue; materializing a bounded work item from its nextAction.`,
  };
}
