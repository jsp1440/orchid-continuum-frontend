/**
 * Route one issue for the lane, and record the routing whichever way it goes.
 *
 * Emits `provider_free` and the fixed command list the worker will run. A
 * refusal is written as a durable record naming what the task declared and what
 * could have run, rather than the bare `provider_not_authorized` the lane
 * previously left behind.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { CapabilityUnknown, commandsFor, refusalRecord, routeIssue } from './oc-capability-router.mjs';

const issueNumber = Number(process.env.ISSUE_NUMBER);
const repo = process.env.REPO;
if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) throw new Error('Invalid issue number');

function output(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  else console.log(`${key}=${value}`);
}

const raw = execFileSync('gh', ['api', `repos/${repo}/issues/${issueNumber}`], { encoding: 'utf8' });
const issue = JSON.parse(raw);

let routing;
try {
  // Labels carry declarations too, so they have to reach the router.
  routing = routeIssue({ number: issueNumber, body: issue.body, labels: issue.labels });
} catch (error) {
  // An unclassified capability is a routing failure, not a licence to spend.
  const reason = error instanceof CapabilityUnknown ? 'unclassified_capability' : 'invalid_declaration';
  output('provider_free', 'false');
  output('commands', '[]');
  mkdirSync('.oc-receipts', { recursive: true });
  writeFileSync(`.oc-receipts/route-${issueNumber}.json`, JSON.stringify({
    schema: 'oc.lane-refusal.v1', issue: issueNumber, reason, detail: String(error.message),
  }, null, 2));
  console.error(`issue #${issueNumber}: ${reason}: ${error.message}`);
  process.exit(0);
}

const commands = commandsFor(routing);
output('provider_free', String(routing.providerFree));
output('commands', JSON.stringify(commands));

mkdirSync('.oc-receipts', { recursive: true });
writeFileSync(
  `.oc-receipts/route-${issueNumber}.json`,
  JSON.stringify(refusalRecord(issue, routing), null, 2),
);

console.log(`issue #${issueNumber}: provider_free=${routing.providerFree} commands=${JSON.stringify(commands)}`);
