#!/usr/bin/env npx tsx

import { COMPLETION_GRAPH } from '../src/lib/completion-graph/completionGraphData';
import { selectAdmissibleLeaf } from '../src/lib/completion-graph/scheduler';
import type { CompletionNode } from '../src/lib/completion-graph/types';

export type GraphDispatchPlanInput = {
  maxActiveLanes?: number;
  runningCount?: number;
  queuedIssueNumbers?: number[];
  openWorkRefs?: string[];
  occupiedNodeIds?: string[];
  /** Issue-side bindings, keyed by issue number. See `declaredNodesByIssue` in oc-dispatch-control. */
  declaredNodesByIssue?: Record<number, string[]>;
  now?: string;
};

export type GraphDispatchPlan = {
  capacity: number;
  issues: number[];
  leaves: Array<{ nodeId: string; nodeName: string; issueNumber: number; reasons: string[] }>;
  untrackedLeaves: Array<{ nodeId: string; nodeName: string; reasons: string[] }>;
  surfacedBlockers: Array<{ nodeId: string; nodeName: string; status: string }>;
  /** Queued issues bound to no node in the graph, from either side. They can never be admitted. */
  unboundQueued: number[];
  /** Declarations naming a node this graph does not contain. A binding failure, never a guess. */
  unknownNodeDeclarations: Array<{ issueNumber: number; nodeId: string }>;
  /** Lane capacity and queued work both exist, yet nothing could be admitted. */
  starved: boolean;
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
  const match = ref.match(/^(?:#|jsp1440\/orchid-continuum-frontend#|https:\/\/github\.com\/jsp1440\/orchid-continuum-frontend\/issues\/)?(\d+)$/);
  return match ? Number(match[1]) : null;
}

function collectNodeIds(root: CompletionNode, into: Set<string> = new Set()): Set<string> {
  into.add(root.id);
  for (const child of root.children) collectNodeIds(child, into);
  return into;
}

/**
 * Index the issue-side bindings by node.
 *
 * A declaration naming a node this graph does not contain is reported as exactly
 * that. Guessing which node was meant is the heuristic these bindings replaced.
 */
function indexDeclarations(root: CompletionNode, declaredNodesByIssue: Record<number, string[]>) {
  const known = collectNodeIds(root);
  const declared = new Map<string, number[]>();
  const unknown: GraphDispatchPlan['unknownNodeDeclarations'] = [];
  for (const [key, nodeIds] of Object.entries(declaredNodesByIssue)) {
    const issueNumber = Number(key);
    if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) throw new Error('Invalid declared issue identity');
    for (const nodeId of nodeIds) {
      if (!known.has(nodeId)) { unknown.push({ issueNumber, nodeId }); continue; }
      const bound = declared.get(nodeId) ?? [];
      if (!bound.includes(issueNumber)) bound.push(issueNumber);
      declared.set(nodeId, bound);
    }
  }
  return { declared, unknown };
}

function graphSideIssues(root: CompletionNode, into: Set<number> = new Set()): Set<number> {
  for (const ref of root.issues ?? []) {
    const issue = issueNumberFromRef(ref);
    if (issue !== null) into.add(issue);
  }
  for (const child of root.children) graphSideIssues(child, into);
  return into;
}

function trackedQueuedIssue(node: CompletionNode, queued: ReadonlySet<number>, declared: ReadonlyMap<string, number[]>): number | null {
  for (const ref of node.issues ?? []) {
    const issue = issueNumberFromRef(ref);
    if (issue !== null && queued.has(issue)) return issue;
  }
  for (const issue of declared.get(node.id) ?? []) {
    if (queued.has(issue)) return issue;
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
export function buildGraphDispatchPlan(input: GraphDispatchPlanInput = {}, root: CompletionNode = COMPLETION_GRAPH): GraphDispatchPlan {
  const maxActiveLanes = input.maxActiveLanes ?? 8;
  const runningCount = input.runningCount ?? 0;
  if (!Number.isSafeInteger(maxActiveLanes) || maxActiveLanes < 0 || maxActiveLanes > 8 ||
      !Number.isSafeInteger(runningCount) || runningCount < 0) throw new Error("Invalid graph capacity");
  const capacity = Math.max(0, maxActiveLanes - runningCount);
  const queued = new Set(input.queuedIssueNumbers ?? []);
  const openWorkRefs = new Set(input.openWorkRefs ?? []);
  const now = input.now ?? new Date().toISOString();
  const { declared, unknown } = indexDeclarations(root, input.declaredNodesByIssue ?? {});
  const bound = new Set([...graphSideIssues(root), ...[...declared.values()].flat()]);
  const unboundQueued = [...queued].filter(issue => !bound.has(issue)).sort((a, b) => a - b);
  const graph = cloneGraph(root);
  for (const id of input.occupiedNodeIds ?? []) {
    const node = findNode(graph, id);
    if (node) node.status = 'OWNER_ACTION';
  }

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
    const issueNumber = trackedQueuedIssue(selected.node, queued, declared);
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
    unboundQueued,
    unknownNodeDeclarations: unknown,
    // Reporting this run as a healthy no-op is what let the binding gap run unseen.
    starved: capacity > 0 && queued.size > 0 && issues.length === 0,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input: GraphDispatchPlanInput = {
    maxActiveLanes: Number(process.env.OC_MAX_ACTIVE_LANES ?? 8),
    runningCount: Number(process.env.OC_RUNNING_COUNT ?? 0),
    queuedIssueNumbers: JSON.parse(process.env.OC_QUEUED_ISSUES_JSON ?? '[]'),
    openWorkRefs: JSON.parse(process.env.OC_OPEN_WORK_REFS_JSON ?? '[]'),
    declaredNodesByIssue: JSON.parse(process.env.OC_DECLARED_NODES_JSON ?? '{}'),
    now: process.env.OC_NOW || undefined,
  };
  const plan = buildGraphDispatchPlan(input);
  process.stdout.write(`${JSON.stringify(plan)}\n`);
}
