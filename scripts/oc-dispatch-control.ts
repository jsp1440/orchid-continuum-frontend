import { createHash } from 'node:crypto';
import { buildGraphDispatchPlan } from './oc-graph-dispatch-plan';
import { COMPLETION_GRAPH } from '../src/lib/completion-graph/completionGraphData';
import type { CompletionNode } from '../src/lib/completion-graph/types';
import { buildWaveContext } from './oc-wave-context.mjs';
import { MAX_ACTIVE_LANES, selectLanes } from './oc-multilane-selector.mjs';
import { decideBudget } from './oc-budget-governor.mjs';

export { MAX_ACTIVE_LANES };
export type Issue = { number: number; state: string; title: string; body: string | null; labels: Array<{ name: string }> };
export type Pull = { number: number; state: string; body: string | null; head: { ref: string; sha: string } };
export type Snapshot = { issues: Issue[]; prs: Pull[]; integrationSha: string; implementationSha: string; material: Record<string, string> };
export type LeaseLane = 'provider' | 'provider-free';
export type Lease = {
  id: string; issue: number; nodeId: string; fingerprint: string; waveHash: string;
  runId: string; runAttempt: string; expiresAt: string; reservedUsd: number;
  /** Absent on leases written before the deterministic lane existed; those were all paid. */
  lane?: LeaseLane;
  state: 'reserved' | 'running' | 'validating' | 'blocked' | 'owner-gate' | 'runtime-backoff' | 'done'
    | 'provider-free-done' | 'provider-free-failed' | 'not-executed';
};
export const laneOf = (lease: Lease): LeaseLane => lease.lane ?? 'provider';
export type Ledger = { schema: 1; programStartedAt: string; programSpent: number; dailySpent: Record<string, number>; leases: Lease[] };
export interface LeaseStore {
  read(): Promise<{ version: string; ledger: Ledger }>;
  compareAndSwap(version: string, ledger: Ledger): Promise<boolean>;
}
export const isActive = (lease: Lease) => lease.state === 'reserved' || lease.state === 'running';
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const labelsOf = (issue: Issue) => issue.labels.map(label => label.name);
const steward = (issue: Issue) => labelsOf(issue).includes('oc-portfolio-steward');

// A completion-graph node is the only thing that can carry a queued issue into a
// lane. The graph's own `issues` array binds three of its 119 nodes, so an issue
// the graph does not name is unreachable however it is labelled. This
// accepts the binding from the issue side too: `oc-node:<node-id>`, deliberately
// applied and visible on the issue, exactly as `oc-cap:` declares a capability.
// Reading a node out of the title or body stays refused; that is the heuristic
// these declarations replaced.
const NODE_LABEL = /^oc-node:\s*([a-z0-9][a-z0-9-]*)$/i;
export function declaredNodesByIssue(issues: Issue[]): Record<number, string[]> {
  const declared: Record<number, string[]> = {};
  for (const issue of issues) {
    const nodeIds = labelsOf(issue).map(label => NODE_LABEL.exec(label)?.[1]?.toLowerCase())
      .filter((nodeId): nodeId is string => nodeId !== undefined);
    if (nodeIds.length > 0) declared[issue.number] = [...new Set(nodeIds)];
  }
  return declared;
}

