import { createHash } from 'node:crypto';
import { buildGraphDispatchPlan } from './oc-graph-dispatch-plan';
import { COMPLETION_GRAPH } from '../src/lib/completion-graph/completionGraphData';
import type { CompletionNode } from '../src/lib/completion-graph/types';
import { buildWaveContext } from './oc-wave-context.mjs';
import { BLOCKED_LABELS, MAX_ACTIVE_LANES, selectLanes } from './oc-multilane-selector.mjs';
import { decideBudget } from './oc-budget-governor.mjs';
import { routeIssue } from './oc-capability-router.mjs';
import { admitWorkflowProviderExecution } from '../src/lib/provider-governor/workflowGovernorAdmission';
import type { GovernorState, Provider } from '../src/lib/provider-governor/providerGovernor';

export { MAX_ACTIVE_LANES };
export type Issue = { number: number; state: string; title: string; body: string | null; labels: Array<{ name: string }> };
export type Pull = { number: number; state: string; merged?: boolean; baseRef?: string; body: string | null; head: { ref: string; sha: string } };
export type Snapshot = { issues: Issue[]; prs: Pull[]; integrationSha: string; implementationSha: string; material: Record<string, string> };
export type LeaseLane = 'provider' | 'provider-free';
export type Lease = {
  id: string; issue: number; nodeId: string; fingerprint: string; waveHash: string;
  runId: string; runAttempt: string; expiresAt: string; reservedUsd: number;
  /** The exact implementation revision that produced this attempt. */
  implementationSha?: string;
  /**
   * Leases written by the first deterministic lane predate the lane field. A terminal
   * provider-free outcome with a zero reservation is unambiguous legacy state.
   * Active or ordinary terminal leases without a lane remain provider leases so
   * an ambiguous zero-cost record still fails closed.
   */
  lane?: LeaseLane;
  state: 'reserved' | 'running' | 'validating' | 'blocked' | 'owner-gate' | 'runtime-backoff' | 'done'
    | 'provider-free-done' | 'provider-free-failed' | 'not-executed';
};
export function laneOf(lease: Lease): LeaseLane {
  if (lease.lane) return lease.lane;
  if (lease.reservedUsd === 0 &&
      ['provider-free-done', 'provider-free-failed', 'not-executed'].includes(lease.state)) {
    return 'provider-free';
  }
  return 'provider';
}
export type Ledger = { schema: 1; programStartedAt: string; programSpent: number; dailySpent: Record<string, number>; leases: Lease[] };
export interface LeaseStore {
  read(): Promise<{ version: string; ledger: Ledger }>;
  compareAndSwap(version: string, ledger: Ledger): Promise<boolean>;
}
export const isActive = (lease: Lease) => lease.state === 'reserved' || lease.state === 'running';
export function terminalIssueLabel(state: Lease['state']) {
  if (state === 'done') return 'oc-done';
  // Passing commands prove execution, not product acceptance.
  if (state === 'provider-free-done' || state === 'validating') return 'oc-validating';
  if (state === 'provider-free-failed') return 'oc-repair';
  if (state === 'not-executed') return 'oc-queued';
  if (state === 'owner-gate') return 'oc-owner-gate';
  if (state === 'runtime-backoff') return 'oc-runtime-backoff';
  return 'oc-blocked';
}
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const labelsOf = (issue: Issue) => issue.labels.map(label => label.name);
const steward = (issue: Issue) => labelsOf(issue).includes('oc-portfolio-steward');

// A completion-graph node is the only thing that can carry a queued issue into a
// lane. The graph's own `issues` array binds three of its 119 nodes, so an issue
// the graph does not name is unreachable however it is labelled. This
// accepts the binding from the issue side too: `oc-node:<node-id>`, deliberately
// applied and visible on the issue, exactly as `oc-cap:` declares a capability.
// A generated issue may also carry the canonical line-anchored graph marker in
// its packet body. Free-form title/prose matching remains refused.
const NODE_LABEL = /^oc-node:\s*([a-z0-9][a-z0-9-]*)$/i;
const NODE_BODY = /^OC-GRAPH-NODE:\s*([a-z0-9][a-z0-9-]*)\s*$/im;
export function declaredNodesByIssue(issues: Issue[]): Record<number, string[]> {
  const declared: Record<number, string[]> = {};
  for (const issue of issues) {
    const nodeIds = [
      ...labelsOf(issue).map(label => NODE_LABEL.exec(label)?.[1]?.toLowerCase()),
      NODE_BODY.exec(issue.body || '')?.[1]?.toLowerCase(),
    ].filter((nodeId): nodeId is string => nodeId !== undefined);
    if (nodeIds.length > 0) declared[issue.number] = [...new Set(nodeIds)];
  }
  return declared;
}
export function lineageFor(issue: number, prs: Pull[]) {
  return prs.filter(pr => new RegExp(`^OC-(?:AUTO|LINEAGE)-ISSUE:\\s*#${issue}\\s*$`, 'mi').test(pr.body || '') ||
    new RegExp(`^oc-auto(?:-|/)${issue}(?:-|$)`, 'i').test(pr.head.ref) ||
    new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+(?:jsp1440/orchid-continuum-frontend)?#${issue}\\b`, 'i').test(pr.body || '') ||
    // Reviewed integration PRs such as #677 explicitly say "Implements #676".
    // Ignoring that declaration makes a merged implementation look like new
    // work. Only affirmative declarations count, not incidental prose/titles.
    new RegExp(`^implement(?:s|ed)?\\s+(?:issue\\s+)?(?:jsp1440/orchid-continuum-frontend)?#${issue}\\b`, 'mi').test(pr.body || ''));
}
/**
 * How many abandoned attempts an issue may accumulate before it stops being
 * re-admitted on its own.
 *
 * Re-admission after an abandoned attempt has to be bounded or it becomes its
 * own loop: the lane opens a PR, the PR is closed, the issue is admissible
 * again, forever. Three is enough for a transient failure and few enough that a
 * genuinely rejected approach stops taking lanes and becomes visible in the
 * starvation report instead.
 */
