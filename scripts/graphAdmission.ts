import { execFileSync } from 'node:child_process';
import { COMPLETION_GRAPH } from '../src/lib/completion-graph/completionGraphData';
import {
  graphNodeMarker,
  liveIssuesForNode,
  resolveExecutableIssue,
  type OpenIssueRef,
} from '../src/lib/completion-graph/executableIssue';
import { selectAdmissibleLeaf, type AdmissionResult } from '../src/lib/completion-graph/scheduler';
import type { CompletionNode } from '../src/lib/completion-graph/types';

function ghJson(args: string[]): unknown {
  const out = execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out || '[]');
}

function collectOpenIssues(): OpenIssueRef[] {
  return ghJson([
    'issue',
    'list',
    '--state',
    'open',
    '--limit',
    '200',
    '--json',
    'number,body,labels',
  ]) as OpenIssueRef[];
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

function materializeGraphIssue(node: CompletionNode): number {
  const marker = graphNodeMarker(node.id);
  const title = `Graph leaf: ${node.name}`;
  const body = [
    'This bounded work item was materialized directly from the canonical completion graph because the selected admissible leaf had no live executable issue.',
    '',
    `Graph node: \`${node.id}\``,
    `Lane: \`${node.lane ?? 'UNSPECIFIED'}\``,
    '',
    '## Required next action',
    node.nextAction || 'Reconcile this leaf against current canonical evidence and implement the smallest safe acceptance step.',
    '',
    '## Completion discipline',
    '- The completion graph remains authoritative for WHAT work is selected.',
    '- Update the graph evidence/status when acceptance evidence changes so the scheduler can advance naturally.',
    '- Do not infer scientific absence from unavailable evidence and do not weaken provenance or sensitive-locality protections.',
    '- Production deployment, production data/KG mutation, taxonomy activation, publication, credentials, spending, and destructive operations remain owner-gated.',
    '',
    marker,
  ].join('\n');

  const url = execFileSync(
    'gh',
    ['issue', 'create', '--title', title, '--body', body, '--label', 'oc-queued', '--label', 'oc-auto-generated'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
  const match = url.match(/\/issues\/(\d+)\/?$/);
  if (!match) {
    throw new Error(`Graph issue materialization did not return an issue URL for ${node.id}`);
  }
  return Number(match[1]);
}

const openIssues = collectOpenIssues();
const openWorkRefs = collectOpenWorkRefs(openIssues);
const excludedNodeIds = new Set<string>();
const suppressedNonExecutable: string[] = [];
let result: AdmissionResult = selectAdmissibleLeaf(COMPLETION_GRAPH, {
  now: new Date().toISOString(),
  openWorkRefs,
  excludedNodeIds,
});
let selectedNode: CompletionNode | undefined;
let issueNumber: number | null = null;
let materialized = false;

// Graph priority remains authoritative. If the highest-ranked leaf is already
// represented by a live but non-executable issue (running, validating, parked,
// blocked, owner-gated, or terminal), exclude only that node for this pulse and
// ask the graph for its next admissible leaf. Never fall through to the legacy
// queue merely because the first graph candidate cannot acquire a lease.
while (result.selected) {
  selectedNode = result.selected.node;
  const liveIssues = liveIssuesForNode(selectedNode, openIssues);
  issueNumber = resolveExecutableIssue(selectedNode, openIssues);

  if (issueNumber !== null) break;

  if (liveIssues.length === 0) {
    issueNumber = materializeGraphIssue(selectedNode);
    materialized = true;
    break;
  }

  suppressedNonExecutable.push(selectedNode.id);
  excludedNodeIds.add(selectedNode.id);
  result = selectAdmissibleLeaf(COMPLETION_GRAPH, {
    now: new Date().toISOString(),
    openWorkRefs,
    excludedNodeIds,
  });
  selectedNode = undefined;
}

const payload = {
  admissible: selectedNode !== undefined && issueNumber !== null,
  selected: selectedNode?.id ?? null,
  issueNumber: issueNumber ?? '',
  mode: selectedNode ? 'issue' : 'blocked',
  materialized,
  suppressedNonExecutable,
  surfacedBlockers: result.surfacedBlockers.map((node) => node.id),
  suppressedDuplicates: result.suppressedDuplicates.map((node) => node.id),
  reasons: result.selected?.reasons ?? [],
};

console.log(JSON.stringify(payload));
