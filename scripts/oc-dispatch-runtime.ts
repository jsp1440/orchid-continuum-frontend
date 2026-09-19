import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertAdmission, assertReceipts, claimLease, isActive, lineageFor, makePlan, reconcileExpired, transitionLease, validateLedger, validatePlan,
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
function snapshot(): Snapshot {
  const issues = pages<Issue & { pull_request?: unknown }>('issues?state=all').filter(i => !i.pull_request)
    .map(({ number, state, title, body, labels }) => ({ number, state, title, body, labels: labels.map(({ name }) => ({ name })).sort((a,b) => a.name.localeCompare(b.name)) }));
  const prs = pages<Pull>('pulls?state=all').map(({ number, state, body, head }) => ({ number, state, body, head: { ref: head.ref, sha: head.sha } })).sort((a,b) => a.number-b.number);
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
 * A wave that admitted nothing while admissible work was pending is a binding
 * failure. Every queued issue the wave did not admit is named below exactly
 * once, with the reason: no node names it, a node does but the ranker did not
 * select it, or its declaration was refused. A wave that admitted nothing
 * because its lanes are busy is not a failure at all, and saying so would train
 * the operator to ignore this.
 *
 * This is written for GITHUB_STEP_SUMMARY, which renders Markdown with HTML
 * passthrough. A bare `<node-id>` is stripped there as an unknown tag, which
 * would delete the one thing the remediation tells an operator to type, and
 * single newlines collapse into one paragraph. Hence the backticks and the list.
 */
/** What the `plan` step prints and writes to the step summary. */
export function planSummary(plan: Plan) {
  return `Inventory: ${JSON.stringify(plan.inventory)}; graph plan: ${JSON.stringify(plan.issues)}; ` +
    `capacity=${plan.capacity}; wave=${plan.wave.hash}; provider_authorized=false; no execution leases acquired.\n` +
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
  if (idle && census > reached) {
    lines.push(`- A further ${census - reached} issue(s) are labelled pending but never reached admission: an open PR lineage, an \`OC-AUTO-HOLD\`, or a lane label.`);
  }
  // Below the fold, every queued issue the wave did not admit is named exactly
  // once, whatever the reason. A silent issue is the defect this exists to catch.
  if (plan.capacity > 0 && plan.unboundQueued.length > 0) {
    lines.push(`- No completion-graph node names these issues (bind one with an \`oc-node:<node-id>\` label naming a leaf): ${plan.unboundQueued.join(', ')}.`);
  }
  if (plan.capacity > 0 && plan.unreachableQueued.length > 0) {
    const named = plan.unreachableQueued.map(({ issueNumber, nodeIds }) => `#${issueNumber} (\`${nodeIds.join('`, `')}\`)`);
    lines.push(`- A node names these issues, and the ranker did not select it this wave -- its status, its dependencies, work already open on it, or another issue took it: ${named.join(', ')}.`);
  }
  for (const { issueNumber, nodeId } of plan.unknownNodeDeclarations) {
    lines.push(`- Issue #${issueNumber} declares node \`${nodeId}\`, which is not in the completion graph. Binding refused.`);
  }
  for (const { issueNumber, nodeId } of plan.unadmissibleNodeDeclarations) {
    lines.push(`- Issue #${issueNumber} declares node \`${nodeId}\`, which is not a leaf, so the ranker can never select it. Binding refused; name a leaf instead.`);
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
        api(`issues/${lease.issue}`, 'PATCH', { labels: [...new Set(record.labels.map(l => l.name)
          .filter(l => !['oc-running','oc-queued','oc-prepared'].includes(l)).concat('oc-blocked'))] });
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
