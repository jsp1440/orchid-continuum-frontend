#!/usr/bin/env npx tsx

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { COMPLETION_GRAPH } from '../src/lib/completion-graph/completionGraphData';
import {
  decideProviderFreeGraphIssueAction,
} from '../src/lib/completion-graph/graphIssueDecision';
import {
  DISCOVERY_LABEL,
  discoverGraphIssues,
  indexDiscoveryFingerprints,
  type DiscoveredIssueRef,
  type FingerprintIndex,
  type GraphDiscoveryResult,
} from '../src/lib/completion-graph/graphDiscovery';
import type { CompletionNode } from '../src/lib/completion-graph/types';
import {
  discoverSupervisorWork,
  PORTFOLIO_REPOSITORIES,
  type SupervisorCiRunSnapshot,
  type SupervisorDiscoveryResult,
  type SupervisorIssueSnapshot,
  type SupervisorPullRequestSnapshot,
  type SupervisorRepositorySnapshot,
  // `ensureQueued` annotates its packet parameter with this. Without the import
  // the whole-repository `npm run typecheck` fails on TS2304, which is a gate
  // every other change has to get past, so it is repaired here rather than
  // left for the next one to trip over.
  type SupervisorTaskRecord,
} from '../src/lib/control-plane/supervisorDiscovery';
import type { OpenIssueRef } from '../src/lib/completion-graph/executableIssue';
import {
  admitBackendReservePlan,
  MAX_RESERVE_PLAN_DEPTH,
} from '../src/lib/control-plane/backendReservePlanClient';
import type { ExistingWorkRef } from '../src/lib/control-plane/orchestratorQueueBridge';

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

export type GraphDiscoveryRun = {
  result: GraphDiscoveryResult;
  filed: Array<{ issueNumber: number; nodeId: string; fingerprint: string; capability: string }>;
  /** Candidates the loop proposed but this run could not file, with the exact failure. */
  notFiled: Array<{ nodeId: string; fingerprint: string; reason: string }>;
};

export type SupervisorRunResult = {
  schema: 'oc.supervisor-discovery.v1';
  discoveredAt: string;
  discovery: SupervisorDiscoveryResult;
  materialization: QueueAction;
  queueRefill: QueueAction[];
  graphDiscovery: GraphDiscoveryRun | { skipped: true; reason: string };
  backendReserve: BackendReserveRun;
  errors: string[];
};

/**
 * Outcome of the opt-in backend evidence-gap reserve pass. `failedClosed` names
 * the exact reason nothing was filed (transport failure, blocked upstream, or an
 * unreadable dedupe index); it is null only when admission itself succeeded.
 */
