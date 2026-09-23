import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { load } from 'js-yaml';
import {
  claimDeterministicLease, isActive, laneOf, reconcileExpired, transitionLease, validateLedger,
  NOT_EXECUTED_CEILING, RECEIPT_OUTCOMES, type Issue, type Ledger, type Lease, type LeaseStore, type Snapshot,
} from '../scripts/oc-dispatch-control';
import { makePlan } from '../scripts/oc-dispatch-control';

const NOW = '2026-09-19T21:00:00.000Z';
const LEAF = 'gate-journey-research-matrix';

const paths: string[] = [];
afterEach(() => paths.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));

function snapshotFor(number: number, labels: string[]): Snapshot {
  return {
    // Sorted, because `snapshot()` sorts and the fingerprint hashes the array.
    issues: [{ number, state: 'open', title: 'deterministic work', body: null,
      labels: labels.map(name => ({ name })).sort((a, b) => a.name.localeCompare(b.name)) }],
    prs: [], integrationSha: 'a'.repeat(40), implementationSha: 'b'.repeat(40), material: { architecture: 'm' },
  };
}

class MemoryStore implements LeaseStore {
  constructor(public ledger: Ledger, public version = '1') {}
  async read() { return { version: this.version, ledger: structuredClone(this.ledger) }; }
  async compareAndSwap(version: string, ledger: Ledger) {
    if (version !== this.version) return false;
    this.ledger = ledger; this.version = String(Number(version) + 1); return true;
  }
}

export const emptyLedger = (): Ledger => ({ schema: 1, programStartedAt: NOW, programSpent: 0, dailySpent: {}, leases: [] });

// Settlement fixtures own a persisted lease, just like the reusable lane.
// An absent ledger must not silently bypass the fence in a successful test.
const settlementLedgerApi = `
if (path.includes('contents/.oc/dispatch-ledger.json')) {
  const file = process.env.OC_SETTLEMENT_LEDGER;
  if (method === 'PUT') {
    const body = JSON.parse(fs.readFileSync(0, 'utf8'));
    fs.writeFileSync(file, Buffer.from(body.content, 'base64').toString());
    console.log('{}'); process.exit(0);
  }
  const content = fs.readFileSync(file);
  console.log(JSON.stringify({ sha: 'v1', content: Buffer.from(content).toString('base64') }));
  // A release can win after the initial ownership check but before settlement's CAS.
  if (process.env.OC_RELEASE_AFTER_READ) {
    const ledger = JSON.parse(content);
    ledger.leases = [];
    fs.writeFileSync(file, JSON.stringify(ledger));
  }
  process.exit(0);
}
`;
function installSettlementLease(env: Record<string, string | undefined>, plan: ReturnType<typeof makePlan>) {
  env.OC_LEASE_ID = 'fixture-owned';
  env.OC_SETTLEMENT_LEDGER = join(env.OC_PLAN_DIR!, 'lease.json');
  writeFileSync(env.OC_TEST_LOG!, '');
  const leaf = plan.leaves[0];
  const owned: Lease = { id: 'fixture-owned', issue: leaf.issueNumber, nodeId: leaf.nodeId,
    fingerprint: leaf.fingerprint, waveHash: plan.wave.hash, runId: '1', runAttempt: '1',
    expiresAt: '2099-01-01T00:00:00.000Z', reservedUsd: 0, lane: 'provider-free', state: 'reserved' };
  writeFileSync(env.OC_SETTLEMENT_LEDGER, JSON.stringify({ ...emptyLedger(), leases: [owned] }));
}

describe('a deterministic lane takes a lease of its own', () => {
  const setup = () => {
    const snapshot = snapshotFor(703, ['oc-queued', `oc-node:${LEAF}`]);
    const plan = makePlan(snapshot, [], NOW);
    expect(plan.issues).toEqual([703]);
    return { snapshot, plan, store: new MemoryStore(emptyLedger()) };
  };

  it('reserves a lane that costs nothing and is tagged as such', async () => {
    const { snapshot, plan, store } = setup();
    const result = await claimDeterministicLease(store, plan, snapshot, { issueNumber: 703, runId: '1', runAttempt: '1', now: NOW });

    expect(result.allowed).toBe(true);
    expect(result.lease?.reservedUsd).toBe(0);
    expect(laneOf(result.lease!)).toBe('provider-free');
  });

  it('never touches the spending ledger', async () => {
    const { snapshot, plan, store } = setup();
    await claimDeterministicLease(store, plan, snapshot, { issueNumber: 703, runId: '1', runAttempt: '1', now: NOW });

    expect(store.ledger.programSpent).toBe(0);
    expect(store.ledger.dailySpent).toEqual({});
  });

  // #171 executed three times in four minutes on one unchanged head, because the
  // fingerprint check in `claimLease` sits behind the provider-authorization
  // early return and deterministic work never reached it.
  it('refuses to execute an unchanged issue a second time', async () => {
    const { snapshot, plan, store } = setup();
    const first = await claimDeterministicLease(store, plan, snapshot, { issueNumber: 703, runId: '1', runAttempt: '1', now: NOW });
    expect(first.allowed).toBe(true);
    await transitionLease(store, first.lease!.id, '1', '1', 'provider-free-done');

    const second = await claimDeterministicLease(store, plan, snapshot, { issueNumber: 703, runId: '2', runAttempt: '1', now: NOW });

    expect(second.allowed).toBe(false);
    expect(second.reason).toBe('unchanged_attempt');
    expect(second.lease).toBeNull();
  });

  it('admits the issue again once the integration revision moves', async () => {
    const { snapshot, plan, store } = setup();
    const first = await claimDeterministicLease(store, plan, snapshot, { issueNumber: 703, runId: '1', runAttempt: '1', now: NOW });
    await transitionLease(store, first.lease!.id, '1', '1', 'provider-free-done');

    const moved = { ...snapshot, integrationSha: 'c'.repeat(40) };
    const nextPlan = makePlan(moved, store.ledger.leases, NOW);
    const third = await claimDeterministicLease(store, nextPlan, moved, { issueNumber: 703, runId: '3', runAttempt: '1', now: NOW });

    expect(third.allowed).toBe(true);
  });

  it('does not hand out a second lane while one is live', async () => {
    const { snapshot, plan, store } = setup();
    await claimDeterministicLease(store, plan, snapshot, { issueNumber: 703, runId: '1', runAttempt: '1', now: NOW });
    const again = await claimDeterministicLease(store, plan, snapshot, { issueNumber: 703, runId: '2', runAttempt: '1', now: NOW });

    expect(again.reason).toBe('lease_owned');
  });
});

describe('the ledger keeps the two lanes apart', () => {
  const lease = (over: Partial<Lease>): Lease => ({
    id: 'x', issue: 1, nodeId: LEAF, fingerprint: 'f', waveHash: 'w', runId: '1', runAttempt: '1',
    expiresAt: NOW, reservedUsd: 0.5, state: 'reserved', ...over,
  });
  const ledgerWith = (l: Lease): Ledger => ({ ...emptyLedger(), leases: [l] });

  it('refuses a deterministic lease that reserved money', () => {
    expect(() => validateLedger(ledgerWith(lease({ lane: 'provider-free', reservedUsd: 0.5 })))).toThrow('Malformed lease');
  });

  it('still refuses a provider lease that reserved nothing', () => {
    expect(() => validateLedger(ledgerWith(lease({ lane: 'provider', reservedUsd: 0 })))).toThrow('Malformed lease');
  });

  it('reads a lease written before the deterministic lane existed as a paid one', () => {
    expect(() => validateLedger(ledgerWith(lease({ reservedUsd: 0.5 })))).not.toThrow();
    expect(laneOf(lease({ reservedUsd: 0.5 }))).toBe('provider');
  });

  it('refuses to settle a deterministic lease into a provider outcome', async () => {
    const store = new MemoryStore(ledgerWith(lease({ id: 'd', lane: 'provider-free', reservedUsd: 0 })));
    await expect(transitionLease(store, 'd', '1', '1', 'done')).rejects.toThrow('provider outcome');
  });

  it('expires a deterministic lease as not-executed, because settlement never ran', async () => {
    // `settle-deterministic` is the only writer of a provider-free outcome, and
    // it always transitions the lease. So an expired one is the single case in
    // which we KNOW no evidence was judged -- which is `not-executed`, not a
    // failure.
    //
    // It was recorded as `provider-free-failed`, which is not excluded from the
    // fingerprint bar, while the reconcile callback stripped `oc-queued` and
    // applied `oc-blocked`. The issue became unselectable and permanently
    // unclaimable at once: restoring the labels by hand still left the claim
    // returning `unchanged_attempt`. That is precisely the trap `not-executed`
    // was added to remove, relocated to the expiry path.
    const store = new MemoryStore(ledgerWith(lease({ id: 'd', lane: 'provider-free', reservedUsd: 0, expiresAt: '2020-01-01T00:00:00.000Z' })));
    await reconcileExpired(store, NOW, async () => true);

    expect(store.ledger.leases[0].state).toBe('not-executed');
    expect(isActive(store.ledger.leases[0])).toBe(false);
  });

  it('leaves an expired provider lease blocked, because something unseen was running', async () => {
    const store = new MemoryStore(ledgerWith(lease({ id: 'p', lane: 'provider', reservedUsd: 4, expiresAt: '2020-01-01T00:00:00.000Z' })));
    await reconcileExpired(store, NOW, async () => true);

    expect(store.ledger.leases[0].state).toBe('blocked');
  });

  it('lets the expired deterministic issue be claimed again on the next pulse', async () => {
    // The whole point of the state: after the expiry, the work is admissible.
    const store = new MemoryStore(ledgerWith(lease({ id: 'd', lane: 'provider-free', reservedUsd: 0, expiresAt: '2020-01-01T00:00:00.000Z' })));
    await reconcileExpired(store, NOW, async () => true);
    const snapshot = snapshotFor(703, ['oc-queued', `oc-node:${LEAF}`]);
    const plan = makePlan(snapshot, [], NOW);
    // Same fingerprint as the expired lease, which is the case that used to bar it.
    store.ledger.leases[0].fingerprint = plan.leaves.find(l => l.issueNumber === 703)!.fingerprint;

    const claim = await claimDeterministicLease(store, plan, snapshot, { issueNumber: 703, runId: '2', runAttempt: '1', now: NOW });

    expect(claim.allowed, claim.reason).toBe(true);
  });
});

