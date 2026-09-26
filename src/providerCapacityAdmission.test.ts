import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  assertAdmission, claimDeterministicLease, claimLease, isActive, laneClassOf, makePlan, providerCapacityFor,
  providerCapacityFromEnvironment, reconcileExpired, reconcileStaleRunningLabels, runningCount, transitionLease,
  validatePlan, type Issue, type Lease, type Ledger, type LeaseStore, type ProviderCapacity, type Snapshot,
} from '../scripts/oc-dispatch-control';
import { buildGraphDispatchPlan } from '../scripts/oc-graph-dispatch-plan';
import { bindingReport, planSummary } from '../scripts/oc-dispatch-runtime';
import { COMPLETION_GRAPH } from './lib/completion-graph/completionGraphData';
import type { CompletionNode } from './lib/completion-graph/types';
import reserveIssues from './lib/__fixtures__/reserve-mission-issues-816-818.json';

const NOW = '2026-09-25T20:25:00.000Z';
const DAY = '2026-09-25';

/** The policy environment every lane's budget-preflight job runs with. */
const LANE_ENV = {
  PROVIDER_AUTHORIZED: 'true', OC_PROVIDER_NO_API_MODE: 'false', OC_PROVIDER_DISABLED: '',
  OC_PROVIDER_DAILY_MAX_CALLS: '4', OC_PROVIDER_WAVE_MAX_CALLS: '1',
};

/** A provider-required body in the exact shape the supervisor files (#793-#809). */
const providerIssue = (number: number, nodeId: string): Issue => ({
  number, state: 'open', title: `P5 Graph leaf: ${nodeId}`,
  body: `Graph node: \`${nodeId}\`\n\nOC-GRAPH-NODE: ${nodeId}\n\nOC-SUPERVISOR-SOURCE: completion-graph\n` +
    'OC-SWARM-CAPABILITY: open-ended-code-authoring\nOC-SWARM-PROVIDER-REQUIRED: true\nOC-DISCOVERY-FINGERPRINT: ocfp1-00000000',
  labels: ['oc-queued', 'oc-auto-generated', 'oc-cap:open-ended-code-authoring', 'oc-discovered', `oc-node:${nodeId}`]
    .sort().map(name => ({ name })),
});
const freeIssue = (number: number, nodeId: string): Issue => ({
  number, state: 'open', title: `Deterministic check for ${nodeId}`, body: `OC-GRAPH-NODE: ${nodeId}`,
  labels: ['oc-queued', 'oc-cap:test-execution', `oc-node:${nodeId}`].map(name => ({ name })),
});

/** The fourteen open provider-required queued issues, each on its live graph leaf. */
const LIVE_PROVIDER_QUEUE: Array<[number, string]> = [
  [793, 'cap-screen-orchids'], [794, 'cap-pollinator-mycorrhiza-real-data'], [797, 'cap-matrix-report-lexicon'],
  [798, 'cap-kg-visualization-graph'], [799, 'cap-oasis-greenhouse-monitoring'], [800, 'cap-kg-mission-control-adapter'],
  [801, 'cap-lexicon-coverage-instrumentation'], [802, 'cap-literature-intelligence-adapter'],
  [803, 'cap-locality-safety-cross-cutting'], [804, 'cap-classroom-teacher-dashboard'],
  [805, 'cap-literature-public-browser-7'], [806, 'cap-scheduler-issue-automation-10'],
  [807, 'cap-buying-companion-11'], [809, 'cap-research-evidence-chain'],
];
/** An admissible real leaf the ranker places below every one the live wave admitted. */
const LOWER_LEAF = 'cap-research-trait-explorer';
const FREE = 900;

function liveSnapshot(): Snapshot {
  return {
    issues: [...LIVE_PROVIDER_QUEUE.map(([n, node]) => providerIssue(n, node)), freeIssue(FREE, LOWER_LEAF)],
    prs: [], integrationSha: 'a'.repeat(40), implementationSha: 'b'.repeat(40), material: { architecture: 'current' },
  };
}
function liveLedger(overrides: Partial<Ledger> = {}): Ledger {
  return { schema: 1, programStartedAt: '2026-09-20T00:00:00.000Z', programSpent: 42, dailySpent: { [DAY]: 10 }, leases: [], ...overrides };
}

class MemoryStore implements LeaseStore {
  version = 0;
  constructor(public ledger: Ledger) {}
  async read() { return { version: String(this.version), ledger: structuredClone(this.ledger) }; }
  async compareAndSwap(version: string, ledger: Ledger) {
    if (version !== String(this.version)) return false;
    this.version++; this.ledger = structuredClone(ledger); return true;
  }
}