export type BackendReserveRun =
  | { enabled: false; reason: string }
  | {
      enabled: true;
      paidProviderCalls: 0;
      upstreamStatus: string | null;
      transportFailure: string | null;
      upstreamReason: string | null;
      failedClosed: string | null;
      heldFingerprints: number;
      filed: Array<{ issueNumber: number; sourceKey: string; fingerprint: string; labels: string[] }>;
      notFiled: Array<{ sourceKey: string; fingerprint: string | null; reason: string }>;
      suppressed: Array<{ sourceKey: string; reason: string }>;
      rejected: Array<{ sourceRef: string | null; reason: string }>;
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

export function isTerminalGraphIssue(body: string, labels: string[]): boolean {
  return /^OC-GRAPH-NODE:\s*[a-z0-9][a-z0-9-]*\s*$/im.test(body) ||
    labels.some((label) => /^oc-node:[a-z0-9][a-z0-9-]*$/i.test(label));
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
    .filter((issue) => isTerminalGraphIssue(issue.body ?? '', (issue.labels ?? []).map((label) => label.name)));

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
    .map((issue) => ({ number: issue.number, body: issue.body, labels: issue.labels }));
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

function fetchDiscoveryLabelled(repo: string): DiscoveredIssueRef[] {
  return flattenPaginated(ghJson<GitHubIssue[] | GitHubIssue[][]>([
    'api',
    `repos/${repo}/issues?state=all&labels=${DISCOVERY_LABEL}&per_page=100`,
    '--paginate',
    '--slurp',
  ])).filter((issue) => !issue.pull_request).map((issue) => ({ number: issue.number, state: issue.state, body: issue.body }));
}

/**
 * Every fingerprint already filed, read by LABEL (state=all, so closed issues
 * count) and never by text search. A failed read is reported as unavailable so
 * the loop files nothing; it is never treated as "nothing filed yet".
 */
export function readDiscoveryFingerprintIndex(
  repository: string,
  snapshotIssues: SupervisorIssueSnapshot[],
  fetchLabelled: (repo: string) => DiscoveredIssueRef[] = fetchDiscoveryLabelled,
): FingerprintIndex {
  try {
    const labelled = fetchLabelled(repository);
    const fingerprints = indexDiscoveryFingerprints([
      ...labelled,
      ...snapshotIssues.map((issue) => ({ number: issue.number, state: issue.state, body: issue.body })),
    ]);
    return { available: true, fingerprints };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function ensureLabel(repository: string, name: string): void {
  // `gh issue create --label` fails outright on a label that does not exist,
  // and a failed create must never read as filed. Labels are made first;
  // --force makes an existing label a no-op rather than an error.
  execFileSync('gh', ['label', 'create', name, '--repo', repository, '--force', '--color', 'ededed',
    '--description', 'Orchid Continuum governed autonomy marker'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function materializeDiscoveredGraphIssues(
  frontendIssues: SupervisorIssueSnapshot[],
  now: string,
  io: {
    fingerprintIndex: FingerprintIndex;
    ensureLabel: (name: string) => void;
    createIssue: (title: string, body: string, labels: string[]) => number;
  },
): GraphDiscoveryRun {
  const result = discoverGraphIssues(COMPLETION_GRAPH, {
    now,
    openIssues: openIssueRefs(frontendIssues),
    fingerprintIndex: io.fingerprintIndex,
  });
  const filed: GraphDiscoveryRun['filed'] = [];
  const notFiled: GraphDiscoveryRun['notFiled'] = [];
  for (const candidate of result.candidates) {
    try {
      for (const label of candidate.labels) io.ensureLabel(label);
      const issueNumber = io.createIssue(candidate.title, candidate.body, candidate.labels);
      filed.push({ issueNumber, nodeId: candidate.nodeId, fingerprint: candidate.fingerprint, capability: candidate.capability });
    } catch (error) {
      notFiled.push({ nodeId: candidate.nodeId, fingerprint: candidate.fingerprint,
        reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { result, filed, notFiled };
}

export const BACKEND_RESERVE_FLAG = 'OC_ADMIT_BACKEND_RESERVE';
const DEFAULT_CALYX_API_URL = 'https://orchid-calyx-backend.onrender.com';
const MATERIAL_FINGERPRINT = /Material fingerprint:\s*([0-9a-f]{64})\b/gi;
const QUEUE_BRIDGE_MARKER = /<!-- oc-queue-bridge:(\S+) -->/i;

export function backendReserveEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[BACKEND_RESERVE_FLAG] === '1';
}

function materialFingerprints(body: string | null | undefined): string[] {
  return [...(body ?? '').matchAll(MATERIAL_FINGERPRINT)].map((match) => match[1].toLowerCase());
}

/**
 * Material fingerprints of backend reserve work already filed: every
 * `oc-discovered` issue (open or closed, read by label, as graph discovery
 * does) plus the live snapshot. A failed read is unavailable, never empty.
 */
export function readReserveFingerprintIndex(
  repository: string,
  snapshotIssues: SupervisorIssueSnapshot[],
  fetchLabelled: (repo: string) => DiscoveredIssueRef[] = fetchDiscoveryLabelled,
): FingerprintIndex {
  try {
    const bodies = [...fetchLabelled(repository), ...snapshotIssues].map((issue) => issue.body);
    return { available: true, fingerprints: new Set(bodies.flatMap(materialFingerprints)) };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function existingWorkRefs(issues: SupervisorIssueSnapshot[]): ExistingWorkRef[] {
  return issues
    .filter((issue) => issue.state === 'open')
    .map((issue) => ({
      sourceKey: QUEUE_BRIDGE_MARKER.exec(issue.body)?.[1]?.toLowerCase(),
      title: issue.title,
      state: 'open' as const,
      kind: 'issue' as const,
    }));
}

/**
 * One bounded, opt-in pass that admits the Calyx backend evidence-gap reserve
 * plan (`oc.reserve-refill.v1`) through the canonical bridge and files at most
 * the bridge's `create` entries with the same label-first writer and
 * `oc-discovered` label/dedupe graph discovery uses. Provider-free: one GET to
 * the backend and GitHub issue writes only; no KG mutation, no publication.
 * Any transport failure, blocked upstream, or unreadable index files nothing.
 */
export async function materializeBackendReservePlan(
  frontendIssues: SupervisorIssueSnapshot[],
  io: {
    enabled: boolean;
    baseUrl: string;
    fingerprintIndex: FingerprintIndex;
    ensureLabel: (name: string) => void;
    createIssue: (title: string, body: string, labels: string[]) => number;
    fetchImpl?: typeof fetch;
  },
): Promise<BackendReserveRun> {
  if (!io.enabled) {
    return { enabled: false, reason: `${BACKEND_RESERVE_FLAG} is not '1'; backend reserve admission is off (owner opt-in).` };
  }
  const run: Extract<BackendReserveRun, { enabled: true }> = {
    enabled: true,
    paidProviderCalls: 0,
    upstreamStatus: null,
    transportFailure: null,
    upstreamReason: null,
    failedClosed: null,
    heldFingerprints: 0,
    filed: [],
    notFiled: [],
    suppressed: [],
    rejected: [],
  };
  const index = io.fingerprintIndex;
  if ('reason' in index) {
    return { ...run, failedClosed: `reserve dedupe index unavailable: ${index.reason}` };
  }
  const held = new Set(index.fingerprints);
  run.heldFingerprints = held.size;

  const admission = await admitBackendReservePlan(existingWorkRefs(frontendIssues), {
    baseUrl: io.baseUrl,
    mode: 'deterministic-no-api',
    reserveDepth: MAX_RESERVE_PLAN_DEPTH,
    heldFingerprints: [...held],
    fetchImpl: io.fetchImpl,
  });
  run.upstreamStatus = admission.bridge.upstreamStatus;
  run.transportFailure = admission.transportFailure;
  run.upstreamReason = admission.upstreamReason;
  run.rejected = admission.bridge.rejected;
  run.suppressed = [...admission.bridge.plan.suppressed];
  if (admission.transportFailure || admission.bridge.upstreamBlocked) {
    run.failedClosed = admission.transportFailure
      ? `transport: ${admission.transportFailure}`
      : `upstream blocked: ${admission.bridge.upstreamStatus}`
        + (admission.upstreamReason ? ` (${admission.upstreamReason})` : '');
    return run;
  }

  // The bridge already caps creates at the upstream reserve depth; the client
  // cap is re-applied so an oversized upstream depth can never widen a pass.
  for (const prepared of admission.bridge.plan.create.slice(0, MAX_RESERVE_PLAN_DEPTH)) {
    const fingerprint = materialFingerprints(prepared.body)[0] ?? null;
    if (!fingerprint) {
      run.notFiled.push({ sourceKey: prepared.sourceKey, fingerprint, reason: 'prepared body carries no material fingerprint' });
      continue;
    }
    if (held.has(fingerprint)) {
      run.suppressed.push({ sourceKey: prepared.sourceKey, reason: `material fingerprint ${fingerprint} already filed` });
      continue;
    }
    if (prepared.protected || prepared.labels.includes('oc-owner-gate')) {
      run.notFiled.push({ sourceKey: prepared.sourceKey, fingerprint, reason: 'protected work is never filed autonomously' });
      continue;
    }
    const labels = [...new Set([...prepared.labels, DISCOVERY_LABEL])];
    const body = `${prepared.body}\n\nOC-SUPERVISOR-SOURCE: calyx-evidence-gap-reserve`;
    try {
      for (const label of labels) io.ensureLabel(label);
      const issueNumber = io.createIssue(prepared.title, body, labels);
      held.add(fingerprint);
      run.filed.push({ issueNumber, sourceKey: prepared.sourceKey, fingerprint, labels });
    } catch (error) {
      run.notFiled.push({ sourceKey: prepared.sourceKey, fingerprint,
        reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return run;
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

export async function runSupervisorDiscovery(): Promise<SupervisorRunResult> {
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
  // The bounded "next unmet gate -> filed issue" loop. It runs only when the
  // current repository's inventory was read, and it reads its own dedupe index
  // by label; either read failing means nothing is filed this pass.
  const graphDiscovery: SupervisorRunResult['graphDiscovery'] = frontend && frontendAvailable
    ? materializeDiscoveredGraphIssues(frontend.issues, discoveredAt, {
        fingerprintIndex: readDiscoveryFingerprintIndex(currentRepository(), frontend.issues),
        ensureLabel: (name) => ensureLabel(currentRepository(), name),
        createIssue,
      })
    : { skipped: true, reason: 'Current repository issue inventory was unavailable; no graph discovery was attempted.' };
  // Opt-in backend evidence-gap reserve pass (OC_ADMIT_BACKEND_RESERVE=1).
  // Off by default so activation stays an owner decision.
  const reserveEnabled = backendReserveEnabled();
  const backendReserve = await materializeBackendReservePlan(frontend?.issues ?? [], {
    enabled: reserveEnabled,
    baseUrl: process.env.VITE_CALYX_API_URL || DEFAULT_CALYX_API_URL,
    fingerprintIndex: !reserveEnabled
      ? { available: false, reason: 'pass disabled' }
      : frontend && frontendAvailable
        ? readReserveFingerprintIndex(currentRepository(), frontend.issues)
        : { available: false, reason: 'current repository issue inventory was unavailable' },
    ensureLabel: (name) => ensureLabel(currentRepository(), name),
    createIssue,
  });

  const result: SupervisorRunResult = {
    schema: 'oc.supervisor-discovery.v1',
    discoveredAt,
    discovery,
    materialization,
    queueRefill,
    graphDiscovery,
    backendReserve,
    errors,
  };
  mkdirSync('.oc-wave', { recursive: true });
  writeFileSync('.oc-wave/supervisor-discovery.json', JSON.stringify(result, null, 2) + '\n');
  return result;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const result = await runSupervisorDiscovery();
  process.stdout.write(JSON.stringify(result) + '\n');
}