export const MAX_ABANDONED_ATTEMPTS = 3;

/**
 * What a PR lineage means for admission, which is not the same as how many PRs
 * it contains.
 *
 * Three states, and only two of them are durable work:
 *
 * - **in flight** — an open PR. A second attempt must not start.
 * - **delivered** — a merged PR. The work is in; the issue needs settling
 *   against current main, not redoing.
 * - **abandoned** — closed without merging. Nothing is in flight and nothing
 *   was delivered.
 *
 * The rule this replaced was `lineage.length > 0`, which counted an abandoned
 * attempt as durable work. That is a one-way door with no label on it: the
 * issue still reads `oc-queued` to a person and still counts in the queued
 * inventory, while `selectLanes` can never admit it again and nothing will ever
 * look at it. On 2026-09-24 the live plan step named #296 (lineage #303 closed)
 * and #308 (lineage #312 closed) in its STARVED report every five minutes,
 * alongside eight free lanes and nothing admitted.
 */
export function lineageDisposition(lineage: Pull[]) {
  const inFlight = lineage.filter(pr => pr.state === 'open');
  const delivered = lineage.filter(pr => pr.state !== 'open' && pr.merged === true);
  const abandoned = lineage.filter(pr => pr.state !== 'open' && pr.merged !== true);
  return {
    inFlight, delivered, abandoned,
    attemptsExhausted: abandoned.length >= MAX_ABANDONED_ATTEMPTS,
    // Durable means "work is in flight or already delivered", plus the bound
    // above so repeated abandonment stops rather than cycles.
    durable: inFlight.length > 0 || delivered.length > 0
      || abandoned.length >= MAX_ABANDONED_ATTEMPTS,
  };
}

function eligibleIssues(snapshot: Snapshot) {
  return snapshot.issues.map(issue => {
    const lineage = lineageFor(issue.number, snapshot.prs);
    return { ...issue, hasDurablePr: lineageDisposition(lineage).durable,
      repairablePr: lineage.length === 1 && lineage[0].state === 'open', portfolioSteward: steward(issue) };
  });
}
function openRefs(snapshot: Snapshot, issues: ReturnType<typeof eligibleIssues>) {
  const repairPrs = new Set(issues.filter(i => i.repairablePr && labelsOf(i).includes('oc-repair'))
    .flatMap(i => lineageFor(i.number, snapshot.prs).map(pr => pr.number)));
  return snapshot.prs.filter(pr => pr.state === 'open' && !repairPrs.has(pr.number))
    .flatMap(pr => [`#${pr.number}`, `jsp1440/orchid-continuum-frontend#${pr.number}`]);
}
/** Labels that `runningCount` treats as already released, so a label beside one of them holds nothing. */
const RELEASED_LABELS = ['oc-done', 'oc-validating', 'oc-blocked', 'oc-owner-gate', 'oc-runtime-backoff'];
export function runningCount(snapshot: Snapshot, leases: Lease[]) {
  // A stale label is conservatively occupied until reconciliation proves termination.
  return new Set([
    ...leases.filter(isActive).map(lease => lease.issue),
    ...runningLabelledIssues(snapshot.issues).map(i => i.number),
  ]).size;
}
function admission(snapshot: Snapshot, queued: number[], now: string, root: CompletionNode, running = 0, occupiedNodeIds: string[] = [],
  providerCapacity: ProviderCapacity | null = null) {
  const issues = eligibleIssues(snapshot);
  // Filter first, rank with the canonical #301/#313 scheduler second. Scan every
  // eligible issue (not just the first eight in GitHub's API ordering).
  const allEligible = issues.filter(issue => selectLanes({ issues: [issue] }).selected.length > 0).map(i => i.number);
  const admissible = queued.filter(i => allEligible.includes(i));
  return buildGraphDispatchPlan({ maxActiveLanes: MAX_ACTIVE_LANES, runningCount: running,
    queuedIssueNumbers: admissible, openWorkRefs: openRefs(snapshot, issues), now, occupiedNodeIds,
    declaredNodesByIssue: declaredNodesByIssue(snapshot.issues),
    ...(providerCapacity === null ? {} : {
      providerLaneIssues: admissible.filter(number => laneClassOf(snapshot.issues.find(i => i.number === number)!) === 'provider'),
      providerSlots: providerCapacity.slots,
      providerSlotsReason: providerCapacity.reason,
    }) }, root);
}

/**
 * Which lane an issue's own classify job will send it to.
 *
 * This is the lane workflow's `oc-provider-free-route.mjs` decision, made with
 * the same `routeIssue` over the same body and labels: `providerFree` goes to
 * the deterministic lane, everything else to budget preflight. An issue whose
 * declaration cannot be routed is routed `provider_free=false` by that job, so
 * it is provider-lane here too -- it would take a provider slot, not a free one.
 */
