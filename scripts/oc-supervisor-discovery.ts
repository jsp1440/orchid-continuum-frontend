#!/usr/bin/env npx tsx

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { COMPLETION_GRAPH } from '../src/lib/completion-graph/completionGraphData';
import {
  decideProviderFreeGraphIssueAction,
  type SupervisorTaskPacket,
} from '../src/lib/completion-graph/graphIssueDecision';
import type { CompletionNode } from '../src/lib/completion-graph/types';
import {
  discoverSupervisorWork,
  type SupervisorDiscoveryResult,
  type SupervisorIssueSnapshot,
  type SupervisorRepositorySnapshot,
  type SupervisorTaskRecord,
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

export type SupervisorRunResult = {
  schema: 'oc.supervisor-discovery.v1';
  discoveredAt: string;
  discovery: SupervisorDiscoveryResult;
  materialization: {
    action: 'created' | 'reused' | 'none' | 'skipped';
    issueNumber?: number;
    taskId?: string;
    reason: string;
  };
  errors: string[];
};

function ghJson<T>(args: string[]): T {
  return JSON.parse(execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  }) || 'null') as T;
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
    'jsp1440/Orchid-Continuum-Brain',
    'jsp1440/orchid-calyx-backend',
    'jsp1440/orchid-continuum-frontend',
    ...configured,
    process.env.GITHUB_REPOSITORY ?? '',
  ].filter((value) => /^[\\w.-]+\\/[\\w.-]+$/.test(value)))];
}

function snapshot(repository: string): SupervisorRepositorySnapshot {
  const pages = ghJson<GitHubIssue[] | GitHubIssue[][]>([
    'api',
    `repos/${repository}/issues?state=open&per_page=100&sort=updated&direction=desc`,
    '--paginate',
    '--slurp',
  ]);
  const issues: SupervisorIssueSnapshot[] = flattenPaginated(pages)
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({
      number: issue.number,
      repository,
      state: issue.state,
      title: issue.title,
      body: issue.body ?? '',
      labels: (issue.labels ?? []).map((label) => label.name),
      updatedAt: issue.updated_at,
    }));
  return { repository, issues };
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
  const match = url.match(/\\/issues\\/(\\d+)\\/?$/);
  if (!match) throw new Error('Supervisor issue materialization returned no issue URL');
  return Number(match[1]);
}

function openIssueRefs(issues: SupervisorIssueSnapshot[]): OpenIssueRef[] {
  return issues.map((issue) => ({ number: issue.number, body: issue.body }));
}

function materialize(
  discovery: SupervisorDiscoveryResult,
  frontendIssues: SupervisorIssueSnapshot[],
  now: string,
): SupervisorRunResult['materialization'] {
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
          issueNumber: reusable.existingIssueNumber,
          taskId: reusable.taskId,
          reason: `Existing governed issue #${reusable.existingIssueNumber} already carries ${reusable.taskId}.`,
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
      reason: `Selected graph node ${candidate.source.reference} disappeared from the checked-out graph; failed closed.`,
    };
  }
  const decision = decideProviderFreeGraphIssueAction(node, openIssueRefs(frontendIssues), now);
  if (decision.action === 'reuse-existing') {
    return {
      action: 'reused',
      issueNumber: decision.issueNumber,
      taskId: candidate.taskId,
      reason: decision.reason,
    };
  }
  if (decision.action !== 'create') {
    return {
      action: 'skipped',
      taskId: candidate.taskId,
      reason: decision.reason,
    };
  }

  const issueNumber = createIssue(decision.title, decision.body, decision.labels);
  return {
    action: 'created',
    issueNumber,
    taskId: candidate.taskId,
    reason: decision.reason,
  };
}

export function runSupervisorDiscovery(): SupervisorRunResult {
  const discoveredAt = new Date().toISOString();
  const errors: string[] = [];
  const repositories: SupervisorRepositorySnapshot[] = [];
  for (const repository of repositoryNames()) {
    try {
      repositories.push(snapshot(repository));
    } catch (error) {
      errors.push(`Unable to scan ${repository}: ${error instanceof Error ? error.message : String(error)}`);
      repositories.push({ repository, issues: [] });
    }
  }

  const discovery = discoverSupervisorWork(COMPLETION_GRAPH, repositories, discoveredAt);
  const frontend = repositories.find((entry) => entry.repository === 'jsp1440/orchid-continuum-frontend');
  const materialization = frontend && !errors.some((error) => error.includes('jsp1440/orchid-continuum-frontend'))
    ? materialize(discovery, frontend.issues, discoveredAt)
    : {
        action: 'skipped' as const,
        reason: 'Frontend issue inventory was unavailable; no queue mutation was attempted.',
      };

  const result: SupervisorRunResult = {
    schema: 'oc.supervisor-discovery.v1',
    discoveredAt,
    discovery,
    materialization,
    errors,
  };
  mkdirSync('.oc-wave', { recursive: true });
  writeFileSync('.oc-wave/supervisor-discovery.json', `${JSON.stringify(result, null, 2)}\\n`);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runSupervisorDiscovery();
  process.stdout.write(`${JSON.stringify(result)}\\n`);
}
