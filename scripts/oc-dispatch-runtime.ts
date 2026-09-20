import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertAdmission, assertReceipts, claimDeterministicLease, claimLease, isActive, laneOf, lineageFor, makePlan, reconcileExpired, transitionLease, validateLedger, validatePlan,
  type Issue, type Ledger, type LeaseStore, type Plan, type Pull, type Snapshot } from './oc-dispatch-control';
import { decideBudget } from './oc-budget-governor.mjs';

const repo = process.env.GITHUB_REPOSITORY || '';
const stateBranch = 'oc-dispatch-state';
const statePath = '.oc/dispatch-ledger.json';
const now = () => new Date().toISOString();
function api<T>(path: string, method = 'GET', body?: unknown): T {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Invalid repository');
  const args = ['api', `repos/${repo}/${path}`, '--method', method];
  if (body !== undefined) args.push('--input', '-');
  return JSON.parse(execFileSync('gh', args, { input: body === undefined ? undefined : JSON.stringify(body),
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 }) || 'null') as T;
}
function status(error: unknown, code: number) {
  return error instanceof Error && 'stderr' in error && String(error.stderr).includes(`HTTP ${code}`);
}
function pages<T>(path: string): T[] {
  const values: T[] = [];
  for (let page = 1; page <= 1000; page++) {
    const batch = api<T[]>(`${path}&per_page=100&page=${page}`);
    values.push(...batch);
    if (batch.length < 100) return values;
  }
  throw new Error('Incomplete GitHub pagination');
}
export class GitHubLeaseStore implements LeaseStore {
  async read() {
    // Missing or malformed accounting never means zero dollars already spent.
    const file = api<{ sha: string; content: string }>(`contents/${statePath}?ref=${stateBranch}`);
    return { version: file.sha, ledger: JSON.parse(Buffer.from(file.content, 'base64').toString()) as Ledger };
  }
  async compareAndSwap(version: string, ledger: Ledger) {
    try {
      api(`contents/${statePath}`, 'PUT', { branch: stateBranch, sha: version,
        message: 'chore(autonomy): persist fenced dispatch lease receipt',
        content: Buffer.from(JSON.stringify(ledger, null, 2) + '\n').toString('base64') });
      return true;
    } catch (error) {
      if (status(error, 409)) return false;
      throw error;
    }
  }
}
/**
 * A ledger store for the lane that cannot spend.
 *
 * `GitHubLeaseStore.read()` throws on a missing ledger deliberately: for the
 * paid lane, "no accounting file" must never read as "nothing has been spent".
 * The deterministic lane reserves exactly zero, so an absent ledger is simply an
 * empty one -- and because the paid lane has refused before reading since the
 * day it was written, no ledger has ever been created. This is the only lane
 * permitted to create it.
 *
 * The balance refusal below guards CREATION only -- `version !== ''` delegates
 * straight to the parent. That is deliberate (an existing ledger's balance is
 * the paid lane's business, and this lane never writes one), but the earlier
 * wording here said flatly that it "cannot write a non-zero reservation", which
 * is stronger than the code. `validateLedger` and `transitionLease` are what
 * actually keep this lane's leases at zero, and both are mutation-pinned.
 */
export class DeterministicLeaseStore extends GitHubLeaseStore {
  async read() {
    try {
      return await super.read();
    } catch (error) {
      if (!status(error, 404)) throw error;
      return { version: '', ledger: { schema: 1, programStartedAt: now(), programSpent: 0, dailySpent: {}, leases: [] } as Ledger };
    }
  }

  async compareAndSwap(version: string, ledger: Ledger) {
    if (version !== '') return super.compareAndSwap(version, ledger);
    if (ledger.programSpent !== 0 || Object.keys(ledger.dailySpent).length > 0) {
      throw new Error('Refusing to initialize accounting with a non-zero balance');
    }
    try { api(`git/ref/heads/${stateBranch}`); }
    catch (error) {
      if (!status(error, 404)) throw error;
      api('git/refs', 'POST', { ref: `refs/heads/${stateBranch}`, sha: process.env.GITHUB_SHA || '' });
    }
    try {
      api(`contents/${statePath}`, 'PUT', { branch: stateBranch,
        message: 'chore(autonomy): initialize durable dispatch ledger',
        content: Buffer.from(JSON.stringify(ledger, null, 2) + '\n').toString('base64') });
      return true;
    } catch (error) {
      // Someone else created it first; re-read and retry rather than overwrite.
      if (status(error, 409) || status(error, 422)) return false;
      throw error;
    }
  }
}

