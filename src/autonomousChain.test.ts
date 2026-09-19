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

describe('verifying an admission does not change the question', () => {
  // Honest scope: this covers the verification path, which had none at all. It
  // does NOT reproduce the live drift -- it passes under the old snapshot
  // isolation too, so it pins the absence of a crash, not the fix.
  it('accepts its own plan when a sibling issue holds a repair PR', async () => {
    const { assertAdmission } = await import('../scripts/oc-dispatch-control');
    // `openRefs` excludes the PR of an `oc-repair` issue from open tracked work.
    // Re-planning with the other issues deleted put that PR back, suppressed a
    // different set of leaves, and refused a correct admission as drift.
    const withSibling: Snapshot = {
      ...snapshot(LABELS),
      issues: [
        ...snapshot(LABELS).issues,
        { number: 900, state: 'open', title: 'a sibling under repair', body: 'OC-AUTO-ISSUE: #900', labels: [{ name: 'oc-queued' }, { name: 'oc-repair' }] },
      ],
      prs: [{ number: 901, state: 'open', body: 'OC-AUTO-ISSUE: #900', head: { ref: 'oc-auto-900', sha: 'd'.repeat(40) } }],
    };

    const plan = makePlan(withSibling, [], NOW);
    expect(plan.issues).toContain(ISSUE);
    expect(() => assertAdmission(plan, withSibling, ISSUE, NOW)).not.toThrow();
  });
});

describe('a lane that never executed does not bar the work forever', () => {
  const relabel = (labels: string[], next: string[]) =>
    [...new Set(labels.filter(l => !['oc-running', 'oc-queued', 'oc-prepared', 'oc-validating', 'oc-repair'].includes(l)).concat(next))];

  it('admits the issue again on the next pulse, and the one after', async () => {
    // The dedupe added to stop #171 running three times in four minutes then
    // refused work that never ran once: settlement relabelled the issue
    // `oc-queued` while writing a terminal lease that burned the fingerprint,
    // so every later pulse admitted it, refused it, receipted it and reported
    // the wave green -- the failure this whole PR exists to fix, one level down.
    const store = new MemoryStore({ schema: 1, programStartedAt: NOW, programSpent: 0, dailySpent: {}, leases: [] });
    let labels = [...LABELS];

    const first = await claimDeterministicLease(store, makePlan(snapshot(labels), [], NOW), snapshot(labels),
      { issueNumber: ISSUE, runId: '1', runAttempt: '1', now: NOW });
    expect(first.allowed).toBe(true);

    // The worker never ran: settlement records `not-executed` and re-queues.
    await transitionLease(store, first.lease!.id, '1', '1', 'not-executed');
    labels = relabel(labels, ['oc-queued']);

    for (const run of ['2', '3', '4']) {
      const plan = makePlan(snapshot(labels), store.ledger.leases, NOW);
      expect(plan.issues).toEqual([ISSUE]);
      const again = await claimDeterministicLease(store, plan, snapshot(labels),
        { issueNumber: ISSUE, runId: run, runAttempt: '1', now: NOW });
      expect(again.allowed, `pulse ${run} refused: ${again.reason}`).toBe(true);
      await transitionLease(store, again.lease!.id, run, '1', 'not-executed');
    }
  });

  it('still refuses a second run of work that did execute', async () => {
    const store = new MemoryStore({ schema: 1, programStartedAt: NOW, programSpent: 0, dailySpent: {}, leases: [] });
    const first = await claimDeterministicLease(store, makePlan(snapshot(LABELS), [], NOW), snapshot(LABELS),
      { issueNumber: ISSUE, runId: '1', runAttempt: '1', now: NOW });
    await transitionLease(store, first.lease!.id, '1', '1', 'provider-free-done');

    const again = await claimDeterministicLease(store, makePlan(snapshot(LABELS), store.ledger.leases, NOW), snapshot(LABELS),
      { issueNumber: ISSUE, runId: '2', runAttempt: '1', now: NOW });

    expect(again.allowed).toBe(false);
    expect(again.reason).toBe('unchanged_attempt');
  });

  it('parks a genuine failure rather than re-queueing it for one accidental retry', async () => {
    // `oc-repair` without `oc-queued`: the selector will not pick it up, so the
    // state says what is true -- unchanged failing work is not retried -- rather
    // than claiming it is queued while the fingerprint bars it.
    const failed = snapshot(relabel([...LABELS], ['oc-repair']));
    expect(selectLanes({ issues: failed.issues }).selected).toEqual([]);
  });
});
