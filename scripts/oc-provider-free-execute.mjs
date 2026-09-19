/**
 * Run the deterministic capabilities an issue declared, and record the result.
 *
 * Commands come from the router's fixed registry, never from issue text, so
 * nothing an issue author writes can become a command. Zero provider calls by
 * construction: no provider secret is present in this job.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { LOCAL_EXECUTORS } from './oc-capability-router.mjs';

const issueNumber = Number(process.env.ISSUE_NUMBER);
const repo = process.env.REPO;
// Exactly the commands this repository binds; a shared capability with no
// local executor contributes no command and must not widen this set.
const allowed = new Set(Object.values(LOCAL_EXECUTORS));
const commands = JSON.parse(process.env.COMMANDS || '[]');

if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) throw new Error('Invalid issue number');
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
  results.push({ command, exit_code: exitCode, output_tail: tail });
  if (exitCode !== 0) failed = true;
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
  completed_at: new Date().toISOString(),
};

mkdirSync('.oc-receipts', { recursive: true });
writeFileSync(`.oc-receipts/provider-free-${issueNumber}.json`, JSON.stringify(evidence, null, 2));

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