function snapshot(): Snapshot {
  const issues = pages<Issue & { pull_request?: unknown }>('issues?state=all').filter(i => !i.pull_request)
    .map(({ number, state, title, body, labels }) => ({ number, state, title, body, labels: labels.map(({ name }) => ({ name })).sort((a,b) => a.name.localeCompare(b.name)) }));
  // `merged_at` is what distinguishes a merged PR from a closed one, and the
  // report needs it: "closed" tells the operator to go and look at something
  // that is already in. It is not on `Pull` because nothing else consumes it.
  const prs = pages<Pull & { merged_at: string | null }>('pulls?state=all')
    .map(({ number, state, merged_at, body, head }) => ({ number, state, merged: Boolean(merged_at), body, head: { ref: head.ref, sha: head.sha } }))
    .sort((a,b) => a.number-b.number);
  const integration = api<{ object: { sha: string } }>('git/ref/heads/oc-autonomous-integration');
  const material = Object.fromEntries(['CLAUDE.md', 'package.json', 'src/lib/completion-graph/scheduler.ts']
    .map(path => [path, readFileSync(path, 'utf8')]));
  return { issues, prs, material, integrationSha: integration.object.sha,
    implementationSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() };
}
function output(key: string, value: string) {
  if (/\n|\r/.test(value)) throw new Error('Invalid workflow output');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
function readPlan() {
  const plan = JSON.parse(readFileSync(join(process.env.OC_PLAN_DIR || '.oc-wave', 'plan.json'), 'utf8')) as Plan;
  validatePlan(plan);
  if (process.env.OC_WAVE_HASH !== plan.wave.hash) throw new Error('Wrong shared wave artifact');
  return plan;
}
function receipt(issue: number, waveHash: string, outcome: string, extra: object = {}) {
  const dir = process.env.OC_RECEIPT_DIR || '.oc-receipts';
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${issue}.json`), JSON.stringify({ issue, waveHash, outcome,
    providerAuthorized: process.env.PROVIDER_AUTHORIZED === 'true', providerCalls: 0,
    providerCostUsd: 0, ...extra }, null, 2) + '\n');
  output('outcome', outcome);
}
/**
 * Name every pending issue this wave did not admit, once each, with the reason.
 *
 * "Once each, with the reason" is the whole contract, and the previous version
 * broke it three ways -- one of them live on this branch's own summary:
 *
 *   * The census/reached shortfall printed a COUNT and three candidate causes
 *     ("an open PR lineage, an `OC-AUTO-HOLD`, or a lane label"), identifying
 *     none of them and naming none of the issues. Five queued issues appeared
 *     nowhere in a report whose docstring promised they would.
 *   * That line was gated on the wave being idle, so in a wave that admitted
 *     even one issue the shortfall vanished entirely -- count and all.
 *   * An issue carrying two refused declarations was named twice; and an issue
 *     admitted on one declaration while a second was refused got a line reading
 *     "Binding refused" as the only thing said about it, while the lane was
 *     executing it.
 *
 * A wave that admitted nothing because its lanes are busy is not a failure, and
 * saying so would train the operator to ignore this.
 *
 * Written for GITHUB_STEP_SUMMARY, which renders Markdown with HTML passthrough.
 * A bare `<node-id>` is stripped there as an unknown tag, which would delete the
 * one thing the remediation tells an operator to type, and single newlines
 * collapse into one paragraph. Hence the backticks and the list.
 */
/**
 * What the `plan` step prints and writes to the step summary.
 *
 * `provider_authorized` is READ, not asserted. It was a hard-coded `false` in
 * this template, so the one governance fact the summary states about itself was
 * the one fact it could not get wrong -- and it would have gone on printing
 * `false` if the environment ever said otherwise. Two other call sites in this
 * file already derive it from the environment; so does this one now.
 */
export function planSummary(plan: Plan) {
  const providerAuthorized = process.env.PROVIDER_AUTHORIZED === 'true';
  return `Inventory: ${JSON.stringify(plan.inventory)}; graph plan: ${JSON.stringify(plan.issues)}; ` +
    `capacity=${plan.capacity}; wave=${plan.wave.hash}; provider_authorized=${providerAuthorized}; ` +
    `no execution leases acquired.\n` +
    bindingReport(plan);
}

export function bindingReport(plan: Plan) {
  const lines: string[] = [];
  // Only numbers this report can account for. The label census counts work that
  // is executing and work that never reached the ranker, so printing it as a
  // count of pending work states a total the lines below then contradict.
  const reached = plan.queuedReachingAdmission;
  const census = plan.inventory.queued + plan.inventory.prepared;
  const idle = plan.capacity > 0 && plan.issues.length === 0
    && (plan.starved || (census > 0 && plan.inventory.active === 0));
  if (idle) {
    lines.push(`- **STARVED**: ${plan.capacity} free lane(s), ${reached} issue(s) reached graph admission, nothing admitted. ` +
      `${plan.untrackedLeaves.length} admissible graph leaf/leaves carried no pending issue.`);
  }
  // Deliberately NOT gated on `idle`. An issue that never reached the ranker is
  // just as invisible in a wave that admitted one issue as in a wave that
  // admitted none, and it was the partially-admitting wave that printed nothing.
  // An issue the wave ADMITTED is being executed, whatever else it declared. A
  // refusal line about a second declaration would be the only thing this report
  // says about it, and it would be false.
  const admitted = new Set(plan.issues);
  const said = new Set<number>(admitted);
  const take = (issue: number) => said.has(issue) ? false : (said.add(issue), true);

  for (const { issueNumber, reason } of plan.pendingNotReachingAdmission) {
    if (plan.capacity <= 0) break;
    // Through `take()` like every other line-type. The first version of this
    // loop consulted neither `said` nor `admitted`, so the one line added to
    // fix the "once each" promise was the one line that did not keep it: an
    // issue could be named here and again below, and an ADMITTED issue could be
    // told it "never reached admission" while the lane was executing it.
    // `makePlan` happens to keep these sets disjoint today, which is exactly
    // the reasoning that left the last guard dead and unnoticed.
    if (!take(issueNumber)) continue;
    lines.push(`- Issue #${issueNumber} is labelled pending and never reached admission: ${reason}.`);
  }
  if (plan.capacity > 0) {
    const unbound = plan.unboundQueued.filter(take);
    if (unbound.length > 0) {
      lines.push(`- No completion-graph node names these issues (bind one with an \`oc-node:<node-id>\` label naming a leaf): ${unbound.join(', ')}.`);
    }
    const unreachable = plan.unreachableQueued.filter(({ issueNumber }) => take(issueNumber));
    if (unreachable.length > 0) {
      const named = unreachable.map(({ issueNumber, nodeIds }) => `#${issueNumber} (\`${nodeIds.join('`, `')}\`)`);
      lines.push(`- A node names these issues, and the ranker did not select it this wave -- its status, its dependencies, work already open on it, or another issue took it: ${named.join(', ')}.`);
    }
  }
  // One line per ISSUE, not per declaration, and not per declaration KIND
  // either. An issue can declare a node that is not in the graph AND a node
  // that is not a leaf; grouping within each category still gave it a line from
  // each loop, and the cross-category guard that was supposed to stop that was
  // consulted nowhere -- both `said.add` calls could be deleted with the full
  // suite green. Fixing only the half an operator is told about would not admit
  // the issue, so both halves go in the one line.
  const refusals = new Map<number, { unknown: string[]; unadmissible: string[] }>();
  const note = (issueNumber: number, kind: 'unknown' | 'unadmissible', nodeId: string) => {
    if (admitted.has(issueNumber) || said.has(issueNumber)) return;
    const entry = refusals.get(issueNumber) ?? { unknown: [], unadmissible: [] };
    entry[kind].push(nodeId);
    refusals.set(issueNumber, entry);
  };
  for (const { issueNumber, nodeId } of plan.unknownNodeDeclarations) note(issueNumber, 'unknown', nodeId);
  for (const { issueNumber, nodeId } of plan.unadmissibleNodeDeclarations) note(issueNumber, 'unadmissible', nodeId);

  const list = (nodeIds: string[]) => `\`${nodeIds.join('`, `')}\``;
  for (const [issueNumber, { unknown, unadmissible }] of [...refusals].sort((a, b) => a[0] - b[0])) {
    const parts: string[] = [];
    if (unknown.length > 0) {
      parts.push(`${unknown.length > 1 ? 'nodes' : 'node'} ${list(unknown)}, which ${unknown.length > 1 ? 'are' : 'is'} not in the completion graph`);
    }
    if (unadmissible.length > 0) {
      parts.push(`${unadmissible.length > 1 ? 'nodes' : 'node'} ${list(unadmissible)}, which ${unadmissible.length > 1 ? 'are' : 'is'} not a leaf, so the ranker can never select ${unadmissible.length > 1 ? 'them' : 'it'}`);
    }
    lines.push(`- Issue #${issueNumber} declares ${parts.join('; and ')}. Binding refused; name a leaf that exists.`);
  }
  return lines.length > 0 ? `\n${lines.join('\n')}\n` : '';
}