describe('provider capacity is computed once per plan from durable inputs', () => {
  it('is zero under the live daily hard cap, with the budget reason', () => {
    const capacity = providerCapacityFromEnvironment(LANE_ENV, liveLedger(), NOW);
    expect(capacity.slots).toBe(0);
    expect(capacity.reason).toBe('daily_hard_cap_exceeded');
    expect(capacity.basis).toMatchObject({ dailySpentUsd: 10, budgetReason: 'daily_hard_cap_exceeded',
      dailyCallsRemaining: null, dailyCallsBasis: 'not_recorded_by_ledger' });
  });

  it('is bounded by the per-wave call cap when budget is available', () => {
    const capacity = providerCapacityFromEnvironment(LANE_ENV, liveLedger({ dailySpent: { [DAY]: 0 } }), NOW);
    expect(capacity).toMatchObject({ slots: 1, reason: 'wave_max_calls' });
  });

  it('is bounded by how many ordinary tasks the remaining budget can still reserve', () => {
    const capacity = providerCapacityFromEnvironment({ ...LANE_ENV, OC_PROVIDER_WAVE_MAX_CALLS: '3' }, liveLedger({ dailySpent: { [DAY]: 9.5 } }), NOW);
    expect(capacity).toMatchObject({ slots: 1, reason: 'budget_fit' });
    expect(capacity.basis.budgetFitTasks).toBe(1);
  });

  it.each([
    [{ PROVIDER_AUTHORIZED: 'false' }, 'provider_not_authorized'],
    [{ OC_PROVIDER_NO_API_MODE: 'true' }, 'no_api_mode'],
    // The lane gate's own default: NO-API is ON when the variable is absent.
    [{ OC_PROVIDER_NO_API_MODE: undefined }, 'no_api_mode'],
    [{ OC_PROVIDER_DISABLED: 'anthropic,gemini,openai' }, 'provider_policy_denied:no-provider-within-governor'],
    [{ OC_PROVIDER_WAVE_MAX_CALLS: '0' }, 'provider_policy_denied:no-provider-within-governor'],
    [{ OC_PROVIDER_WAVE_MAX_CALLS: 'lots' }, 'invalid_provider_policy_env:OC_PROVIDER_WAVE_MAX_CALLS'],
  ])('fails closed to zero slots for %j', (override, reason) => {
    const capacity = providerCapacityFromEnvironment({ ...LANE_ENV, ...override }, liveLedger({ dailySpent: {} }), NOW);
    expect(capacity).toMatchObject({ slots: 0, reason });
  });

  it('grants no slot without a durable ledger, because missing accounting is not zero spend', () => {
    expect(providerCapacityFromEnvironment(LANE_ENV, null, NOW)).toMatchObject({ slots: 0, reason: 'ledger_unavailable' });
  });

  it('closes with the program window, exactly as the lane budget would', () => {
    expect(providerCapacityFor({ providerAuthorized: true, noApiMode: false, disabledProviders: [], waveMaxCalls: 1, dailyMaxCalls: 4,
      ledger: liveLedger({ programStartedAt: '2026-09-01T00:00:00.000Z', dailySpent: {} }), now: NOW }))
      .toMatchObject({ slots: 0, reason: 'program_window_closed' });
  });

  it('does not touch any financial control: caps, reservations and spend are read, never written', () => {
    const ledger = liveLedger();
    const before = structuredClone(ledger);
    providerCapacityFromEnvironment(LANE_ENV, ledger, NOW);
    expect(ledger).toEqual(before);
  });
});

describe('lane class comes from the same router the classify job runs', () => {
  it('classifies the live provider-required issues as provider-lane and declared deterministic work as provider-free', () => {
    expect(laneClassOf(providerIssue(793, 'cap-screen-orchids'))).toBe('provider');
    expect(laneClassOf(freeIssue(FREE, LOWER_LEAF))).toBe('provider-free');
  });
  it('treats undeclared and unroutable issues as provider-lane, because classify routes them provider_free=false', () => {
    expect(laneClassOf({ number: 1, body: null, labels: [{ name: 'oc-queued' }] })).toBe('provider');
    expect(laneClassOf({ number: 2, body: 'OC-SWARM-CAPABILITY: no-such-capability', labels: [] })).toBe('provider');
  });
});

