// `oc-runtime-backoff` was terminal: the lane parked an issue when the provider
// chain was unavailable, settlement recorded a `runtime-backoff` lease, and no
// code path ever requeued it (#238, parked since 09-05). These pin the bounded
// exit: an exponential retry time on the lease, a single requeue into ordinary
// admission once it passes, dead-letter after MAX_ABANDONED_ATTEMPTS, and a
// recorded conflict -- not a requeue -- for an issue labelled both queued and
// backed off. Budgets, provider slots and admission are unchanged and still
// gate the requeued work.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  MAX_ABANDONED_ATTEMPTS, RUNTIME_BACKOFF_BASE_MS, claimLease, effectiveBackoffUntil, makePlan, providerCapacityFromEnvironment,
  runtimeBackoffDecisions, runtimeBackoffDelayMs, transitionLease, validateLedger,
  type Issue, type Lease, type Ledger, type LeaseStore, type Snapshot,
} from '../scripts/oc-dispatch-control';
import { reconcileRuntimeBackoff } from '../scripts/oc-dispatch-runtime';
import type { CompletionNode } from './lib/completion-graph/types';

const T0 = '2026-09-30T12:00:00.000Z';
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();
const issue = (number: number, labels: string[]): Issue => ({ number, state: 'open', title: `Task ${number}`, body: 'Bounded acceptance',
  labels: labels.map(name => ({ name })) });
function fixture(issues: Issue[]) {
  const node = (id: string, number: number): CompletionNode => ({ id, parentId: 'root', name: id, type: 'acceptance_gate', status: 'MISSING',
    threeLevels: { codeComplete: 'NOT_MET', integratedComplete: 'NOT_MET', productComplete: 'NOT_MET' },
    evidence: [], issues: [`#${number}`], nextAction: 'Implement bounded gate', lastUpdated: T0, children: [] });
  const root: CompletionNode = { ...node('root', 0), parentId: null, children: issues.map(i => node(`leaf-${i.number}`, i.number)) };
  const snapshot: Snapshot = { issues, prs: [], integrationSha: 'a'.repeat(40), implementationSha: 'b'.repeat(40), material: { architecture: 'current' } };
  return { root, snapshot };
}
class MemoryStore implements LeaseStore {
  version = 0;
  ledger: Ledger;
  constructor(ledger: Partial<Ledger> = {}) {
    this.ledger = { schema: 1, programStartedAt: '2026-09-29T00:00:00.000Z', programSpent: 0, dailySpent: {}, leases: [], ...ledger };
  }
  async read() { return { version: String(this.version), ledger: structuredClone(this.ledger) }; }
  async compareAndSwap(version: string, ledger: Ledger) {
    if (version !== String(this.version)) return false;
    this.version++; this.ledger = structuredClone(ledger); return true;
  }
}
const backoffLease = (issueNumber: number, n: number, overrides: Partial<Lease> = {}): Lease => ({
  id: `b-${issueNumber}-${n}`, issue: issueNumber, nodeId: `leaf-${issueNumber}`, fingerprint: `f-${issueNumber}-${n}`, waveHash: 'w'.repeat(64),
  runId: String(1000 + n), runAttempt: '1', expiresAt: at(-600), reservedUsd: 0.5, lane: 'provider', state: 'runtime-backoff',
  backoffUntil: at(-60), ...overrides });
const relabel = (i: Issue, remove: string, add: string): Issue =>
  ({ ...i, labels: [...i.labels.filter(l => l.name !== remove), { name: add }] });
const claim = (store: LeaseStore, plan: ReturnType<typeof makePlan>, snapshot: Snapshot, root: CompletionNode, now: string, runId: string) =>
  claimLease(store, plan, snapshot, { issueNumber: 1, runId, runAttempt: '1', providerAuthorized: true, requestedUsd: 0.5, now }, root);