export function lineageFor(issue: number, prs: Pull[]) {
  return prs.filter(pr => new RegExp(`^OC-AUTO-ISSUE:\\s*#${issue}\\s*$`, 'm').test(pr.body || '') ||
    new RegExp(`^oc-auto-${issue}(?:-|$)`).test(pr.head.ref) ||
    new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+(?:jsp1440/orchid-continuum-frontend)?#${issue}\\b`, 'i').test(pr.body || ''));
}
function eligibleIssues(snapshot: Snapshot) {
  return snapshot.issues.map(issue => {
    const lineage = lineageFor(issue.number, snapshot.prs);
    return { ...issue, hasDurablePr: lineage.length > 0,
      repairablePr: lineage.length === 1 && lineage[0].state === 'open', portfolioSteward: steward(issue) };
  });
}
function openRefs(snapshot: Snapshot, issues: ReturnType<typeof eligibleIssues>) {
  const repairPrs = new Set(issues.filter(i => i.repairablePr && labelsOf(i).includes('oc-repair'))
    .flatMap(i => lineageFor(i.number, snapshot.prs).map(pr => pr.number)));
  return snapshot.prs.filter(pr => pr.state === 'open' && !repairPrs.has(pr.number))
    .flatMap(pr => [`#${pr.number}`, `jsp1440/orchid-continuum-frontend#${pr.number}`]);
}
export function runningCount(snapshot: Snapshot, leases: Lease[]) {
  // A stale label is conservatively occupied until reconciliation proves termination.
  return new Set([
    ...leases.filter(isActive).map(lease => lease.issue),
    ...snapshot.issues.filter(i => !steward(i) && i.state !== 'closed' && labelsOf(i).includes('oc-running') &&
      !labelsOf(i).some(l => ['oc-done', 'oc-validating', 'oc-blocked', 'oc-owner-gate', 'oc-runtime-backoff'].includes(l)))
      .map(i => i.number),
  ]).size;
}
function admission(snapshot: Snapshot, queued: number[], now: string, root: CompletionNode, running = 0, occupiedNodeIds: string[] = []) {
  const issues = eligibleIssues(snapshot);
  // Filter first, rank with the canonical #301/#313 scheduler second. Scan every
  // eligible issue (not just the first eight in GitHub's API ordering).
  const allEligible = issues.filter(issue => selectLanes({ issues: [issue] }).selected.length > 0).map(i => i.number);
  return buildGraphDispatchPlan({ maxActiveLanes: MAX_ACTIVE_LANES, runningCount: running,
    queuedIssueNumbers: queued.filter(i => allEligible.includes(i)), openWorkRefs: openRefs(snapshot, issues), now, occupiedNodeIds,
    declaredNodesByIssue: declaredNodesByIssue(snapshot.issues) }, root);
}
function findNode(root: CompletionNode, id: string): CompletionNode | undefined {
  return root.id === id ? root : root.children.map(child => findNode(child, id)).find(Boolean);
}
const LANE_STATES = ['queued', 'prepared', 'validating', 'blocked', 'owner-gate', 'runtime-backoff'] as const;
export function makePlan(snapshot: Snapshot, leases: Lease[] = [], now = new Date().toISOString(), root = COMPLETION_GRAPH, onlyIssue?: number) {
  if (!/^[a-f0-9]{40}$/.test(snapshot.integrationSha) || !/^[a-f0-9]{40}$/.test(snapshot.implementationSha)) throw new Error('Unknown implementation/integration revision');
  const occupied = new Set(leases.filter(isActive).map(lease => lease.issue));
  // `onlyIssue` narrows the QUEUE, never the snapshot. Removing the other issues
  // instead would change `openRefs`, whose `repairPrs` exclusion is computed from
  // the issue list -- so a sibling's repair PR would stop being excluded, a
  // different set of leaves would be admissible, and a verification meant to
  // reproduce one decision would be answering a different question.
  const queued = snapshot.issues.filter(i => !occupied.has(i.number)).map(i => i.number)
    .filter(number => onlyIssue === undefined || number === onlyIssue);
  const plan = admission(snapshot, queued, now, root, runningCount(snapshot, leases), leases.filter(isActive).map(l => l.nodeId));
  const leaves = plan.leaves.map(leaf => {
    const issue = snapshot.issues.find(i => i.number === leaf.issueNumber)!;
    const lineage = lineageFor(issue.number, snapshot.prs);
    const node = findNode(root, leaf.nodeId)!;
    return { ...leaf, fingerprint: sha({ issue, lineage, node, integrationSha: snapshot.integrationSha }),
      repairPr: lineage[0]?.number ?? null, repairBranch: lineage[0]?.head.ref ?? null };
  });
  const contextNodes = new Map<string, CompletionNode>();
  const includeNode = (id: string) => {
    if (contextNodes.has(id)) return;
    const node = findNode(root, id);
    if (!node) throw new Error('Missing context dependency');
    contextNodes.set(id, node);
    node.dependsOn?.forEach(includeNode);
  };
  leaves.forEach(leaf => includeNode(leaf.nodeId));
  const wave = buildWaveContext({
    integrationSha: snapshot.integrationSha,
    governance: ['No main merge or production deployment', 'No scientific/taxonomy activation or locality publication',
      'No credentials or spending authority', 'Owner holds and validation gates are mandatory',
      'One durable issue/PR lineage; graph admission and exclusive lease before execution'],
    architecture: snapshot.material,
    completionGraph: [...contextNodes.values()].sort((a,b) => a.id.localeCompare(b.id)),
    prLineage: snapshot.prs.filter(pr => pr.state === 'open').map(pr => ({ number: pr.number, head: pr.head })).sort((a,b) => a.number-b.number),
    repositoryState: { implementationSha: snapshot.implementationSha, admission: leaves.map(({ issueNumber, nodeId, fingerprint }) => ({ issueNumber, nodeId, fingerprint })) },
  });
  const inventory = Object.fromEntries(LANE_STATES
    .map(state => [state, snapshot.issues.filter(i => i.state === 'open' && !steward(i) && labelsOf(i).includes(`oc-${state}`)).length])
  ) as Record<(typeof LANE_STATES)[number], number>;
  return { ...plan, leaves, wave, inventory: { ...inventory, active: runningCount(snapshot, leases) }, implementationSha: snapshot.implementationSha, integrationSha: snapshot.integrationSha };
}
export type Plan = ReturnType<typeof makePlan>;

export function assertAdmission(plan: Plan, snapshot: Snapshot, issueNumber: number, now: string, root = COMPLETION_GRAPH) {
  validatePlan(plan);
  if (plan.implementationSha !== snapshot.implementationSha || plan.integrationSha !== snapshot.integrationSha) throw new Error('Implementation or integration revision changed; replan');
  const expected = plan.leaves.find(leaf => leaf.issueNumber === issueNumber);
  if (!expected || !plan.issues.includes(issueNumber)) throw new Error('Issue missing from admitted dispatch plan');
  const current = makePlan(snapshot, [], now, root, issueNumber).leaves.find(leaf => leaf.issueNumber === issueNumber);
  if (!current || current.nodeId !== expected.nodeId || current.fingerprint !== expected.fingerprint) {
    // Naming the field that moved, because "graph/admission/issue/lineage" names
    // four causes and identifies none, and a lane that refuses without saying
    // why cannot be repaired from its own logs.
    const drift = !current ? 'the isolated re-plan admitted nothing'
      : current.nodeId !== expected.nodeId ? `node ${expected.nodeId} -> ${current.nodeId}`
      : `fingerprint ${expected.fingerprint.slice(0, 12)} -> ${current.fingerprint.slice(0, 12)}`;
    throw new Error(`Graph/admission/issue/lineage drift; dispatch refused (${drift})`);
  }
  return expected;
}
export function validateLedger(ledger: Ledger) {
  if (ledger.schema !== 1 || !Number.isFinite(Date.parse(ledger.programStartedAt)) ||
      !Number.isFinite(ledger.programSpent) || ledger.programSpent < 0 || !Array.isArray(ledger.leases) ||
      !ledger.dailySpent || Object.values(ledger.dailySpent).some(n => !Number.isFinite(n) || n < 0)) throw new Error('Invalid durable ledger');
  // A deterministic lease reserves nothing and must never be able to; a provider
  // lease must still reserve something. Neither rule is weakened by the other.
  if (ledger.leases.some(l => !Number.isSafeInteger(l.issue) || l.issue <= 0 || !Number.isFinite(Date.parse(l.expiresAt)) ||
      !Number.isFinite(l.reservedUsd) || (laneOf(l) === 'provider-free' ? l.reservedUsd !== 0 : l.reservedUsd <= 0) ||
      (l.lane !== undefined && l.lane !== 'provider' && l.lane !== 'provider-free') ||
      !['reserved','running','validating','blocked','owner-gate','runtime-backoff','done',
        'provider-free-done','provider-free-failed','not-executed'].includes(l.state))) throw new Error('Malformed lease');
  const active = ledger.leases.filter(isActive);
  if (new Set(active.map(l => l.issue)).size !== active.length || new Set(active.map(l => l.nodeId)).size !== active.length) throw new Error('Duplicate active leases in ledger');
}
export type Claim = { issueNumber: number; runId: string; runAttempt: string; providerAuthorized: boolean; requestedUsd: number; now: string };
export async function claimLease(store: LeaseStore, plan: Plan, snapshot: Snapshot, input: Claim, root = COMPLETION_GRAPH) {
  const leaf = assertAdmission(plan, snapshot, input.issueNumber, input.now, root);
  // Never even read or initialize accounting as authority when authorization is false.
  if (!input.providerAuthorized) return { allowed: false, reason: 'provider_not_authorized', lease: null };
  if (!/^\d+$/.test(input.runId) || !/^\d+$/.test(input.runAttempt)) throw new Error('Missing executable workflow invocation');
  for (let attempt = 0; attempt < 8; attempt++) {
    const { version, ledger } = await store.read();
    validateLedger(ledger);
    if (ledger.leases.some(l => (l.issue === input.issueNumber || l.nodeId === leaf.nodeId) && isActive(l))) return { allowed: false, reason: 'lease_owned', lease: null };
    if (runningCount(snapshot, ledger.leases) >= MAX_ACTIVE_LANES) return { allowed: false, reason: 'capacity_full', lease: null };
    // Unchanged failed/completed work is never blindly paid for again.
    if (ledger.leases.some(l => l.fingerprint === leaf.fingerprint)) return { allowed: false, reason: 'unchanged_attempt', lease: null };
    const day = input.now.slice(0, 10);
    const budget = decideBudget({ providerAuthorized: input.providerAuthorized, requestedUsd: input.requestedUsd,
      difficulty: labelsOf(snapshot.issues.find(i => i.number === input.issueNumber)!).includes('oc-difficult') ? 'difficult' : 'ordinary',
      programSpent: ledger.programSpent, dailySpent: ledger.dailySpent[day] ?? 0,
      programStartedAt: ledger.programStartedAt, now: input.now });
    if (!budget.allowed) return { allowed: false, reason: budget.reason, lease: null };
    const lease: Lease = { id: sha({ issue: input.issueNumber, run: input.runId, attempt: input.runAttempt, wave: plan.wave.hash }),
      issue: input.issueNumber, nodeId: leaf.nodeId, fingerprint: leaf.fingerprint, waveHash: plan.wave.hash,
      runId: input.runId, runAttempt: input.runAttempt, expiresAt: new Date(Date.parse(input.now) + 90 * 60000).toISOString(),
      reservedUsd: Math.ceil(input.requestedUsd * 100) / 100, state: 'reserved' };
    // Reservations charge the ledger immediately and are never auto-refunded on
    // unknown provider outcomes. Concurrent lanes cannot each spend the same balance.
    const next = structuredClone(ledger);
    next.programSpent = Math.round((next.programSpent + lease.reservedUsd) * 100) / 100;
    next.dailySpent[day] = Math.round(((next.dailySpent[day] ?? 0) + lease.reservedUsd) * 100) / 100;
    next.leases.push(lease);
    if (await store.compareAndSwap(version, next)) return { allowed: true, reason: 'reserved', lease };
  }
  throw new Error('Ledger contention; dispatch refused');
}
export type DeterministicClaim = { issueNumber: number; runId: string; runAttempt: string; now: string };
/**
 * Reserve a lane for work that costs nothing, and refuse to repeat it.
 *
 * `claimLease` returns `provider_not_authorized` before it reads the ledger, so
 * deterministic work never reached the fingerprint check and an unchanged issue
 * was re-executed on every scheduler pulse -- #171 ran three times in four
 * minutes on one unchanged head. The dedupe is not accounting, so it does not
 * need authorization; this path reads the ledger for identity only and cannot
 * reach `decideBudget`, `programSpent` or `dailySpent` at all.
 */
export async function claimDeterministicLease(store: LeaseStore, plan: Plan, snapshot: Snapshot, input: DeterministicClaim, root = COMPLETION_GRAPH) {
  const leaf = assertAdmission(plan, snapshot, input.issueNumber, input.now, root);
  if (!/^\d+$/.test(input.runId) || !/^\d+$/.test(input.runAttempt)) throw new Error('Missing executable workflow invocation');
  for (let attempt = 0; attempt < 8; attempt++) {
    const { version, ledger } = await store.read();
    validateLedger(ledger);
    if (ledger.leases.some(l => (l.issue === input.issueNumber || l.nodeId === leaf.nodeId) && isActive(l))) return { allowed: false, reason: 'lease_owned', lease: null };
    if (runningCount(snapshot, ledger.leases) >= MAX_ACTIVE_LANES) return { allowed: false, reason: 'capacity_full', lease: null };
    // The same issue, lineage, node and integration revision produce the same
    // fingerprint, so an unchanged attempt is never run a second time.
    //
    // A lane that never executed is excluded. Barring work on the strength of an
    // attempt that did not happen is how the dedupe became the defect it was
    // added to fix: the issue was relabelled `oc-queued`, admitted on every
    // later pulse, refused, receipted and reported green, forever.
    if (ledger.leases.some(l => l.fingerprint === leaf.fingerprint && l.state !== 'not-executed')) {
      return { allowed: false, reason: 'unchanged_attempt', lease: null };
    }
    const lease: Lease = { id: sha({ issue: input.issueNumber, run: input.runId, attempt: input.runAttempt, wave: plan.wave.hash, lane: 'provider-free' }),
      issue: input.issueNumber, nodeId: leaf.nodeId, fingerprint: leaf.fingerprint, waveHash: plan.wave.hash,
      runId: input.runId, runAttempt: input.runAttempt, expiresAt: new Date(Date.parse(input.now) + 90 * 60000).toISOString(),
      reservedUsd: 0, lane: 'provider-free', state: 'reserved' };
    const next = structuredClone(ledger);
    next.leases.push(lease);
    // Deliberately no programSpent/dailySpent write: this lane cannot spend.
    if (await store.compareAndSwap(version, next)) return { allowed: true, reason: 'reserved', lease };
  }
  throw new Error('Ledger contention; dispatch refused');
}

export async function transitionLease(store: LeaseStore, id: string, runId: string, runAttempt: string, state: Lease['state']) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { version, ledger } = await store.read();
    validateLedger(ledger);
    const lease = ledger.leases.find(l => l.id === id);
    if (!lease || lease.runId !== runId || lease.runAttempt !== runAttempt) throw new Error('Lease fencing token mismatch');
    if (lease.state === state) return lease;
    if (!isActive(lease) || (state === 'reserved')) throw new Error('Terminal lease cannot be revived');
    if (laneOf(lease) === 'provider-free' && !['running', 'provider-free-done', 'provider-free-failed', 'not-executed'].includes(state)) {
      throw new Error('Deterministic lease cannot settle into a provider outcome');
    }
    lease.state = state;
    if (await store.compareAndSwap(version, ledger)) return lease;
  }
  throw new Error('Ledger contention; settlement refused');
}
export async function reconcileExpired(store: LeaseStore, now: string, runCompleted: (runId: string) => Promise<boolean>, beforeRelease: (lease: Lease) => Promise<void> = async () => {}) {
  const { ledger } = await store.read();
  validateLedger(ledger);
  for (const lease of ledger.leases.filter(l => isActive(l) && l.expiresAt <= now)) {
    // Time alone is not proof a worker stopped. API failure/unknown status keeps capacity occupied.
    if (await runCompleted(lease.runId)) {
      await beforeRelease(lease);
      // A deterministic lease has no provider outcome to settle into; an expired
      // one failed, and must not be recorded as anything softer.
      await transitionLease(store, lease.id, lease.runId, lease.runAttempt,
        laneOf(lease) === 'provider-free' ? 'provider-free-failed' : 'blocked');
    }
  }
}
export function validatePlan(plan: Plan) {
  if (buildWaveContext(plan.wave.packet).hash !== plan.wave.hash) throw new Error('Wave context hash mismatch');
  const admission = plan.leaves.map(({ issueNumber, nodeId, fingerprint }) => ({ issueNumber, nodeId, fingerprint }));
  const bound = plan.wave.packet.repositoryState.admission;
  if (!Array.isArray(bound) || bound.length !== admission.length ||
      admission.some((entry, index) => Object.entries(entry).some(([key, value]) => bound[index][key] !== value)) ||
      JSON.stringify(plan.issues) !== JSON.stringify(plan.leaves.map(l => l.issueNumber)) ||
      plan.issues.length > MAX_ACTIVE_LANES || new Set(plan.issues).size !== plan.issues.length) {
    throw new Error('Plan differs from hash-bound admission');
  }
}
/**
 * What a lane may report having done. The four execution states are distinct on
 * purpose: a provider-free run that actually executed must never be recorded as
 * `provider_not_authorized`, which is what the denied-lane receipt used to say
 * about a lane that had just run four commands.
 */
export const RECEIPT_OUTCOMES = [
  // Execution happened, deterministically, with no provider.
  'provider_free_done', 'provider_free_failed',
  // Execution did not happen, and why.
  'provider_not_authorized', 'no_api_mode', 'dispatch_refused', 'not_executed',
  // Provider-lane settlement states.
  'validating', 'blocked', 'owner-gate', 'runtime-backoff', 'done',
] as const;

export function assertReceipts(plan: Plan, receipts: Array<{ issue: number; waveHash: string; outcome: string }>) {
  validatePlan(plan);
  if (receipts.length !== plan.issues.length || new Set(receipts.map(r => r.issue)).size !== receipts.length ||
      receipts.some(r => !plan.issues.includes(r.issue) || r.waveHash !== plan.wave.hash ||
        !RECEIPT_OUTCOMES.includes(r.outcome as (typeof RECEIPT_OUTCOMES)[number]))) {
    throw new Error('Admitted graph plan and actual lane receipts diverged');
  }
}