describe('the four execution states are distinct', () => {
  it('names each one', () => {
    expect(RECEIPT_OUTCOMES).toContain('provider_free_done');
    expect(RECEIPT_OUTCOMES).toContain('provider_free_failed');
    expect(RECEIPT_OUTCOMES).toContain('provider_not_authorized');
    expect(RECEIPT_OUTCOMES).toContain('not_executed');
  });

  it('keeps a completed deterministic run distinguishable from a refused one', () => {
    expect(new Set(RECEIPT_OUTCOMES).size).toBe(RECEIPT_OUTCOMES.length);
    expect(RECEIPT_OUTCOMES.indexOf('provider_free_done')).not.toBe(RECEIPT_OUTCOMES.indexOf('provider_not_authorized'));
  });
});

describe('settlement writes the one authoritative receipt', () => {
  const harness = (nodeId = LEAF) => {
    const dir = mkdtempSync(join(tmpdir(), 'oc-settle-')); paths.push(dir);
    const bin = join(dir, 'bin'); mkdirSync(bin);
    const gh = join(bin, 'gh');
    writeFileSync(gh, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.OC_TEST_LOG, JSON.stringify(args) + '\\n');
const path = args[1];
const method = args[args.indexOf('--method') + 1];
${settlementLedgerApi}
if (method === 'PATCH') {
  // The body arrives on stdin via \`--input -\`, not in argv.
  const body = fs.readFileSync(0, 'utf8');
  fs.appendFileSync(process.env.OC_TEST_LOG, 'PATCHBODY ' + body + '\\n');
  console.log('{}'); process.exit(0);
}
if (/issues\\/\\d+$/.test(path)) { console.log(JSON.stringify({ number: 703, state: 'open', title: 'deterministic work', body: null, labels: [{ name: 'oc-queued' }, { name: 'oc-node:${nodeId}' }] })); process.exit(0); }
console.log('{}');
`);
    chmodSync(gh, 0o755);
    const planDir = join(dir, 'wave'); mkdirSync(planDir);
    // The runtime re-derives the snapshot from the real checkout, so the plan
    // has to carry the shas it will actually see.
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    const snapshot = { ...snapshotFor(703, ['oc-queued', `oc-node:${nodeId}`]),
      integrationSha: 'a'.repeat(40), implementationSha: head };
    const plan = makePlan(snapshot, [], NOW);
    writeFileSync(join(planDir, 'plan.json'), JSON.stringify(plan));
    const env = {
      ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: 'jsp1440/orchid-continuum-frontend',
      GITHUB_OUTPUT: join(dir, 'outputs'), OC_TEST_LOG: join(dir, 'requests'), OC_PLAN_DIR: planDir,
      OC_RECEIPT_DIR: join(dir, 'receipts'), OC_EVIDENCE_DIR: join(dir, 'evidence'),
      OC_WAVE_HASH: plan.wave.hash, ISSUE_NUMBER: '703', GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1',
      PROVIDER_AUTHORIZED: 'false',
    };
    installSettlementLease(env, plan);
    // Evidence as the executor actually writes it, so a test must opt out of the
    // fencing fields rather than accidentally omit them.
    const writeEvidence = (evidence: Record<string, unknown>) => {
      mkdirSync(env.OC_EVIDENCE_DIR, { recursive: true });
      writeFileSync(join(env.OC_EVIDENCE_DIR, '703.json'), JSON.stringify({
        schema: 'oc.provider-free-evidence.v1', issue: 703, wave_hash: plan.wave.hash,
        run: '1:1', provider_calls: 0, provider_cost_usd: 0, results: [{ command: 'npm run test', exit_code: 0 }], ...evidence,
      }));
    };
    const writeRaw = (body: string) => {
      mkdirSync(env.OC_EVIDENCE_DIR, { recursive: true });
      writeFileSync(join(env.OC_EVIDENCE_DIR, '703.json'), body);
    };
    const settle = (extra: Record<string, string> = {}) => spawnSync(process.execPath,
      ['--import', 'tsx', resolve('scripts/oc-dispatch-runtime.ts'), 'settle-deterministic'],
      { env: { ...env, ...extra }, encoding: 'utf8' });
    const receiptExists = () => existsSync(join(env.OC_RECEIPT_DIR, '703.json'));
    const receipt = () => JSON.parse(readFileSync(join(env.OC_RECEIPT_DIR, '703.json'), 'utf8'));
    const patched = () => readFileSync(env.OC_TEST_LOG, 'utf8').trim().split('\n')
      .filter(line => line.startsWith('PATCHBODY '))
      .map(line => JSON.parse(line.slice('PATCHBODY '.length)) as { labels: string[] });
    return { env, writeEvidence, writeRaw, settle, receipt, receiptExists, patched };
  };

  it('records a run that executed and passed as provider_free_done, never as provider_not_authorized', () => {
    const h = harness();
    h.writeEvidence({ outcome: 'done', results: [{ command: 'npm run test', exit_code: 0 }] });
    const run = h.settle();

    expect(run.status, run.stderr).toBe(0);
    expect(h.receipt()).toMatchObject({ issue: 703, outcome: 'provider_free_done', providerCalls: 0, providerCostUsd: 0 });
    expect(JSON.stringify(h.receipt())).not.toContain('provider_not_authorized');
  });

  it('moves a passing issue to validation rather than claiming it done', () => {
    const h = harness();
    h.writeEvidence({ outcome: 'done' });
    h.settle();

    const labels = h.patched().at(-1)!.labels;
    expect(labels).toContain('oc-validating');
    expect(labels).not.toContain('oc-done');
    expect(labels).not.toContain('oc-queued');
  });

  it('settles a fixed deployed Featured Genus acceptance proof to done', () => {
    const h = harness('cap-homepage-featured-genus');
    h.writeEvidence({
      outcome: 'done',
      results: [{ command: 'npm run verify:featured-genus', exit_code: 0 }],
      acceptance: {
        kind: 'featured-genus-deployed',
        node_id: 'cap-homepage-featured-genus',
        issue: 703,
        passed: true,
        release_sha: 'a'.repeat(40),
        expected_release_sha: null,
      },
    });
    const run = h.settle();

    expect(run.status, run.stderr).toBe(0);
    expect(h.receipt()).toMatchObject({ issue: 703, outcome: 'done', providerCalls: 0, providerCostUsd: 0 });
    expect(h.patched().at(-1)!.labels).toContain('oc-done');
    expect(h.patched().at(-1)!.labels).not.toContain('oc-validating');
  });

  it('records a run that executed and failed as provider_free_failed, and returns it for repair', () => {
    const h = harness();
    h.writeEvidence({ outcome: 'failed', results: [{ command: 'npm run test', exit_code: 1 }] });
    const run = h.settle();

    expect(run.status, run.stderr).toBe(0);
    expect(h.receipt()).toMatchObject({ outcome: 'provider_free_failed' });
    const labels = h.patched().at(-1)!.labels;
    expect(labels).toContain('oc-repair');
    // NOT re-queued: unchanged failing work must not be retried, and leaving it
    // queued gave one accidental retry before stranding it while still saying
    // it was queued.
    expect(labels).not.toContain('oc-queued');
  });

  // Absence of evidence is not success. A worker that never started, or died
  // before writing, must not settle as a pass.
  it('records a lane that never executed as not_executed', () => {
    const h = harness();
    const run = h.settle();

    expect(run.status, run.stderr).toBe(0);
    expect(h.receipt()).toMatchObject({ outcome: 'not_executed' });
    expect(existsSync(join(h.env.OC_EVIDENCE_DIR, '703.json'))).toBe(false);
  });

  it('refuses evidence that belongs to another issue', () => {
    const h = harness();
    h.writeEvidence({ issue: 999999, outcome: 'done' });
    const run = h.settle();

    expect(run.status, run.stderr).toBe(0);
    expect(h.receipt()).toMatchObject({ issue: 703, outcome: 'not_executed' });
    expect(JSON.stringify(h.receipt())).toContain('belongs to issue #999999');
  });

  it('refuses evidence that belongs to another wave', () => {
    const h = harness();
    h.writeEvidence({ wave_hash: 'not-this-wave', outcome: 'done' });
    const run = h.settle();

    expect(h.receipt()).toMatchObject({ outcome: 'not_executed' });
    expect(JSON.stringify(h.receipt())).toContain('another wave');
  });

  it('refuses evidence that belongs to another run', () => {
    const h = harness();
    h.writeEvidence({ run: '999:9', outcome: 'done' });
    h.settle();

    expect(h.receipt()).toMatchObject({ outcome: 'not_executed' });
    expect(JSON.stringify(h.receipt())).toContain('belongs to run 999:9');
  });

  it('settles malformed evidence rather than crashing without a receipt', () => {
    const h = harness();
    h.writeRaw('{ this is not json');
    const run = h.settle();

    expect(run.status, run.stderr).toBe(0);
    expect(h.receipt()).toMatchObject({ outcome: 'not_executed' });
    expect(JSON.stringify(h.receipt())).toContain('not valid JSON');
  });

  it('does not call an absent provider_calls field a provider call', () => {
    // `undefined !== 0` reported "Deterministic lane reported a provider call"
    // for evidence that reported nothing of the kind.
    const h = harness();
    h.writeEvidence({ outcome: 'done', provider_calls: undefined });
    const run = h.settle();

    expect(run.status, run.stderr).toBe(0);
    expect(run.stderr).not.toContain('reported a provider call');
    expect(JSON.stringify(h.receipt())).toContain('records no provider_calls');
  });

  it.each([
    {}, { id: 'foreign' }, { issue: 704 }, { nodeId: 'another-node' },
    { fingerprint: 'changed' }, { waveHash: 'another-wave' }, { runId: '2' },
    { runAttempt: '2' }, { state: 'provider-free-done' },
    { expiresAt: '2020-01-01T00:00:00.000Z' }, { lane: 'provider', reservedUsd: 0.5 },
  ])('refuses an unowned settlement before any issue write: %j', (change) => {
    const h = harness();
    const file = join(h.env.OC_PLAN_DIR, 'lease.json');
    const ledger = JSON.parse(readFileSync(file, 'utf8'));
    if (Object.keys(change).length === 0) ledger.leases = [];
    else Object.assign(ledger.leases[0], change);
    writeFileSync(file, JSON.stringify(ledger));
    h.writeEvidence({ outcome: 'done' });
    const before = readFileSync(file, 'utf8');
    const run = h.settle();
    expect(run.status).toBe(1);
    expect(h.patched()).toEqual([]);
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(h.receipt()).toMatchObject({ outcome: 'dispatch_refused', providerCalls: 0 });
  });

  it('refuses a missing lease id rather than bypassing the ledger', () => {
    const h = harness();
    h.writeEvidence({ outcome: 'done' });
    expect(h.settle({ OC_LEASE_ID: '' }).status).toBe(1);
    expect(h.patched()).toEqual([]);
    expect(h.receipt()).toMatchObject({ outcome: 'dispatch_refused' });
  });

  it('refuses a release racing after preflight before touching issue labels', () => {
    const h = harness();
    h.writeEvidence({ outcome: 'done' });
    const run = h.settle({ OC_RELEASE_AFTER_READ: 'true' });
    expect(run.status).toBe(1);
    expect(h.patched()).toEqual([]);
    expect(h.receipt()).toMatchObject({ outcome: 'dispatch_refused', evidence: { outcome: 'done' } });
  });

  it.each(['done', 'failed'])('does not call an empty command list execution: %s', (outcome) => {
    const h = harness();
    h.writeEvidence({ outcome, results: [] });
    const run = h.settle();
    expect(run.status, run.stderr).toBe(0);
    expect(h.receipt()).toMatchObject({ outcome: 'not_executed', commands: 0 });
    expect(h.patched().at(-1)!.labels).toContain('oc-queued');
    expect(h.patched().at(-1)!.labels).not.toContain('oc-validating');
  });

  it('refuses evidence claiming a provider call', () => {
    const h = harness();
    h.writeEvidence({ outcome: 'done', provider_calls: 1 });
    const run = h.settle();

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('provider call');
  });
});

describe('the lane workflow cannot report two things about one issue', () => {
  const lane = load(readFileSync('.github/workflows/orchid-budgeted-completion-lane.yml', 'utf8')) as {
    jobs: Record<string, { needs?: string | string[]; if?: string; steps?: Array<{ uses?: string; with?: { name?: string }; if?: string }> }>;
  };
  const receiptWriters = Object.entries(lane.jobs).filter(([, job]) =>
    (job.steps ?? []).some(step => (step.uses ?? '').includes('upload-artifact') &&
      (step.with?.name ?? '').includes('oc-lane-')));

  it('decides the route before the provider preflight can write a refusal', () => {
    expect(lane.jobs['budget-preflight'].needs).toBe('classify');
    expect(lane.jobs['budget-preflight'].if).toContain("provider_free != 'true'");
  });

  it('gives the deterministic route its own settlement', () => {
    expect(lane.jobs['settle-deterministic']).toBeDefined();
    expect(lane.jobs['provider-free-worker'].if).toContain("deterministic-preflight.outputs.allowed == 'true'");
  });

  it('leaves the two receipt writers mutually exclusive', () => {
    // A provider-free issue must never also produce the denied-lane receipt:
    // both would upload `oc-lane-<attempt>-<issue>` for the same issue, and the
    // audit would read whichever won.
    const names = receiptWriters.map(([name]) => name);
    expect(names).toContain('settle-deterministic');
    expect(names).toContain('deterministic-preflight');
    expect(names).toContain('budget-preflight');
    const providerFreeOnly = ['deterministic-preflight', 'settle-deterministic'];
    for (const name of providerFreeOnly) {
      const job = lane.jobs[name];
      const gate = [job.if ?? '', ...[job.needs ?? []].flat()].join(' ');
      expect(gate).toMatch(/deterministic-preflight|classify/);
    }
    expect(lane.jobs['budget-preflight'].if).toContain("!= 'true'");
  });
});

describe('the deterministic lane may create the ledger the paid lane never could', () => {
  it('refuses to initialize accounting with a balance', async () => {
    const { DeterministicLeaseStore } = await import('../scripts/oc-dispatch-runtime');
    const store = new DeterministicLeaseStore();
    await expect(store.compareAndSwap('', { ...emptyLedger(), programSpent: 12 }))
      .rejects.toThrow('non-zero balance');
    await expect(store.compareAndSwap('', { ...emptyLedger(), dailySpent: { '2026-09-19': 3 } }))
      .rejects.toThrow('non-zero balance');
  });

  it('still lets the paid lane treat a missing ledger as unknown spend', async () => {
    // This test previously compared a prototype object to a constructor function
    // and asserted a subclass is an instance of its base: neither can fail. The
    // guard it names -- `GitHubLeaseStore.read()` throwing on 404, so the paid
    // lane never reads a missing accounting file as nothing spent -- could be
    // deleted outright with the whole suite green. It is the repository's money
    // boundary, and the test holding it there verified nothing.
    const dir = mkdtempSync(join(tmpdir(), 'oc-paid-store-')); paths.push(dir);
    const bin = join(dir, 'bin'); mkdirSync(bin);
    const gh = join(bin, 'gh');
    writeFileSync(gh, `#!/usr/bin/env node\nconsole.error('gh: Not Found (HTTP 404)');\nprocess.exit(1);\n`);
    chmodSync(gh, 0o755);

    const probe = join(dir, 'probe.mjs');
    writeFileSync(probe, `
import { GitHubLeaseStore, DeterministicLeaseStore } from ${JSON.stringify(resolve('scripts/oc-dispatch-runtime.ts'))};
let paid = 'resolved';
try { await new GitHubLeaseStore().read(); } catch { paid = 'threw'; }
const free = await new DeterministicLeaseStore().read();
console.log(JSON.stringify({ paid, freeVersion: free.version, freeSpent: free.ledger.programSpent }));
`);
    const run = spawnSync(process.execPath, ['--import', 'tsx', probe], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: 'jsp1440/orchid-continuum-frontend' },
      encoding: 'utf8',
    });

    const result = JSON.parse(run.stdout.trim().split('\n').at(-1)!);
    expect(result.paid).toBe('threw');
    // And the deterministic lane, which cannot spend, reads it as empty.
    expect(result.freeVersion).toBe('');
    expect(result.freeSpent).toBe(0);
  });

});

