import { selectAdmissibleLeaf, type AdmissionDecision } from '../completion-graph/scheduler';
import {
  DETERMINISTIC_GRAPH_TASKS,
  deterministicGraphTaskFor,
  type SupervisorTaskPacket,
} from '../completion-graph/graphIssueDecision';
import type { CompletionNode } from '../completion-graph/types';

export type SupervisorIssueSnapshot = {
  number: number;
  repository: string;
  state: 'open' | 'closed';
  title: string;
  body: string;
  labels: string[];
  updatedAt?: string;
};

export type SupervisorRepositorySnapshot = {
  repository: string;
  issues: SupervisorIssueSnapshot[];
};

export type SupervisorTaskStatus = 'eligible' | 'parked' | 'blocked' | 'owner-gate' | 'completed';

export type SupervisorTaskRecord = SupervisorTaskPacket & {
  status: SupervisorTaskStatus;
  action: 'materialize' | 'reuse' | 'observe';
  existingIssueNumber?: number;
};

export type SupervisorDiscoveryResult = {
  scannedRepositories: string[];
  issueCounts: Record<string, number>;
  graphSelection: { nodeId: string; reasons: string[] } | null;
  packets: SupervisorTaskRecord[];
  parkedSources: Array<{ repository: string; issueNumber: number; reason: string }>;
  reasons: string[];
};

/**
 * Capabilities that the local deterministic worker can execute without any
 * provider authorization. This is deliberately a small allow-list shared with
 * the router; prose, titles, and arbitrary issue commands never infer a route.
 */
const PROVIDER_FREE_CAPABILITIES = new Set([
  'test-execution',
  'lint-execution',
  'typecheck-execution',
  'schema-validation',
  'route-verification',
  'render-route-verification',
  'featured-genus-verification',
  'build-verification',
]);

function markerCapability(body: string, labels: string[]): string | null {
  const label = labels.find((value) => /^oc-cap:[a-z0-9][a-z0-9-]*$/i.test(value));
  if (label) return label.replace(/^oc-cap:/i, '').toLowerCase();

  const marker = body.match(/^OC-(?:SWARM-CAPABILITY|BRAIN-PROVIDER-FREE):\\s*([a-z0-9][a-z0-9-]*)\\s*$/im);
  return marker?.[1]?.toLowerCase() ?? null;
}

function riskClass(labels: string[]): SupervisorTaskPacket['riskClass'] {
  if (labels.some((label) => /^oc-p0$/i.test(label))) return 'high';
  if (labels.some((label) => /^oc-p[12]$/i.test(label))) return 'medium';
  return 'low';
}

function ownerGateStatus(labels: string[], body: string): SupervisorTaskPacket['ownerGateStatus'] {
  if (labels.some((label) => /^oc-owner-gate$/i.test(label)) || /^OC-AUTO-HOLD:\\s*true\\s*$/im.test(body)) {
    return 'owner-gate';
  }
  if (labels.some((label) => /^oc-blocked$/i.test(label))) return 'blocked';
  return 'none';
}

function dependencies(body: string): string[] {
  const match = body.match(/^OC-SWARM-DEPENDS-ON:\\s*(.+)$/im);
  return match
    ? match[1].split(',').map((value) => value.trim()).filter(Boolean)
    : [];
}

function taskStatus(issue: SupervisorIssueSnapshot, capability: string | null): SupervisorTaskStatus {
  const gate = ownerGateStatus(issue.labels, issue.body);
  if (gate === 'owner-gate') return 'owner-gate';
  if (gate === 'blocked') return 'blocked';
  if (issue.labels.some((label) => /^oc-done$/i.test(label))) return 'completed';
  if (!capability || !PROVIDER_FREE_CAPABILITIES.has(capability)) return 'parked';
  if (!issue.labels.some((label) => /^oc-queued$/i.test(label))) return 'parked';
  return 'eligible';
}