describe('runtime backoff has an expiry, a bound and a requeue', () => {
  it('settlement stores an exponential backoffUntil on the lease', async () => {
    expect([1, 2, 3, 20].map(runtimeBackoffDelayMs)).toEqual([30, 60, 120, 480].map(m => m * 60_000));
    const store = new MemoryStore({ leases: [backoffLease(1, 1), { ...backoffLease(1, 2), state: 'running', backoffUntil: undefined, expiresAt: at(90) }] });
    const lease = await transitionLease(store, 'b-1-2', '1002', '1', 'runtime-backoff', { requireActive: true, now: T0 });
    // Second backoff for this issue: 30 min x 2^1.
    expect(lease?.backoffUntil).toBe(at(60));
    expect(() => validateLedger(store.ledger)).not.toThrow();
    // A retry time on anything but a backoff is malformed accounting.
    expect(() => validateLedger({ ...store.ledger, leases: [{ ...backoffLease(1, 1), state: 'blocked' }] })).toThrow('Malformed lease');
  });

  it('times a lease settled before backoffUntil existed from its expiry, never earlier', () => {
    const legacy = backoffLease(1, 1, { backoffUntil: undefined, expiresAt: '2026-09-05T10:00:00.000Z' });
    expect(effectiveBackoffUntil(legacy, [legacy])).toBe(new Date(Date.parse(legacy.expiresAt) + RUNTIME_BACKOFF_BASE_MS).toISOString());
  });

  it('requeues an expired backoff once, and leaves an unexpired one parked', () => {
    const { snapshot } = fixture([issue(1, ['oc-runtime-backoff']), issue(2, ['oc-runtime-backoff'])]);
    const leases = [backoffLease(1, 1, { backoffUntil: at(-1) }), backoffLease(2, 1, { backoffUntil: at(1) })];
    const first = runtimeBackoffDecisions(snapshot, leases, T0);
    expect(first).toEqual([
      { issue: 1, attempts: 1, action: 'requeue', backoffUntil: at(-1) },
      { issue: 2, attempts: 1, action: 'wait', backoffUntil: at(1) },
    ]);
    // Applying the requeue removes the backoff label, so the next pass does not requeue it again.
    const after = { ...snapshot, issues: [relabel(snapshot.issues[0], 'oc-runtime-backoff', 'oc-queued'), snapshot.issues[1]] };
    expect(runtimeBackoffDecisions(after, leases, at(5)).filter(d => d.action === 'requeue').map(d => d.issue)).toEqual([2]);
    expect(runtimeBackoffDecisions(after, leases, at(5)).some(d => d.issue === 1)).toBe(false);
  });

  it(`parks the ${MAX_ABANDONED_ATTEMPTS + 1}th attempt as dead_letter with an actionable follow-up`, () => {
    const { snapshot } = fixture([issue(1, ['oc-runtime-backoff'])]);
    const leases = Array.from({ length: MAX_ABANDONED_ATTEMPTS }, (_, n) => backoffLease(1, n + 1));
    const [decision] = runtimeBackoffDecisions(snapshot, leases, T0);
    expect(decision).toMatchObject({ issue: 1, attempts: MAX_ABANDONED_ATTEMPTS, action: 'dead_letter', reason: 'dead_letter' });
    // It must not promise that relabelling retries: an unchanged fingerprint is refused.
    expect(decision.action === 'dead_letter' && decision.followUp).toMatch(/Relabelling alone will not retry it/);
    expect(decision.action === 'dead_letter' && decision.followUp).toMatch(/unchanged_attempt/);
    expect(decision.action === 'dead_letter' && decision.followUp).toMatch(/oc-autonomous-integration head, an edit to the issue title or body/);
    // One fewer attempt is still an ordinary requeue.
    expect(runtimeBackoffDecisions(snapshot, leases.slice(1), T0)[0]).toMatchObject({ action: 'requeue', attempts: MAX_ABANDONED_ATTEMPTS - 1 });
  });

  it('records a queued-and-backoff conflict, skips it, and still decides every other issue', () => {
    const { snapshot } = fixture([issue(238, ['oc-queued', 'oc-p1', 'oc-runtime-backoff']), issue(3, ['oc-runtime-backoff']), issue(4, ['oc-runtime-backoff'])]);
    const leases = [backoffLease(3, 1), backoffLease(4, 1), backoffLease(4, 2), backoffLease(4, 3)];
    expect(runtimeBackoffDecisions(snapshot, leases, T0)).toEqual([
      { issue: 3, attempts: 1, action: 'requeue', backoffUntil: at(-60) },
      { issue: 4, attempts: 3, action: 'dead_letter', reason: 'dead_letter', followUp: expect.any(String) },
      { issue: 238, attempts: 0, action: 'conflict', reason: 'queued_and_backoff_labels', labels: ['oc-queued', 'oc-runtime-backoff'] },
    ]);
  });

  it('keeps owner holds, active leases and lease-less labels parked', () => {
    const { snapshot } = fixture([issue(5, ['oc-runtime-backoff', 'oc-owner-gate']), issue(6, ['oc-runtime-backoff']), issue(7, ['oc-runtime-backoff'])]);
    const leases = [backoffLease(5, 1), backoffLease(6, 1), { ...backoffLease(6, 2), state: 'running' as const, backoffUntil: undefined, expiresAt: at(60) }];
    expect(runtimeBackoffDecisions(snapshot, leases, T0).map(d => [d.issue, d.action])).toEqual([[5, 'kept'], [6, 'kept'], [7, 'kept']]);
  });

  it.each(['not-a-date', '', 'NaN', '2026-13-45T99:00:00Z'])('never requeues on an unreadable clock (%j)', badNow => {
    // A backoff a year away would requeue if `until > now` were evaluated against NaN.
    const { snapshot } = fixture([issue(1, ['oc-runtime-backoff']), issue(2, ['oc-runtime-backoff']), issue(238, ['oc-queued', 'oc-runtime-backoff'])]);
    const leases = [backoffLease(1, 1, { backoffUntil: at(525_600) }), backoffLease(2, 1, { backoffUntil: at(-60) })];
    const decisions = runtimeBackoffDecisions(snapshot, leases, badNow);
    expect(decisions.some(d => d.action === 'requeue')).toBe(false);
    expect(decisions.filter(d => d.issue !== 238)).toEqual([
      { issue: 1, attempts: 1, action: 'kept', reason: `invalid reconciliation time ${JSON.stringify(badNow)}` },
      { issue: 2, attempts: 1, action: 'kept', reason: `invalid reconciliation time ${JSON.stringify(badNow)}` },
    ]);
    // The label conflict does not depend on the clock and is still recorded.
    expect(decisions.find(d => d.issue === 238)).toMatchObject({ action: 'conflict' });
  });

  it('refuses to record a backoff at an unreadable settlement time', async () => {
    const store = new MemoryStore({ leases: [{ ...backoffLease(1, 1), state: 'running', backoffUntil: undefined, expiresAt: at(90) }] });
    await expect(transitionLease(store, 'b-1-1', '1001', '1', 'runtime-backoff', { requireActive: true, now: 'not-a-date' }))
      .rejects.toThrow('Invalid settlement time');
    expect(store.ledger.leases[0].state).toBe('running');
  });

  it('fails closed, and says so, when the pass throws outside per-issue handling', () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(chunk => { writes.push(String(chunk)); return true; });
    try {
      const { snapshot } = fixture([issue(1, ['oc-runtime-backoff'])]);
      const broken = { ...snapshot, issues: null as unknown as Issue[] };
      const records = reconcileRuntimeBackoff(broken, { schema: 1, programStartedAt: T0, programSpent: 0, dailySpent: {}, leases: [backoffLease(1, 1)] });
      expect(records).toEqual([{ action: 'failed_closed', reason: expect.any(String) }]);
    } finally {
      spy.mockRestore();
    }
    expect(writes.join('')).toMatch(/::warning title=runtime backoff::pass failed closed after 0 record\(s\); remaining issues stay parked: /);
  });
});