describe('the live starvation replay: 14 provider-required queued issues, dailySpent = 10', () => {
  it('reproduces the defect without provider slots: eight provider lanes, the deterministic issue never admitted', () => {
    const plan = makePlan(liveSnapshot(), [], NOW);
    expect(plan.issues).toEqual([793, 794, 797, 798, 799, 800, 801, 802]);
    expect(plan.issues).not.toContain(FREE);
  });

  it('admits the provider-free issue and reports, but does not admit, every provider issue', () => {
    const snapshot = liveSnapshot();
    const labelsBefore = structuredClone(snapshot.issues.map(i => i.labels));
    const plan = makePlan(snapshot, [], NOW, COMPLETION_GRAPH, undefined, providerCapacityFromEnvironment(LANE_ENV, liveLedger(), NOW));

    expect(plan.issues).toEqual([FREE]);
    expect(plan.leaves[0].nodeId).toBe(LOWER_LEAF);
    expect(plan.providerAdmitted).toBe(0);
    expect(plan.providerDeferred.map(d => d.issueNumber).sort((a, b) => a - b)).toEqual(LIVE_PROVIDER_QUEUE.map(([n]) => n));
    for (const deferred of plan.providerDeferred) {
      expect(deferred.reason).toBe('provider_capacity: daily_hard_cap_exceeded');
      expect(deferred.nodeId).toBe(LIVE_PROVIDER_QUEUE.find(([n]) => n === deferred.issueNumber)![1]);
    }
    // Not relabelled: the plan changes no issue, and every provider issue stays queued.
    expect(snapshot.issues.map(i => i.labels)).toEqual(labelsBefore);
    expect(snapshot.issues.filter(i => i.number !== FREE).every(i => i.labels.some(l => l.name === 'oc-queued'))).toBe(true);
    // Deferred is its own explanation: not a binding gap and not starvation.
    expect(plan.unreachableQueued.map(u => u.issueNumber)).not.toEqual(expect.arrayContaining([793]));
    expect(plan.untrackedLeaves.map(l => l.nodeId)).not.toContain('cap-screen-orchids');
    expect(plan.starved).toBe(false);
  });

  it('names each deferred issue once, with its exact reason, in the plan report', () => {
    const plan = makePlan(liveSnapshot(), [], NOW, COMPLETION_GRAPH, undefined, providerCapacityFromEnvironment(LANE_ENV, liveLedger(), NOW));
    const report = bindingReport(plan);
    for (const [n, node] of LIVE_PROVIDER_QUEUE) {
      expect(report.match(new RegExp(`#${n}\\b`, 'g'))).toHaveLength(1);
      expect(report).toContain(`#${n} (\`${node}\`: provider_capacity: daily_hard_cap_exceeded)`);
    }
    expect(report).not.toContain('STARVED');
    expect(planSummary(plan)).toContain('provider_slots=0 (daily_hard_cap_exceeded); provider_admitted=0');
  });

  it('with budget, admits exactly the wave call cap of provider lanes and fills the rest with deterministic work', () => {
    const plan = makePlan(liveSnapshot(), [], NOW, COMPLETION_GRAPH, undefined,
      providerCapacityFromEnvironment(LANE_ENV, liveLedger({ dailySpent: { [DAY]: 0 } }), NOW));
    expect(plan.issues).toEqual([793, FREE]);
    expect(plan.providerAdmitted).toBe(1);
    expect(plan.providerDeferred.every(d => d.reason === 'provider_capacity: wave_max_calls')).toBe(true);
    expect(plan.providerDeferred).toHaveLength(13);
  });

  it('records the slot count and its reason in the hash-bound wave packet', () => {
    const capacity = providerCapacityFromEnvironment(LANE_ENV, liveLedger(), NOW);
    const plan = makePlan(liveSnapshot(), [], NOW, COMPLETION_GRAPH, undefined, capacity);
    expect(plan.wave.packet.repositoryState.providerCapacity).toMatchObject({ slots: 0, reason: 'daily_hard_cap_exceeded' });
    expect(() => validatePlan(plan)).not.toThrow();
    // Editing the plan's slot count without re-hashing the packet is refused.
    const forged = { ...plan, providerCapacity: { ...capacity, slots: 8, reason: 'wave_max_calls' } as ProviderCapacity };
    expect(() => validatePlan(forged)).toThrow('Plan differs from hash-bound admission');
  });

  it('keeps the plan admissible end to end: the deterministic lane claims its zero-cost lease', async () => {
    const snapshot = liveSnapshot();
    const plan = makePlan(snapshot, [], NOW, COMPLETION_GRAPH, undefined, providerCapacityFromEnvironment(LANE_ENV, liveLedger(), NOW));
    const store = new MemoryStore(liveLedger());
    const claim = await claimDeterministicLease(store, plan, snapshot, { issueNumber: FREE, runId: '1', runAttempt: '1', now: NOW });
    expect(claim).toMatchObject({ allowed: true, reason: 'reserved' });
    expect(store.ledger.dailySpent[DAY]).toBe(10);
  });
});

