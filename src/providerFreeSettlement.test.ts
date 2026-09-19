import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { load } from 'js-yaml';
import {
  claimDeterministicLease, isActive, laneOf, reconcileExpired, transitionLease, validateLedger,
  RECEIPT_OUTCOMES, type Issue, type Ledger, type Lease, type LeaseStore, type Snapshot,
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

  it('expires a deterministic lease as failed, not as blocked', async () => {
    const store = new MemoryStore(ledgerWith(lease({ id: 'd', lane: 'provider-free', reservedUsd: 0, expiresAt: '2020-01-01T00:00:00.000Z' })));
    await reconcileExpired(store, NOW, async () => true);

    expect(store.ledger.leases[0].state).toBe('provider-free-failed');
    expect(isActive(store.ledger.leases[0])).toBe(false);
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
  const harness = () => {
    const dir = mkdtempSync(join(tmpdir(), 'oc-settle-')); paths.push(dir);
    const bin = join(dir, 'bin'); mkdirSync(bin);
    const gh = join(bin, 'gh');
    writeFileSync(gh, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.OC_TEST_LOG, JSON.stringify(args) + '\\n');
const path = args[1];
const method = args[args.indexOf('--method') + 1];
if (path.includes('contents/.oc/dispatch-ledger.json')) { console.error('HTTP 404'); process.exit(1); }
if (method === 'PATCH') {
  // The body arrives on stdin via \`--input -\`, not in argv.
  const body = fs.readFileSync(0, 'utf8');
  fs.appendFileSync(process.env.OC_TEST_LOG, 'PATCHBODY ' + body + '\\n');
  console.log('{}'); process.exit(0);
}
if (/issues\\/\\d+$/.test(path)) { console.log(JSON.stringify({ number: 703, state: 'open', title: 'deterministic work', body: null, labels: [{ name: 'oc-queued' }, { name: 'oc-node:${LEAF}' }] })); process.exit(0); }
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
      GITHUB_OUTPUT: join(dir, 'outputs'), OC_TEST_LOG: join(dir, 'requests'), OC_PLAN_DIR: planDir,
      OC_RECEIPT_DIR: join(dir, 'receipts'), OC_EVIDENCE_DIR: join(dir, 'evidence'),
      OC_WAVE_HASH: plan.wave.hash, ISSUE_NUMBER: '703', GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1',
      PROVIDER_AUTHORIZED: 'false',
    };
    // Evidence as the executor actually writes it, so a test must opt out of the
    // fencing fields rather than accidentally omit them.
    const writeEvidence = (evidence: Record<string, unknown>) => {
      mkdirSync(env.OC_EVIDENCE_DIR, { recursive: true });
      writeFileSync(join(env.OC_EVIDENCE_DIR, '703.json'), JSON.stringify({
        schema: 'oc.provider-free-evidence.v1', issue: 703, wave_hash: plan.wave.hash,
        run: '1:1', provider_calls: 0, provider_cost_usd: 0, results: [], ...evidence,
      }));
    };
    const writeRaw = (body: string) => {
      mkdirSync(env.OC_EVIDENCE_DIR, { recursive: true });
      writeFileSync(join(env.OC_EVIDENCE_DIR, '703.json'), body);
    };
    const settle = () => spawnSync(process.execPath,
      ['--import', 'tsx', resolve('scripts/oc-dispatch-runtime.ts'), 'settle-deterministic'], { env, encoding: 'utf8' });
    const receipt = () => JSON.parse(readFileSync(join(env.OC_RECEIPT_DIR, '703.json'), 'utf8'));
    const patched = () => readFileSync(env.OC_TEST_LOG, 'utf8').trim().split('\n')
      .filter(line => line.startsWith('PATCHBODY '))
      .map(line => JSON.parse(line.slice('PATCHBODY '.length)) as { labels: string[] });
    return { env, writeEvidence, writeRaw, settle, receipt, patched };
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
      issue: 703, wave_hash: h.plan.wave.hash, run: '1:1', provider_calls: 0, outcome: 'done', results: [] }));

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
