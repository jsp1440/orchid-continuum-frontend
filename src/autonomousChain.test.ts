import { describe, expect, it } from 'vitest';
import {
  claimDeterministicLease, declaredNodesByIssue, laneOf, makePlan, transitionLease,
  type Ledger, type LeaseStore, type Snapshot,
} from '../scripts/oc-dispatch-control';
import { bindingReport } from '../scripts/oc-dispatch-runtime';
import { commandsFor, routeIssue } from '../scripts/oc-capability-router.mjs';
import { selectLanes } from '../scripts/oc-multilane-selector.mjs';

const NOW = '2026-09-19T21:00:00.000Z';
const LEAF = 'gate-journey-research-matrix';
const ISSUE = 703;

// Exactly the labels an owner would apply: one capability declaration per
// deterministic capability this repository can execute, and one node binding.
const LABELS = ['oc-queued', 'oc-cap:test-execution', 'oc-cap:typecheck-execution', `oc-node:${LEAF}`];

class MemoryStore implements LeaseStore {
  constructor(public ledger: Ledger, public version = '1') {}
  async read() { return { version: this.version, ledger: structuredClone(this.ledger) }; }
  async compareAndSwap(version: string, ledger: Ledger) {
    if (version !== this.version) return false;
    this.ledger = ledger; this.version = String(Number(version) + 1); return true;
  }
}

const snapshot = (labels: string[], integrationSha = 'a'.repeat(40)): Snapshot => ({
  issues: [{ number: ISSUE, state: 'open', title: 'a deterministic task', body: 'acceptance prose that names nothing', labels: labels.map(name => ({ name })) }],
  prs: [], integrationSha, implementationSha: 'b'.repeat(40), material: { architecture: 'm' },
});

/**
 * Every hop of the autonomous cycle, asserted against the artifact the previous
 * hop actually produced.
 *
 * Each hop was individually covered and the chain was not: an independent check
 * deleted the wiring that carries a label into the planner and the whole suite
 * stayed green. A hop that consumes something the previous hop does not produce
 * is the defect this exists to catch.
 */
describe('QUEUED -> BOUND -> ADMITTED -> LEASED -> EXECUTED -> RECEIPT -> SETTLED', () => {
  it('carries one declaration the whole way, and refuses to repeat it', async () => {
    const store = new MemoryStore({ schema: 1, programStartedAt: NOW, programSpent: 0, dailySpent: {}, leases: [] });
    const current = snapshot(LABELS);

    // QUEUED: the selector admits it as pending work.
    expect(selectLanes({ issues: current.issues }).selected).toEqual([ISSUE]);

    // BOUND: the node binding comes off the label, never off the prose.
    const declared = declaredNodesByIssue(current.issues);
    expect(declared).toEqual({ [ISSUE]: [LEAF] });

    // ADMITTED: the planner consumes that declaration and admits the issue.
    const plan = makePlan(current, [], NOW);
    expect(plan.issues).toEqual([ISSUE]);
    expect(plan.leaves[0].nodeId).toBe(LEAF);
    expect(plan.starved).toBe(false);
    expect(bindingReport(plan)).toBe('');

    // DISPATCH PLAN: the wave is hash-bound to exactly that admission.
    expect(plan.wave.packet.repositoryState.admission).toEqual([
      { issueNumber: ISSUE, nodeId: LEAF, fingerprint: plan.leaves[0].fingerprint },
    ]);

    // LANE: the capability declarations route it provider-free, with commands
    // from the fixed registry rather than from anything the issue says.
    const routing = routeIssue({ number: ISSUE, body: current.issues[0].body, labels: current.issues[0].labels });
    expect(routing.providerFree).toBe(true);
    const commands = commandsFor(routing);
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every(command => command.startsWith('npm run'))).toBe(true);

    // LEASED: a zero-cost lane, tagged, with no reach into accounting.
    const claimed = await claimDeterministicLease(store, plan, current, { issueNumber: ISSUE, runId: '11', runAttempt: '1', now: NOW });
    expect(claimed.allowed).toBe(true);
    expect(claimed.lease!.reservedUsd).toBe(0);
    expect(laneOf(claimed.lease!)).toBe('provider-free');
    expect(store.ledger.programSpent).toBe(0);

    // The lease is bound to the same fingerprint the plan admitted.
    expect(claimed.lease!.fingerprint).toBe(plan.leaves[0].fingerprint);

    // EXECUTED -> RECEIPT -> SETTLED: settlement moves the lease to a
    // deterministic terminal state. (The receipt itself is asserted end to end
    // in providerFreeSettlement.test.ts, against the real runtime.)
    await transitionLease(store, claimed.lease!.id, '11', '1', 'provider-free-done');
    expect(store.ledger.leases[0].state).toBe('provider-free-done');
    expect(store.ledger.programSpent).toBe(0);

    // NEXT PULSE: the issue is unchanged, so it is neither admitted nor leased.
    const settled = snapshot(['oc-validating', ...LABELS.filter(l => l !== 'oc-queued')]);
    expect(selectLanes({ issues: settled.issues }).selected).toEqual([]);

    // And even if it were still labelled queued, the fingerprint refuses it.
    const stillQueued = snapshot(LABELS);
    const replanned = makePlan(stillQueued, store.ledger.leases, NOW);
    expect(replanned.issues).toEqual([ISSUE]);
    const again = await claimDeterministicLease(store, replanned, stillQueued, { issueNumber: ISSUE, runId: '12', runAttempt: '1', now: NOW });
    expect(again.allowed).toBe(false);
    expect(again.reason).toBe('unchanged_attempt');
    expect(store.ledger.leases).toHaveLength(1);
  });

  it('admits it again only once something it depends on actually changes', async () => {
    const store = new MemoryStore({ schema: 1, programStartedAt: NOW, programSpent: 0, dailySpent: {}, leases: [] });
    const first = snapshot(LABELS);
    const claimed = await claimDeterministicLease(store, makePlan(first, [], NOW), first, { issueNumber: ISSUE, runId: '11', runAttempt: '1', now: NOW });
    await transitionLease(store, claimed.lease!.id, '11', '1', 'provider-free-done');

    const moved = snapshot(LABELS, 'c'.repeat(40));
    const replanned = makePlan(moved, store.ledger.leases, NOW);
    const again = await claimDeterministicLease(store, replanned, moved, { issueNumber: ISSUE, runId: '13', runAttempt: '1', now: NOW });

    expect(again.allowed).toBe(true);
    expect(again.lease!.fingerprint).not.toBe(claimed.lease!.fingerprint);
  });

  it('admits nothing when the node binding is removed, however the prose reads', async () => {
    const withoutBinding = snapshot(['oc-queued', 'oc-cap:test-execution']);
    withoutBinding.issues[0].body = `This issue implements ${LEAF}. oc-node:${LEAF}`;
    withoutBinding.issues[0].title = LEAF;

    const plan = makePlan(withoutBinding, [], NOW);

    expect(declaredNodesByIssue(withoutBinding.issues)).toEqual({});
    expect(plan.issues).toEqual([]);
    expect(plan.starved).toBe(true);
    expect(plan.unboundQueued).toEqual([ISSUE]);
  });

  it('routes provider-free without ever consulting provider authorization', () => {
    // The lane's own construction, not a promise: nothing on this path reads
    // PROVIDER_AUTHORIZED, and the commands come from the local registry.
    const routing = routeIssue({ number: ISSUE, body: null, labels: LABELS.map(name => ({ name })) });
    expect(routing.providerFree).toBe(true);
    expect(routing.blocking ?? []).toEqual([]);
  });
});