export function laneClassOf(issue: Pick<Issue, 'number' | 'body' | 'labels'>): LeaseLane {
  try {
    return routeIssue({ number: issue.number, body: issue.body, labels: issue.labels }).providerFree ? 'provider-free' : 'provider';
  } catch {
    return 'provider';
  }
}

/**
 * How many provider-lane issues one wave may admit, and the constraint that
 * decided it. Computed once per plan from durable, deterministic inputs and
 * recorded in the hash-bound wave packet, so every lane's isolated re-plan
 * reproduces the same decision instead of re-reading a ledger that its
 * siblings have since charged.
 *
 * This decides ADMISSION only. It spends nothing, reserves nothing and grants
 * nothing: every admitted provider lane still passes the provider governor and
 * `claimLease` -> `decideBudget` at its own preflight, exactly as before.
 */
export type ProviderCapacity = {
  slots: number;
  reason: string;
  basis: {
    providerAuthorized: boolean;
    noApiMode: boolean;
    disabledProviders: string[];
    policyReason: string | null;
    budgetReason: string | null;
    day: string;
    dailySpentUsd: number | null;
    programSpentUsd: number | null;
    /** Ordinary tasks the remaining daily/program budget can still reserve. */
    budgetFitTasks: number | null;
    waveMaxCalls: number | null;
    dailyMaxCalls: number | null;
    /**
     * The ledger records reservations, not provider calls, and the governor's
     * call counters are not persisted between lanes. Remaining daily calls are
     * therefore unknown, and are recorded as unknown rather than invented.
     */
    dailyCallsRemaining: null;
    dailyCallsBasis: 'not_recorded_by_ledger';
  };
};
export type ProviderCapacityInput = {
  providerAuthorized: boolean;
  noApiMode: boolean;
  disabledProviders: Provider[];
  waveMaxCalls: number;
  dailyMaxCalls: number;
  materialWorkThreshold?: number;
  minimumDispatchIntervalMs?: number;
  /** `null` when the durable ledger does not exist or could not be read. */
  ledger: Ledger | null;
  now: string;
};
const GOVERNOR_PROVIDERS: Provider[] = ['anthropic', 'gemini', 'openai'];
export function providerCapacityFor(input: ProviderCapacityInput): ProviderCapacity {
  const day = input.now.slice(0, 10);
  const basis: ProviderCapacity['basis'] = {
    providerAuthorized: input.providerAuthorized, noApiMode: input.noApiMode,
    disabledProviders: [...input.disabledProviders].sort(), policyReason: null, budgetReason: null, day,
    dailySpentUsd: input.ledger ? (input.ledger.dailySpent[day] ?? 0) : null,
    programSpentUsd: input.ledger ? input.ledger.programSpent : null,
    budgetFitTasks: null, waveMaxCalls: input.waveMaxCalls, dailyMaxCalls: input.dailyMaxCalls,
    dailyCallsRemaining: null, dailyCallsBasis: 'not_recorded_by_ledger',
  };
  const none = (reason: string): ProviderCapacity => ({ slots: 0, reason, basis });
  if (!input.providerAuthorized) return none('provider_not_authorized');
  if (input.noApiMode) return none('no_api_mode');
  // The provider governor the lane runs (provider-governor-workflow-gate.ts),
  // with the state that lane always starts from: fresh, no calls, no
  // fingerprint. With a single work unit its decision depends only on policy,
  // not on which issue the unit names, so one probe answers for every lane.
  const usage = () => Object.fromEntries(GOVERNOR_PROVIDERS.map(p => [p, { calls: 0, tokens: 0, costUsd: 0, lastDispatchAt: null }])) as GovernorState['daily'];
  const policy = admitWorkflowProviderExecution({
    now: input.now,
    work: [{ issueNumber: 1 }],
    state: { noApiMode: input.noApiMode, dayKey: day, daily: usage(), wave: usage(), lastFingerprint: null },
    config: { noApiMode: input.noApiMode, materialWorkThreshold: input.materialWorkThreshold ?? 1,
      minimumDispatchIntervalMs: input.minimumDispatchIntervalMs ?? 3_600_000,
      dailyMaxCalls: input.dailyMaxCalls, waveMaxCalls: input.waveMaxCalls, disabledProviders: input.disabledProviders },
  });
  basis.policyReason = policy.reason;
  if (!policy.allowPaidExecution) return none(`provider_policy_denied:${policy.reason}`);
  // Missing accounting never means nothing has been spent; claimLease cannot
  // reserve without the ledger either.
  if (!input.ledger) return none('ledger_unavailable');
  const budget = decideBudget({ providerAuthorized: true, difficulty: 'ordinary',
    programSpent: input.ledger.programSpent, dailySpent: input.ledger.dailySpent[day] ?? 0,
    programStartedAt: input.ledger.programStartedAt, now: input.now });
  basis.budgetReason = budget.reason;
  if (!budget.allowed) return none(budget.reason);
  const cents = (usd: number) => Math.floor(usd * 100 + 1e-9);
  const fit = Math.floor(Math.min(cents(budget.dailyRemainingUsd ?? 0), cents(budget.programRemainingUsd ?? 0)) /
    Math.max(1, Math.ceil(budget.config.ordinaryTaskUsd * 100 - 1e-9)));
  basis.budgetFitTasks = fit;
  const bounds: Array<[number, string]> = [[input.waveMaxCalls, 'wave_max_calls'], [input.dailyMaxCalls, 'daily_max_calls'], [fit, 'budget_fit']];
  const [slots, reason] = bounds.reduce((best, bound) => bound[0] < best[0] ? bound : best);
  return { slots: Math.max(0, slots), reason, basis };
}

