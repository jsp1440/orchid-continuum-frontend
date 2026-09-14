#!/usr/bin/env npx tsx

import { COMPLETION_GRAPH } from '../src/lib/completion-graph/completionGraphData';
import { selectAdmissibleLeaf } from '../src/lib/completion-graph/scheduler';
import type { CompletionNode } from '../src/lib/completion-graph/types';

export type GraphDispatchPlanInput = {
  maxActiveLanes?: number;
  runningCount?: number;
  queuedIssueNumbers?: number[];
  openWorkRefs?: string[];
  now?: string;
};

export type GraphDispatchPlan = {
  capacity: number;
  issues: number[];
  leaves: Array<{ nodeId: string; nodeName: string; issueNumber: number; reasons: string[] }>;
  untrackedLeaves: Array<{ nodeId: string; nodeName: string; reasons: string[] }>;
  surfacedBlockers: Array<{ nodeId: string; nodeName: string; status: string }>;
};

function cloneGraph(root: CompletionNode): CompletionNode {
  return structuredClone(root);
}

function findNode(root: CompletionNode, id: string): CompletionNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function issueNumberFromRef(ref: string): number | null {
  const match = ref.match(/(?:^|#)(\d+)$/);
  return match ? Number(match[1]) : null;
}

function trackedQueuedIssue(node: CompletionNode, queued: ReadonlySet<number>): number | null {
  for (const ref of node.issues ?? []) {
    const issue = issueNumberFromRef(ref);
    if (issue !== null && queued.has(issue)) return issue;
  }
  return null;
}

/**
 * Convert canonical completion-graph priority into an executable wave.
 *
 * Important invariant: selecting one leaf for the current wave must NOT unlock
 * one of its dependants in that same wave. We therefore mark examined leaves
 * OWNER_ACTION in an isolated clone solely to remove them from this planning
 * pass; dependencies continue to see them as not-DONE and remain blocked.
 */
export function buildGraphDispatchPlan(input: GraphDispatchPlanInput = {}): GraphDispatchPlan {
  const maxActiveLanes = Math.max(0, Number(input.maxActiveLanes ?? 8));
  const runningCount = Math.max(0, Number(input.runningCount ?? 0));
  const capacity = Math.max(0, maxActiveLanes - runningCount);
  const queued = new Set(input.queuedIssueNumbers ?? []);
  const openWorkRefs = new Set(input.openWorkRefs ?? []);
  const now = input.now ?? new Date().toISOString();
  const graph = cloneGraph(COMPLETION_GRAPH);

  const issues: number[] = [];
  const leaves: GraphDispatchPlan['leaves'] = [];
  const untrackedLeaves: GraphDispatchPlan['untrackedLeaves'] = [];
  const blockerMap = new Map<string, { nodeId: string; nodeName: string; status: string }>();

  // The graph is finite; this guard is defensive against malformed future data.
  for (let examined = 0; examined < 1000 && issues.length < capacity; examined += 1) {
    const result = selectAdmissibleLeaf(graph, { now, openWorkRefs });
    for (const blocker of result.surfacedBlockers) {
      blockerMap.set(blocker.id, { nodeId: blocker.id, nodeName: blocker.name, status: blocker.status });
    }
    if (!result.selected) break;

    const selected = result.selected;
    const issueNumber = trackedQueuedIssue(selected.node, queued);
    if (issueNumber !== null && !issues.includes(issueNumber)) {
      issues.push(issueNumber);
      leaves.push({
        nodeId: selected.node.id,
        nodeName: selected.node.name,
        issueNumber,
        reasons: selected.reasons,
      });
    } else {
      untrackedLeaves.push({ nodeId: selected.node.id, nodeName: selected.node.name, reasons: selected.reasons });
    }

    const isolated = findNode(graph, selected.node.id);
    if (!isolated) break;
    isolated.status = 'OWNER_ACTION';
  }

  return {
    capacity,
    issues,
    leaves,
    untrackedLeaves,
    surfacedBlockers: [...blockerMap.values()],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input: GraphDispatchPlanInput = {
    maxActiveLanes: Number(process.env.OC_MAX_ACTIVE_LANES ?? 8),
    runningCount: Number(process.env.OC_RUNNING_COUNT ?? 0),
    queuedIssueNumbers: JSON.parse(process.env.OC_QUEUED_ISSUES_JSON ?? '[]'),
    openWorkRefs: JSON.parse(process.env.OC_OPEN_WORK_REFS_JSON ?? '[]'),
    now: process.env.OC_NOW || undefined,
  };
  const plan = buildGraphDispatchPlan(input);
  process.stdout.write(`${JSON.stringify(plan)}\n`);
}
