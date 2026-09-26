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
  /**
   * Queued issues whose lane is the PROVIDER lane: the lane's own classify job
   * (`routeIssue`) would route them `provider_free=false`, so they can only run
   * after a budget reservation. Every other queued issue is provider-free.
   */
  providerLaneIssues?: number[];
  /**
   * How many provider-lane issues this wave may admit. `undefined` means the
   * caller did not evaluate provider capacity, and admission is not split by
   * lane class (the behaviour before per-lane-class admission).
   */
  providerSlots?: number;
  /** The binding constraint behind `providerSlots`, e.g. `daily_hard_cap_exceeded` or `wave_max_calls`. */
  providerSlotsReason?: string;
};

export type GraphDispatchPlan = {
  capacity: number;
  issues: number[];
  leaves: Array<{ nodeId: string; nodeName: string; issueNumber: number; reasons: string[] }>;
  untrackedLeaves: Array<{ nodeId: string; nodeName: string; reasons: string[] }>;
  surfacedBlockers: Array<{ nodeId: string; nodeName: string; status: string }>;
  /** Queued issues no node names at all, from either side. They can never be admitted. */
  unboundQueued: number[];
  /** Queued issues a node does name, where the ranker did not select that node this wave. */
  unreachableQueued: Array<{ issueNumber: number; nodeIds: string[] }>;
  /** Declarations naming a node this graph does not contain. A binding failure, never a guess. */
  unknownNodeDeclarations: Array<{ issueNumber: number; nodeId: string }>;
  /** Declarations naming a real node that is not a leaf, so the ranker can never select it. */
  unadmissibleNodeDeclarations: Array<{ issueNumber: number; nodeId: string }>;
  /** Lane capacity and queued work both exist, yet nothing could be admitted. */
  starved: boolean;
  /** How many queued issues reached the ranker, as against the raw label census. */
  queuedReachingAdmission: number;
  /** WHICH queued issues reached the ranker. A count cannot be subtracted from a census to get names. */
  reachedAdmission: number[];
  /**
   * Pending-labelled issues that never reached the ranker at all, by number.
   *
   * Always empty here: this planner is only ever handed the issues that already
   * reached it, so it cannot see the ones that did not. `makePlan` has both the
   * label census and `reachedAdmission` and fills it in. The field lives on the
   * shape so that every plan has it and a report can never read `undefined`.
   */
  pendingNotReachingAdmission: Array<{ issueNumber: number; reason: string }>;
  /** How many admitted issues are provider-lane issues. Never more than `providerSlots`. */
  providerAdmitted: number;
  /**
   * Provider-lane issues the ranker DID reach this wave and that were not
   * admitted because no provider slot was left. They keep their queue label;
   * the reason names the exact constraint so the operator can see capacity,
   * not a binding problem, is what holds them.
   */
  providerDeferred: Array<{ issueNumber: number; nodeId: string; reason: string }>;
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

/** `selectAdmissibleLeaf` only ever returns a leaf, so only a leaf can carry an issue. */
function collectLeafIds(root: CompletionNode, into: Set<string> = new Set()): Set<string> {
  if (root.children.length === 0) into.add(root.id);
  for (const child of root.children) collectLeafIds(child, into);
  return into;
}

/**
 * Index the issue-side bindings by node.
 *
 * Three outcomes, kept apart on purpose. A declaration naming a node this graph
 * does not contain is reported as exactly that; guessing which node was meant is
 * the heuristic these bindings replaced. A declaration naming a real node that is
 * not a leaf -- a domain or a portfolio -- is reported too, rather than counted
 * as a binding: the ranker only ever selects leaves, so such an issue can never
 * be admitted, and silently treating it as bound would remove it from
 * `unboundQueued` and leave the operator with no line to act on. Naming a domain
 * instead of a leaf is the likeliest way to mislabel an issue.
 */
function indexDeclarations(root: CompletionNode, declaredNodesByIssue: Record<number, string[]>) {
  const known = collectNodeIds(root);
  const leaves = collectLeafIds(root);
  const declared = new Map<string, number[]>();
  const unknown: GraphDispatchPlan['unknownNodeDeclarations'] = [];
  const unadmissible: GraphDispatchPlan['unadmissibleNodeDeclarations'] = [];
  for (const [key, nodeIds] of Object.entries(declaredNodesByIssue)) {
    const issueNumber = Number(key);
    if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) throw new Error('Invalid declared issue identity');
    for (const nodeId of nodeIds) {
      if (!known.has(nodeId)) { unknown.push({ issueNumber, nodeId }); continue; }
      if (!leaves.has(nodeId)) { unadmissible.push({ issueNumber, nodeId }); continue; }
      const bound = declared.get(nodeId) ?? [];
      if (!bound.includes(issueNumber)) bound.push(issueNumber);
      declared.set(nodeId, bound);
    }
  }
  return { declared, unknown, unadmissible };
}