describe('the live reserve missions #816-#818 (verbatim, #819 fixtures) under dailySpent = 10', () => {
  const RESERVE_LEAF = 'cap-kg-evidence-gap-research-missions';
  // The fixture stores labels as the plain names GitHub's issue_read returned.
  const reserve: Issue[] = reserveIssues.issues
    .map(({ number, state, title, body, labels, user }) => ({ number, state, title, body, labels: labels.map(name => ({ name })), author: user.login }));
  const snapshot = (): Snapshot => ({
    issues: [...LIVE_PROVIDER_QUEUE.map(([n, node]) => providerIssue(n, node)), ...reserve],
    prs: [], integrationSha: 'a'.repeat(40), implementationSha: 'b'.repeat(40), material: {},
  });

  it('the fixtures are the provider-free, bound, pending missions the checker replayed', () => {
    expect(reserve.map(i => i.number)).toEqual([816, 817, 818]);
    for (const issue of reserve) {
      expect(issue.labels.map(l => l.name)).toContain('oc-prepared');
      expect(laneClassOf(issue)).toBe('provider-free');
    }
  });

  it('reproduces the live wave without provider slots: eight provider lanes, #816-#818 unreachable', () => {
    const plan = makePlan(snapshot(), [], NOW);
    expect(plan.issues).toEqual([793, 794, 797, 798, 799, 800, 801, 802]);
    expect(plan.unreachableQueued).toEqual(expect.arrayContaining([816, 817, 818]
      .map(issueNumber => ({ issueNumber, nodeIds: [RESERVE_LEAF] }))));
  });

  it('admits one reserve mission onto its leaf with dailySpent = 10 and a wave call cap of 1', () => {
    const snap = snapshot();
    const capacity = providerCapacityFromEnvironment(LANE_ENV, liveLedger(), NOW);
    expect(capacity).toMatchObject({ slots: 0, reason: 'daily_hard_cap_exceeded' });
    const plan = makePlan(snap, [], NOW, COMPLETION_GRAPH, undefined, capacity);

    expect(plan.issues).toEqual([816]);
    expect(plan.leaves).toEqual([expect.objectContaining({ issueNumber: 816, nodeId: RESERVE_LEAF })]);
    expect(plan.providerDeferred.map(d => d.issueNumber).sort((a, b) => a - b)).toEqual(LIVE_PROVIDER_QUEUE.map(([n]) => n));
    expect(plan.providerDeferred.every(d => d.reason === 'provider_capacity: daily_hard_cap_exceeded')).toBe(true);
    // One per wave on the leaf; the siblings wait for it, as a node holds one lane.
    expect(plan.unreachableQueued).toEqual(expect.arrayContaining([817, 818]
      .map(issueNumber => ({ issueNumber, nodeIds: [RESERVE_LEAF] }))));
    // The admitted mission survives its lane's isolated re-plan.
    expect(assertAdmission(plan, snap, 816, NOW).nodeId).toBe(RESERVE_LEAF);
  });

  it('with budget, the one provider slot and the reserve mission share the wave', () => {
    const plan = makePlan(snapshot(), [], NOW, COMPLETION_GRAPH, undefined,
      providerCapacityFromEnvironment(LANE_ENV, liveLedger({ dailySpent: { [DAY]: 0 } }), NOW));
    expect(plan.issues).toEqual([793, 816]);
  });
});