/**
 * Read the provider policy from the environment exactly as the lane's gate
 * does: the same variable names and the same defaults, including NO-API ON
 * when the variable is absent. A value the gate would reject yields zero
 * slots instead of a crashed plan.
 */
export function providerCapacityFromEnvironment(env: Record<string, string | undefined>, ledger: Ledger | null, now: string): ProviderCapacity {
  const bool = (name: string, fallback: boolean) => {
    const value = env[name];
    if (value == null || value === '') return fallback;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(name);
  };
  const int = (name: string, fallback: number) => {
    const value = env[name];
    if (value == null || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) throw new Error(name);
    return parsed;
  };
  const providerAuthorized = env.PROVIDER_AUTHORIZED === 'true';
  try {
    const disabled = (env.OC_PROVIDER_DISABLED ?? '').split(',').map(v => v.trim()).filter(Boolean);
    if (disabled.some(p => !GOVERNOR_PROVIDERS.includes(p as Provider))) throw new Error('OC_PROVIDER_DISABLED');
    return providerCapacityFor({ providerAuthorized, noApiMode: bool('OC_PROVIDER_NO_API_MODE', true),
      disabledProviders: disabled as Provider[],
      waveMaxCalls: int('OC_PROVIDER_WAVE_MAX_CALLS', 1), dailyMaxCalls: int('OC_PROVIDER_DAILY_MAX_CALLS', 4),
      materialWorkThreshold: int('OC_PROVIDER_MATERIAL_WORK_THRESHOLD', 1),
      minimumDispatchIntervalMs: int('OC_PROVIDER_MINIMUM_DISPATCH_INTERVAL_MS', 3_600_000), ledger, now });
  } catch (error) {
    const capacity = providerCapacityFor({ providerAuthorized: false, noApiMode: true, disabledProviders: [],
      waveMaxCalls: 0, dailyMaxCalls: 0, ledger, now });
    return { ...capacity, basis: { ...capacity.basis, providerAuthorized },
      reason: `invalid_provider_policy_env:${error instanceof Error ? error.message : 'unknown'}` };
  }
}
function findNode(root: CompletionNode, id: string): CompletionNode | undefined {
  return root.id === id ? root : root.children.map(child => findNode(child, id)).find(Boolean);
}
const LANE_STATES = ['queued', 'prepared', 'validating', 'blocked', 'owner-gate', 'runtime-backoff'] as const;
export function makePlan(snapshot: Snapshot, leases: Lease[] = [], now = new Date().toISOString(), root = COMPLETION_GRAPH, onlyIssue?: number,
  providerCapacity: ProviderCapacity | null = null) {
  if (!/^[a-f0-9]{40}$/.test(snapshot.integrationSha) || !/^[a-f0-9]{40}$/.test(snapshot.implementationSha)) throw new Error('Unknown implementation/integration revision');
  const occupied = new Set(leases.filter(isActive).map(lease => lease.issue));
  // `onlyIssue` narrows the QUEUE, never the snapshot. Removing the other issues
  // instead would change `openRefs`, whose `repairPrs` exclusion is computed from
  // the issue list -- so a sibling's repair PR would stop being excluded, a
  // different set of leaves would be admissible, and a verification meant to
  // reproduce one decision would be answering a different question.
  const queued = snapshot.issues.filter(i => !occupied.has(i.number)).map(i => i.number)
    .filter(number => onlyIssue === undefined || number === onlyIssue);
  if (providerCapacity !== null && (!Number.isSafeInteger(providerCapacity.slots) || providerCapacity.slots < 0 || !providerCapacity.reason)) {
    throw new Error('Invalid provider capacity');
  }
  const plan = admission(snapshot, queued, now, root, runningCount(snapshot, leases), leases.filter(isActive).map(l => l.nodeId), providerCapacity);
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
    repositoryState: { implementationSha: snapshot.implementationSha, admission: leaves.map(({ issueNumber, nodeId, fingerprint }) => ({ issueNumber, nodeId, fingerprint })),
      // The provider-slot decision is part of the admission, so it is hash-bound
      // with it: a lane re-plans with exactly this input, never a live re-read.
      providerCapacity: providerCapacity ?? null },
  });
  const inventory = Object.fromEntries(LANE_STATES
    .map(state => [state, snapshot.issues.filter(i => i.state === 'open' && !steward(i) && labelsOf(i).includes(`oc-${state}`)).length])
  ) as Record<(typeof LANE_STATES)[number], number>;
  // The census/reached shortfall was first reported as a bare count, then as a
  // list of numbers under a line naming three candidate causes and identifying
  // none of them -- and on a live run every one of those three was false for
  // #703, whose real cause (an already-MERGED PR lineage) was not among them.
  // Printing a guess is the same defect as printing a count.
  //
  // So the reason is derived per issue, from the exclusion that actually applies,
  // in `selectLanes`' own order. `occupied` comes first because `makePlan` filters
  // on it before the selector ever runs: an issue whose lease is executing right
  // now was being reported as work that never reached admission.
  const reasonFor = (issue: Issue): string => {
    if (occupied.has(issue.number)) return 'an active lease is executing it';
    const labels = labelsOf(issue);
    const blocking = labels.find(l => BLOCKED_LABELS.has(l));
    if (blocking) return `the \`${blocking}\` label`;
    if (/^OC-AUTO-HOLD:\s*true\s*$/m.test(issue.body || '')) return 'an `OC-AUTO-HOLD: true` marker in its body';
    const lineage = lineageFor(issue.number, snapshot.prs);
    const disposition = lineageDisposition(lineage);
    if (disposition.durable && !(labels.includes('oc-repair') && lineage.length === 1 && lineage[0].state === 'open')) {
      // Durable lineage holds it, not merely any lineage. A single merged PR is
      // the commonest case and the one the old text told the operator to go and
      // close -- there is nothing open to close, and the lane will never pick
      // the issue up again on its own.
      const state = (pr: Pull) => pr.state === 'open' ? 'open' : pr.merged ? 'merged' : 'closed';
      const named = lineage.map(pr => `#${pr.number} (${state(pr)})`).join(', ');
      if (disposition.inFlight.length === 0 && disposition.delivered.length === 0) {
        // Every attempt was abandoned and the bound is spent. Say the number,
        // because "it is held" without it reads as a rule nobody can act on.
        return `${disposition.abandoned.length} abandoned attempt(s) ${named} and no merged or open PR; ` +
          `re-admission stops at ${MAX_ABANDONED_ATTEMPTS}, so this needs a decision rather than another lane`;
      }
      if (lineage.length === 1 && lineage[0].merged) {
        // The operator-relevant fact, and the one the old wording hid: there is
        // no open PR to go and close, the work is already in, and the lane will
        // not pick this issue up again by itself.
        const target = lineage[0].baseRef ? ` into \`${lineage[0].baseRef}\`` : ' into its target branch';
        return `its PR lineage ${named}; the PR is already merged${target}; reconcile current main and issue acceptance before settling it`;
      }
      return lineage.length === 1
        ? `its PR lineage ${named}; only a single OPEN PR on an \`oc-repair\` issue is repairable`
        : `an ambiguous PR lineage ${named}; repair needs exactly one open PR`;
    }
    return 'no rule this report knows about -- read `selectLanes`';
  };
  const pendingNotReachingAdmission = onlyIssue !== undefined ? [] : snapshot.issues
    .filter(i => i.state === 'open' && !steward(i) && labelsOf(i).some(l => ['oc-queued', 'oc-prepared'].includes(l)))
    .filter(i => !plan.reachedAdmission.includes(i.number))
    .map(i => ({ issueNumber: i.number, reason: reasonFor(i) }))
    .sort((a, b) => a.issueNumber - b.issueNumber);
  return { ...plan, leaves, wave, pendingNotReachingAdmission, providerCapacity, inventory: { ...inventory, active: runningCount(snapshot, leases) }, implementationSha: snapshot.implementationSha, integrationSha: snapshot.integrationSha };
}
export type Plan = ReturnType<typeof makePlan>;