function issuePacket(issue: SupervisorIssueSnapshot): SupervisorTaskRecord | null {
  const capability = markerCapability(issue.body, issue.labels);
  if (!capability) return null;
  const status = taskStatus(issue, capability);
  const owner = ownerGateStatus(issue.labels, issue.body);
  return {
    schema: 'oc.supervisor-task.v1',
    taskId: `issue:${issue.repository}#${issue.number}:${capability}`,
    source: { kind: 'issue', repository: issue.repository, reference: `#${issue.number}` },
    targetRepo: issue.repository,
    targetModule: issue.title,
    capability,
    dependencies: dependencies(issue.body),
    riskClass: riskClass(issue.labels),
    ownerGateStatus: owner,
    providerRequirement: PROVIDER_FREE_CAPABILITIES.has(capability) ? 'none' : 'required',
    validationCriteria: [
      'Execute only the declared fixed capability on the exact admitted revision.',
      'Do not infer completion from issue prose, provider output, or an unrelated pull request.',
    ],
    completionEvidenceRequirements: [
      'Record the task ID, implementation SHA, lease/run identity, exit code, and provider spend.',
      'Preserve the issue owner-gate or blocked state when the governing condition is not satisfied.',
    ],
    status,
    action: 'observe',
    existingIssueNumber: issue.number,
  };
}

function cloneAndRestrictToDeterministicLeaves(root: CompletionNode): CompletionNode {
  const copy = structuredClone(root);
  const walk = (node: CompletionNode) => {
    if (node.children.length === 0 && !DETERMINISTIC_GRAPH_TASKS[node.id]) {
      node.status = 'OWNER_ACTION';
    }
    node.children.forEach(walk);
  };
  walk(copy);
  return copy;
}

function graphSelection(
  root: CompletionNode,
  now: string,
  openWorkRefs: ReadonlySet<string>,
): AdmissionDecision | null {
  const result = selectAdmissibleLeaf(cloneAndRestrictToDeterministicLeaves(root), {
    now,
    openWorkRefs,
  });
  return result.selected;
}

function existingGraphIssue(
  node: CompletionNode,
  issues: SupervisorIssueSnapshot[],
): SupervisorIssueSnapshot | undefined {
  const marker = `OC-GRAPH-NODE: ${node.id}`;
  return issues.find((issue) =>
    issue.body.includes(marker) ||
    issue.labels.some((label) => label.toLowerCase() === `oc-node:${node.id}`.toLowerCase()),
  );
}

function graphRecord(
  selection: AdmissionDecision,
  frontendIssues: SupervisorIssueSnapshot[],
): SupervisorTaskRecord | null {
  const packet = deterministicGraphTaskFor(selection.node);
  if (!packet) return null;
  const existing = existingGraphIssue(selection.node, frontendIssues);
  return {
    ...packet,
    status: existing ? taskStatus(existing, packet.capability) : 'eligible',
    action: existing ? 'reuse' : 'materialize',
    existingIssueNumber: existing?.number,
  };
}

/**
 * Discover from the canonical completion graph and explicit issue declarations.
 * This is a pure decision function: it never creates issues or changes labels.
 * The hosted supervisor owns those mutations after this result has been
 * written as a durable discovery artifact.
 */
export function discoverSupervisorWork(
  root: CompletionNode,
  repositories: SupervisorRepositorySnapshot[],
  now: string,
): SupervisorDiscoveryResult {
  const frontend = repositories.find((entry) => entry.repository === 'jsp1440/orchid-continuum-frontend');
  const frontendIssues = frontend?.issues ?? [];
  const openWorkRefs = new Set(
    frontendIssues
      .filter((issue) => issue.state === 'open')
      .map((issue) => `#${issue.number}`),
  );
  const selection = graphSelection(root, now, openWorkRefs);
  const packets: SupervisorTaskRecord[] = [];
  const graph = selection ? graphRecord(selection, frontendIssues) : null;
  if (graph) packets.push(graph);

  const parkedSources: SupervisorDiscoveryResult['parkedSources'] = [];
  for (const repository of repositories) {
    for (const issue of repository.issues) {
      const packet = issuePacket(issue);
      if (!packet) continue;
      if (packet.status === 'parked' || packet.status === 'blocked' || packet.status === 'owner-gate') {
        parkedSources.push({
          repository: issue.repository,
          issueNumber: issue.number,
          reason: packet.status,
        });
      }
      if (!packets.some((candidate) => candidate.taskId === packet.taskId)) packets.push(packet);
    }
  }

  return {
    scannedRepositories: repositories.map((entry) => entry.repository),
    issueCounts: Object.fromEntries(repositories.map((entry) => [entry.repository, entry.issues.length])),
    graphSelection: selection
      ? { nodeId: selection.node.id, reasons: selection.reasons }
      : null,
    packets,
    parkedSources,
    reasons: selection
      ? [`deterministic graph selection: ${selection.node.id}`]
      : ['no explicitly bound provider-free graph leaf is currently admissible'],
  };
}
