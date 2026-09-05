import { execFileSync } from 'node:child_process';
import { COMPLETION_GRAPH } from '../src/lib/completion-graph/completionGraphData';
import type { OpenIssueRef } from '../src/lib/completion-graph/executableIssue';
import { decideGraphIssueAction } from '../src/lib/completion-graph/graphIssueDecision';
import { selectAdmissibleLeaf } from '../src/lib/completion-graph/scheduler';

function ghJson(args: string[]): unknown {
  const out = execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out || '[]');
}

function collectOpenIssues(): OpenIssueRef[] {
  return ghJson(['issue', 'list', '--state', 'open', '--limit', '200', '--json', 'number,body']) as OpenIssueRef[];
}

function collectOpenWorkRefs(openIssues: OpenIssueRef[]): Set<string> {
  const refs = new Set<string>();

  for (const issue of openIssues) {
    refs.add(`#${issue.number}`);
  }

  const prList = ghJson(['pr', 'list', '--state', 'open', '--limit', '200', '--json', 'number']) as Array<{ number: number }>;
  for (const pr of prList) {
    refs.add(`#${pr.number}`);
  }

  return refs;
}

function createIssue(title: string, body: string, labels: string[]): number {
  const labelArgs = labels.flatMap((label) => ['--label', label]);
  const url = execFileSync(
    'gh',
    ['issue', 'create', '--title', title, '--body', body, ...labelArgs],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
  const match = url.match(/\/issues\/(\d+)\/?$/);
  if (!match) {
    throw new Error(`Graph issue materialization did not return an issue URL for title "${title}"`);
  }
  return Number(match[1]);
}

const now = new Date().toISOString();
const openIssues = collectOpenIssues();
const result = selectAdmissibleLeaf(COMPLETION_GRAPH, {
  now,
  openWorkRefs: collectOpenWorkRefs(openIssues),
});

const selectedNode = result.selected?.node ?? null;
const decision = decideGraphIssueAction(selectedNode, openIssues, now);

let issueNumber: number | null = null;
let materialized = false;

if (decision.action === 'reuse-existing') {
  issueNumber = decision.issueNumber;
} else if (decision.action === 'create') {
  issueNumber = createIssue(decision.title, decision.body, decision.labels);
  materialized = true;
} else {
  // no-admissible-node / fail-closed: log why so the workflow run has a durable
  // trail explaining why nothing was created, per the "log why, never guess" rule.
  console.error(`[graph-admission] ${decision.reason}`);
}

const payload = {
  admissible: result.selected !== null,
  selected: selectedNode?.id ?? null,
  issueNumber: issueNumber ?? '',
  mode: issueNumber !== null ? 'issue' : 'blocked',
  materialized,
  decision: decision.action,
  reason: decision.reason,
  surfacedBlockers: result.surfacedBlockers.map((node) => node.id),
  suppressedDuplicates: result.suppressedDuplicates.map((node) => node.id),
  reasons: result.selected?.reasons ?? [],
};

console.log(JSON.stringify(payload));
