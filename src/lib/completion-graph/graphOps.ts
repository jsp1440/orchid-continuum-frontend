/**
 * Canonical completion graph — traversal, drill-down, and scheduler selection.
 */

import { computeNodePercentage } from './scoring';
import type { CompletionNode, CompletionStatus, ExecutionLane } from './types';
import { DEFAULT_PRIORITY } from './types';

export function flattenGraph(node: CompletionNode): CompletionNode[] {
  const out: CompletionNode[] = [node];
  for (const child of node.children) out.push(...flattenGraph(child));
  return out;
}

/** A leaf is structural: any node with no children, regardless of declared type. */
export function getLeaves(node: CompletionNode): CompletionNode[] {
  return flattenGraph(node).filter((n) => n.children.length === 0);
}

export function countIncompleteLeaves(node: CompletionNode): number {
  return getLeaves(node).filter((leaf) => leaf.status !== 'DONE').length;
}

export function countLeavesByStatus(node: CompletionNode): Record<CompletionStatus, number> {
  const counts: Record<CompletionStatus, number> = {
    DONE: 0,
    PARTIAL: 0,
    MISSING: 0,
    BLOCKED: 0,
    OWNER_ACTION: 0,
    EXTERNAL_BLOCKER: 0,
    UNKNOWN: 0,
  };
  for (const leaf of getLeaves(node)) counts[leaf.status] += 1;
  return counts;
}

export function findNode(node: CompletionNode, id: string): CompletionNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/** Ancestor chain from the root down to (and including) the target node. Empty if not found. */
export function getBreadcrumb(root: CompletionNode, id: string): CompletionNode[] {
  function search(node: CompletionNode, trail: CompletionNode[]): CompletionNode[] | null {
    const nextTrail = [...trail, node];
    if (node.id === id) return nextTrail;
    for (const child of node.children) {
      const found = search(child, nextTrail);
      if (found) return found;
    }
    return null;
  }
  return search(root, []) ?? [];
}

export function groupLeavesByLane(node: CompletionNode): Record<ExecutionLane, CompletionNode[]> {
  const groups: Record<ExecutionLane, CompletionNode[]> = {
    PRODUCT_COMPLETION: [],
    INTEGRATION_COMPLETION: [],
    SCIENTIFIC_DATA_COMPLETION: [],
    RELEASE_ACCEPTANCE: [],
  };
  for (const leaf of getLeaves(node)) {
    if (leaf.lane) groups[leaf.lane].push(leaf);
  }
  return groups;
}

const ACTIONABLE_STATUSES: CompletionStatus[] = ['MISSING', 'PARTIAL', 'UNKNOWN'];

const LANE_ORDER: Record<ExecutionLane, number> = {
  PRODUCT_COMPLETION: 0,
  INTEGRATION_COMPLETION: 1,
  SCIENTIFIC_DATA_COMPLETION: 2,
  RELEASE_ACCEPTANCE: 3,
};

/**
 * Scheduler entry point: highest-priority unmet acceptance gate that is
 * actually actionable right now (excludes BLOCKED / OWNER_ACTION /
 * EXTERNAL_BLOCKER leaves — those need an external event first, per the
 * mission's "a blocker on one issue must not stop the program" rule).
 */
export function selectNextUnmetGate(root: CompletionNode): CompletionNode | null {
  const candidates = getLeaves(root).filter((leaf) => ACTIONABLE_STATUSES.includes(leaf.status));
  if (candidates.length === 0) return null;

  return [...candidates].sort((a, b) => {
    const priorityDelta = (a.priority ?? DEFAULT_PRIORITY) - (b.priority ?? DEFAULT_PRIORITY);
    if (priorityDelta !== 0) return priorityDelta;

    const laneDelta = (LANE_ORDER[a.lane ?? 'RELEASE_ACCEPTANCE'] ?? 9) - (LANE_ORDER[b.lane ?? 'RELEASE_ACCEPTANCE'] ?? 9);
    if (laneDelta !== 0) return laneDelta;

    const percentA = computeNodePercentage(a) ?? 0;
    const percentB = computeNodePercentage(b) ?? 0;
    return percentA - percentB;
  })[0];
}

export function listBlockers(root: CompletionNode): CompletionNode[] {
  return getLeaves(root).filter((leaf) => leaf.status === 'BLOCKED' || leaf.status === 'EXTERNAL_BLOCKER');
}

export function listOwnerActions(root: CompletionNode): CompletionNode[] {
  return getLeaves(root).filter((leaf) => leaf.status === 'OWNER_ACTION');
}
