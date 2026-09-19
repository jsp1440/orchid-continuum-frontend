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
    issues: [{ number, state: 'open', title: 'deterministic work', body: null, labels: labels.map(name => ({ name })) }],
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

const emptyLedger = (): Ledger => ({ schema: 1, programStartedAt: NOW, programSpent: 0, dailySpent: {}, leases: [] });

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
if (/issues\\/\\d+$/.test(path)) { console.log(JSON.stringify({ number: 703, state: 'open', title: 't', body: null, labels: [{ name: 'oc-queued' }, { name: 'oc-node:${LEAF}' }] })); process.exit(0); }
console.log('{}');
`);
    chmodSync(gh, 0o755);
    const planDir = join(dir, 'wave'); mkdirSync(planDir);
    const snapshot = snapshotFor(703, ['oc-queued', `oc-node:${LEAF}`]);
    const plan = makePlan(snapshot, [], NOW);
    writeFileSync(join(planDir, 'plan.json'), JSON.stringify(plan));
    const env = {
      ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: 'jsp1440/orchid-continuum-frontend',
      GITHUB_OUTPUT: join(dir, 'outputs'), OC_TEST_LOG: join(dir, 'requests'), OC_PLAN_DIR: planDir,
      OC_RECEIPT_DIR: join(dir, 'receipts'), OC_EVIDENCE_DIR: join(dir, 'evidence'),
      OC_WAVE_HASH: plan.wave.hash, ISSUE_NUMBER: '703', GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1',
      PROVIDER_AUTHORIZED: 'false',
    };
    const writeEvidence = (evidence: unknown) => {
      mkdirSync(env.OC_EVIDENCE_DIR, { recursive: true });
      writeFileSync(join(env.OC_EVIDENCE_DIR, '703.json'), JSON.stringify(evidence));
    };
    const settle = () => spawnSync(process.execPath,
      ['--import', 'tsx', resolve('scripts/oc-dispatch-runtime.ts'), 'settle-deterministic'], { env, encoding: 'utf8' });
    const receipt = () => JSON.parse(readFileSync(join(env.OC_RECEIPT_DIR, '703.json'), 'utf8'));
    const patched = () => readFileSync(env.OC_TEST_LOG, 'utf8').trim().split('\n')
      .filter(line => line.startsWith('PATCHBODY '))
      .map(line => JSON.parse(line.slice('PATCHBODY '.length)) as { labels: string[] });
    return { env, writeEvidence, settle, receipt, patched };
  };

  it('records a run that executed and passed as provider_free_done, never as provider_not_authorized', () => {
    const h = harness();
    h.writeEvidence({ schema: 'oc.provider-free-evidence.v1', issue: 703, outcome: 'done', provider_calls: 0,
      results: [{ command: 'npm run test', exit_code: 0 }] });
    const run = h.settle();

    expect(run.status, run.stderr).toBe(0);
    expect(h.receipt()).toMatchObject({ issue: 703, outcome: 'provider_free_done', providerCalls: 0, providerCostUsd: 0 });
    expect(JSON.stringify(h.receipt())).not.toContain('provider_not_authorized');
  });

  it('moves a passing issue to validation rather than claiming it done', () => {
    const h = harness();
    h.writeEvidence({ issue: 703, outcome: 'done', provider_calls: 0, results: [] });
    h.settle();

    const labels = h.patched().at(-1)!.labels;
    expect(labels).toContain('oc-validating');
    expect(labels).not.toContain('oc-done');
    expect(labels).not.toContain('oc-queued');
  });

  it('records a run that executed and failed as provider_free_failed, and returns it for repair', () => {
    const h = harness();
    h.writeEvidence({ issue: 703, outcome: 'failed', provider_calls: 0, results: [{ command: 'npm run test', exit_code: 1 }] });
    const run = h.settle();

    expect(run.status, run.stderr).toBe(0);
    expect(h.receipt()).toMatchObject({ outcome: 'provider_free_failed' });
    const labels = h.patched().at(-1)!.labels;
    expect(labels).toContain('oc-repair');
    expect(labels).toContain('oc-queued');
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

  it('refuses evidence claiming a provider call', () => {
    const h = harness();
    h.writeEvidence({ issue: 703, outcome: 'done', provider_calls: 1, results: [] });
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