describe('the requeued issue still goes through admission, provider slots and the budget', () => {
  async function backedOff() {
    const queued = issue(1, ['oc-queued']);
    const { root, snapshot } = fixture([queued]);
    const store = new MemoryStore();
    const plan = makePlan(snapshot, [], T0, root);
    const first = await claim(store, plan, snapshot, root, T0, '100');
    expect(first).toMatchObject({ allowed: true });
    await transitionLease(store, first.lease!.id, '100', '1', 'runtime-backoff', { requireActive: true, now: T0 });
    return { root, snapshot, store, requeued: { ...snapshot, issues: [queued] } };
  }

  it('an unchanged fingerprint is refused before its backoff expires and admitted after', async () => {
    const { root, store, requeued } = await backedOff();
    const early = makePlan(requeued, store.ledger.leases, at(10), root);
    expect(await claim(store, early, requeued, root, at(10), '101')).toMatchObject({ allowed: false, reason: 'unchanged_attempt' });
    const late = makePlan(requeued, store.ledger.leases, at(31), root);
    const retry = await claim(store, late, requeued, root, at(31), '102');
    expect(retry).toMatchObject({ allowed: true, reason: 'reserved' });
    // The retry is charged like any other reservation.
    expect(store.ledger.programSpent).toBe(1);
  });

  it('the budget still refuses a requeued retry', async () => {
    const { root, store, requeued } = await backedOff();
    store.ledger.programSpent = 100;
    store.ledger.dailySpent[T0.slice(0, 10)] = 10;
    const plan = makePlan(requeued, store.ledger.leases, at(31), root);
    const result = await claim(store, plan, requeued, root, at(31), '103');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/cap_exceeded/);
    expect(store.ledger.leases.filter(l => l.state === 'reserved')).toHaveLength(0);
  });

  it('NO-API mode and a disabled provider leave the requeued provider-lane issue unadmitted', async () => {
    const { root, store, requeued } = await backedOff();
    for (const env of [{ PROVIDER_AUTHORIZED: 'true' }, { PROVIDER_AUTHORIZED: 'true', OC_PROVIDER_NO_API_MODE: 'false', OC_PROVIDER_DISABLED: 'anthropic,gemini,openai' }]) {
      const capacity = providerCapacityFromEnvironment(env, store.ledger, at(31));
      expect(capacity.slots).toBe(0);
      expect(makePlan(requeued, store.ledger.leases, at(31), root, undefined, capacity).issues).toEqual([]);
    }
  });

  it(`a fingerprint with ${MAX_ABANDONED_ATTEMPTS} backoffs is never paid for again`, async () => {
    const { root, store, requeued } = await backedOff();
    const [existing] = store.ledger.leases;
    store.ledger.leases.push({ ...existing, id: 'x2', runId: '201' }, { ...existing, id: 'x3', runId: '202' });
    const plan = makePlan(requeued, store.ledger.leases, at(600), root);
    expect(await claim(store, plan, requeued, root, at(600), '104')).toMatchObject({ allowed: false, reason: 'unchanged_attempt' });
  });
});