async function main() {
  const command = process.argv[2];
  const store = new GitHubLeaseStore();
  if (command === 'plan') {
    const current = snapshot();
    let leases: Ledger['leases'] = [];
    try { const { ledger } = await store.read(); validateLedger(ledger); leases = ledger.leases; }
    catch (error) { if (!status(error, 404)) throw error; }
    const plan = makePlan(current, leases);
    const dir = process.env.OC_PLAN_DIR || '.oc-wave';
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan, null, 2) + '\n');
    writeFileSync(join(dir, `wave-${plan.wave.hash}.json`), plan.wave.canonical + '\n');
    output('issues', JSON.stringify(plan.issues));
    output('wave_hash', plan.wave.hash);
    const summary = planSummary(plan);
    process.stdout.write(summary);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    return;
  }
  if (command === 'reconcile') {
    try { await store.read(); } catch (error) { if (status(error, 404)) return; throw error; }
    {
      await reconcileExpired(store, now(), async run => api<{ status: string }>(`actions/runs/${run}`).status === 'completed', async lease => {
        const record = api<Issue>(`issues/${lease.issue}`);
        // A provider lease that expired was doing something we cannot see, so it
        // blocks. A deterministic one that expired did nothing we can see: its
        // settlement never ran. Blocking it strips `oc-queued`, which makes it
        // unselectable forever, on the strength of an attempt that produced no
        // evidence either way. It goes back to the queue instead, and the
        // `not-executed` lease keeps it genuinely admissible.
        const free = laneOf(lease) === 'provider-free';
        api(`issues/${lease.issue}`, 'PATCH', { labels: [...new Set(record.labels.map(l => l.name)
          .filter(l => !['oc-running','oc-queued','oc-prepared'].includes(l)).concat(free ? 'oc-queued' : 'oc-blocked'))] });
      });
    }
    return;
  }
  const plan = readPlan();
  if (command === 'audit') {
    const dir = process.env.OC_RECEIPT_DIR || '.oc-receipts';
    const receipts = (existsSync(dir) ? readdirSync(dir) : []).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')));
    assertReceipts(plan, receipts);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `All ${plan.issues.length} admitted issues have matching governed lane receipts. Calls/cost: ${receipts.every(r => r.providerCalls === 0 && r.providerCostUsd === 0) ? "0 / $0" : "see reservation and provider receipts"}.\n`);
    return;
  }
  if (command === 'admit-deterministic' || command === 'settle-deterministic') {
    const number = Number(process.env.ISSUE_NUMBER);
    if (!Number.isSafeInteger(number) || number <= 0) throw new Error('Invalid issue number');
    const id = process.env.GITHUB_RUN_ID || '';
    const attempt = process.env.GITHUB_RUN_ATTEMPT || '';
    if (command === 'admit-deterministic') {
      // No provider authorization is consulted, because nothing here can spend.
      const result = await claimDeterministicLease(new DeterministicLeaseStore(), plan, snapshot(), { issueNumber: number, runId: id, runAttempt: attempt, now: now() });
      output('allowed', String(result.allowed));
      output('lease_id', result.lease?.id || '');
      // A refusal is still a receipt: the audit must see that this issue was
      // deliberately not executed, and why, rather than nothing at all.
      if (!result.allowed) receipt(number, plan.wave.hash, 'not_executed', { reason: result.reason });
      // The ceiling is only a bound if the issue stops arriving. A lane that has
      // failed to produce evidence NOT_EXECUTED_CEILING times needs a person, so
      // it leaves the queue and says so on the issue rather than being admitted,
      // refused and receipted on every pulse for ever.
      if (!result.allowed && result.reason === 'not_executed_ceiling') {
        const record = api<Issue>(`issues/${number}`);
        api(`issues/${number}`, 'PATCH', { labels: [...new Set(record.labels.map(l => l.name)
          .filter(l => !['oc-running', 'oc-queued', 'oc-prepared'].includes(l)).concat('oc-blocked'))] });
      }
      return;
    }
    const leaseId = process.env.OC_LEASE_ID || '';
    const evidencePath = join(process.env.OC_EVIDENCE_DIR || '.oc-evidence', `${number}.json`);
    // Absence of evidence is never success. A worker that never ran, or crashed
    // before writing, settles as `not_executed`, not as a pass.
    type Evidence = { issue?: number; wave_hash?: string; run?: string; outcome?: string; results?: { command?: string; exit_code?: number }[]; provider_calls?: number };
    // Malformed evidence is evidence that nothing trustworthy was recorded, not
    // a reason to crash without a receipt and hold the lane for ninety minutes.
    let evidence: Evidence | null = null;
    let rejected = '';
    if (existsSync(evidencePath)) {
      try { evidence = JSON.parse(readFileSync(evidencePath, 'utf8')) as Evidence; }
      catch { rejected = 'evidence was not valid JSON'; }
    }
    // The lease is fenced on runId/runAttempt, but the outcome was being decided
    // before and independently of that fence: settlement accepted an artifact
    // without checking whose it was, and recorded one issue's pass from another
    // issue's evidence in another wave.
    if (evidence && !rejected) {
      if (evidence.issue !== number) rejected = `evidence belongs to issue #${evidence.issue}`;
      else if (evidence.wave_hash !== plan.wave.hash) rejected = 'evidence belongs to another wave';
      else if (evidence.run !== `${id}:${attempt}`) rejected = `evidence belongs to run ${evidence.run}`;
      else if (evidence.provider_calls === undefined) rejected = 'evidence records no provider_calls';
      else if (evidence.provider_calls !== 0) throw new Error('Deterministic lane reported a provider call');
      else if (!Array.isArray(evidence.results)) rejected = 'evidence records no results array';
      else if (evidence.results.some(r => !Number.isSafeInteger(r?.exit_code))) rejected = 'a recorded command has no exit code';
    }
    if (rejected) evidence = null;
    const executed = !rejected && (evidence?.outcome === 'done' || evidence?.outcome === 'failed');
    // The receipt the audit consumes was taking `outcome` on the worker's word
    // while carrying the exit codes that contradicted it. Correctly fenced
    // evidence claiming `done` over `exit_code: 1` moved the issue to
    // `oc-validating` and reported the deterministic run as a pass, embedding
    // the proof that it failed. The exit codes are the harder evidence, so they
    // decide -- and they can only ever move the verdict towards failure, never
    // turn a failure into a pass.
    // Strictly one-directional: a recorded non-zero exit turns a claimed `done`
    // into a failure, and nothing can turn a claimed `failed` into a pass. An
    // empty results list is not evidence of failure either, so it is left
    // alone. Say plainly what that means rather than only what it is not: a
    // forged `outcome: 'done'` carrying NO commands is recorded as
    // `provider_free_done` and moves the issue to `oc-validating` having run
    // nothing. It is unreachable from this repository's own producers --
    // `routeIssue` sets `providerFree` only when there is at least one command,
    // and the evidence file is written after the command loop -- so it needs a
    // forged artifact that also clears the issue, wave and run fence.
    // `commands: 0` is on the receipt for anyone auditing that case.
    const failedCommands = (evidence?.results ?? []).filter(r => r.exit_code !== 0);
    const contradicted = executed && evidence?.outcome === 'done' && failedCommands.length > 0
      ? `evidence claimed 'done' over ${failedCommands.map(r => `${r.command} (exit ${r.exit_code})`).join(', ')}` : '';
    const derived = contradicted ? 'failed' : evidence?.outcome;
    const outcome = !executed ? 'not_executed' : derived === 'done' ? 'provider_free_done' : 'provider_free_failed';
    // Written FIRST, before the relabel and before the ledger transition. Both
    // of those call out, and either can throw: a fencing-token mismatch, ledger
    // contention, a malformed ledger, any `gh` failure. The workflow's
    // `if: always()` on the upload promised the audit a receipt in exactly that
    // case, and `if-no-files-found: ignore` meant it silently uploaded nothing
    // instead -- the run died between the calls and left precisely the
    // unexplained gap the comment said it prevented. The outcome is fully
    // decided by this point, so nothing is lost by recording it here.
    receipt(number, plan.wave.hash, outcome, {
      lane: 'provider-free',
      commands: (evidence?.results ?? []).length,
      evidence: evidence ?? (rejected || 'absent'),
      ...(contradicted ? { contradicted } : {}),
    });
    const record = api<Issue>(`issues/${number}`);
    const labels = record.labels.map(l => l.name);
    // A successful deterministic run is evidence, not acceptance: it moves to
    // validation, never straight to done. A failure parks for repair WITHOUT
    // `oc-queued`: unchanged failing work must not be retried, and leaving it
    // queued gave exactly one accidental retry -- the label change altered the
    // fingerprint -- before stranding it while still claiming it was queued.
    // A lane that never executed goes back to the queue and, because its lease
    // records `not-executed`, is genuinely admissible again.
    //
    // OWNER DECISION, stated rather than quietly taken: while
    // `provider_authorized` is false, nothing in this repository restores
    // `oc-queued` to an `oc-repair` issue. `orchid-completion-lane.yml` is the
    // only writer of that label and it is reachable only through
    // `provider-worker`. So `oc-repair` is a second resting place alongside
    // `oc-blocked`, and a person moves the work out of it.
    //
    // Re-queueing instead is NOT free: the fingerprint bar would refuse the
    // unchanged attempt on every pulse while the issue still consumed one of
    // eight admission slots, which starves a queue that already has 22 waiting.
    // That trade is the owner's to make, so this stays as it is and is reported.
    const next = outcome === 'provider_free_done' ? ['oc-validating']
      : outcome === 'provider_free_failed' ? ['oc-repair'] : ['oc-queued'];
    api(`issues/${number}`, 'PATCH', { labels: [...new Set(labels
      .filter(l => !['oc-running', 'oc-queued', 'oc-prepared', 'oc-validating', 'oc-repair'].includes(l)).concat(next))] });
    if (leaseId) {
      await transitionLease(new DeterministicLeaseStore(), leaseId, id, attempt,
        outcome === 'provider_free_done' ? 'provider-free-done'
          : outcome === 'provider_free_failed' ? 'provider-free-failed' : 'not-executed');
    }
    return;
  }
  const issue = Number(process.env.ISSUE_NUMBER);
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new Error('Invalid issue number');
  const runId = process.env.GITHUB_RUN_ID || '';
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT || '';
  const providerAuthorized = process.env.PROVIDER_AUTHORIZED === 'true';
  if (command === 'admit' || command === 'verify' || command === 'start') {
    // This gate is inside the real worker as well as its wrapper; direct calls cannot bypass it.
    const authorization = decideBudget({ providerAuthorized });
    if (!providerAuthorized) {
      output('allowed', 'false');
      receipt(issue, plan.wave.hash, authorization.reason);
      return;
    }
    if (process.env.OC_PROVIDER_POLICY_ALLOWED !== 'true') {
      output('allowed', 'false');
      receipt(issue, plan.wave.hash, 'no_api_mode');
      return;
    }
    const current = snapshot();
    if (command === 'verify' || command === 'start') {
      const { ledger } = await store.read();
      validateLedger(ledger);
      const lease = ledger.leases.find(l => l.id === process.env.OC_LEASE_ID);
      if (!lease || lease.issue !== issue || lease.runId !== runId || lease.runAttempt !== runAttempt ||
          lease.waveHash !== plan.wave.hash || !isActive(lease) || lease.expiresAt <= now()) throw new Error('No current fenced execution lease');
      assertAdmission(plan, current, issue, now());
      const record = current.issues.find(i => i.number === issue)!;
      const budget = decideBudget({ providerAuthorized, requestedUsd: lease.reservedUsd,
        difficulty: record.labels.some(l => l.name === 'oc-difficult') ? 'difficult' : 'ordinary',
        programSpent: ledger.programSpent - lease.reservedUsd,
        dailySpent: (ledger.dailySpent[now().slice(0,10)] ?? 0) - lease.reservedUsd,
        programStartedAt: ledger.programStartedAt, now: now() });
      if (!budget.allowed) throw new Error(`Budget revoked: ${budget.reason}`);
      if (command === 'start') {
        if (process.env.GITHUB_JOB !== 'execute') throw new Error('Only the executable lane can start a lease');
        await transitionLease(store, lease.id, runId, runAttempt, 'running');
        api(`issues/${issue}`, 'PATCH', { labels: [...new Set(record.labels.map(l => l.name).filter(l => l !== 'oc-queued' && l !== 'oc-prepared').concat('oc-running'))] });
        output('execute', 'true');
      }
      output('integration_sha', plan.integrationSha);
      output('allowed', 'true');
      return;
    }
    const result = await claimLease(store, plan, current, { issueNumber: issue, runId, runAttempt,
      providerAuthorized, requestedUsd: Number(process.env.REQUESTED_USD), now: now() });
    output('allowed', String(result.allowed));
    output('lease_id', result.lease?.id || '');
    if (!result.allowed) receipt(issue, plan.wave.hash, 'dispatch_refused', { reason: result.reason });
    return;
  }
  if (command === 'settle') {
    const { ledger } = await store.read();
    validateLedger(ledger);
    const owned = ledger.leases.find(l => l.id === process.env.OC_LEASE_ID);
    if (!owned || owned.issue !== issue || owned.runId !== runId || owned.runAttempt !== runAttempt || !isActive(owned)) throw new Error('Settlement does not own current lease');
    const current = snapshot();
    const record = current.issues.find(i => i.number === issue);
    if (!record) throw new Error('Issue disappeared during settlement');
    const labels = record.labels.map(l => l.name);
    const lineage = lineageFor(issue, current.prs);
    const outcome = labels.includes('oc-owner-gate') ? 'owner-gate' :
      labels.includes('oc-blocked') ? 'blocked' : labels.includes('oc-runtime-backoff') ? 'runtime-backoff' :
      lineage.some(pr => pr.state === 'open') ? 'validating' :
      record.state === 'closed' || labels.includes('oc-done') ? 'done' : 'blocked';
    // Labels first: a crash retains the lease conservatively. CAS release cannot
    // erase a successor's lease, and all writes retain unrelated owner holds.
    api(`issues/${issue}`, 'PATCH', { labels: [...new Set(labels.filter(l => !['oc-running','oc-queued','oc-prepared'].includes(l)).concat(`oc-${outcome}`))] });
    await transitionLease(store, process.env.OC_LEASE_ID || '', runId, runAttempt, outcome);
    receipt(issue, plan.wave.hash, outcome, { providerCalls: null, providerCostUsd: null, accounting: 'reservation retained; no unverified billing claims' });
    // Immediate per-lane refill. Does not wait for sibling lanes; planner reads durable capacity.
    api('actions/workflows/orchid-continuous-completion.yml/dispatches', 'POST', { ref: process.env.GITHUB_REF_NAME });
    return;
  }
  throw new Error('Unknown dispatch command');
}
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'Dispatch failed closed'); process.exitCode = 1; });
}