export function assertAdmission(plan: Plan, snapshot: Snapshot, issueNumber: number, now: string, root = COMPLETION_GRAPH) {
  validatePlan(plan);
  if (plan.implementationSha !== snapshot.implementationSha || plan.integrationSha !== snapshot.integrationSha) throw new Error('Implementation or integration revision changed; replan');
  const expected = plan.leaves.find(leaf => leaf.issueNumber === issueNumber);
  if (!expected || !plan.issues.includes(issueNumber)) throw new Error('Issue missing from admitted dispatch plan');
  // The re-plan must answer the plan's question, so it takes the provider-slot
  // input the plan recorded. Recomputing it from the live ledger would read
  // reservations the wave's own sibling lanes have made since.
  const current = makePlan(snapshot, [], now, root, issueNumber, plan.providerCapacity ?? null).leaves.find(leaf => leaf.issueNumber === issueNumber);
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
      (l.implementationSha !== undefined && !/^[a-f0-9]{40}$/.test(l.implementationSha)) ||
      (l.lane !== undefined && l.lane !== 'provider' && l.lane !== 'provider-free') ||
      !['reserved','running','validating','blocked','owner-gate','runtime-backoff','done',
        'provider-free-done','provider-free-failed','not-executed'].includes(l.state))) throw new Error('Malformed lease');
  const active = ledger.leases.filter(isActive);
  if (new Set(active.map(l => l.issue)).size !== active.length || new Set(active.map(l => l.nodeId)).size !== active.length) throw new Error('Duplicate active leases in ledger');
}
export type Claim = { issueNumber: number; runId: string; runAttempt: string; providerAuthorized: boolean; requestedUsd: number; now: string };
export async function claimLease(store: LeaseStore, plan: Plan, snapshot: Snapshot, input: Claim, root = COMPLETION_GRAPH) {
  // Refused before the ledger is read at all. `decideBudget` would deny it a
  // step later anyway, so this is not the only thing between an unauthorized
  // caller and a reservation -- but "never even read" is the stated property,
  // and it needs a test that fails if the read happens. There is one now: a
  // store whose `read()` throws.
  if (!input.providerAuthorized) {
    assertAdmission(plan, snapshot, input.issueNumber, input.now, root);
    return { allowed: false, reason: 'provider_not_authorized', lease: null };
  }
  // Immutable plan identity first; nothing live has been consulted yet.
  validatePlan(plan);
  if (plan.implementationSha !== snapshot.implementationSha || plan.integrationSha !== snapshot.integrationSha) throw new Error('Implementation or integration revision changed; replan');
  const leaf = plan.leaves.find(candidate => candidate.issueNumber === input.issueNumber);
  if (!leaf || !plan.issues.includes(input.issueNumber)) throw new Error('Issue missing from admitted dispatch plan');
  if (!/^\d+$/.test(input.runId) || !/^\d+$/.test(input.runAttempt)) throw new Error('Missing executable workflow invocation');
  for (let attempt = 0; attempt < 8; attempt++) {
    const { version, ledger } = await store.read();
    validateLedger(ledger);
    // Durable identity BEFORE the live re-plan. Two overlapping scheduler
    // passes can admit the same queued issue; the lane workflow's per-issue
    // concurrency group then holds the second lane until the first has
    // reserved, started (`oc-running`) and often settled (`oc-validating`,
    // `oc-runtime-backoff`) it. The second lane's isolated re-plan then sees an
    // issue that is no longer queued and admits nothing -- which is true, and
    // was thrown as "drift" with no receipt, failing the audit (live: #792 in
    // run 36156196749, #791 in run 36156039098). The ledger already proves the
    // work is owned or unchanged, so that is a governed refusal, exactly as
    // `claimDeterministicLease` has always done. Genuine drift -- no durable
    // lease for this work -- still reaches `assertAdmission` below and throws.
    if (ledger.leases.some(l => (l.issue === input.issueNumber || l.nodeId === leaf.nodeId) && isActive(l))) return { allowed: false, reason: 'lease_owned', lease: null };
    // Unchanged failed/completed work is never blindly paid for again.
    if (ledger.leases.some(l => l.fingerprint === leaf.fingerprint)) return { allowed: false, reason: 'unchanged_attempt', lease: null };
    assertAdmission(plan, snapshot, input.issueNumber, input.now, root);
    if (runningCount(snapshot, ledger.leases) >= MAX_ACTIVE_LANES) return { allowed: false, reason: 'capacity_full', lease: null };
    const day = input.now.slice(0, 10);
    const budget = decideBudget({ providerAuthorized: input.providerAuthorized, requestedUsd: input.requestedUsd,
      difficulty: labelsOf(snapshot.issues.find(i => i.number === input.issueNumber)!).includes('oc-difficult') ? 'difficult' : 'ordinary',
      programSpent: ledger.programSpent, dailySpent: ledger.dailySpent[day] ?? 0,
      programStartedAt: ledger.programStartedAt, now: input.now });
    if (!budget.allowed) return { allowed: false, reason: budget.reason, lease: null };
    const lease: Lease = { id: sha({ issue: input.issueNumber, run: input.runId, attempt: input.runAttempt, wave: plan.wave.hash }),
      issue: input.issueNumber, nodeId: leaf.nodeId, fingerprint: leaf.fingerprint, waveHash: plan.wave.hash,
      runId: input.runId, runAttempt: input.runAttempt, expiresAt: new Date(Date.parse(input.now) + 90 * 60000).toISOString(),
      reservedUsd: Math.ceil(input.requestedUsd * 100) / 100, implementationSha: plan.implementationSha, state: 'reserved' };
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
  // Validate the immutable plan identity before reading live labels. A live label
  // may legitimately move while another run is executing the same admitted work.
  validatePlan(plan);
  if (plan.implementationSha !== snapshot.implementationSha || plan.integrationSha !== snapshot.integrationSha) {
    throw new Error('Implementation or integration revision changed; replan');
  }
  const leaf = plan.leaves.find(candidate => candidate.issueNumber === input.issueNumber);
  if (!leaf || !plan.issues.includes(input.issueNumber)) throw new Error('Issue missing from admitted dispatch plan');
  if (!/^\d+$/.test(input.runId) || !/^\d+$/.test(input.runAttempt)) throw new Error('Missing executable workflow invocation');

  for (let attempt = 0; attempt < 8; attempt++) {
    const { version, ledger } = await store.read();
    validateLedger(ledger);

    // A second scheduler pulse can arrive after the first pulse has settled the
    // issue and changed its labels to oc-validating/oc-done. The strict
    // isolated re-plan below must still reject a genuinely changed or unbound
    // issue, but an exact durable fingerprint is proof that this pulse is only
    // stale. Return a governed refusal so the workflow can write its
    // not_executed receipt instead of failing the whole canary.
    const matching = ledger.leases.filter(candidate => candidate.fingerprint === leaf.fingerprint);
    if (matching.some(candidate => isActive(candidate))) return { allowed: false, reason: 'lease_owned', lease: null };

    const repairing = labelsOf(snapshot.issues.find(issue => issue.number === input.issueNumber)!).includes('oc-repair');
    if (matching.some(candidate => candidate.state !== 'not-executed' &&
        !(repairing && failedOnOlderImplementation(candidate, snapshot.implementationSha)))) {
      return { allowed: false, reason: 'unchanged_attempt', lease: null };
    }

    // No matching terminal evidence exists, so the live admission proof remains
    // mandatory. This keeps label, graph, lineage and capability drift fail-closed.
    assertAdmission(plan, snapshot, input.issueNumber, input.now, root);
    if (runningCount(snapshot, ledger.leases) >= MAX_ACTIVE_LANES) return { allowed: false, reason: 'capacity_full', lease: null };

    // The not-executed escape hatch had no floor. An issue whose worker can
    // never write evidence -- a failing npm ci, a dead runner, a capability
    // with no local executor -- was admitted, refused and receipted on every
    // pulse of a five-minute cron, appending one lease each time and reporting
    // a green audit each time. At 474 bytes a lease that is 133 KiB a day, and
    // the ledger passes the contents API's 1 MiB ceiling inside eight days,
    // breaking every lane's read(), not just this one's.
    if (ledger.leases.filter(l => l.fingerprint === leaf.fingerprint && l.state === 'not-executed').length >= NOT_EXECUTED_CEILING) {
      return { allowed: false, reason: 'not_executed_ceiling', lease: null };
    }
    const lease: Lease = { id: sha({ issue: input.issueNumber, run: input.runId, attempt: input.runAttempt, wave: plan.wave.hash, lane: 'provider-free' }),
      issue: input.issueNumber, nodeId: leaf.nodeId, fingerprint: leaf.fingerprint, waveHash: plan.wave.hash,
      runId: input.runId, runAttempt: input.runAttempt, expiresAt: new Date(Date.parse(input.now) + 90 * 60000).toISOString(),
      reservedUsd: 0, implementationSha: plan.implementationSha, lane: 'provider-free', state: 'reserved' };
    const next = structuredClone(ledger);
    next.leases.push(lease);
    // Deliberately no programSpent/dailySpent write: this lane cannot spend.
    if (await store.compareAndSwap(version, next)) return { allowed: true, reason: 'reserved', lease };
  }
  throw new Error('Ledger contention; dispatch refused');
}

/** How many times a fingerprint may settle `not-executed` before the lane stops trying. */
export const NOT_EXECUTED_CEILING = 3;

function failedOnOlderImplementation(lease: Lease, implementationSha: string) {
  return laneOf(lease) === 'provider-free' && lease.state === 'provider-free-failed' &&
    typeof lease.implementationSha === 'string' && /^[a-f0-9]{40}$/.test(lease.implementationSha) &&
    lease.implementationSha !== implementationSha;
}

/**
 * Return deterministic failures that may safely re-enter the queue.
 *
 * A failed provider-free attempt is intentionally removed from `oc-queued` so
 * the same immutable implementation cannot thrash every scheduler pulse. Once
 * a different implementation revision exists, the old failure is no longer a
 * proof about the current code and one bounded retry becomes safe. Missing
 * revision evidence, owner holds, and an already-failed attempt at the current
 * revision all remain parked.
 */
export function providerFreeRepairsReadyForRequeue(snapshot: Snapshot, leases: Lease[]) {
  if (!/^[a-f0-9]{40}$/.test(snapshot.implementationSha)) return [];
  const parked = eligibleIssues(snapshot).filter(issue => {
    const labels = new Set(labelsOf(issue));
    if (!labels.has('oc-repair') || labels.has('oc-queued') || labels.has('oc-prepared') ||
        leases.some(lease => lease.issue === issue.number && isActive(lease))) return false;
    // Reuse normal admission exclusions before restoring queue state: owner
    // holds, publication holds, running work, stewards and durable PRs all apply.
    const candidate = { ...issue, labels: [...issue.labels, { name: 'oc-queued' }] };
    if (selectLanes({ issues: [candidate] }).selected.length === 0) return false;
    const failures = leases.filter(lease => lease.issue === issue.number &&
      laneOf(lease) === 'provider-free' && lease.state === 'provider-free-failed');
    if (failures.length === 0) return false;
    // Legacy failures without an exact implementation revision are not safe to
    // reinterpret; they stay visible for an owner or repair PR.
    return failures.every(lease => failedOnOlderImplementation(lease, snapshot.implementationSha));
  });
  return parked.map(issue => issue.number).sort((a, b) => a - b);
}

export async function transitionLease(store: LeaseStore, id: string, runId: string, runAttempt: string, state: Lease['state'], options: { requireActive?: boolean } = {}) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { version, ledger } = await store.read();
    validateLedger(ledger);
    const lease = ledger.leases.find(l => l.id === id);
    // Reconciliation races with settlement and with a previous retry. Once the
    // lease is gone there is nothing left to release; treating that as a safe
    // no-op is what makes release idempotent without weakening fencing for an
    // existing lease.
    if (!lease) {
      if (options.requireActive) throw new Error('Lease fencing token mismatch');
      return null;
    }
    if (lease.runId !== runId || lease.runAttempt !== runAttempt) throw new Error('Lease fencing token mismatch');
    // Reconciliation may observe a release twice. An executable worker must
    // still fail closed if its lease disappeared or settled after preflight.
    if (options.requireActive && !isActive(lease)) throw new Error('Terminal lease cannot be revived');
    if (lease.state === state) return lease;
    // A concurrent settlement may have released this lease after the caller's
    // snapshot. Preserve its outcome; missing/already-released leases are safe
    // no-ops, while an existing lease still requires the exact run fence above.
    if (!isActive(lease) || state === 'reserved') return lease;
    if (laneOf(lease) === 'provider-free' && !['running', 'provider-free-done', 'provider-free-failed', 'not-executed'].includes(state)) {
      throw new Error('Deterministic lease cannot settle into a provider outcome');
    }
    lease.state = state;
    if (await store.compareAndSwap(version, ledger)) return lease;
  }
  throw new Error('Ledger contention; settlement refused');
}
export async function reconcileExpired(
  store: LeaseStore,
  now: string,
  runCompleted: (runId: string) => Promise<boolean>,
  beforeRelease: (lease: Lease) => Promise<void> = async () => {},
  afterRelease: (lease: Lease) => Promise<void> = async () => {},
) {
  const { ledger } = await store.read();
  validateLedger(ledger);
  const report = { inspected: 0, recovered: 0, kept: 0, errors: 0 };
  for (const lease of ledger.leases.filter(l => isActive(l) && l.expiresAt <= now)) {
    report.inspected++;
    // Time alone is not proof a worker stopped. API failure/unknown status keeps capacity occupied.
    try {
      if (!(await runCompleted(lease.runId))) {
        report.kept++;
        continue;
      }
      await beforeRelease(lease);
      // Expiry without settlement is not execution evidence. Deterministic
      // work may retry within its existing bound; unseen paid work stays blocked.
      const finalLease = await transitionLease(store, lease.id, lease.runId, lease.runAttempt,
        laneOf(lease) === 'provider-free' ? 'not-executed' : 'blocked');
      // Use the outcome that actually won the CAS, including a concurrent
      // settlement, before synchronizing issue labels outside the ledger.
      if (finalLease) await afterRelease(finalLease);
      report.recovered++;
    } catch {
      // Unavailable evidence for one run must not stop unaffected lanes.
      // Its reservation remains occupied until termination can be established.
      report.errors++;
    }
  }
  return report;
}
/** The issues whose `oc-running` label `runningCount` counts as occupied capacity. */
export function runningLabelledIssues(issues: Issue[]) {
  return issues.filter(i => !steward(i) && i.state !== 'closed' && labelsOf(i).includes('oc-running') &&
    !labelsOf(i).some(l => RELEASED_LABELS.includes(l)));
}
export type StaleLabelOutcome = { issue: number; outcome: 'cleared' | 'kept' | 'error'; reason: string; leaseId?: string; state?: Lease['state'] };
/**
 * Release capacity held by an `oc-running` label its lane can no longer own.
 *
 * `runningCount` counts a stale label as occupied "until reconciliation proves
 * termination", but nothing proved it for a lease that was already terminal:
 * `reconcileExpired` only inspects ACTIVE leases, so when its relabel
 * (`afterRelease`) failed after the ledger transition had won, or a settle job
 * died between its ledger write and its label write, the lease was terminal,
 * never inspected again, and the label consumed one of the eight lanes for
 * ever.
 *
 * The proof required here is the same one expiry uses, and nothing weaker:
 * the ledger's LATEST lease for the issue is terminal, no lease for it is
 * active, and the hosted run that held that lease is proven completed. A label
 * with no lease at all, an unknown run status, or a status API failure keeps
 * the label -- fail closed -- and is reported. The ledger is re-read just
 * before each relabel so a lane that claimed the issue meanwhile is never
 * stripped of its label.
 */