describe('reconcile applies the decisions per issue against GitHub', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
  // A fake `gh` serving the reads `snapshot()` makes. PATCH to #9 fails, to
  // prove one failed write does not stop the other issues; `ghFails` makes the
  // snapshot's issue read fail, as a GitHub outage would. `live` overrides the
  // labels the per-issue re-read sees, as if someone relabelled the issue
  // between the snapshot and the write; `commentFails` rejects every comment
  // POST on the named issues.
  function run(issues: Issue[], leases: Lease[], ghFails = false,
    { live = {}, commentFails = [] }: { live?: Record<number, string[]>; commentFails?: number[] } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'oc-backoff-')); dirs.push(dir);
    const bin = join(dir, 'bin'); mkdirSync(bin);
    const ledgerFile = join(dir, 'ledger.json');
    writeFileSync(ledgerFile, JSON.stringify({ schema: 1, programStartedAt: '2026-09-29T00:00:00.000Z', programSpent: 0, dailySpent: {}, leases }));
    writeFileSync(join(dir, 'issues.json'), JSON.stringify(issues));
    writeFileSync(join(bin, 'gh'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const path = args[1];
const method = args[args.indexOf('--method') + 1];
const log = line => fs.appendFileSync(process.env.OC_TEST_LOG, line + '\\n');
const issues = JSON.parse(fs.readFileSync(process.env.OC_ISSUES, 'utf8'));
if (process.env.OC_GH_FAILS === '1' && path.includes('state=all')) { process.stderr.write('HTTP 502'); process.exit(1); }
if (path.includes('contents/.oc/dispatch-ledger.json')) {
  console.log(JSON.stringify({ sha: 'v1', content: fs.readFileSync(process.env.OC_LEDGER_FILE).toString('base64') })); process.exit(0);
}
if (path.includes('git/ref/heads/oc-autonomous-integration')) { console.log(JSON.stringify({ object: { sha: 'a'.repeat(40) } })); process.exit(0); }
if (path.includes('pulls?')) { console.log('[]'); process.exit(0); }
if (path.includes('labels=oc-running')) { console.log('[]'); process.exit(0); }
if (path.includes('labels=oc-runtime-backoff')) { console.log(JSON.stringify(issues.filter(i => i.labels.some(l => l.name === 'oc-runtime-backoff')))); process.exit(0); }
if (path.includes('issues?')) { console.log(JSON.stringify(issues)); process.exit(0); }
const match = /issues\\/(\\d+)(\\/comments)?$/.exec(path);
const live = JSON.parse(process.env.OC_LIVE_LABELS);
if (match && method === 'GET') {
  const found = issues.find(i => i.number === Number(match[1]));
  const labels = live[match[1]];
  console.log(JSON.stringify(labels ? { ...found, labels: labels.map(name => ({ name })) } : found)); process.exit(0);
}
if (match && method === 'PATCH') {
  if (match[1] === '9') { process.stderr.write('HTTP 502'); process.exit(1); }
  log('PATCH ' + match[1] + ' ' + fs.readFileSync(0, 'utf8')); console.log('{}'); process.exit(0);
}
if (match && method === 'POST' && JSON.parse(process.env.OC_COMMENT_FAILS).includes(Number(match[1]))) {
  log('COMMENTFAIL ' + match[1]); process.stderr.write('HTTP 502'); process.exit(1);
}
if (match && method === 'POST') { log('COMMENT ' + match[1] + ' ' + fs.readFileSync(0, 'utf8')); console.log('{}'); process.exit(0); }
console.log('{}');
`);
    chmodSync(join(bin, 'gh'), 0o755);
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: 'jsp1440/orchid-continuum-frontend',
      OC_TEST_LOG: join(dir, 'log'), OC_LEDGER_FILE: ledgerFile, OC_ISSUES: join(dir, 'issues.json'), OC_GH_FAILS: ghFails ? '1' : '',
      OC_LIVE_LABELS: JSON.stringify(live), OC_COMMENT_FAILS: JSON.stringify(commentFails), GITHUB_STEP_SUMMARY: join(dir, 'summary') };
    writeFileSync(env.GITHUB_STEP_SUMMARY, '');
    writeFileSync(env.OC_TEST_LOG, '');
    const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/oc-dispatch-runtime.ts'), 'reconcile'], { env, encoding: 'utf8' });
    const lines = readFileSync(env.OC_TEST_LOG, 'utf8').trim().split('\n').filter(Boolean);
    const patches = Object.fromEntries(lines.filter(l => l.startsWith('PATCH ')).map(l => {
      const [, n, ...body] = l.split(' ');
      return [n, (JSON.parse(body.join(' ')) as { labels: string[] }).labels];
    }));
    const comments = lines.filter(l => l.startsWith('COMMENT ')).map(l => l.split(' ')[1]);
    const failedComments = lines.filter(l => l.startsWith('COMMENTFAIL ')).map(l => l.split(' ')[1]);
    const records = result.stdout.split('\n').filter(l => l.startsWith('runtime-backoff ')).map(l => JSON.parse(l.slice('runtime-backoff '.length)));
    return { result, patches, comments, failedComments, records, summary: readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8') };
  }

  it('requeues, dead-letters and skips conflicts independently; a failed write stays parked', () => {
    // Real clock: these times are relative to now, since the runtime reads the wall clock.
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const issues = [issue(3, ['oc-runtime-backoff', 'oc-p1']), issue(4, ['oc-runtime-backoff']), issue(5, ['oc-runtime-backoff']),
      issue(9, ['oc-runtime-backoff']), issue(238, ['oc-queued', 'oc-p1', 'oc-runtime-backoff'])];
    const leases = [backoffLease(3, 1, { backoffUntil: past }), backoffLease(4, 1), backoffLease(4, 2), backoffLease(4, 3),
      backoffLease(5, 1, { backoffUntil: future }), backoffLease(9, 1, { backoffUntil: past })];
    const { result, patches, comments } = run(issues, leases);
    expect(result.status, result.stderr).toBe(0);
    expect(patches['3'].sort()).toEqual(['oc-p1', 'oc-queued']);
    expect(patches['4'].sort()).toEqual(['oc-blocked']);
    expect(Object.keys(patches).sort()).toEqual(['3', '4']);
    expect(comments.sort()).toEqual(['3', '4']);
    const records = result.stdout.split('\n').filter(l => l.startsWith('runtime-backoff ')).map(l => JSON.parse(l.slice('runtime-backoff '.length)));
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ issue: 3, action: 'requeue', applied: true }),
      expect.objectContaining({ issue: 4, action: 'dead_letter', reason: 'dead_letter', applied: true }),
      expect.objectContaining({ issue: 5, action: 'wait' }),
      expect.objectContaining({ issue: 9, action: 'requeue', applied: false }),
      expect.objectContaining({ issue: 238, action: 'conflict', reason: 'queued_and_backoff_labels' }),
    ]));
  });

  it('a failed snapshot read leaves every issue parked without failing reconciliation', () => {
    const { result, patches, summary } = run([issue(3, ['oc-runtime-backoff'])], [backoffLease(3, 1)], true);
    expect(result.status, result.stderr).toBe(0);
    expect(patches).toEqual({});
    expect(result.stdout).toContain('"action":"skipped"');
    // Surfaced as an annotation and in the step summary, not only on stdout.
    expect(result.stdout).toMatch(/^::warning title=runtime backoff::pass skipped; every backed-off issue stays parked: /m);
    expect(summary).toContain('Runtime backoff: pass skipped');
  });

  it('writes nothing when the labels changed between the snapshot and the write', () => {
    const past = new Date(Date.now() - 3_600_000).toISOString();
    // #6 would dead-letter and #7 would requeue from the snapshot; the live
    // re-read shows #6 already requeued by a person and #7 no longer backed off.
    const issues = [issue(6, ['oc-runtime-backoff']), issue(7, ['oc-runtime-backoff']), issue(3, ['oc-runtime-backoff'])];
    const leases = [backoffLease(6, 1), backoffLease(6, 2), backoffLease(6, 3), backoffLease(7, 1, { backoffUntil: past }), backoffLease(3, 1, { backoffUntil: past })];
    const { result, patches, comments, records } = run(issues, leases, false, { live: { 6: ['oc-runtime-backoff', 'oc-queued'], 7: ['oc-p1'] } });
    expect(result.status, result.stderr).toBe(0);
    expect(Object.keys(patches)).toEqual(['3']);
    expect(comments).toEqual(['3']);
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ issue: 6, action: 'dead_letter', applied: false, reason: 'labels changed since the snapshot' }),
      expect.objectContaining({ issue: 7, action: 'requeue', applied: false, reason: 'labels changed since the snapshot' }),
      expect.objectContaining({ issue: 3, action: 'requeue', applied: true, commented: true }),
    ]));
  });

  it('records a relabelled dead letter whose comment could not be posted, and says so', () => {
    const issues = [issue(4, ['oc-runtime-backoff'])];
    const leases = [backoffLease(4, 1), backoffLease(4, 2), backoffLease(4, 3)];
    const { result, patches, comments, failedComments, records, summary } = run(issues, leases, false, { commentFails: [4] });
    expect(result.status, result.stderr).toBe(0);
    expect(patches['4']).toEqual(['oc-blocked']);
    expect(comments).toEqual([]);
    // One retry, then an honest record rather than a silent loss.
    expect(failedComments).toEqual(['4', '4']);
    expect(records).toEqual([expect.objectContaining({ issue: 4, action: 'dead_letter', applied: true, commented: false,
      commentError: expect.stringContaining('HTTP 502'), followUp: expect.stringContaining('unchanged_attempt') })]);
    expect(result.stdout).toMatch(/^::warning title=runtime backoff::#4 relabelled but its follow-up comment was not posted/m);
    expect(summary).toContain('#4 relabelled but its follow-up comment was not posted');
  });
});
