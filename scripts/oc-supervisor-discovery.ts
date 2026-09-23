#!/usr/bin/env npx tsx

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { COMPLETION_GRAPH } from '../src/lib/completion-graph/completionGraphData';
import {
  decideProviderFreeGraphIssueAction,
} from '../src/lib/completion-graph/graphIssueDecision';
import type { CompletionNode } from '../src/lib/completion-graph/types';
import {
  discoverSupervisorWork,
  PORTFOLIO_REPOSITORIES,
  type SupervisorCiRunSnapshot,
  type SupervisorDiscoveryResult,
  type SupervisorIssueSnapshot,
  type SupervisorPullRequestSnapshot,
  type SupervisorRepositorySnapshot,
} from '../src/lib/control-plane/supervisorDiscovery';
import type { OpenIssueRef } from '../src/lib/completion-graph/executableIssue';

type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels?: Array<{ name: string }>;
  pull_request?: unknown;
  updated_at?: string;
};

type GitHubPullRequest = {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  draft?: boolean;
  labels?: Array<{ name: string }>;
  head?: { sha?: string };
  base?: { ref?: string };
  updated_at?: string;
};

type GitHubWorkflowRun = {
  id: number;
  name?: string;
  status?: string;
  conclusion?: string | null;
  head_sha?: string;
  created_at?: string;
};

type GitHubRepository = {
  default_branch?: string;
  default_branch_sha?: string;
  sha?: string;
};

type QueueAction = {
  action: 'created' | 'reused' | 'queued' | 'none' | 'skipped';
  repository?: string;
  issueNumber?: number;
  taskId?: string;
  fingerprint?: string;
  reason: string;
};

export type SupervisorRunResult = {
  schema: 'oc.supervisor-discovery.v1';
  discoveredAt: string;
  discovery: SupervisorDiscoveryResult;
  materialization: QueueAction;
  queueRefill: QueueAction[];
  errors: string[];
};

function ghJson<T>(args: string[]): T {
  return JSON.parse(execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  }) || 'null') as T;
}

function tryGhJson<T>(args: string[]): T | undefined {
  try {
    return ghJson<T>(args);
  } catch {
    return undefined;
  }
}

function flattenPaginated<T>(value: T[] | T[][]): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((page) => Array.isArray(page) ? page : [page]);
}

function repositoryNames(): string[] {
  const configured = (process.env.OC_SUPERVISOR_REPOSITORIES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([
    ...PORTFOLIO_REPOSITORIES,
    ...configured,
    process.env.GITHUB_REPOSITORY ?? '',
  ].filter((value) => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)))];
}

function currentRepository(): string {
  return process.env.GITHUB_REPOSITORY || 'jsp1440/orchid-continuum-frontend';
}

function snapshot(repository: string): SupervisorRepositorySnapshot {
  const openPages = ghJson<GitHubIssue[] | GitHubIssue[][]>([
    'api',
    `repos/${repository}/issues?state=open&per_page=100&sort=updated&direction=desc`,
    '--paginate',
    '--slurp',
  ]);

  // Closed, terminal graph issues are durable completion evidence. The graph
  // remains PARTIAL when a separate browser/live gate is outstanding, but a
  // bounded deterministic refresh that already reached oc-done must not be
  // materialized again under a new issue number on the next scheduler pulse.
  //
  // Fetch these only for the current orchestration repository so portfolio
  // scans of the other repositories remain bounded to their live backlog.
  const terminalPages = repository === currentRepository()
    ? ghJson<GitHubIssue[] | GitHubIssue[][]>([
        'api',
        `repos/${repository}/issues?state=closed&labels=oc-done&per_page=100&sort=updated&direction=desc`,
        '--paginate',
        '--slurp',
      ])
    : [];
  const terminalGraphIssues = flattenPaginated(terminalPages)
    .filter((issue) => !issue.pull_request)
    .filter((issue) => {
      const labels = (issue.labels ?? []).map((label) => label.name);
      return /^OC-GRAPH-NODE:\\s*[a-z0-9][a-z0-9-]*\\s*$/im.test(issue.body ?? '') ||
        labels.some((label) => /^oc-node:[a-z0-9][a-z0-9-]*$/i.test(label));
    });

  const inventory = [
    ...flattenPaginated(openPages).filter((issue) => !issue.pull_request),
    ...terminalGraphIssues,
  ];
  const deduped = inventory.filter((issue, index) =>
    inventory.findIndex((candidate) => candidate.number === issue.number) === index,
  );
  const issues: SupervisorIssueSnapshot[] = deduped
    .map((issue) => ({
      number: issue.number,
      repository,
      state: issue.state,
      title: issue.title,
      body: issue.body ?? '',
      labels: (issue.labels ?? []).map((label) => label.name),
      updatedAt: issue.updated_at,
    }));

  // PR and CI state are evidence sources, not admission commands. If either
  // endpoint is unavailable, keep the issue inventory and record the gap in the
  // repository observation instead of converting an access failure into work.
  const pullRequests = flattenPaginated(tryGhJson<GitHubPullRequest[] | GitHubPullRequest[][]>([
    'api',
    `repos/${repository}/pulls?state=open&per_page=50&sort=updated&direction=desc`,
  ]) ?? []).map((pull): SupervisorPullRequestSnapshot => ({
    number: pull.number,
    repository,
    state: pull.state,
    title: pull.title,
    body: pull.body ?? '',
    labels: (pull.labels ?? []).map((label) => label.name),
    draft: pull.draft === true,
    headSha: pull.head?.sha,
    baseBranch: pull.base?.ref,
    updatedAt: pull.updated_at,
  }));
  const ciRuns = (tryGhJson<{ workflow_runs?: GitHubWorkflowRun[] }>([
    'api',
    `repos/${repository}/actions/runs?per_page=20`,
  ])?.workflow_runs ?? []).map((run): SupervisorCiRunSnapshot => ({
    id: run.id,
    name: run.name ?? '',
    status: run.status ?? 'unknown',
    conclusion: run.conclusion ?? null,
    headSha: run.head_sha,
    createdAt: run.created_at,
  }));
  const metadata = tryGhJson<GitHubRepository>([
    'api',
    `repos/${repository}`,
  ]);
  return {
    repository,
    issues,
    pullRequests,
    ciRuns,
    defaultBranch: metadata?.default_branch,
    headSha: metadata?.default_branch_sha ?? metadata?.sha,
    available: true,
  };
}

