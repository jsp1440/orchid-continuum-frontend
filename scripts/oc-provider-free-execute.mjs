/**
 * Run the deterministic capabilities an issue declared, and record the result.
 *
 * This writes execution evidence only. The authoritative lane receipt is written
 * by `oc-dispatch-runtime.ts settle-deterministic`, which reads this file, so
 * there is exactly one record of what the lane did and it is written by the job
 * that knows whether execution happened.
 *
 * Commands come from the router's fixed registry, never from issue text, so
 * nothing an issue author writes can become a command. Zero provider calls by
 * construction: no provider secret is present in this job.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { LOCAL_EXECUTORS } from './oc-capability-router.mjs';

const issueNumber = Number(process.env.ISSUE_NUMBER);
const repo = process.env.REPO;
// Exactly the commands this repository binds; a shared capability with no
// local executor contributes no command and must not widen this set.
const allowed = new Set(Object.values(LOCAL_EXECUTORS));
const commands = JSON.parse(process.env.COMMANDS || '[]');

if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) throw new Error('Invalid issue number');
if (!Array.isArray(commands) || commands.length === 0) throw new Error('No deterministic commands to execute');
for (const command of commands) {
  if (!allowed.has(command)) throw new Error(`refusing to run '${command}': not in the capability registry`);
}

const results = [];
let failed = false;
for (const command of commands) {
  const argv = command.split(' ');
  const run = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', shell: false });
  const exitCode = run.status ?? 1;
  const tail = String(run.stdout || '').trimEnd().split('\n').slice(-8);
  const errorTail = String(run.stderr || '').trimEnd().split('\n').slice(-8);
  results.push({ command, exit_code: exitCode, output_tail: tail, error_tail: errorTail });
  if (exitCode !== 0) failed = true;
}

// A command can carry a product-acceptance proof only through a fixed,
// repository-owned validator. Ordinary passing commands remain execution
// evidence and settle to `oc-validating`; they can never smuggle an arbitrary
// acceptance object into the receipt.
let acceptance;
if (!failed && commands.includes('npm run verify:featured-genus')) {
  try {
    const report = JSON.parse(readFileSync('artifacts/featured-genus-report.json', 'utf8'));
    const expectedRun = `${process.env.GITHUB_RUN_ID || ''}:${process.env.GITHUB_RUN_ATTEMPT || ''}`;
    const releaseSha = String(report.release_sha || '');
    const expectedReleaseSha = String(process.env.EXPECTED_RELEASE_SHA || '').trim();
    if (
      report.schema === 'oc.featured-genus-validation.v1' &&
      report.validation_kind === 'featured-genus-deployed' &&
      report.node_id === 'cap-homepage-featured-genus' &&
      report.issue === issueNumber &&
      report.wave_hash === (process.env.WAVE_HASH || null) &&
      report.run === expectedRun &&
      report.passed === true &&
      report.provider_calls === 0 &&
      report.provider_cost_usd === 0 &&
      /^[a-f0-9]{40}$/.test(releaseSha) &&
      (!expectedReleaseSha || report.expected_release_sha === expectedReleaseSha) &&
      (!expectedReleaseSha || releaseSha === expectedReleaseSha)
    ) {
      acceptance = {
        kind: report.validation_kind,
        node_id: report.node_id,
        issue: report.issue,
        passed: true,
        release_sha: releaseSha,
        expected_release_sha: report.expected_release_sha || null,
      };
    }
  } catch {
    // The command's exit code remains the hard evidence. Missing or malformed
    // acceptance metadata must not turn a successful-looking run into product
    // completion; settlement will keep it in validation instead.
  }
}

const evidence = {
  schema: 'oc.provider-free-evidence.v1',
  issue: issueNumber,
  wave_hash: process.env.WAVE_HASH || null,
  run: `${process.env.GITHUB_RUN_ID || ''}:${process.env.GITHUB_RUN_ATTEMPT || ''}`,
  provider_calls: 0,
  provider_cost_usd: 0,
  outcome: failed ? 'failed' : 'done',
  results,
  ...(acceptance ? { acceptance } : {}),
  completed_at: new Date().toISOString(),
};

// Evidence, not the lane receipt. Settlement reads this and writes the single
// authoritative receipt the audit consumes, so a run that executed can never be
// recorded by a parallel job as `provider_not_authorized`.
const evidenceDir = process.env.OC_EVIDENCE_DIR || '.oc-evidence';
mkdirSync(evidenceDir, { recursive: true });
writeFileSync(`${evidenceDir}/${issueNumber}.json`, JSON.stringify(evidence, null, 2));

// Completion rests on this evidence, not on the job having run.
const body = [
  `[OC-PROVIDER-FREE] deterministic execution ${evidence.outcome}`,
  '',
  ...results.map(r => `- \`${r.command}\` exit ${r.exit_code}`),
  '',
  '```json',
  JSON.stringify(evidence, null, 2),
  '```',
].join('\n');

if (repo) {
  execFileSync('gh', ['api', `repos/${repo}/issues/${issueNumber}/comments`, '-f', `body=${body}`], { stdio: 'inherit' });
}
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Provider-free execution for #${issueNumber}: ${evidence.outcome}, ${results.length} command(s), 0 provider calls.\n`);
}
process.exit(failed ? 1 : 0);