export async function reconcileStaleRunningLabels(
  store: LeaseStore,
  issues: Issue[],
  runCompleted: (runId: string) => Promise<boolean>,
  relabel: (issue: number, lease: Lease) => Promise<void>,
) {
  const outcomes: StaleLabelOutcome[] = [];
  for (const issue of runningLabelledIssues(issues).sort((a, b) => a.number - b.number)) {
    try {
      const { ledger } = await store.read();
      validateLedger(ledger);
      const leases = ledger.leases.filter(l => l.issue === issue.number);
      if (leases.some(isActive)) { outcomes.push({ issue: issue.number, outcome: 'kept', reason: 'an active lease owns the label' }); continue; }
      const last = leases[leases.length - 1];
      if (!last) { outcomes.push({ issue: issue.number, outcome: 'kept', reason: 'no ledger lease proves who applied the label' }); continue; }
      if (!(await runCompleted(last.runId))) {
        outcomes.push({ issue: issue.number, outcome: 'kept', reason: `run ${last.runId} is not proven completed`, leaseId: last.id, state: last.state });
        continue;
      }
      // Re-read: the label may now belong to a lane that claimed after the first read.
      const { ledger: fresh } = await store.read();
      validateLedger(fresh);
      const now = fresh.leases.filter(l => l.issue === issue.number);
      if (now.some(isActive) || now[now.length - 1]?.id !== last.id) {
        outcomes.push({ issue: issue.number, outcome: 'kept', reason: 'a newer lease appeared during reconciliation' });
        continue;
      }
      await relabel(issue.number, last);
      outcomes.push({ issue: issue.number, outcome: 'cleared', reason: `terminal lease ${last.state} and run ${last.runId} completed`, leaseId: last.id, state: last.state });
    } catch (error) {
      outcomes.push({ issue: issue.number, outcome: 'error', reason: error instanceof Error ? error.message : 'unknown failure' });
    }
  }
  return outcomes;
}
export function validatePlan(plan: Plan) {
  if (buildWaveContext(plan.wave.packet).hash !== plan.wave.hash) throw new Error('Wave context hash mismatch');
  const admission = plan.leaves.map(({ issueNumber, nodeId, fingerprint }) => ({ issueNumber, nodeId, fingerprint }));
  const bound = plan.wave.packet.repositoryState.admission;
  if (!Array.isArray(bound) || bound.length !== admission.length ||
      admission.some((entry, index) => Object.entries(entry).some(([key, value]) => bound[index][key] !== value)) ||
      JSON.stringify(plan.issues) !== JSON.stringify(plan.leaves.map(l => l.issueNumber)) ||
      plan.issues.length > MAX_ACTIVE_LANES || new Set(plan.issues).size !== plan.issues.length ||
      canonicalJson(plan.providerCapacity ?? null) !== canonicalJson(plan.wave.packet.repositoryState.providerCapacity ?? null) ||
      (plan.providerCapacity && (plan.providerAdmitted ?? 0) > plan.providerCapacity.slots)) {
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
