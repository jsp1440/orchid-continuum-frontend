import { describe, expect, it } from 'vitest';
import { assertAdmission, assertReceipts, claimLease, makePlan, reconcileExpired, runningCount, transitionLease,
  providerFreeRepairsReadyForRequeue, type Issue, type Ledger, type LeaseStore, type Snapshot } from '../scripts/oc-dispatch-control';
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
    expect(makePlan(snapshot, [], now, root).issues.sort((a,b) => a-b)).toEqual([10,11,12]);
    snapshot.issues[8].labels.push({ name: 'oc-repair' });
    const repaired = makePlan(snapshot, [], now, root).leaves.find(l => l.issueNumber === 9);
    expect(repaired?.repairPr).toBe(91);
    expect(repaired?.repairBranch).toBe('repair-9');
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
    await expect(reconcileExpired(store, '2026-09-15T00:00:00.000Z', async () => { throw new Error('API unavailable'); })).rejects.toThrow();
    await reconcileExpired(store, '2026-09-15T00:00:00.000Z', async () => true);
    expect(store.ledger.leases[0].state).toBe('blocked');
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
});
