import { execSync } from 'node:child_process';
import { COMPLETION_GRAPH } from '../src/lib/completion-graph/completionGraphData';
import { selectAdmissibleLeaf } from '../src/lib/completion-graph/scheduler';

function ghJson(args: string): unknown {
  const out = execSync(`gh ${args}`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out || '[]');
}

function collectOpenWorkRefs(): Set<string> {
  const refs = new Set<string>();

  const issueList = ghJson(`issue list --state open --limit 200 --json number`) as Array<{ number: number }>;
  for (const issue of issueList) {
    refs.add(`#${issue.number}`);
  }

  const prList = ghJson(`pr list --state open --limit 200 --json number`) as Array<{ number: number }>;
  for (const pr of prList) {
    refs.add(`#${pr.number}`);
  }

  return refs;
}

function normalizeRef(ref: string): string {
  return ref.replace(/^.*#/, '');
}

const result = selectAdmissibleLeaf(COMPLETION_GRAPH, {
  now: new Date().toISOString(),
  openWorkRefs: collectOpenWorkRefs(),
});

const selectedNode = result.selected?.node;
const issueNumber = selectedNode?.issues?.map(normalizeRef).find((value) => /^\d+$/.test(value)) ?? '';
const firstPrNumber = selectedNode?.prs?.map(normalizeRef).find((value) => /^\d+$/.test(value)) ?? '';
const fallbackIssue = issueNumber || firstPrNumber;

const payload = {
  admissible: result.selected !== null,
  selected: selectedNode?.id ?? null,
  issueNumber: fallbackIssue,
  mode: selectedNode ? (fallbackIssue ? 'issue' : 'node') : 'blocked',
  surfacedBlockers: result.surfacedBlockers.map((node) => node.id),
  suppressedDuplicates: result.suppressedDuplicates.map((node) => node.id),
  reasons: result.selected?.reasons ?? [],
};

console.log(JSON.stringify(payload));