describe('per-lane-class admission in the graph planner', () => {
  const leaf = (id: string, priority: number, issues: string[] = []): CompletionNode => ({ id, parentId: 'root', name: id, type: 'acceptance_gate',
    status: 'MISSING', priority, threeLevels: { codeComplete: 'NOT_MET', integratedComplete: 'NOT_MET', productComplete: 'NOT_MET' },
    evidence: [], issues, nextAction: 'do', lastUpdated: NOW, children: [] });
  const root = (children: CompletionNode[]): CompletionNode => ({ ...leaf('root', 0), parentId: null, children });

  it('is unchanged when provider capacity is not evaluated', () => {
    const graph = root([leaf('a', 1, ['#1']), leaf('b', 2, ['#2'])]);
    const plan = buildGraphDispatchPlan({ queuedIssueNumbers: [1, 2], providerLaneIssues: [1, 2], now: NOW }, graph);
    expect(plan.issues).toEqual([1, 2]);
    expect(plan.providerDeferred).toEqual([]);
  });

  it('tries the next issue on the same leaf when the first one needs a slot that is not there', () => {
    const graph = root([leaf('a', 1, ['#1', '#2'])]);
    const plan = buildGraphDispatchPlan({ queuedIssueNumbers: [1, 2], providerLaneIssues: [1], providerSlots: 0,
      providerSlotsReason: 'daily_hard_cap_exceeded', now: NOW }, graph);
    expect(plan.issues).toEqual([2]);
    expect(plan.providerDeferred).toEqual([{ issueNumber: 1, nodeId: 'a', reason: 'provider_capacity: daily_hard_cap_exceeded' }]);
  });

  it('never admits more provider-lane issues than slots, and deferred issues do not consume lane capacity', () => {
    const graph = root(Array.from({ length: 10 }, (_, i) => leaf(`n${i}`, i, [`#${i + 1}`])));
    const plan = buildGraphDispatchPlan({ queuedIssueNumbers: Array.from({ length: 10 }, (_, i) => i + 1),
      providerLaneIssues: [1, 2, 3, 4, 5, 6, 7, 8], providerSlots: 2, providerSlotsReason: 'wave_max_calls', now: NOW }, graph);
    expect(plan.issues).toEqual([1, 2, 9, 10]);
    expect(plan.providerAdmitted).toBe(2);
    expect(plan.providerDeferred.map(d => d.issueNumber)).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('reports a wave whose only queued work is provider-deferred as held by capacity, not starved', () => {
    const graph = root([leaf('a', 1, ['#1'])]);
    const plan = buildGraphDispatchPlan({ queuedIssueNumbers: [1], providerLaneIssues: [1], providerSlots: 0,
      providerSlotsReason: 'no_api_mode', now: NOW }, graph);
    expect(plan.starved).toBe(false);
    expect(plan.untrackedLeaves).toEqual([]);
    expect(plan.unreachableQueued).toEqual([]);
  });

  it('rejects an invalid slot count instead of guessing', () => {
    expect(() => buildGraphDispatchPlan({ providerSlots: -1 })).toThrow('Invalid provider slot count');
    expect(() => buildGraphDispatchPlan({ providerSlots: 1.5 })).toThrow('Invalid provider slot count');
  });
});

describe('the isolated re-plan reproduces the plan decision', () => {
  // Nine leaves, each bound to one provider-required issue. Issue 791 plays the
  // lane that took the wave's single provider slot.
  const nodes = ['cap-judging-practice', ...LIVE_PROVIDER_QUEUE.slice(0, 8).map(([, node]) => node)];
  const numbers = [791, ...LIVE_PROVIDER_QUEUE.slice(0, 8).map(([n]) => n)];
  const snapshot = (): Snapshot => ({
    issues: [...numbers.map((n, i) => providerIssue(n, nodes[i])), freeIssue(FREE, LOWER_LEAF)],
    prs: [], integrationSha: 'a'.repeat(40), implementationSha: 'b'.repeat(40), material: {},
  });
  const running = (s: Snapshot, issue: number) => {
    const record = s.issues.find(i => i.number === issue)!;
    record.labels = record.labels.filter(l => l.name !== 'oc-queued').concat({ name: 'oc-running' });
  };

  it('re-plans every admitted sibling while the provider lane holds the slot and is labelled oc-running', () => {
    const capacity = providerCapacityFromEnvironment(LANE_ENV, liveLedger({ dailySpent: { [DAY]: 0 } }), NOW);
    const s = snapshot();
    const plan = makePlan(s, [], NOW, COMPLETION_GRAPH, undefined, capacity);
    expect(plan.issues).toEqual([791, FREE]);
    running(s, 791);
    // The sibling would be refused as drift if its re-plan re-read provider
    // capacity from a ledger 791 has since charged; it uses the recorded input.
    expect(assertAdmission(plan, s, FREE, NOW).nodeId).toBe(LOWER_LEAF);
  });

  it('re-plans a provider lane with the recorded slot even after siblings have charged the ledger', () => {
    const capacity = providerCapacityFromEnvironment(LANE_ENV, liveLedger({ dailySpent: { [DAY]: 0 } }), NOW);
    const s = snapshot();
    const plan = makePlan(s, [], NOW, COMPLETION_GRAPH, undefined, capacity);
    expect(assertAdmission(plan, s, 791, NOW).nodeId).toBe('cap-judging-practice');
    // A live recomputation now would say zero -- and would have refused 791.
    expect(providerCapacityFromEnvironment(LANE_ENV, liveLedger(), NOW).slots).toBe(0);
  });

  it('root cause: a second overlapping wave re-plans an issue the first wave already started, and admits nothing', () => {
    // Waves A and B both planned while 791 was queued (live: runs 36156039098
    // and its overlapping pass; also #792 in run 36156196749). A reserved and
    // started it. B's lane waited on the per-issue concurrency group, then
    // re-planned against live labels in which 791 is no longer queued.
    const s = snapshot();
    const waveB = makePlan(s, [], NOW);
    running(s, 791);
    expect(() => assertAdmission(waveB, s, 791, NOW)).toThrow('the isolated re-plan admitted nothing');
  });

  it('fix: that lane is now a governed refusal with a receipt reason, proven by the durable lease', async () => {
    const s = snapshot();
    const waveA = makePlan(s, [], NOW);
    const waveB = makePlan(s, [], '2026-09-25T20:26:00.000Z');
    const store = new MemoryStore(liveLedger({ dailySpent: { [DAY]: 0 } }));
    const claimA = await claimLease(store, waveA, s, { issueNumber: 791, runId: '1', runAttempt: '1', providerAuthorized: true, requestedUsd: 0.5, now: NOW });
    expect(claimA.allowed).toBe(true);
    running(s, 791);

    // Still running: owned.
    await expect(claimLease(store, waveB, s, { issueNumber: 791, runId: '2', runAttempt: '1', providerAuthorized: true, requestedUsd: 0.5, now: NOW }))
      .resolves.toMatchObject({ allowed: false, reason: 'lease_owned' });
    // Settled by wave A: the unchanged fingerprint is never paid for again.
    await transitionLease(store, claimA.lease!.id, '1', '1', 'validating');
    await expect(claimLease(store, waveB, s, { issueNumber: 791, runId: '2', runAttempt: '1', providerAuthorized: true, requestedUsd: 0.5, now: NOW }))
      .resolves.toMatchObject({ allowed: false, reason: 'unchanged_attempt' });
    // Nothing new was reserved or charged.
    expect(store.ledger.leases).toHaveLength(1);
    expect(store.ledger.dailySpent[DAY]).toBe(0.5);
  });

  it('does not loosen the drift refusal: with no durable lease for the work, drift still throws', async () => {
    const s = snapshot();
    const plan = makePlan(s, [], NOW);
    running(s, 794);
    const store = new MemoryStore(liveLedger({ dailySpent: { [DAY]: 0 } }));
    await expect(claimLease(store, plan, s, { issueNumber: 794, runId: '3', runAttempt: '1', providerAuthorized: true, requestedUsd: 0.5, now: NOW }))
      .rejects.toThrow('the isolated re-plan admitted nothing');
    expect(store.ledger.leases).toEqual([]);
  });

  it('still refuses an unauthorized caller without reading the ledger', async () => {
    const s = snapshot();
    const plan = makePlan(s, [], NOW);
    const store: LeaseStore = { read: async () => { throw new Error('ledger read'); }, compareAndSwap: async () => false };
    await expect(claimLease(store, plan, s, { issueNumber: 791, runId: '1', runAttempt: '1', providerAuthorized: false, requestedUsd: 0.5, now: NOW }))
      .resolves.toMatchObject({ allowed: false, reason: 'provider_not_authorized' });
  });
});

describe('a completed, failed, expired or abandoned lane never permanently consumes capacity', () => {
  const lease = (overrides: Partial<Lease> = {}): Lease => ({ id: 'l1', issue: 791, nodeId: 'cap-judging-practice', fingerprint: 'f'.repeat(64),
    waveHash: 'w'.repeat(64), runId: '100', runAttempt: '1', expiresAt: '2026-09-25T21:00:00.000Z', reservedUsd: 0.5,
    lane: 'provider', state: 'running', ...overrides });
  const labelled = (number: number, labels: string[]): Issue => ({ number, state: 'open', title: 't', body: null, labels: labels.map(name => ({ name })) });
  const snap = (issues: Issue[]): Snapshot => ({ issues, prs: [], integrationSha: 'a'.repeat(40), implementationSha: 'b'.repeat(40), material: {} });

  it.each(['done', 'validating', 'blocked', 'owner-gate', 'runtime-backoff'] as const)(
    'a settled provider lease (%s) whose label moved holds no lane', state => {
      expect(runningCount(snap([labelled(791, [`oc-${state}`])]), [lease({ state })])).toBe(0);
    });

  it.each(['provider-free-done', 'provider-free-failed', 'not-executed'] as const)(
    'a settled deterministic lease (%s) holds no lane', state => {
      expect(runningCount(snap([labelled(791, ['oc-queued'])]), [lease({ state, lane: 'provider-free', reservedUsd: 0 })])).toBe(0);
    });

  it('an expired lease whose run completed is released; an unproven one keeps its lane', async () => {
    const store = new MemoryStore(liveLedger({ leases: [lease({ expiresAt: '2026-09-25T19:00:00.000Z' }),
      lease({ id: 'l2', issue: 792, nodeId: 'n2', runId: '200', expiresAt: '2026-09-25T19:00:00.000Z' })] }));
    const report = await reconcileExpired(store, NOW, async run => run === '100');
    expect(report).toMatchObject({ inspected: 2, recovered: 1, kept: 1 });
    expect(store.ledger.leases.map(l => l.state)).toEqual(['blocked', 'running']);
    expect(runningCount(snap([]), store.ledger.leases)).toBe(1);
  });

  it('an abandoned lane whose run status cannot be read stays occupied (fail closed) rather than released', async () => {
    const store = new MemoryStore(liveLedger({ leases: [lease({ expiresAt: '2026-09-25T19:00:00.000Z' })] }));
    const report = await reconcileExpired(store, NOW, async () => { throw new Error('HTTP 502'); });
    expect(report).toMatchObject({ errors: 1, recovered: 0 });
    expect(store.ledger.leases.filter(isActive)).toHaveLength(1);
  });

  it('the leak: expiry won the ledger, the relabel failed, and the terminal lease is never inspected again', async () => {
    const store = new MemoryStore(liveLedger({ leases: [lease({ expiresAt: '2026-09-25T19:00:00.000Z' })] }));
    const report = await reconcileExpired(store, NOW, async () => true, async () => {}, async () => { throw new Error('HTTP 502 on PATCH'); });
    expect(report.errors).toBe(1);
    expect(store.ledger.leases[0].state).toBe('blocked');
    const stuck = snap([labelled(791, ['oc-running'])]);
    expect(runningCount(stuck, store.ledger.leases)).toBe(1);
    // A second pass does not see it: nothing active has expired.
    expect(await reconcileExpired(store, NOW, async () => true)).toMatchObject({ inspected: 0 });

    // The stale-label pass does.
    const relabelled: Array<[number, Lease['state']]> = [];
    const outcomes = await reconcileStaleRunningLabels(store, stuck.issues, async () => true, async (issue, l) => { relabelled.push([issue, l.state]); });
    expect(outcomes).toEqual([expect.objectContaining({ issue: 791, outcome: 'cleared', state: 'blocked' })]);
    expect(relabelled).toEqual([[791, 'blocked']]);
  });

  it('keeps the label, fail closed, when the run is unproven, the status call fails, or no lease accounts for it', async () => {
    const terminal = new MemoryStore(liveLedger({ leases: [lease({ state: 'blocked' })] }));
    const calls: number[] = [];
    const relabel = async (issue: number) => { calls.push(issue); };
    await expect(reconcileStaleRunningLabels(terminal, [labelled(791, ['oc-running'])], async () => false, relabel))
      .resolves.toEqual([expect.objectContaining({ outcome: 'kept', reason: 'run 100 is not proven completed' })]);
    await expect(reconcileStaleRunningLabels(terminal, [labelled(791, ['oc-running'])], async () => { throw new Error('HTTP 404'); }, relabel))
      .resolves.toEqual([expect.objectContaining({ outcome: 'error', reason: 'HTTP 404' })]);
    await expect(reconcileStaleRunningLabels(terminal, [labelled(555, ['oc-running'])], async () => true, relabel))
      .resolves.toEqual([expect.objectContaining({ issue: 555, outcome: 'kept', reason: 'no ledger lease proves who applied the label' })]);
    expect(calls).toEqual([]);
  });

  it('never strips the label from a lane that owns an active lease, or one that claimed during reconciliation', async () => {
    const active = new MemoryStore(liveLedger({ leases: [lease({ state: 'blocked' }), lease({ id: 'l2', runId: '101' })] }));
    const calls: number[] = [];
    await expect(reconcileStaleRunningLabels(active, [labelled(791, ['oc-running'])], async () => true, async i => { calls.push(i); }))
      .resolves.toEqual([expect.objectContaining({ outcome: 'kept', reason: 'an active lease owns the label' })]);

    const racing = new MemoryStore(liveLedger({ leases: [lease({ state: 'blocked' })] }));
    const outcomes = await reconcileStaleRunningLabels(racing, [labelled(791, ['oc-running'])], async () => {
      racing.ledger.leases.push(lease({ id: 'l3', runId: '102', state: 'reserved' }));
      return true;
    }, async i => { calls.push(i); });
    expect(outcomes).toEqual([expect.objectContaining({ outcome: 'kept', reason: 'a newer lease appeared during reconciliation' })]);
    expect(calls).toEqual([]);
  });

  it('ignores labels runningCount already treats as released, and portfolio stewards', async () => {
    const store = new MemoryStore(liveLedger());
    const outcomes = await reconcileStaleRunningLabels(store, [labelled(1, ['oc-running', 'oc-validating']),
      labelled(2, ['oc-running', 'oc-portfolio-steward']), { ...labelled(3, ['oc-running']), state: 'closed' }], async () => true, async () => {});
    expect(outcomes).toEqual([]);
  });
});

describe('the plan job reads the same provider policy as the lane', () => {
  type Step = { name?: string; env?: Record<string, string> };
  type Job = { steps: Step[]; env?: Record<string, string> };
  const load = (name: string) => yaml.load(readFileSync(`.github/workflows/${name}.yml`, 'utf8')) as { env?: Record<string, string>; jobs: Record<string, Job> };
  const KEYS = ['OC_PROVIDER_NO_API_MODE', 'OC_PROVIDER_DISABLED', 'OC_PROVIDER_DAILY_MAX_CALLS', 'OC_PROVIDER_WAVE_MAX_CALLS'];

  it('mirrors the budget-preflight policy values exactly, so admission can never be wider than the lane', () => {
    const scheduler = load('orchid-continuous-completion');
    const lane = load('orchid-budgeted-completion-lane');
    const planStep = scheduler.jobs.plan.steps.find(step => step.name === 'Read complete inventory and rank canonical graph leaves')!;
    const preflight = lane.jobs['budget-preflight'].env!;
    for (const key of KEYS) expect(String(planStep.env![key]), key).toBe(String(preflight[key]));
    expect(scheduler.env!.PROVIDER_AUTHORIZED).toBe('true');
  });
});

describe('a deterministic-only research node never reaches the paid lane', () => {
  const RESERVE_LEAF = 'cap-kg-evidence-gap-research-missions';
  const reserve: Issue[] = reserveIssues.issues
    .map(({ number, state, title, body, labels, user }) => ({ number, state, title, body, labels: labels.map(name => ({ name })), author: user.login }));
  // #825 as filed on 2026-09-25: a reserve mission bound to the leaf whose domain has no local executor.
  const morphology: Issue = {
    number: 825, state: 'open', title: 'Research morphology gap for Gastrochilus calceolaris',
    body: reserve[0].body.replace('- Domain: nomenclature', '- Domain: morphology') + `\nOC-GRAPH-NODE: ${RESERVE_LEAF}`,
    labels: ['oc-p2', 'oc-prepared', 'oc-discovered'].map(name => ({ name })),
  };
  // #820 as filed on 2026-09-25: a provider-required duplicate bound to the same leaf.
  const duplicate = providerIssue(820, RESERVE_LEAF);
  const snap = (issues: Issue[]): Snapshot => ({ issues, prs: [], integrationSha: 'a'.repeat(40), implementationSha: 'b'.repeat(40), material: {} });
  const withBudget = () => providerCapacityFromEnvironment(LANE_ENV, liveLedger({ dailySpent: { [DAY]: 0 } }), NOW);

  it('both issues route provider-lane, which is what made them dangerous', () => {
    expect(laneClassOf(morphology)).toBe('provider');
    expect(laneClassOf(duplicate)).toBe('provider');
  });

  it('with a provider slot free and nothing else queued, neither is admitted', () => {
    const plan = makePlan(snap([morphology, duplicate]), [], NOW, COMPLETION_GRAPH, undefined, withBudget());
    expect(plan.issues).toEqual([]);
    const reasons = Object.fromEntries(plan.pendingNotReachingAdmission.map(p => [p.issueNumber, p.reason]));
    expect(reasons[825]).toMatch(/only deterministic executors/);
    expect(reasons[820]).toMatch(/only deterministic executors/);
  });

  it('the leaf still admits its provider-free nomenclature mission', () => {
    const s = snap([morphology, duplicate, ...reserve]);
    const plan = makePlan(s, [], NOW, COMPLETION_GRAPH, undefined, withBudget());
    expect(plan.issues).toEqual([816]);
    expect(assertAdmission(plan, s, 816, NOW).nodeId).toBe(RESERVE_LEAF);
  });
});