describe('the ledger records what settlement decided', () => {
  // A harness with a real ledger, so the lease transition and the refusal
  // receipt are exercised. Without one, `settle-deterministic` skipped the
  // transition entirely and `admit-deterministic` was never reached.
  const withLedger = (leases: Lease[]) => {
    const dir = mkdtempSync(join(tmpdir(), 'oc-ledger-')); paths.push(dir);
    const bin = join(dir, 'bin'); mkdirSync(bin);
    const state = join(dir, 'ledger.json');
    writeFileSync(state, JSON.stringify({ schema: 1, programStartedAt: NOW, programSpent: 0, dailySpent: {}, leases }));
    const gh = join(bin, 'gh');
    writeFileSync(gh, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const path = args[1];
const method = args[args.indexOf('--method') + 1];
const STATE = ${JSON.stringify(state)};
if (path.includes('contents/.oc/dispatch-ledger.json')) {
  if (method === 'PUT') {
    const body = JSON.parse(fs.readFileSync(0, 'utf8'));
    fs.writeFileSync(STATE, Buffer.from(body.content, 'base64').toString());
    console.log('{}'); process.exit(0);
  }
  console.log(JSON.stringify({ sha: 'v1', content: Buffer.from(fs.readFileSync(STATE)).toString('base64') }));
  process.exit(0);
}
if (method === 'PATCH') { fs.readFileSync(0, 'utf8'); console.log('{}'); process.exit(0); }
if (/issues\\/\\d+$/.test(path)) { console.log(JSON.stringify({ number: 703, state: 'open', title: 'deterministic work', body: null, labels: [{ name: 'oc-queued' }, { name: 'oc-node:${LEAF}' }] })); process.exit(0); }
if (path.includes('/issues?')) { console.log(JSON.stringify([{ number: 703, state: 'open', title: 'deterministic work', body: null, labels: [{ name: 'oc-queued' }, { name: 'oc-node:${LEAF}' }] }])); process.exit(0); }
if (path.includes('/pulls?')) { console.log('[]'); process.exit(0); }
if (path.includes('git/ref/heads/')) { console.log(JSON.stringify({ object: { sha: 'a'.repeat(40) } })); process.exit(0); }
console.log('{}');
`);
    chmodSync(gh, 0o755);
    const planDir = join(dir, 'wave'); mkdirSync(planDir);
    // The runtime re-derives the snapshot from the real checkout, so the plan
    // has to carry the shas it will actually see.
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    const snapshot = { ...snapshotFor(703, ['oc-queued', `oc-node:${LEAF}`]),
      integrationSha: 'a'.repeat(40), implementationSha: head };
    const plan = makePlan(snapshot, [], NOW);
    writeFileSync(join(planDir, 'plan.json'), JSON.stringify(plan));
    const env = {
      ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: 'jsp1440/orchid-continuum-frontend',
      GITHUB_OUTPUT: join(dir, 'outputs'), OC_PLAN_DIR: planDir, OC_RECEIPT_DIR: join(dir, 'receipts'),
      OC_EVIDENCE_DIR: join(dir, 'evidence'), OC_WAVE_HASH: plan.wave.hash, ISSUE_NUMBER: '703',
      GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: 'a'.repeat(40), PROVIDER_AUTHORIZED: 'false',
    };
    const cmd = (command: string, extra: Record<string, string> = {}) => spawnSync(process.execPath,
      ['--import', 'tsx', resolve('scripts/oc-dispatch-runtime.ts'), command],
      { env: { ...env, ...extra }, encoding: 'utf8' });
    return { env, plan, cmd, ledger: () => JSON.parse(readFileSync(state, 'utf8')) as Ledger,
      receipt: () => JSON.parse(readFileSync(join(env.OC_RECEIPT_DIR, '703.json'), 'utf8')) };
  };

  it('writes a not_executed receipt when it refuses an unchanged attempt', () => {
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    const snapshot = { ...snapshotFor(703, ['oc-queued', `oc-node:${LEAF}`]),
      integrationSha: 'a'.repeat(40), implementationSha: head };
    const fingerprint = makePlan(snapshot, [], NOW).leaves[0].fingerprint;
    const h = withLedger([{ id: 'old', issue: 703, nodeId: LEAF, fingerprint, waveHash: 'w', runId: '0',
      runAttempt: '1', expiresAt: NOW, reservedUsd: 0, lane: 'provider-free', state: 'provider-free-done' }]);

    const run = h.cmd('admit-deterministic');

    expect(run.status, run.stderr).toBe(0);
    expect(h.receipt()).toMatchObject({ issue: 703, outcome: 'not_executed', reason: 'unchanged_attempt' });
    expect(readFileSync(h.env.GITHUB_OUTPUT, 'utf8')).toContain('allowed=false');
  });

  it('settles the lease in the ledger, not only the label', () => {
    const h0 = withLedger([]);
    const h = withLedger([{ id: 'live', issue: 703, nodeId: LEAF, fingerprint: h0.plan.leaves[0].fingerprint,
      waveHash: h0.plan.wave.hash, runId: '1', runAttempt: '1', expiresAt: '2099-01-01T00:00:00.000Z',
      reservedUsd: 0, lane: 'provider-free', state: 'reserved' }]);
    mkdirSync(h.env.OC_EVIDENCE_DIR, { recursive: true });
    writeFileSync(join(h.env.OC_EVIDENCE_DIR, '703.json'), JSON.stringify({
      issue: 703, wave_hash: h.plan.wave.hash, run: '1:1', provider_calls: 0, outcome: 'done', results: [{ command: 'npm run test', exit_code: 0 }] }));

    const run = h.cmd('settle-deterministic', { OC_LEASE_ID: 'live' });

    expect(run.status, run.stderr).toBe(0);
    expect(h.ledger().leases[0].state).toBe('provider-free-done');
    expect(h.ledger().programSpent).toBe(0);
  });

  it('settles a lane that never executed as not-executed, so it can run later', () => {
    const h0 = withLedger([]);
    const h = withLedger([{ id: 'live', issue: 703, nodeId: LEAF, fingerprint: h0.plan.leaves[0].fingerprint,
      waveHash: h0.plan.wave.hash, runId: '1', runAttempt: '1', expiresAt: '2099-01-01T00:00:00.000Z',
      reservedUsd: 0, lane: 'provider-free', state: 'reserved' }]);

    const run = h.cmd('settle-deterministic', { OC_LEASE_ID: 'live' });

    expect(run.status, run.stderr).toBe(0);
    expect(h.ledger().leases[0].state).toBe('not-executed');
  });
});

describe('guards the suite was not holding', () => {
  const lease = (over: Partial<Lease>): Lease => ({
    id: 'x', issue: 1, nodeId: LEAF, fingerprint: 'f', waveHash: 'w', runId: '1', runAttempt: '1',
    expiresAt: NOW, reservedUsd: 0, lane: 'provider-free', state: 'reserved', ...over,
  });

  it('refuses a receipt outcome that is not in the vocabulary', async () => {
    const { assertReceipts } = await import('../scripts/oc-dispatch-control');
    const snapshot = snapshotFor(703, ['oc-queued', `oc-node:${LEAF}`]);
    const plan = makePlan(snapshot, [], NOW);

    expect(() => assertReceipts(plan, [{ issue: 703, waveHash: plan.wave.hash, outcome: 'looks_fine_to_me' }]))
      .toThrow('diverged');
    expect(() => assertReceipts(plan, [{ issue: 703, waveHash: plan.wave.hash, outcome: 'provider_free_done' }]))
      .not.toThrow();
  });

  it('refuses a deterministic lane once every lane is occupied', async () => {
    const snapshot = snapshotFor(703, ['oc-queued', `oc-node:${LEAF}`]);
    const plan = makePlan(snapshot, [], NOW);
    const full: Ledger = {
      schema: 1, programStartedAt: NOW, programSpent: 0, dailySpent: {},
      leases: Array.from({ length: 8 }, (_, i) => lease({ id: `l${i}`, issue: 1000 + i, nodeId: `n${i}`, fingerprint: `f${i}` })),
    };
    const store = new MemoryStore(full);

    const result = await claimDeterministicLease(store, plan, snapshot, { issueNumber: 703, runId: '1', runAttempt: '1', now: NOW });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('capacity_full');
  });

  it('re-verifies the admission rather than trusting the plan it was handed', async () => {
    const snapshot = snapshotFor(703, ['oc-queued', `oc-node:${LEAF}`]);
    const plan = makePlan(snapshot, [], NOW);
    // A plan whose leaf claims a node the issue is not bound to. Trusting the
    // plan's own leaf instead of re-verifying would admit it.
    const forged = { ...plan, leaves: [{ ...plan.leaves[0], nodeId: 'cap-conservatory-collection' }] };

    await expect(claimDeterministicLease(new MemoryStore(emptyLedger()), forged as typeof plan, snapshot,
      { issueNumber: 703, runId: '1', runAttempt: '1', now: NOW })).rejects.toThrow();
  });

  it('says which field drifted when it refuses', async () => {
    const { assertAdmission } = await import('../scripts/oc-dispatch-control');
    const snapshot = snapshotFor(703, ['oc-queued', `oc-node:${LEAF}`]);
    const plan = makePlan(snapshot, [], NOW);
    // The wave hash binds the plan's own leaves, so drift has to come from the
    // world moving underneath it -- here the issue gains a label between the
    // plan job and the lane, which is what happened live on #243.
    const moved = snapshotFor(703, ['oc-queued', `oc-node:${LEAF}`, 'oc-p1']);

    expect(() => assertAdmission(plan, moved, 703, NOW)).toThrow(/drift; dispatch refused \(fingerprint /);
  });
});

describe('the lane workflow, where it has to hold', () => {
  const lane = load(readFileSync('.github/workflows/orchid-budgeted-completion-lane.yml', 'utf8')) as {
    jobs: Record<string, { needs?: string | string[]; if?: string; steps?: Array<{ if?: string; uses?: string; with?: Record<string, string>; run?: string }> }>;
  };

  it('never lets both receipt writers run for one issue', () => {
    // The old test asserted only that the job names existed. Making
    // `deterministic-preflight` unconditional created the double-upload
    // collision it is named for, and it stayed green.
    const gates = Object.fromEntries(Object.entries(lane.jobs).map(([name, job]) => [name, job.if ?? '']));
    expect(gates['budget-preflight']).toContain("provider_free != 'true'");
    expect(gates['deterministic-preflight']).toContain("provider_free == 'true'");
    // Complementary conditions on the same expression: exactly one can run.
    const provider = gates['budget-preflight'].match(/needs\.classify\.outputs\.provider_free\s*!=/);
    const deterministic = gates['deterministic-preflight'].match(/needs\.classify\.outputs\.provider_free\s*==/);
    expect(provider).not.toBeNull();
    expect(deterministic).not.toBeNull();
  });

  it('settles the deterministic lane even when the settlement throws', () => {
    const upload = lane.jobs['settle-deterministic'].steps!.at(-1)!;
    expect(upload.uses).toContain('upload-artifact');
    expect(upload.if).toBe('always()');
  });

  it('keeps a refusal auditable by uploading the not-executed receipt', () => {
    const refusal = lane.jobs['deterministic-preflight'].steps!.find(step => (step.uses ?? '').includes('upload-artifact'))!;
    expect(refusal.if).toContain("allowed == 'false'");
    expect(refusal.with!.name).toContain('oc-lane-');
  });
});


describe('a lane that cannot produce evidence stops trying', () => {
  /**
   * `not-executed` was added so that a lane which never ran did not bar its own
   * work for ever. It had no floor. An issue whose worker can never write
   * evidence -- a failing `npm ci`, a dead runner, a declared capability with no
   * local executor -- was admitted, refused, receipted and reported green on
   * every pulse of a five-minute cron, appending one lease each time.
   *
   * 288 pulses a day at 474 bytes a lease is 133 KiB a day for ONE stuck issue,
   * and the ledger passes the contents API's 1 MiB ceiling in about eight days
   * -- at which point `read()` breaks for every lane, not just this one.
   */
  const setup = () => {
    const snapshot = snapshotFor(703, ['oc-queued', `oc-node:${LEAF}`]);
    const plan = makePlan(snapshot, [], NOW);
    const fingerprint = plan.leaves.find(l => l.issueNumber === 703)!.fingerprint;
    return { snapshot, plan, fingerprint };
  };

  const claim = (store: MemoryStore, plan: ReturnType<typeof makePlan>, snapshot: Snapshot, run: string) =>
    claimDeterministicLease(store, plan, snapshot, { issueNumber: 703, runId: run, runAttempt: '1', now: NOW });

  it('admits the same unchanged work exactly NOT_EXECUTED_CEILING times', async () => {
    const { snapshot, plan, fingerprint } = setup();
    const store = new MemoryStore(emptyLedger());
    const reasons: string[] = [];

    for (let pulse = 1; pulse <= NOT_EXECUTED_CEILING + 3; pulse++) {
      const result = await claim(store, plan, snapshot, String(pulse));
      reasons.push(result.reason);
      // The worker dies without writing evidence, so settlement records exactly
      // what the reconcile path would: nothing was executed.
      if (result.allowed) await transitionLease(store, result.lease!.id, String(pulse), '1', 'not-executed');
    }

    expect(reasons.filter(r => r === 'reserved')).toHaveLength(NOT_EXECUTED_CEILING);
    expect(reasons.slice(NOT_EXECUTED_CEILING)).toEqual(['not_executed_ceiling', 'not_executed_ceiling', 'not_executed_ceiling']);
    expect(store.ledger.leases).toHaveLength(NOT_EXECUTED_CEILING);
    expect(store.ledger.leases.every(l => l.fingerprint === fingerprint && l.state === 'not-executed')).toBe(true);
  });

  it('bounds the ledger instead of appending a lease on every pulse for ever', async () => {
    const { snapshot, plan } = setup();
    const store = new MemoryStore(emptyLedger());

    for (let pulse = 1; pulse <= 50; pulse++) {
      const result = await claim(store, plan, snapshot, String(pulse));
      if (result.allowed) await transitionLease(store, result.lease!.id, String(pulse), '1', 'not-executed');
    }

    // 50 pulses is under five hours of the `*/5` cron. Unbounded, this was 50.
    expect(store.ledger.leases).toHaveLength(NOT_EXECUTED_CEILING);
  });

  it('still admits work whose fingerprint moved, because that is different work', async () => {
    const { snapshot, plan } = setup();
    const store = new MemoryStore(emptyLedger());
    for (let pulse = 1; pulse <= NOT_EXECUTED_CEILING; pulse++) {
      const result = await claim(store, plan, snapshot, String(pulse));
      await transitionLease(store, result.lease!.id, String(pulse), '1', 'not-executed');
    }
    expect((await claim(store, plan, snapshot, '9')).reason).toBe('not_executed_ceiling');

    // A new integration revision is a new fingerprint: the ceiling is per
    // unchanged attempt, not a permanent ban on the issue.
    const moved = { ...snapshot, integrationSha: 'c'.repeat(40) };
    const movedPlan = makePlan(moved, [], NOW);

    expect((await claim(store, movedPlan, moved, '10')).allowed).toBe(true);
  });
});


describe('the receipt is the audit record, so it may not be a self-report', () => {
  /** The same subprocess harness as the settlement suite above. */
  const harness = () => {
    const dir = mkdtempSync(join(tmpdir(), 'oc-settle2-')); paths.push(dir);
    const bin = join(dir, 'bin'); mkdirSync(bin);
    const gh = join(bin, 'gh');
    writeFileSync(gh, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.OC_TEST_LOG, JSON.stringify(args) + '\\n');
const path = args[1];
const method = args[args.indexOf('--method') + 1];
${settlementLedgerApi}
if (method === 'PATCH') {
  const body = fs.readFileSync(0, 'utf8');
  fs.appendFileSync(process.env.OC_TEST_LOG, 'PATCHBODY ' + body + '\\n');
  console.log('{}'); process.exit(0);
}
if (/issues\\/\\d+$/.test(path)) { console.log(JSON.stringify({ number: 703, state: 'open', title: 'deterministic work', body: null, labels: [{ name: 'oc-queued' }, { name: 'oc-node:${LEAF}' }] })); process.exit(0); }
console.log('{}');
`);
    chmodSync(gh, 0o755);
    const planDir = join(dir, 'wave'); mkdirSync(planDir);
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    const snapshot = { ...snapshotFor(703, ['oc-queued', `oc-node:${LEAF}`]),
      integrationSha: 'a'.repeat(40), implementationSha: head };
    const plan = makePlan(snapshot, [], NOW);
    writeFileSync(join(planDir, 'plan.json'), JSON.stringify(plan));
    const env = {
      ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: 'jsp1440/orchid-continuum-frontend',
      GITHUB_OUTPUT: join(dir, 'outputs'), OC_TEST_LOG: join(dir, 'requests'), OC_PLAN_DIR: planDir,
      OC_RECEIPT_DIR: join(dir, 'receipts'), OC_EVIDENCE_DIR: join(dir, 'evidence'),
      OC_WAVE_HASH: plan.wave.hash, ISSUE_NUMBER: '703', GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1',
      PROVIDER_AUTHORIZED: 'false',
    };
    installSettlementLease(env, plan);
    const writeEvidence = (evidence: Record<string, unknown>) => {
      mkdirSync(env.OC_EVIDENCE_DIR, { recursive: true });
      writeFileSync(join(env.OC_EVIDENCE_DIR, '703.json'), JSON.stringify({
        schema: 'oc.provider-free-evidence.v1', issue: 703, wave_hash: plan.wave.hash,
        run: '1:1', provider_calls: 0, provider_cost_usd: 0, results: [{ command: 'npm run test', exit_code: 0 }], ...evidence,
      }));
    };
    const settle = (extra: Record<string, string> = {}) => spawnSync(process.execPath,
      ['--import', 'tsx', resolve('scripts/oc-dispatch-runtime.ts'), 'settle-deterministic'],
      { env: { ...env, ...extra }, encoding: 'utf8' });
    const receipt = () => JSON.parse(readFileSync(join(env.OC_RECEIPT_DIR, '703.json'), 'utf8'));
    const receiptExists = () => existsSync(join(env.OC_RECEIPT_DIR, '703.json'));
    const patched = () => readFileSync(env.OC_TEST_LOG, 'utf8').trim().split('\n')
      .filter(line => line.startsWith('PATCHBODY '))
      .map(line => JSON.parse(line.slice('PATCHBODY '.length)) as { labels: string[] });
    return { env, writeEvidence, settle, receipt, receiptExists, patched };
  };

  it('does not call a run done over commands that did not exit zero', () => {
    // Correctly fenced evidence -- right issue, right wave, right run, zero
    // provider calls -- claiming `done` while carrying the proof it failed.
    // Settlement took `outcome` on the worker's word, wrote
    // `outcome: provider_free_done` into the authoritative receipt, counted the
    // two failing commands as `commands: 2`, and moved the issue to
    // `oc-validating`.
    const h = harness();
    h.writeEvidence({ outcome: 'done', results: [
      { command: 'npm run test', exit_code: 1, output_tail: ['47 tests failed'] },
      { command: 'npm run typecheck', exit_code: 2 },
    ] });
    const run = h.settle();

    expect(run.status, run.stderr).toBe(0);
    expect(h.receipt()).toMatchObject({ outcome: 'provider_free_failed', commands: 2 });
    expect(h.receipt().contradicted).toContain('npm run test (exit 1)');
    expect(h.patched().at(-1)!.labels).toContain('oc-repair');
    expect(h.patched().at(-1)!.labels).not.toContain('oc-validating');
  });

  it('never turns a self-reported failure into a pass', () => {
    // One-directional on purpose: exit codes may only move the verdict towards
    // failure. A worker that says it failed is believed without argument.
    const h = harness();
    h.writeEvidence({ outcome: 'failed', results: [{ command: 'npm run test', exit_code: 0 }] });
    h.settle();

    expect(h.receipt()).toMatchObject({ outcome: 'provider_free_failed' });
    expect(h.receipt().contradicted).toBeUndefined();
  });

  it('leaves an honest pass alone', () => {
    const h = harness();
    h.writeEvidence({ outcome: 'done', results: [{ command: 'npm run test', exit_code: 0 }] });
    h.settle();

    expect(h.receipt()).toMatchObject({ outcome: 'provider_free_done' });
    expect(h.receipt().contradicted).toBeUndefined();
  });

  it('refuses evidence whose commands carry no exit code at all', () => {
    const h = harness();
    h.writeEvidence({ outcome: 'done', results: [{ command: 'npm run test' }] });
    h.settle();

    expect(h.receipt()).toMatchObject({ outcome: 'not_executed' });
    expect(h.receipt().evidence).toContain('exit code');
  });

  it('writes the receipt before the settlement can throw, not after', () => {
    // `if: always()` on the upload promised the audit a receipt when settlement
    // throws, and `if-no-files-found: ignore` meant it silently uploaded
    // nothing: `receipt()` ran AFTER `transitionLease`, so a fencing mismatch,
    // ledger contention or any `gh` failure left no file at all. The test that
    // carried this name only asserted `upload.if === 'always()'` on a YAML node,
    // which is true of a workflow whose step has nothing to upload.
    const h = harness();
    h.writeEvidence({ outcome: 'done', results: [{ command: 'npm run test', exit_code: 0 }] });
    // A lease id the ledger cannot resolve must be refused before relabelling.
    const run = h.settle({ OC_LEASE_ID: 'a-lease-this-ledger-does-not-have' });

    expect(run.status).not.toBe(0);
    expect(h.receiptExists(), 'settlement threw and left the audit no receipt').toBe(true);
    expect(h.patched(), 'a foreign lease must not relabel the issue').toEqual([]);
    expect(h.receipt()).toMatchObject({ issue: 703, outcome: 'dispatch_refused', providerCalls: 0 });
  });
});


