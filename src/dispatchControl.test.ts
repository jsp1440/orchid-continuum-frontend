import { describe, expect, it, vi } from 'vitest';
import { assertAdmission, assertReceipts, claimDeterministicLease, claimLease, classifyZeroAdmission, isActive, laneOf, lineageFor, makePlan, MAX_ACTIVE_LANES, planWithStarvationRepair, reconcileExpired, runningCount, terminalIssueLabel, transitionLease,
  providerFreeRepairsReadyForRequeue, validateLedger, type Issue, type Ledger, type LeaseStore, type Snapshot } from '../scripts/oc-dispatch-control';
import type { CompletionNode } from './lib/completion-graph/types';

const now = '2026-09-14T04:00:00.000Z';
const issue = (number: number, labels = ['oc-queued']): Issue => ({ number, state: 'open', title: `Task ${number}`, body: 'Bounded acceptance', labels: labels.map(name => ({ name })) });
function fixture(count = 12) {
  const node = (number: number): CompletionNode => ({ id: `leaf-${number}`, parentId: 'root', name: `Task ${number}`,
    type: 'acceptance_gate', status: 'MISSING', threeLevels: { codeComplete: 'NOT_MET', integratedComplete: 'NOT_MET', productComplete: 'NOT_MET' },
    evidence: [], issues: [`#${number}`], nextAction: 'Implement bounded gate', lastUpdated: now, children: [] });
  const root: CompletionNode = { ...node(0), id: 'root', parentId: null, children: Array.from({ length: count }, (_, i) => node(i+1)) };
  const snapshot: Snapshot = { issues: Array.from({ length: count }, (_, i) => issue(i+1)), prs: [], integrationSha: 'a'.repeat(40), implementationSha: 'b'.repeat(40), material: { architecture: 'current material' } };
  return { root, snapshot };
}
class MemoryStore implements LeaseStore {
  version = 0;
  writes = 0;
  ledger: Ledger = { schema: 1, programStartedAt: '2026-09-14T00:00:00.000Z', programSpent: 0, dailySpent: {}, leases: [] };
  async read() { return { version: String(this.version), ledger: structuredClone(this.ledger) }; }
  async compareAndSwap(version: string, ledger: Ledger) {
    if (version !== String(this.version)) return false;
    this.version++; this.writes++; this.ledger = structuredClone(ledger); return true;
  }
}
function claim(store: LeaseStore, plan: ReturnType<typeof makePlan>, snapshot: Snapshot, root: CompletionNode, number: number, runId = '100') {
  return claimLease(store, plan, snapshot, { issueNumber: number, runId, runAttempt: '1', providerAuthorized: true, requestedUsd: 0.5, now }, root);
}
describe('canonical graph → durable lease → independent dispatch → refill', () => {
  it('reconstructs historical provider-free receipts without reviving or charging them', () => {
    const ledger: Ledger = {
      schema: 1,
      programStartedAt: '2026-09-14T00:00:00.000Z',
      programSpent: 0,
      dailySpent: {},
      leases: [
        {
          id: 'receipt-done', issue: 1, nodeId: 'leaf-1', fingerprint: 'fingerprint-1', waveHash: 'wave-1',
          runId: '100', runAttempt: '1', expiresAt: now, reservedUsd: 0, state: 'provider-free-done',
        },
        {
          id: 'receipt-failed', issue: 2, nodeId: 'leaf-2', fingerprint: 'fingerprint-2', waveHash: 'wave-2',
          runId: '101', runAttempt: '1', expiresAt: now, reservedUsd: 0, state: 'provider-free-failed',
        },
      ],
    };

    expect(() => validateLedger(ledger)).not.toThrow();
    expect(ledger.leases.every(lease => !isActive(lease))).toBe(true);
    expect(runningCount(fixture(2).snapshot, ledger.leases)).toBe(0);
    expect(ledger.programSpent).toBe(0);
  });
  it('keeps zero-cost receipts and paid execution leases mutually exclusive', () => {
    const base: Ledger = {
      schema: 1,
      programStartedAt: '2026-09-14T00:00:00.000Z',
      programSpent: 0,
      dailySpent: {},
      leases: [],
    };
    const lease = {
      id: 'receipt', issue: 1, nodeId: 'leaf-1', fingerprint: 'fingerprint', waveHash: 'wave',
      runId: '100', runAttempt: '1', expiresAt: now,
    };

    expect(() => validateLedger({ ...base, leases: [{ ...lease, reservedUsd: 0.5, state: 'provider-free-done' }] as Ledger['leases'] }))
      .toThrow('Malformed lease');
    expect(() => validateLedger({ ...base, leases: [{ ...lease, reservedUsd: 0, state: 'blocked' }] as Ledger['leases'] }))
      .toThrow('Malformed lease');
    expect(() => validateLedger({ ...base, leases: [{ ...lease, reservedUsd: 0, state: 'unknown' }] as unknown as Ledger['leases'] }))
      .toThrow('Malformed lease');
  });
  it('preserves explicit implementation lineage even when its PR merged only into integration', () => {
    const { root, snapshot } = fixture(1);
    snapshot.prs = [{ number: 677, state: 'closed', merged: true, baseRef: 'oc-autonomous-integration',
      body: 'Implements #1 against current main.', head: { ref: 'reviewed-readiness', sha: 'c'.repeat(40) } }];
    const plan = makePlan(snapshot, [], now, root);
    expect(plan.issues).toEqual([]);
    expect(plan.pendingNotReachingAdmission[0].reason).toContain('oc-autonomous-integration');
    expect(plan.pendingNotReachingAdmission[0].reason).toContain('reconcile current main and issue acceptance');
  });

  it.each(['Implements #676', 'Implemented issue #676', 'implements jsp1440/orchid-continuum-frontend#676'])('recognizes an affirmative implementation declaration: %s', body => {
    expect(lineageFor(676, [{ number: 677, body, state: 'closed', merged: true,
      head: { ref: 'reviewed-readiness', sha: 'c'.repeat(40) } }])).toHaveLength(1);
  });

  it.each(['Does not implement #676', 'Implements jsp1440/orchid-calyx-backend#676', 'Implements #6760', 'See #676'])('does not invent lineage from a different scope: %s', body => {
    expect(lineageFor(676, [{ number: 677, body, state: 'open', head: { ref: 'unrelated', sha: 'c'.repeat(40) } }])).toEqual([]);
  });

  it('accepts the historical zero-cost deterministic terminal lease, but rejects ambiguous zero-cost leases', () => {
    const legacy: Ledger['leases'][number] = {
      id: 'legacy-deterministic',
      issue: 243,
      nodeId: 'cap-conservatory-collection',
      fingerprint: 'f'.repeat(64),
      waveHash: 'w'.repeat(64),
      runId: '35469789739',
      runAttempt: '1',
      expiresAt: '2026-09-19T22:45:21.726Z',
      reservedUsd: 0,
      state: 'provider-free-done',
    };
    const ledger: Ledger = {
      schema: 1,
      programStartedAt: '2026-09-19T21:15:22.086Z',
      programSpent: 0,
      dailySpent: {},
      leases: [legacy],
    };
    expect(laneOf(legacy)).toBe('provider-free');
    expect(() => validateLedger(ledger)).not.toThrow();
    expect(() => validateLedger({ ...ledger, leases: [{ ...legacy, state: 'running' }] })).toThrow('Malformed lease');
  });

  it('turns a stale deterministic plan into a deduplicated refusal after settlement', async () => {
    const { root, snapshot } = fixture(1); const store = new MemoryStore();
    const plan = makePlan(snapshot, [], now, root);
    const first = await claimDeterministicLease(store, plan, snapshot, { issueNumber: 1, runId: '100', runAttempt: '1', now }, root);
    expect(first.allowed).toBe(true);
    await transitionLease(store, first.lease!.id, '100', '1', 'provider-free-done');

    // The first run has settled the exact fingerprint and moved the issue out
    // of the queue before this run reaches its live admission check.
    snapshot.issues[0] = issue(1, ['oc-validating']);
    const stale = await claimDeterministicLease(store, plan, snapshot, { issueNumber: 1, runId: '101', runAttempt: '1', now }, root);
    expect(stale).toMatchObject({ allowed: false, reason: 'unchanged_attempt', lease: null });
    expect(store.ledger.leases).toHaveLength(1);
  });

  it('selects eight independent queued/prepared issues, with deterministic graph priority', () => {
    const { root, snapshot } = fixture();
    root.children.forEach((node, i) => { node.priority = i; });
    snapshot.issues[1] = issue(2, ['oc-prepared']);
    snapshot.issues.reverse();
    const plan = makePlan(snapshot, [], now, root);
    expect(plan.issues).toEqual([1,2,3,4,5,6,7,8]);
    expect(plan.leaves.map(l => l.issueNumber)).toEqual(plan.issues);
  });
  it('deducts existing running lanes and excludes steward capacity', () => {
    const { root, snapshot } = fixture();
    snapshot.issues[0] = issue(1, ['oc-running']);
    snapshot.issues[1] = issue(2, ['oc-running']);
    snapshot.issues.push(issue(100, ['oc-running','oc-portfolio-steward']));
    const plan = makePlan(snapshot, [], now, root);
    expect(plan.capacity).toBe(6);
    expect(plan.issues).toHaveLength(6);
    expect(plan.issues).not.toContain(100);
  });
  it('skips every blocked state, held body and durable PR; repair retains exactly one open lineage', () => {
    const { root, snapshot } = fixture();
    ['oc-running','oc-validating','oc-blocked','oc-owner-gate','oc-runtime-backoff','oc-done'].forEach((label, i) => { snapshot.issues[i] = issue(i+1, ['oc-queued',label]); });
    snapshot.issues[6].body += '\nOC-AUTO-HOLD: true\n';
    snapshot.prs = [{ number: 90, body: 'OC-AUTO-ISSUE: #8', state: 'closed', head: { ref: 'oc-auto-8-work', sha: 'c'.repeat(40) } },
      { number: 91, body: 'OC-AUTO-ISSUE: #9', state: 'open', head: { ref: 'repair-9', sha: 'd'.repeat(40) } }];
    // #8's only PR was closed without merging: one abandoned attempt, nothing
    // in flight and nothing delivered, so it is admissible again. #9's open PR
    // is work in flight and still holds it until it is labelled `oc-repair`.
    expect(makePlan(snapshot, [], now, root).issues.sort((a,b) => a-b)).toEqual([8,10,11,12]);
    snapshot.issues[8].labels.push({ name: 'oc-repair' });
    const repaired = makePlan(snapshot, [], now, root).leaves.find(l => l.issueNumber === 9);
    expect(repaired?.repairPr).toBe(91);
    expect(repaired?.repairBranch).toBe('repair-9');
  });

  it('re-admits an issue whose every attempt was abandoned, and stops at the bound', () => {
    // The live starvation this repairs: on 2026-09-24 the plan step named #296
    // (lineage #303 closed) and #308 (lineage #312 closed) as pending and
    // unreachable, every five minutes, with eight free lanes and nothing
    // admitted. A closed-unmerged PR is an abandoned attempt, not durable work,
    // and counting it as durable removed those issues from the portfolio for
    // good while they still read `oc-queued` to anyone looking.
    const { root, snapshot } = fixture(1);
    const attempt = (number: number): Snapshot['prs'][number] => ({ number, body: 'OC-AUTO-ISSUE: #1',
      state: 'closed', head: { ref: `oc-auto/1-attempt-${number}`, sha: 'c'.repeat(40) } });

    snapshot.prs = [attempt(90)];
    expect(makePlan(snapshot, [], now, root).issues).toEqual([1]);

    snapshot.prs = [attempt(90), attempt(91)];
    expect(makePlan(snapshot, [], now, root).issues).toEqual([1]);

    // MAX_ABANDONED_ATTEMPTS. Re-admission is bounded or it is its own loop.
    snapshot.prs = [attempt(90), attempt(91), attempt(92)];
    const exhausted = makePlan(snapshot, [], now, root);
    expect(exhausted.issues).toEqual([]);
    expect(exhausted.pendingNotReachingAdmission[0].reason).toContain('3 abandoned attempt(s)');
    expect(exhausted.pendingNotReachingAdmission[0].reason).toContain('needs a decision rather than another lane');
  });

  it('keeps delivered and in-flight lineage holding the issue', () => {
    const { root, snapshot } = fixture(1);
    // Merged: the work is in, and settling it is not this lane's job.
    snapshot.prs = [{ number: 90, body: 'OC-AUTO-ISSUE: #1', state: 'closed', merged: true,
      baseRef: 'main', head: { ref: 'oc-auto/1-work', sha: 'c'.repeat(40) } }];
    expect(makePlan(snapshot, [], now, root).issues).toEqual([]);

    // Open: a second attempt must not start alongside the first.
    snapshot.prs = [{ number: 91, body: 'OC-AUTO-ISSUE: #1', state: 'open',
      head: { ref: 'oc-auto/1-work', sha: 'c'.repeat(40) } }];
    expect(makePlan(snapshot, [], now, root).issues).toEqual([]);

    // An abandoned attempt does not make a merged sibling disappear.
    snapshot.prs = [{ number: 90, body: 'OC-AUTO-ISSUE: #1', state: 'closed', merged: true,
      baseRef: 'main', head: { ref: 'oc-auto/1-merged', sha: 'c'.repeat(40) } },
      { number: 92, body: 'OC-AUTO-ISSUE: #1', state: 'closed',
        head: { ref: 'oc-auto/1-abandoned', sha: 'd'.repeat(40) } }];
    expect(makePlan(snapshot, [], now, root).issues).toEqual([]);
  });
  it('refuses unresolved dependencies and never unlocks same-wave dependants', () => {
    const { root, snapshot } = fixture(3);
    root.children[1].dependsOn = ['leaf-1'];
    root.children[2].dependsOn = ['unknown'];
    expect(makePlan(snapshot, [], now, root).issues).toEqual([1]);
    root.children[0].status = 'DONE';
    expect(makePlan(snapshot, [], now, root).issues).toEqual([2]);
  });
  it('atomically grants exactly one lease when the same issue races itself', async () => {
    const { root, snapshot } = fixture(); const store = new MemoryStore();
    const plan = makePlan(snapshot, [], now, root); const number = plan.issues[0];
    const results = await Promise.all([claim(store, plan, snapshot, root, number), claim(store, plan, snapshot, root, number, '101')]);
    expect(results.filter(r => r.allowed)).toHaveLength(1);
    expect(results.find(r => !r.allowed)?.reason).toBe('lease_owned');
    expect(store.ledger.programSpent).toBe(0.5);
    expect(store.ledger.leases).toHaveLength(1);
  });
  it('reserves all eight slots and releases completed, blocked and gated slots for immediate refill', async () => {
    const { root, snapshot } = fixture(); const store = new MemoryStore();
    const plan = makePlan(snapshot, [], now, root);
    for (const number of plan.issues) expect((await claim(store, plan, snapshot, root, number)).allowed).toBe(true);
    expect(runningCount(snapshot, store.ledger.leases)).toBe(8);
    expect(makePlan(snapshot, store.ledger.leases, now, root).issues).toEqual([]);
    for (const [i, state] of ['done','blocked','owner-gate'].entries()) {
      const lease = store.ledger.leases[i];
      await transitionLease(store, lease.id, '100', '1', state as 'done' | 'blocked' | 'owner-gate');
      snapshot.issues.find(issue => issue.number === lease.issue)!.labels = [{ name: `oc-${state}` }];
    }
    expect(makePlan(snapshot, store.ledger.leases, now, root).capacity).toBe(3);
    expect(makePlan(snapshot, store.ledger.leases, now, root).issues).toHaveLength(3);
    expect(makePlan(snapshot, store.ledger.leases, now, root).issues.every(n => !plan.issues.includes(n))).toBe(true);
  });
  it('rejects a stale owner token and does not release an unaffected lane', async () => {
    const { root, snapshot } = fixture(); const store = new MemoryStore(); const plan = makePlan(snapshot, [], now, root);
    const first = (await claim(store, plan, snapshot, root, plan.issues[0])).lease!;
    const second = (await claim(store, plan, snapshot, root, plan.issues[1])).lease!;
    await expect(transitionLease(store, first.id, 'impostor', '1', 'done')).rejects.toThrow('fencing');
    await transitionLease(store, first.id, '100', '1', 'blocked');
    expect(store.ledger.leases.find(l => l.id === second.id)?.state).toBe('reserved');
  });
  it('expiry requires independent proof of workflow termination', async () => {
    const { root, snapshot } = fixture(); const store = new MemoryStore(); const plan = makePlan(snapshot, [], now, root);
    await claim(store, plan, snapshot, root, plan.issues[0]);
    await reconcileExpired(store, '2026-09-15T00:00:00.000Z', async () => false);
    expect(store.ledger.leases[0].state).toBe('reserved');
    await expect(reconcileExpired(store, '2026-09-15T00:00:00.000Z', async () => { throw new Error('API unavailable'); }))
      .resolves.toMatchObject({ inspected: 1, recovered: 0, errors: 1 });
    await reconcileExpired(store, '2026-09-15T00:00:00.000Z', async () => true);
    expect(store.ledger.leases[0].state).toBe('blocked');
  });
  it('accepts legacy terminal provider-free records without treating them as active leases', async () => {
    const { root, snapshot } = fixture(8); const store = new MemoryStore();
    store.ledger.leases.push({
      id: 'legacy', issue: 1, nodeId: 'leaf-1', fingerprint: 'legacy-fingerprint',
      waveHash: 'legacy-wave', runId: '100', runAttempt: '1', expiresAt: now,
      reservedUsd: 0, state: 'provider-free-done',
    });
    expect(() => validateLedger(store.ledger)).not.toThrow();
    await expect(reconcileExpired(store, '2026-09-15T00:00:00.000Z', async () => true)).resolves.toMatchObject({ inspected: 0 });
    expect(makePlan(snapshot, store.ledger.leases, now, root).issues).toEqual([1,2,3,4,5,6,7,8]);
  });
  it('treats a lease removed by a concurrent release as an idempotent no-op', async () => {
    const { root, snapshot } = fixture(); const store = new MemoryStore();
    const plan = makePlan(snapshot, [], now, root);
    const lease = (await claim(store, plan, snapshot, root, plan.issues[0])).lease!;
    await expect(reconcileExpired(store, '2026-09-15T00:00:00.000Z', async () => true, async () => {
      store.ledger.leases = [];
    })).resolves.toMatchObject({ recovered: 1, errors: 0 });
    expect(store.ledger.leases).toEqual([]);
    expect(await transitionLease(store, lease.id, '100', '1', 'blocked')).toBeNull();
  });
  it('continues reconciling other leases when one stale run has unavailable evidence', async () => {
    const { root, snapshot } = fixture(); const store = new MemoryStore();
    const plan = makePlan(snapshot, [], now, root);
    await claim(store, plan, snapshot, root, plan.issues[0]);
    await claim(store, plan, snapshot, root, plan.issues[1], '101');
    const report = await reconcileExpired(store, '2026-09-15T00:00:00.000Z', async runId => {
      if (runId === '100') throw new Error('hosted evidence unavailable');
      return true;
    });
    expect(report).toMatchObject({ inspected: 2, recovered: 1, errors: 1 });
    expect(store.ledger.leases.find(lease => lease.runId === '100')?.state).toBe('reserved');
    expect(store.ledger.leases.find(lease => lease.runId === '101')?.state).toBe('blocked');
  });
  it('does not revive a lease already released during reconciliation', async () => {
    const { root, snapshot } = fixture(); const store = new MemoryStore();
    const plan = makePlan(snapshot, [], now, root);
    const lease = (await claim(store, plan, snapshot, root, plan.issues[0])).lease!;
    const report = await reconcileExpired(store, '2026-09-15T00:00:00.000Z', async () => true, async () => {
      await transitionLease(store, lease.id, '100', '1', 'done');
    });
    expect(report).toMatchObject({ recovered: 1, errors: 0 });
    expect(store.ledger.leases[0].state).toBe('done');
  });
  it('preserves the concurrent terminal outcome for the issue label side effect', async () => {
    const { root, snapshot } = fixture(); const store = new MemoryStore();
    const plan = makePlan(snapshot, [], now, root);
    const lease = (await claim(store, plan, snapshot, root, plan.issues[0])).lease!;
    const terminalStates: string[] = [];
    const report = await reconcileExpired(store, '2026-09-15T00:00:00.000Z', async () => true, async () => {
      await transitionLease(store, lease.id, '100', '1', 'done');
    }, async finalLease => {
      terminalStates.push(finalLease.state);
    });
    expect(report).toMatchObject({ recovered: 1, errors: 0 });
    expect(terminalStates).toEqual(['done']);
    expect(terminalIssueLabel(store.ledger.leases[0].state)).toBe('oc-done');
    expect(terminalIssueLabel('blocked')).toBe('oc-blocked');
  });
  it.each([
    ['provider-free-done', 'oc-validating'],
    ['provider-free-failed', 'oc-repair'],
    ['not-executed', 'oc-queued'],
  ] as const)('preserves concurrent deterministic %s without promoting acceptance', async (state, label) => {
    const { root, snapshot } = fixture(); const store = new MemoryStore();
    const plan = makePlan(snapshot, [], now, root);
    const result = await claimDeterministicLease(store, plan, snapshot,
      { issueNumber: plan.issues[0], runId: '100', runAttempt: '1', now }, root);
    const labels: string[] = [];
    const report = await reconcileExpired(store, '2026-09-15T00:00:00.000Z', async () => true,
      async () => { await transitionLease(store, result.lease!.id, '100', '1', state); },
      async finalLease => { labels.push(terminalIssueLabel(finalLease.state)); });
    expect(report).toEqual({ inspected: 1, recovered: 1, kept: 0, errors: 0 });
    expect(store.ledger.leases[0].state).toBe(state);
    expect(labels).toEqual([label]);
    expect(runningCount(snapshot, store.ledger.leases)).toBe(0);
    expect(store.ledger.programSpent).toBe(0);
  });
  it('keeps executable transitions strict while reconciliation release is idempotent', async () => {
    const { root, snapshot } = fixture(); const store = new MemoryStore();
    const plan = makePlan(snapshot, [], now, root);
    const lease = (await claim(store, plan, snapshot, root, plan.issues[0])).lease!;
    await transitionLease(store, lease.id, '100', '1', 'done');
    await expect(transitionLease(store, lease.id, 'other-run', '1', 'blocked')).rejects.toThrow('fencing');
    await expect(transitionLease(store, lease.id, '100', '1', 'running', { requireActive: true })).rejects.toThrow('Terminal');
    await expect(transitionLease(store, 'removed', '100', '1', 'running', { requireActive: true })).rejects.toThrow('fencing');
    expect(store.ledger.leases[0].state).toBe('done');
  });
  it('authorization=false makes zero reservations even with the full budget remaining', async () => {
    const { root, snapshot } = fixture(); const store = new MemoryStore(); const plan = makePlan(snapshot, [], now, root);
    const result = await claimLease(store, plan, snapshot, { issueNumber: plan.issues[0], runId: '100', runAttempt: '1', providerAuthorized: false, requestedUsd: 0.5, now }, root);
    expect(result.reason).toBe('provider_not_authorized'); expect(store.writes).toBe(0);
  });
  it('concurrent reservations cannot overspend the same remaining daily/program balance', async () => {
    const { root, snapshot } = fixture(); const store = new MemoryStore(); const plan = makePlan(snapshot, [], now, root);
    store.ledger.programSpent = 99.5; store.ledger.dailySpent[now.slice(0,10)] = 9.5;
    const results = await Promise.all(plan.issues.map(number => claim(store, plan, snapshot, root, number)));
    expect(results.filter(r => r.allowed)).toHaveLength(1);
    expect(store.ledger.programSpent).toBe(100); expect(store.ledger.dailySpent[now.slice(0,10)]).toBe(10);
  });
  it('unchanged context reuses its hash while changed graph or lineage refuses stale dispatch', () => {
    const { root, snapshot } = fixture(); const plan = makePlan(snapshot, [], now, root); const number = plan.issues[0];
    expect(makePlan(structuredClone(snapshot), [], now, root).wave.hash).toBe(plan.wave.hash);
    snapshot.issues.find(i => i.number === number)!.labels.push({ name: 'oc-blocked' });
    expect(() => assertAdmission(plan, snapshot, number, now, root)).toThrow('drift');
  });
  it('requeues a deterministic repair only after a new implementation revision', () => {
    const { snapshot } = fixture(1);
    snapshot.issues[0] = issue(1, ['oc-repair']);
    const oldSha = snapshot.implementationSha;
    const failed = { id: 'failed', issue: 1, nodeId: 'leaf-1', fingerprint: 'f', waveHash: 'w',
      runId: '1', runAttempt: '1', expiresAt: now, reservedUsd: 0, implementationSha: oldSha,
      lane: 'provider-free' as const, state: 'provider-free-failed' as const };
    expect(providerFreeRepairsReadyForRequeue(snapshot, [failed])).toEqual([]);
    snapshot.implementationSha = 'c'.repeat(40);
    expect(providerFreeRepairsReadyForRequeue(snapshot, [failed])).toEqual([1]);
    expect(providerFreeRepairsReadyForRequeue(snapshot, [{ ...failed, implementationSha: snapshot.implementationSha }])).toEqual([]);
  });
  it.each(['oc-owner-gate', 'oc-publication-hold', 'oc-running', 'oc-blocked', 'oc-runtime-backoff',
    'oc-validating', 'oc-done', 'oc-portfolio-steward'])('keeps a repaired issue parked behind %s', (hold) => {
    const { snapshot } = fixture(1);
    snapshot.issues[0] = issue(1, ['oc-repair', hold]);
    const failed = { id: 'failed', issue: 1, nodeId: 'leaf-1', fingerprint: 'f', waveHash: 'w',
      runId: '1', runAttempt: '1', expiresAt: now, reservedUsd: 0, implementationSha: 'c'.repeat(40),
      lane: 'provider-free' as const, state: 'provider-free-failed' as const };
    expect(providerFreeRepairsReadyForRequeue(snapshot, [failed])).toEqual([]);
  });
  it('preserves body holds, unknown revision evidence, and active leases when repairing', () => {
    const { snapshot } = fixture(1);
    snapshot.issues[0] = issue(1, ['oc-repair']);
    const failed = { id: 'failed', issue: 1, nodeId: 'leaf-1', fingerprint: 'f', waveHash: 'w',
      runId: '1', runAttempt: '1', expiresAt: now, reservedUsd: 0, implementationSha: 'c'.repeat(40),
      lane: 'provider-free' as const, state: 'provider-free-failed' as const };
    snapshot.issues[0].body = 'OC-AUTO-HOLD: true';
    expect(providerFreeRepairsReadyForRequeue(snapshot, [failed])).toEqual([]);
    snapshot.issues[0].body = '';
    expect(providerFreeRepairsReadyForRequeue(snapshot, [failed, { ...failed, implementationSha: undefined }])).toEqual([]);
    expect(providerFreeRepairsReadyForRequeue(snapshot, [failed, { ...failed, id: 'active', state: 'reserved' }])).toEqual([]);
    // A closed, unmerged attempt does not hold the repair: nothing is in
    // flight and nothing was delivered, and the repair still needs a newer
    // implementation revision before it fires.
    snapshot.prs.push({ number: 88, state: 'closed', body: 'OC-LINEAGE-ISSUE: #1', head: { ref: 'oc-auto/1-work', sha: 'd'.repeat(40) } });
    expect(providerFreeRepairsReadyForRequeue(snapshot, [failed])).toEqual([1]);
    // A merged attempt does: the work is already in.
    snapshot.prs.push({ number: 89, state: 'closed', merged: true, body: 'OC-LINEAGE-ISSUE: #1', head: { ref: 'oc-auto/1-merged', sha: 'e'.repeat(40) } });
    expect(providerFreeRepairsReadyForRequeue(snapshot, [failed])).toEqual([]);
  });
  it('detects hash tampering, unadmitted issues, missing/duplicate/mismatched actual receipts', () => {
    const { root, snapshot } = fixture(); const plan = makePlan(snapshot, [], now, root);
    const receipts = plan.issues.map(issue => ({ issue, waveHash: plan.wave.hash, outcome: 'provider_not_authorized' }));
    expect(() => assertReceipts(plan, receipts)).not.toThrow();
    expect(() => assertReceipts(plan, receipts.slice(1))).toThrow('diverged');
    expect(() => assertReceipts(plan, [...receipts.slice(1), receipts[1]])).toThrow('diverged');
    expect(() => assertReceipts(plan, receipts.map(r => ({ ...r, waveHash: 'wrong' })))).toThrow('diverged');
    expect(() => assertAdmission(plan, snapshot, 999, now, root)).toThrow('missing');
    plan.wave.packet.governance.push('tampered');
    expect(() => assertAdmission(plan, snapshot, plan.issues[0], now, root)).toThrow('hash');
  });

  describe('#900: zero-admission with queued executable work fails closed, not healthy', () => {
    // Two issues sharing one completion-graph leaf: #2 is already executing
    // (an active lease occupies the node), #1 is plainly `oc-queued`, passes
    // every `selectLanes` exclusion, and the graph node itself names it -- so
    // nothing in `pendingNotReachingAdmission`'s own reasons explains it either
    // (it falls through to "no rule this report knows about"). This is real,
    // unexplained starvation, not merely-unbound backlog.
    const sharedNodeFixture = () => {
      const { root, snapshot } = fixture(1);
      root.children[0].issues = ['#1', '#2'];
      snapshot.issues.push(issue(2, ['oc-running']));
      const activeLease: Ledger['leases'][number] = { id: 'active-2', issue: 2, nodeId: 'leaf-1', fingerprint: 'f', waveHash: 'w',
        runId: '1', runAttempt: '1', expiresAt: now, reservedUsd: 0, lane: 'provider-free', state: 'running' };
      return { root, snapshot, activeLease };
    };

    it('classifies an executable, graph-bound, unadmitted issue as starved, naming it and the reason', () => {
      const { root, snapshot, activeLease } = sharedNodeFixture();
      const plan = makePlan(snapshot, [activeLease], now, root);
      expect(plan.issues).toEqual([]);
      expect(plan.capacity).toBeGreaterThan(0);
      expect(plan.unreachableQueued).toEqual([{ issueNumber: 1, nodeIds: ['leaf-1'] }]);

      const report = classifyZeroAdmission(plan, root);
      expect(report.healthy).toBe(false);
      expect(report.strandedIssues).toEqual([1]);
      expect(report.reason).toContain('#1');
    });

    it('classifies legitimately idle work -- blocked, gated or durable -- as healthy with no stranded issues', () => {
      const { root, snapshot } = fixture(1);
      snapshot.issues[0] = issue(1, ['oc-queued', 'oc-owner-gate']);
      const plan = makePlan(snapshot, [], now, root);
      expect(plan.issues).toEqual([]);
      expect(plan.unreachableQueued).toEqual([]);

      const report = classifyZeroAdmission(plan, root);
      expect(report.healthy).toBe(true);
      expect(report.strandedIssues).toEqual([]);
    });

    it('classifies merely-unbound backlog (no node names it at all) as healthy, not starvation', () => {
      // Common, ordinary state -- real production backlog outpaces graph
      // leaves -- and already has its own reported line ("bind one with an
      // `oc-node:<node-id>` label"). Treating it as starvation would fail this
      // job closed on routine unbound backlog instead of an actual admission
      // malfunction, which is exactly the regression this test guards against.
      const { root, snapshot } = fixture(1);
      root.children[0].issues = [];
      const plan = makePlan(snapshot, [], now, root);
      expect(plan.issues).toEqual([]);
      expect(plan.unboundQueued).toEqual([1]);
      expect(plan.unreachableQueued).toEqual([]);

      const report = classifyZeroAdmission(plan, root);
      expect(report.healthy).toBe(true);
      expect(report.strandedIssues).toEqual([]);
    });

    it('classifies a node declared OWNER_ACTION/EXTERNAL_BLOCKER in the canonical graph as healthy, not starvation', () => {
      // Regression: the real completion graph has leaves genuinely gated this
      // way (e.g. `cap-research-trait-explorer` naming #525, `research-atlas`
      // naming #788) -- a gated leaf is never examined by the ranker, so its
      // named issue lands in `unreachableQueued` with nothing else to explain
      // it. That is an explicit owner/external gate, not unexplained starvation.
      const { root, snapshot } = fixture(1);
      root.children[0].status = 'OWNER_ACTION';
      const plan = makePlan(snapshot, [], now, root);
      expect(plan.issues).toEqual([]);
      expect(plan.unreachableQueued).toEqual([{ issueNumber: 1, nodeIds: ['leaf-1'] }]);

      const report = classifyZeroAdmission(plan, root);
      expect(report.healthy).toBe(true);
      expect(report.strandedIssues).toEqual([]);
    });

    it('does not let a lease-occupancy OWNER_ACTION mutation (internal to planning) masquerade as a canonical gate', () => {
      // `buildGraphDispatchPlan` marks an occupied node `OWNER_ACTION` on an
      // internal CLONE for planning purposes only; the canonical `root` this
      // function is given is never mutated. Checking the clone instead of the
      // canonical graph would make every lease-occupancy starvation case
      // falsely read as a legitimate gate and silently heal nothing.
      const { root, snapshot, activeLease } = sharedNodeFixture();
      expect(root.children[0].status).toBe('MISSING');
      const plan = makePlan(snapshot, [activeLease], now, root);
      expect(root.children[0].status).toBe('MISSING');
      expect(classifyZeroAdmission(plan, root).healthy).toBe(false);
    });

    describe('#198: full capacity and dependency-gated work are not starvation', () => {
      const dependencyFixture = (gateStatus: CompletionNode['status'], chain: 'direct' | 'transitive' = 'direct') => {
        const { root, snapshot } = fixture(chain === 'direct' ? 2 : 3);
        // Only #1 is queued; every other leaf is graph structure without work.
        snapshot.issues = [issue(1)];
        root.children.slice(1).forEach(child => { child.issues = []; });
        if (chain === 'direct') {
          root.children[0].dependsOn = ['leaf-2'];
          root.children[1].status = gateStatus;
        } else {
          root.children[0].dependsOn = ['leaf-2'];
          root.children[1].dependsOn = ['leaf-3'];
          root.children[2].status = gateStatus;
        }
        return { root, snapshot };
      };

      it('reports capacity=0 as capacity-constrained waiting: healthy, and no repair pass is spent', async () => {
        const { root, snapshot } = fixture(1);
        const running: Ledger['leases'] = Array.from({ length: MAX_ACTIVE_LANES }, (_, i) => ({
          id: `busy-${i}`, issue: 100 + i, nodeId: 'leaf-1', fingerprint: 'f', waveHash: 'w', runId: String(i), runAttempt: '1',
          expiresAt: now, reservedUsd: 0, lane: 'provider-free', state: 'running' as const }));
        snapshot.issues.push(...running.map(lease => issue(lease.issue, ['oc-running'])));
        const plan = makePlan(snapshot, running, now, root);
        expect(plan.issues).toEqual([]);
        expect(plan.capacity).toBe(0);

        const report = classifyZeroAdmission(plan, root);
        expect(report.healthy).toBe(true);
        expect(report.waitingOnCapacity).toBe(true);
        expect(report.strandedIssues).toEqual([]);

        const repair = vi.fn(async () => {});
        const outcome = await planWithStarvationRepair(() => plan, repair, root);
        expect(outcome.status).toBe('idle');
        expect(repair).not.toHaveBeenCalled();
      });

      it('classifies a queued leaf behind an OWNER_ACTION prerequisite as explicitly gated, not stranded', () => {
        const { root, snapshot } = dependencyFixture('OWNER_ACTION');
        const plan = makePlan(snapshot, [], now, root);
        expect(plan.issues).toEqual([]);
        expect(plan.unreachableQueued).toEqual([{ issueNumber: 1, nodeIds: ['leaf-1'] }]);

        const report = classifyZeroAdmission(plan, root);
        expect(report.healthy).toBe(true);
        expect(report.strandedIssues).toEqual([]);
        expect(report.gatedIssues).toEqual([1]);
        expect(report.waitingOnCapacity).toBe(false);
      });

      it('propagates an EXTERNAL_BLOCKER through a transitive prerequisite chain', () => {
        const { root, snapshot } = dependencyFixture('EXTERNAL_BLOCKER', 'transitive');
        const plan = makePlan(snapshot, [], now, root);
        expect(plan.issues).toEqual([]);

        const report = classifyZeroAdmission(plan, root);
        expect(report.healthy).toBe(true);
        expect(report.gatedIssues).toEqual([1]);
      });

      it('does not treat a BLOCKED prerequisite as an owner/external gate: that stays unexplained and fails closed', () => {
        // The scheduler calls BLOCKED "internally repairable"; it is not a gate.
        const { root, snapshot } = dependencyFixture('BLOCKED');
        const plan = makePlan(snapshot, [], now, root);
        expect(plan.issues).toEqual([]);

        const report = classifyZeroAdmission(plan, root);
        expect(report.healthy).toBe(false);
        expect(report.strandedIssues).toEqual([1]);
        expect(report.gatedIssues).toEqual([]);
      });

      it('does not let a DONE prerequisite or a dependency cycle manufacture a gate or recurse forever', () => {
        const { root, snapshot } = dependencyFixture('DONE');
        // leaf-2 is DONE, so leaf-1 is admissible and plan admits it: not a zero-admission plan at all.
        expect(makePlan(snapshot, [], now, root).issues).toEqual([1]);

        const cyclic = dependencyFixture('MISSING', 'transitive');
        cyclic.root.children[2].dependsOn = ['leaf-1'];
        const plan = makePlan(cyclic.snapshot, [], now, cyclic.root);
        expect(plan.issues).toEqual([]);
        const report = classifyZeroAdmission(plan, cyclic.root);
        expect(report.healthy).toBe(false);
        expect(report.gatedIssues).toEqual([]);
      });

      it('keeps unrelated admissible work dispatchable while a dependency-gated leaf waits', () => {
        const { root, snapshot } = fixture(3);
        root.children[0].dependsOn = ['leaf-2'];
        root.children[1].status = 'OWNER_ACTION';
        root.children[1].issues = [];
        snapshot.issues = [issue(1), issue(3)];
        const plan = makePlan(snapshot, [], now, root);
        expect(plan.issues).toEqual([3]);
        expect(plan.issues).not.toContain(1);
      });

      it('genuine starvation still fails closed after exactly one bounded reconsideration', async () => {
        const { root, snapshot, activeLease } = sharedNodeFixture();
        const repair = vi.fn(async () => {});
        const outcome = await planWithStarvationRepair(() => makePlan(snapshot, [activeLease], now, root), repair, root);
        expect(repair).toHaveBeenCalledTimes(1);
        expect(outcome.status).toBe('starved');
        if (outcome.status === 'starved') expect(outcome.strandedIssues).toEqual([1]);
      });
    });

    it('throws rather than classify a plan that actually admitted work', () => {
      const { root, snapshot } = fixture(1);
      const plan = makePlan(snapshot, [], now, root);
      expect(plan.issues).toEqual([1]);
      expect(() => classifyZeroAdmission(plan, root)).toThrow('admitted work');
    });

    it('starvation case: attempts exactly one bounded repair, and admits the issue once the repair releases the blocking node', async () => {
      const { root, snapshot, activeLease } = sharedNodeFixture();
      let leases = [activeLease];
      const computePlan = () => makePlan(snapshot, leases, now, root);
      // The bounded repair this slice implements: reconcile proves #2's run
      // actually completed, so its lease is released and the shared node frees up.
      const repair = vi.fn(async () => { leases = []; });

      const outcome = await planWithStarvationRepair(computePlan, repair, root);
      expect(repair).toHaveBeenCalledTimes(1);
      expect(outcome.status).toBe('admitted');
      expect(outcome.plan.issues).toEqual([1]);
    });

    it('starvation case: fails closed naming the stranded issue when the one bounded repair does not fix it', async () => {
      const { root, snapshot, activeLease } = sharedNodeFixture();
      const computePlan = () => makePlan(snapshot, [activeLease], now, root);
      const repair = vi.fn(async () => {});

      const outcome = await planWithStarvationRepair(computePlan, repair, root);
      expect(outcome.status).toBe('starved');
      if (outcome.status === 'starved') {
        expect(outcome.strandedIssues).toEqual([1]);
        expect(outcome.reason).toContain('#1');
      }
      // Bounded: never a second repair attempt chasing the same unfixed gap.
      expect(repair).toHaveBeenCalledTimes(1);
    });

    it('legitimate idle case: never spends a repair attempt, and records a deliberate idle reason', async () => {
      const { root, snapshot } = fixture(1);
      snapshot.issues[0] = issue(1, ['oc-queued', 'oc-owner-gate']);
      const computePlan = () => makePlan(snapshot, [], now, root);
      const repair = vi.fn(async () => {});

      const outcome = await planWithStarvationRepair(computePlan, repair, root);
      expect(repair).not.toHaveBeenCalled();
      expect(outcome.status).toBe('idle');
      expect(outcome.plan.issues).toEqual([]);
      if (outcome.status === 'idle') expect(outcome.reason).toBeTruthy();
    });

    it('healthy case: passes an already-admitting plan straight through with no repair attempt', async () => {
      const { root, snapshot } = fixture(8);
      const computePlan = () => makePlan(snapshot, [], now, root);
      const repair = vi.fn(async () => {});

      const outcome = await planWithStarvationRepair(computePlan, repair, root);
      expect(repair).not.toHaveBeenCalled();
      expect(outcome.status).toBe('admitted');
      expect(outcome.plan.issues).toHaveLength(8);
    });
  });
});