/**
 * Which nodes name each issue, graph side and declaration side together.
 *
 * Being named is not the same as being admissible, and conflating the two is how
 * an issue disappeared from every report line: a node that names it may be a
 * branch, may be the wrong status, may have unsatisfied dependencies, or may
 * have gone to another issue. So naming is recorded here and reconciled against
 * what the wave actually admitted, rather than assumed to imply admissibility.
 */
function indexNamedBy(root: CompletionNode, declared: ReadonlyMap<string, number[]>) {
  const namedBy = new Map<number, string[]>();
  const add = (issue: number, nodeId: string) => {
    const nodes = namedBy.get(issue) ?? [];
    if (!nodes.includes(nodeId)) nodes.push(nodeId);
    namedBy.set(issue, nodes);
  };
  const walk = (node: CompletionNode) => {
    for (const ref of node.issues ?? []) {
      const issue = issueNumberFromRef(ref);
      if (issue !== null) add(issue, node.id);
    }
    node.children.forEach(walk);
  };
  walk(root);
  for (const [nodeId, issues] of declared) for (const issue of issues) add(issue, nodeId);
  return namedBy;
}

/** Every queued issue a node names, graph side first, in declaration order. */
function trackedQueuedIssues(node: CompletionNode, queued: ReadonlySet<number>, declared: ReadonlyMap<string, number[]>): number[] {
  const found: number[] = [];
  for (const ref of node.issues ?? []) {
    const issue = issueNumberFromRef(ref);
    if (issue !== null && queued.has(issue) && !found.includes(issue)) found.push(issue);
  }
  for (const issue of declared.get(node.id) ?? []) {
    if (queued.has(issue) && !found.includes(issue)) found.push(issue);
  }
  return found;
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
  const providerSlots = input.providerSlots;
  if (providerSlots !== undefined && (!Number.isSafeInteger(providerSlots) || providerSlots < 0)) {
    throw new Error('Invalid provider slot count');
  }
  const providerLane = new Set(input.providerLaneIssues ?? []);
  const providerReason = `provider_capacity: ${input.providerSlotsReason || 'unspecified'}`;
  const queued = new Set(input.queuedIssueNumbers ?? []);
  const openWorkRefs = new Set(input.openWorkRefs ?? []);
  const now = input.now ?? new Date().toISOString();
  const { declared, unknown, unadmissible } = indexDeclarations(root, input.declaredNodesByIssue ?? {});
  const namedBy = indexNamedBy(root, declared);
  const graph = cloneGraph(root);
  for (const id of input.occupiedNodeIds ?? []) {
    const node = findNode(graph, id);
    if (node) node.status = 'OWNER_ACTION';
  }

  const issues: number[] = [];
  const leaves: GraphDispatchPlan['leaves'] = [];
  const untrackedLeaves: GraphDispatchPlan['untrackedLeaves'] = [];
  const blockerMap = new Map<string, { nodeId: string; nodeName: string; status: string }>();
  const providerDeferred: GraphDispatchPlan['providerDeferred'] = [];
  let providerAdmitted = 0;
  // A provider-lane issue fits only while a provider slot is left. Provider-free
  // work never competes for those slots, so budget the provider can never use
  // no longer takes lane capacity from deterministic work.
  const fits = (issue: number) => providerSlots === undefined || !providerLane.has(issue) || providerAdmitted < providerSlots;

  // The graph is finite; this guard is defensive against malformed future data.
  for (let examined = 0; examined < 1000 && issues.length < capacity; examined += 1) {
    const result = selectAdmissibleLeaf(graph, { now, openWorkRefs });
    for (const blocker of result.surfacedBlockers) {
      blockerMap.set(blocker.id, { nodeId: blocker.id, nodeName: blocker.name, status: blocker.status });
    }
    if (!result.selected) break;

    const selected = result.selected;
    // Walk the node's queued issues in binding order. Without provider slots
    // this is exactly the old rule: the first queued issue, or nothing if it is
    // already admitted elsewhere. With slots, a provider-lane issue that does
    // not fit is recorded as deferred and the next issue on the node is tried.
    let issueNumber: number | null = null;
    let deferredHere = false;
    for (const candidate of trackedQueuedIssues(selected.node, queued, declared)) {
      if (issues.includes(candidate)) break;
      if (fits(candidate)) { issueNumber = candidate; break; }
      deferredHere = true;
      if (!providerDeferred.some(entry => entry.issueNumber === candidate)) {
        providerDeferred.push({ issueNumber: candidate, nodeId: selected.node.id, reason: providerReason });
      }
    }
    if (issueNumber !== null) {
      if (providerSlots !== undefined && providerLane.has(issueNumber)) providerAdmitted += 1;
      issues.push(issueNumber);
      leaves.push({
        nodeId: selected.node.id,
        nodeName: selected.node.name,
        issueNumber,
        reasons: selected.reasons,
      });
    } else if (!deferredHere) {
      // A leaf held only by provider capacity DOES carry pending work; calling
      // it untracked would send the operator to bind an issue that is bound.
      untrackedLeaves.push({ nodeId: selected.node.id, nodeName: selected.node.name, reasons: selected.reasons });
    }

    const isolated = findNode(graph, selected.node.id);
    if (!isolated) break;
    isolated.status = 'OWNER_ACTION';
  }

  // Every queued issue the wave did not admit lands in exactly one bucket, so
  // none can fall silently between them. A declaration problem is the most
  // specific answer and takes precedence; then "no node names it"; then "a node
  // does, and the ranker did not reach it".
  const deferred = new Set(providerDeferred.map(entry => entry.issueNumber).filter(issue => !issues.includes(issue)));
  const explained = new Set([...[...unknown, ...unadmissible].map(entry => entry.issueNumber), ...deferred]);
  const unaccounted = [...queued].filter(issue => !issues.includes(issue) && !explained.has(issue)).sort((a, b) => a - b);
  const unboundQueued = unaccounted.filter(issue => (namedBy.get(issue) ?? []).length === 0);
  const unreachableQueued = unaccounted
    .filter(issue => (namedBy.get(issue) ?? []).length > 0)
    .map(issue => ({ issueNumber: issue, nodeIds: namedBy.get(issue) ?? [] }));

  return {
    capacity,
    issues,
    leaves,
    untrackedLeaves,
    surfacedBlockers: [...blockerMap.values()],
    unboundQueued,
    unreachableQueued,
    queuedReachingAdmission: queued.size,
    reachedAdmission: [...queued].sort((a, b) => a - b),
    pendingNotReachingAdmission: [],
    unknownNodeDeclarations: unknown,
    unadmissibleNodeDeclarations: unadmissible,
    providerAdmitted,
    providerDeferred: providerDeferred.filter(entry => deferred.has(entry.issueNumber)),
    // Reporting this run as a healthy no-op is what let the binding gap run unseen.
    // Work held only by provider capacity is reported in `providerDeferred`,
    // with its reason; it is not a binding gap.
    starved: capacity > 0 && [...queued].some(issue => !deferred.has(issue)) && issues.length === 0,
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