describe('reconciling an expired lease does not bury the issue', () => {
  /**
   * The other half of the expiry defect, and the half that needs the real
   * runtime: `beforeRelease` stripped `oc-queued` and added `oc-blocked` for
   * EVERY lane. `oc-blocked` is in the selector's BLOCKED_LABELS, so the issue
   * became unselectable -- on the strength of an attempt that produced no
   * evidence either way.
   */
  const harness = (lease: Partial<Lease>, options: { raceState?: Lease['state']; labels?: string[]; body?: string } = {}) => {
    const dir = mkdtempSync(join(tmpdir(), 'oc-reconcile-')); paths.push(dir);
    const bin = join(dir, 'bin'); mkdirSync(bin);
    const ledgerFile = join(dir, 'ledger.json');
    const ledger: Ledger = { schema: 1, programStartedAt: NOW, programSpent: 0, dailySpent: {},
      leases: [{ id: 'expired', issue: 703, nodeId: LEAF, fingerprint: 'f', waveHash: 'w',
        runId: '99', runAttempt: '1', expiresAt: '2020-01-01T00:00:00.000Z',
        reservedUsd: 0, lane: 'provider-free', state: 'reserved', ...lease } as Lease] };
    writeFileSync(ledgerFile, JSON.stringify(ledger));
    const gh = join(bin, 'gh');
    writeFileSync(gh, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const path = args[1];
const method = args[args.indexOf('--method') + 1];
if (path.includes('contents/.oc/dispatch-ledger.json')) {
  if (method === 'PUT') {
    const body = JSON.parse(fs.readFileSync(0, 'utf8'));
    fs.writeFileSync(process.env.OC_LEDGER_FILE, Buffer.from(body.content, 'base64').toString());
    console.log('{}'); process.exit(0);
  }
  console.log(JSON.stringify({ sha: 'v1', content: Buffer.from(fs.readFileSync(process.env.OC_LEDGER_FILE)).toString('base64') }));
  process.exit(0);
}
if (/actions\\/runs\\/\\d+$/.test(path)) {
  if (process.env.OC_RACE_STATE) {
    const ledger = JSON.parse(fs.readFileSync(process.env.OC_LEDGER_FILE, 'utf8'));
    ledger.leases[0].state = process.env.OC_RACE_STATE;
    fs.writeFileSync(process.env.OC_LEDGER_FILE, JSON.stringify(ledger));
  }
  console.log(JSON.stringify({ status: 'completed' })); process.exit(0);
}
if (method === 'PATCH') {
  fs.appendFileSync(process.env.OC_TEST_LOG, 'PATCHBODY ' + fs.readFileSync(0, 'utf8') + '\\n');
  console.log('{}'); process.exit(0);
}
if (/issues\\/\\d+$/.test(path)) { console.log(JSON.stringify({ number: 703, state: 'open', title: 't', body: process.env.OC_ISSUE_BODY || null, labels: JSON.parse(process.env.OC_ISSUE_LABELS) })); process.exit(0); }
console.log('{}');
`);
    chmodSync(gh, 0o755);
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`,
      GITHUB_REPOSITORY: 'jsp1440/orchid-continuum-frontend', GITHUB_OUTPUT: join(dir, 'outputs'),
      OC_TEST_LOG: join(dir, 'requests'), OC_LEDGER_FILE: ledgerFile,
      OC_RACE_STATE: options.raceState || '', OC_ISSUE_BODY: options.body || '',
      OC_ISSUE_LABELS: JSON.stringify((options.labels || ['oc-running', `oc-node:${LEAF}`]).map(name => ({ name }))) };
    writeFileSync(env.OC_TEST_LOG, '');
    const reconcile = () => spawnSync(process.execPath,
      ['--import', 'tsx', resolve('scripts/oc-dispatch-runtime.ts'), 'reconcile'], { env, encoding: 'utf8' });
    const labels = () => readFileSync(env.OC_TEST_LOG, 'utf8').trim().split('\n').filter(Boolean)
      .filter(line => line.startsWith('PATCHBODY '))
      .map(line => (JSON.parse(line.slice('PATCHBODY '.length)) as { labels: string[] }).labels);
    const stored = () => JSON.parse(readFileSync(ledgerFile, 'utf8')) as Ledger;
    return { reconcile, labels, stored };
  };

  it('returns an expired deterministic issue to the queue instead of blocking it', () => {
    const h = harness({ lane: 'provider-free', reservedUsd: 0 });
    const run = h.reconcile();

    expect(run.status, run.stderr).toBe(0);
    expect(h.labels().at(-1)).toContain('oc-queued');
    expect(h.labels().at(-1)).not.toContain('oc-blocked');
    expect(h.stored().leases[0].state).toBe('not-executed');
  });

  it('still blocks an expired provider lease, which was doing something unseen', () => {
    const h = harness({ lane: 'provider', reservedUsd: 4 });
    const run = h.reconcile();

    expect(run.status, run.stderr).toBe(0);
    expect(h.labels().at(-1)).toContain('oc-blocked');
    expect(h.labels().at(-1)).not.toContain('oc-queued');
    expect(h.stored().leases[0].state).toBe('blocked');
  });
  it('uses a concurrent deterministic settlement for labels, without claiming product completion', () => {
    const h = harness({}, { raceState: 'provider-free-done' });
    const run = h.reconcile();
    expect(run.status, run.stderr).toBe(0);
    expect(h.labels().at(-1)).toContain('oc-validating');
    expect(h.labels().at(-1)).not.toContain('oc-queued');
    expect(h.labels().at(-1)).not.toContain('oc-done');
    expect(h.stored().leases[0].state).toBe('provider-free-done');
  });
  it.each([
    { labels: ['oc-running', 'oc-owner-gate'] },
    { body: 'OC-AUTO-HOLD: true' },
  ])('retains an independently applied owner/publication hold during expiry recovery: %j', options => {
    const h = harness({}, options);
    const run = h.reconcile();
    expect(run.status, run.stderr).toBe(0);
    expect(h.labels().at(-1)).toContain('oc-owner-gate');
    expect(h.labels().at(-1)).not.toContain('oc-running');
    expect(h.labels().at(-1)).not.toContain('oc-queued');
    expect(h.stored().leases[0].state).toBe('not-executed');
  });
});