function findNode(root: CompletionNode, id: string): CompletionNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function createIssue(title: string, body: string, labels: string[]): number {
  const labelArgs = labels.flatMap((label) => ['--label', label]);
  const url = execFileSync(
    'gh',
    ['issue', 'create', '--title', title, '--body', body, ...labelArgs],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
  const match = url.match(/\/issues\/(\d+)\/?$/);
  if (!match) throw new Error('Supervisor issue materialization returned no issue URL');
  return Number(match[1]);
}

function openIssueRefs(issues: SupervisorIssueSnapshot[]): OpenIssueRef[] {
  return issues
    .filter((issue) => issue.state === 'open')
    .map((issue) => ({ number: issue.number, body: issue.body }));
}

function materializeGraph(
  discovery: SupervisorDiscoveryResult,
  frontendIssues: SupervisorIssueSnapshot[],
  now: string,
): QueueAction {
  const candidate = discovery.packets.find((packet) =>
    packet.source.kind === 'completion-graph' &&
    packet.action === 'materialize' &&
    packet.status === 'eligible',
  );
  if (!candidate) {
    const reusable = discovery.packets.find((packet) =>
      packet.source.kind === 'completion-graph' &&
      packet.action === 'reuse',
    );
    return reusable
      ? {
          action: 'reused',
          repository: reusable.targetRepo,
          issueNumber: reusable.existingIssueNumber,
          taskId: reusable.taskId,
          fingerprint: reusable.deduplication.fingerprint,
          reason: 'Existing governed issue #' + reusable.existingIssueNumber +
            ' already carries ' + reusable.taskId + '.',
        }
      : {
          action: 'none',
          reason: discovery.reasons.join('; '),
        };
  }

  const node = findNode(COMPLETION_GRAPH, candidate.source.reference);
  if (!node) {
    return {
      action: 'skipped',
      taskId: candidate.taskId,
      fingerprint: candidate.deduplication.fingerprint,
      reason: 'Selected graph node ' + candidate.source.reference +
        ' disappeared from the checked-out graph; failed closed.',
    };
  }
  const decision = decideProviderFreeGraphIssueAction(node, openIssueRefs(frontendIssues), now);
  if (decision.action === 'reuse-existing') {
    return {
      action: 'reused',
      repository: candidate.targetRepo,
      issueNumber: decision.issueNumber,
      taskId: candidate.taskId,
      fingerprint: candidate.deduplication.fingerprint,
      reason: decision.reason,
    };
  }
  if (decision.action !== 'create') {
    return {
      action: 'skipped',
      taskId: candidate.taskId,
      fingerprint: candidate.deduplication.fingerprint,
      reason: decision.reason,
    };
  }

  const issueNumber = createIssue(decision.title, decision.body, decision.labels);
  return {
    action: 'created',
    repository: candidate.targetRepo,
    issueNumber,
    taskId: candidate.taskId,
    fingerprint: candidate.deduplication.fingerprint,
    reason: decision.reason,
  };
}

function ensureQueued(issue: SupervisorIssueSnapshot, packet?: SupervisorTaskRecord): QueueAction {
  const labels = new Set(issue.labels);
  const labelsToAdd = ['oc-queued'];
  if (packet && !labels.has('oc-cap:' + packet.capability)) {
    labelsToAdd.push('oc-cap:' + packet.capability);
  }
  if (packet?.graphNodeId && !labels.has('oc-node:' + packet.graphNodeId)) {
    labelsToAdd.push('oc-node:' + packet.graphNodeId);
  }
  const missing = labelsToAdd.filter((label) => !labels.has(label));
  if (missing.length === 0) {
    return {
      action: 'reused',
      repository: issue.repository,
      issueNumber: issue.number,
      taskId: packet?.taskId,
      fingerprint: packet?.deduplication.fingerprint,
      reason: 'The eligible packet is already in the governed queue with its declared capability.',
    };
  }
  execFileSync('gh', [
    'issue',
    'edit',
    String(issue.number),
    '--repo',
    issue.repository,
    ...missing.flatMap((label) => ['--add-label', label]),
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return {
    action: 'queued',
    repository: issue.repository,
    issueNumber: issue.number,
    taskId: packet?.taskId,
    fingerprint: packet?.deduplication.fingerprint,
    reason: 'The supervisor reconciled the canonical queue label and explicit capability declaration.',
  };
}

function refillEligibleIssues(
  discovery: SupervisorDiscoveryResult,
  repositories: SupervisorRepositorySnapshot[],
): QueueAction[] {
  const current = currentRepository();
  const byIssue = new Map(
    repositories.flatMap((repository) => repository.issues.map((issue) => [
      repository.repository + '#' + issue.number,
      issue,
    ])),
  );
  return discovery.packets
    .filter((packet) => packet.status === 'eligible' && ['queue', 'reuse'].includes(packet.action))
    .map((packet): QueueAction => {
      if (packet.targetRepo !== current) {
        return {
          action: 'skipped',
          repository: packet.targetRepo,
          issueNumber: packet.existingIssueNumber,
          taskId: packet.taskId,
          fingerprint: packet.deduplication.fingerprint,
          reason: 'Eligible packet belongs to another repository; its local supervisor must own queue mutation.',
        };
      }
      const issue = byIssue.get(packet.targetRepo + '#' + packet.existingIssueNumber);
      if (!issue) {
        return {
          action: 'skipped',
          repository: packet.targetRepo,
          taskId: packet.taskId,
          fingerprint: packet.deduplication.fingerprint,
          reason: 'Issue inventory changed before queue mutation; failed closed.',
        };
      }
      return {
        ...ensureQueued(issue, packet),
        taskId: packet.taskId,
        fingerprint: packet.deduplication.fingerprint,
      };
    });
}

export function runSupervisorDiscovery(): SupervisorRunResult {
  const discoveredAt = new Date().toISOString();
  const errors: string[] = [];
  const repositories: SupervisorRepositorySnapshot[] = [];
  for (const repository of repositoryNames()) {
    try {
      repositories.push(snapshot(repository));
    } catch (error) {
      errors.push('Unable to scan ' + repository + ': ' +
        (error instanceof Error ? error.message : String(error)));
      repositories.push({
        repository,
        issues: [],
        pullRequests: [],
        ciRuns: [],
        available: false,
        accessError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const discovery = discoverSupervisorWork(COMPLETION_GRAPH, repositories, discoveredAt);
  const frontend = repositories.find((entry) => entry.repository === currentRepository());
  const frontendAvailable = frontend &&
    !errors.some((error) => error.startsWith('Unable to scan ' + currentRepository() + ':'));
  const materialization = frontend && frontendAvailable
    ? materializeGraph(discovery, frontend.issues, discoveredAt)
    : {
        action: 'skipped' as const,
        reason: 'Current repository issue inventory was unavailable; no queue mutation was attempted.',
      };
  const queueRefill = frontend && frontendAvailable
    ? refillEligibleIssues(discovery, repositories)
    : [];

  const result: SupervisorRunResult = {
    schema: 'oc.supervisor-discovery.v1',
    discoveredAt,
    discovery,
    materialization,
    queueRefill,
    errors,
  };
  mkdirSync('.oc-wave', { recursive: true });
  writeFileSync('.oc-wave/supervisor-discovery.json', JSON.stringify(result, null, 2) + '\n');
  return result;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const result = runSupervisorDiscovery();
  process.stdout.write(JSON.stringify(result) + '\n');
}