describe('the labels a settlement writes are the ones the selector can act on', () => {
  /**
   * Round 6 found that sending a `not_executed` outcome to `oc-blocked` instead
   * of `oc-queued` left the full 2485-test suite green. That is the burial
   * defect this whole lane exists to remove, unpinned at the exact line the
   * narrative turns on: every test asserted the receipt's `outcome`, and none
   * asserted the label that decides whether the work is ever seen again.
   */
  const harness = () => {
    const dir = mkdtempSync(join(tmpdir(), 'oc-labels-')); paths.push(dir);
    const bin = join(dir, 'bin'); mkdirSync(bin);
    const gh = join(bin, 'gh');
    writeFileSync(gh, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const path = args[1];
const method = args[args.indexOf('--method') + 1];
${settlementLedgerApi}
if (method === 'PATCH') {
  fs.appendFileSync(process.env.OC_TEST_LOG, 'PATCHBODY ' + fs.readFileSync(0, 'utf8') + '\\n');
  console.log('{}'); process.exit(0);
}
if (/issues\\/\\d+$/.test(path)) { console.log(JSON.stringify({ number: 703, state: 'open', title: 't', body: null, labels: [{ name: 'oc-queued' }, { name: 'oc-node:${LEAF}' }] })); process.exit(0); }
console.log('{}');
`);
    chmodSync(gh, 0o755);
    const planDir = join(dir, 'wave'); mkdirSync(planDir);
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    const snapshot = { ...snapshotFor(703, ['oc-queued', `oc-node:${LEAF}`]),
      integrationSha: 'a'.repeat(40), implementationSha: head };
    const plan = makePlan(snapshot, [], NOW);
    writeFileSync(join(planDir, 'plan.json'), JSON.stringify(plan));
    const env = {
      ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: 'jsp1440/orchid-continuum-frontend',
      GITHUB_OUTPUT: join(dir, 'outputs'), OC_TEST_LOG: join(dir, 'requests'), OC_PLAN_DIR: planDir,
      OC_RECEIPT_DIR: join(dir, 'receipts'), OC_EVIDENCE_DIR: join(dir, 'evidence'),
      OC_WAVE_HASH: plan.wave.hash, ISSUE_NUMBER: '703', GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1',
      PROVIDER_AUTHORIZED: 'false',
    };
    installSettlementLease(env, plan);
    writeFileSync(env.OC_TEST_LOG, '');
    const writeEvidence = (evidence: Record<string, unknown>) => {
      mkdirSync(env.OC_EVIDENCE_DIR, { recursive: true });
      writeFileSync(join(env.OC_EVIDENCE_DIR, '703.json'), JSON.stringify({
        schema: 'oc.provider-free-evidence.v1', issue: 703, wave_hash: plan.wave.hash,
        run: '1:1', provider_calls: 0, provider_cost_usd: 0, results: [{ command: 'npm run test', exit_code: 0 }], ...evidence,
      }));
    };
    const settle = () => spawnSync(process.execPath,
      ['--import', 'tsx', resolve('scripts/oc-dispatch-runtime.ts'), 'settle-deterministic'], { env, encoding: 'utf8' });
    const labels = () => readFileSync(env.OC_TEST_LOG, 'utf8').trim().split('\n').filter(Boolean)
      .filter(line => line.startsWith('PATCHBODY '))
      .map(line => (JSON.parse(line.slice('PATCHBODY '.length)) as { labels: string[] }).labels).at(-1)!;
    const receipt = () => JSON.parse(readFileSync(join(env.OC_RECEIPT_DIR, '703.json'), 'utf8'));
    return { writeEvidence, settle, labels, receipt };
  };

  it('returns a lane that never executed to the queue, not to a blocked label', () => {
    const h = harness();
    // No evidence written at all: the worker died before it could.
    h.settle();

    expect(h.receipt()).toMatchObject({ outcome: 'not_executed' });
    expect(h.labels()).toContain('oc-queued');
    for (const buried of ['oc-blocked', 'oc-validating', 'oc-repair', 'oc-done']) {
      expect(h.labels(), `not_executed must not land on ${buried}`).not.toContain(buried);
    }
  });

  it('sends a passing run to validation and nothing else', () => {
    const h = harness();
    h.writeEvidence({ outcome: 'done', results: [{ command: 'npm run test', exit_code: 0 }] });
    h.settle();

    expect(h.labels()).toContain('oc-validating');
    expect(h.labels()).not.toContain('oc-queued');
    expect(h.labels()).not.toContain('oc-repair');
  });

  it('sends a failing run to repair and nothing else', () => {
    const h = harness();
    h.writeEvidence({ outcome: 'failed', results: [{ command: 'npm run test', exit_code: 1 }] });
    h.settle();

    expect(h.labels()).toContain('oc-repair');
    expect(h.labels()).not.toContain('oc-validating');
    // The documented owner decision: NOT re-queued. If this ever changes, the
    // paragraph at oc-dispatch-runtime.ts explaining why must change with it.
    expect(h.labels()).not.toContain('oc-queued');
  });
});

describe('the ceiling is a number, and it is the number the lane documents', () => {
  it('is three, not merely "some constant"', () => {
    // `NOT_EXECUTED_CEILING = 3 -> 10` survived the suite, because every test
    // that exercised the ceiling counted up to the constant itself.
    expect(NOT_EXECUTED_CEILING).toBe(3);
  });
});


describe('the lane jobs declare the permissions they use', () => {
  /**
   * Removing `deterministic-preflight`'s whole `permissions:` block left the
   * suite green. Without it the job inherits the workflow-level `actions: write`
   * and `id-token: write`, which it never uses -- an over-broad token on the one
   * job that touches the durable ledger.
   */
  const lane = load(readFileSync('.github/workflows/orchid-budgeted-completion-lane.yml', 'utf8')) as {
    permissions?: Record<string, string>;
    jobs: Record<string, { permissions?: Record<string, string> }>;
  };

  it.each(['deterministic-preflight', 'provider-free-worker', 'settle-deterministic'])(
    '%s declares its own permissions rather than inheriting the wide set', job => {
      const declared = lane.jobs[job].permissions;
      expect(declared, `${job} inherits the workflow-level permissions`).toBeDefined();
      // The two it must never pick up by inheritance.
      expect(Object.keys(declared!)).not.toContain('actions');
      expect(Object.keys(declared!)).not.toContain('id-token');
    });

  it('and the workflow-level set really is wider, so the declarations matter', () => {
    expect(Object.keys(lane.permissions ?? {})).toEqual(expect.arrayContaining(['actions', 'id-token']));
  });
});


describe('a lane that hit the ceiling stops arriving', () => {
  /**
   * Removing the relabel left the suite green: the claim would go on being
   * refused, receipted and re-planned on every pulse of a five-minute cron
   * for ever. The ceiling is only a bound if the issue also leaves the queue.
   */
  const harness = () => {
    const dir = mkdtempSync(join(tmpdir(), 'oc-ceiling-')); paths.push(dir);
    const bin = join(dir, 'bin'); mkdirSync(bin);
    const ledgerFile = join(dir, 'ledger.json');
    const planDir = join(dir, 'wave'); mkdirSync(planDir);
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    const snapshot = { ...snapshotFor(703, ['oc-queued', `oc-node:${LEAF}`]),
      integrationSha: 'a'.repeat(40), implementationSha: head };
    const plan = makePlan(snapshot, [], NOW);
    writeFileSync(join(planDir, 'plan.json'), JSON.stringify(plan));
    const fingerprint = plan.leaves.find(l => l.issueNumber === 703)!.fingerprint;
    // Already at the ceiling, all of them `not-executed`.
    writeFileSync(ledgerFile, JSON.stringify({
      schema: 1, programStartedAt: NOW, programSpent: 0, dailySpent: {},
      leases: Array.from({ length: NOT_EXECUTED_CEILING }, (_, i) => ({
        id: `spent-${i}`, issue: 703, nodeId: LEAF, fingerprint, waveHash: plan.wave.hash,
        runId: String(i), runAttempt: '1', expiresAt: '2020-01-01T00:00:00.000Z',
        reservedUsd: 0, lane: 'provider-free', state: 'not-executed',
      })),
    }));
    const gh = join(bin, 'gh');
    writeFileSync(gh, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const path = args[1];
const method = args[args.indexOf('--method') + 1];
if (path.includes('contents/.oc/dispatch-ledger.json')) {
  if (method === 'PUT') { const b = JSON.parse(fs.readFileSync(0, 'utf8'));
    fs.writeFileSync(process.env.OC_LEDGER_FILE, Buffer.from(b.content, 'base64').toString());
    console.log('{}'); process.exit(0); }
  console.log(JSON.stringify({ sha: 'v1', content: Buffer.from(fs.readFileSync(process.env.OC_LEDGER_FILE)).toString('base64') }));
  process.exit(0);
}
if (method === 'PATCH') {
  fs.appendFileSync(process.env.OC_TEST_LOG, 'PATCHBODY ' + fs.readFileSync(0, 'utf8') + '\\n');
  console.log('{}'); process.exit(0);
}
if (/issues\\/\\d+$/.test(path)) { console.log(JSON.stringify({ number: 703, state: 'open', title: 't', body: null, labels: [{ name: 'oc-queued' }, { name: 'oc-node:${LEAF}' }] })); process.exit(0); }
if (/git\\/ref\\/heads\\//.test(path)) { console.log(JSON.stringify({ object: { sha: '${'a'.repeat(40)}' } })); process.exit(0); }
// The runtime re-derives the snapshot and refuses on drift, so the listing
// has to carry the same issue the plan was built from. One page, then empty.
if (path.includes('/issues?') && /[?&]page=1(&|$)/.test(path)) {
  console.log(JSON.stringify([{ number: 703, state: 'open', title: 'deterministic work', body: null,
    labels: [{ name: 'oc-queued' }, { name: 'oc-node:${LEAF}' }] }]));
  process.exit(0);
}
if (path.includes('?')) { console.log('[]'); process.exit(0); }
console.log('{}');
`);
    chmodSync(gh, 0o755);
    const env = {
      ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: 'jsp1440/orchid-continuum-frontend',
      GITHUB_OUTPUT: join(dir, 'outputs'), OC_TEST_LOG: join(dir, 'requests'), OC_PLAN_DIR: planDir,
      OC_RECEIPT_DIR: join(dir, 'receipts'), OC_EVIDENCE_DIR: join(dir, 'evidence'),
      OC_LEDGER_FILE: ledgerFile, OC_WAVE_HASH: plan.wave.hash, ISSUE_NUMBER: '703',
      GITHUB_RUN_ID: '99', GITHUB_RUN_ATTEMPT: '1', PROVIDER_AUTHORIZED: 'false', GITHUB_SHA: head,
    };
    writeFileSync(env.OC_TEST_LOG, '');
    const admit = () => spawnSync(process.execPath,
      ['--import', 'tsx', resolve('scripts/oc-dispatch-runtime.ts'), 'admit-deterministic'], { env, encoding: 'utf8' });
    const labels = () => readFileSync(env.OC_TEST_LOG, 'utf8').trim().split('\n').filter(Boolean)
      .filter(line => line.startsWith('PATCHBODY '))
      .map(line => (JSON.parse(line.slice('PATCHBODY '.length)) as { labels: string[] }).labels);
    const receipt = () => JSON.parse(readFileSync(join(env.OC_RECEIPT_DIR, '703.json'), 'utf8'));
    return { admit, labels, receipt };
  };

  it('takes the issue out of the queue when the claim is refused at the ceiling', () => {
    const h = harness();
    const run = h.admit();

    expect(run.status, run.stderr).toBe(0);
    expect(h.receipt()).toMatchObject({ outcome: 'not_executed', reason: 'not_executed_ceiling' });
    const last = h.labels().at(-1);
    expect(last, 'the ceiling must relabel, or the issue arrives again every pulse').toBeDefined();
    expect(last).toContain('oc-blocked');
    expect(last).not.toContain('oc-queued');
  });

});


describe('the report reads merged state from the API, not from a fixture', () => {
  /**
   * `merged: Boolean(merged_at)` could be replaced with `merged: false` and the
   * suite stayed green, because every test that asserted "(merged)" built the
   * `Pull` object by hand. That is the same untested-production-wiring shape as
   * `pendingNotReachingAdmission: []`: the behaviour is pinned, the wiring that
   * feeds it is not. This runs the real `plan` command against a fake `gh`.
   */
  it('prints (merged) for a PR the API reports as merged', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oc-merged-')); paths.push(dir);
    const bin = join(dir, 'bin'); mkdirSync(bin);
    const gh = join(bin, 'gh');
    writeFileSync(gh, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const path = args[1];
if (path.includes('contents/.oc/dispatch-ledger.json')) { console.error('HTTP 404'); process.exit(1); }
if (/git\\/ref\\/heads\\//.test(path)) { console.log(JSON.stringify({ object: { sha: '${'a'.repeat(40)}' } })); process.exit(0); }
if (path.includes('/issues?') && /[?&]page=1(&|$)/.test(path)) {
  console.log(JSON.stringify([{ number: 703, state: 'open', title: 'deterministic work', body: null,
    labels: [{ name: 'oc-queued' }] }]));
  process.exit(0);
}
if (path.includes('/pulls?') && /[?&]page=1(&|$)/.test(path)) {
  // The shape the real API returns: closed, with a merge timestamp.
  console.log(JSON.stringify([{ number: 705, state: 'closed', merged_at: '2026-09-19T02:01:41Z',
    body: 'Closes #703.', head: { ref: 'oc-auto-703-x', sha: '${'c'.repeat(40)}' } }]));
  process.exit(0);
}
if (path.includes('?')) { console.log('[]'); process.exit(0); }
console.log('{}');
`);
    chmodSync(gh, 0o755);
    const outDir = join(dir, 'out'); mkdirSync(outDir);
    const summary = join(dir, 'summary');
    writeFileSync(summary, '');
    const env = {
      ...process.env, PATH: `${bin}:${process.env.PATH}`,
      GITHUB_REPOSITORY: 'jsp1440/orchid-continuum-frontend',
      GITHUB_OUTPUT: join(dir, 'outputs'), OC_PLAN_DIR: outDir,
      GITHUB_STEP_SUMMARY: summary, PROVIDER_AUTHORIZED: 'false',
    };
    const run = spawnSync(process.execPath,
      ['--import', 'tsx', resolve('scripts/oc-dispatch-runtime.ts'), 'plan'], { env, encoding: 'utf8' });

    expect(run.status, run.stderr).toBe(0);
    const printed = readFileSync(summary, 'utf8');
    expect(printed).toContain('#705 (merged)');
    expect(printed).toContain('already merged');
    expect(printed).not.toContain('#705 (closed)');
  });
});
