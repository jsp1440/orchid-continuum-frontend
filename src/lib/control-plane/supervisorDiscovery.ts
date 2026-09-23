import { selectAdmissibleLeaf, type AdmissionDecision } from '../completion-graph/scheduler';
import {
  DETERMINISTIC_GRAPH_TASKS,
  deterministicGraphTaskFor,
  type SupervisorSourceKind,
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
export type SupervisorTaskAction = 'materialize' | 'queue' | 'reuse' | 'observe';

export type SupervisorTaskRecord = SupervisorTaskPacket & {
  status: SupervisorTaskStatus;
  action: SupervisorTaskAction;
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
 * provider authorization. Prose, titles, and arbitrary issue commands never
 * infer a route.
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

const SOURCE_KINDS = new Set<SupervisorSourceKind>([
  'completion-graph',
  'brain-backlog',
  'failed-validation',
  'dependency-gap',
  'stale-evidence',
  'integration-gap',
  'deterministic-check',
  'improvement-discovery',
  'issue',
]);

const CAPABILITY_PATTERN = '[a-z0-9][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)*';

export function packetFingerprint(parts: string[]): string {
  let hash = 2166136261;
  for (const character of parts.join('\\u001f')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return 'ocfp1-' + (hash >>> 0).toString(16).padStart(8, '0');
}

function markerCapability(body: string, labels: string[]): string | null {
  const label = labels.find((value) => /^oc-cap:[a-z0-9][a-z0-9-]*$/i.test(value));
  if (label) return label.replace(/^oc-cap:/i, '').toLowerCase();

  const marker = body.match(new RegExp(
    '^OC-(?:SWARM-CAPABILITY|BRAIN-PROVIDER-FREE|QUEUE-CAPABILITY):\\s*(' +
      CAPABILITY_PATTERN +
      ')\\s*`?\\s*$',
    'im',
  ));
  return marker?.[1]?.toLowerCase() ?? null;
}
function graphNodeId(body: string): string | null {
  return body.match(/^OC-GRAPH-NODE:\s*([a-z0-9][a-z0-9-]*)\s*$/im)?.[1]?.toLowerCase() ?? null;
}

function riskClass(labels: string[]): SupervisorTaskPacket['riskClass'] {
  if (labels.some((label) => /^oc-p0$/i.test(label))) return 'high';
  if (labels.some((label) => /^oc-p[12]$/i.test(label))) return 'medium';
  return 'low';
}

function ownerGateStatus(labels: string[], body: string): SupervisorTaskPacket['ownerGateStatus'] {
  if (labels.some((label) => /^oc-owner-gate$/i.test(label)) || /^OC-AUTO-HOLD:\s*true\s*$/im.test(body)) {
    return 'owner-gate';
  }
  if (labels.some((label) => /^oc-blocked$/i.test(label))) return 'blocked';
  return 'none';
}

function dependencies(body: string): string[] {
  const match = body.match(/^OC-SWARM-DEPENDS-ON:\s*(.+)$/im);
  return match ? match[1].split(',').map((value) => value.trim()).filter(Boolean) : [];
}

function sourceKind(issue: SupervisorIssueSnapshot, capability: string | null): SupervisorSourceKind {
  const explicit = issue.body.match(/^OC-SUPERVISOR-SOURCE:\s*([a-z-]+)\s*$/im)?.[1] as SupervisorSourceKind | undefined;
  if (explicit && SOURCE_KINDS.has(explicit)) return explicit;
  if (graphNodeId(issue.body)) return 'completion-graph';
  if (issue.repository === 'jsp1440/Orchid-Continuum-Brain') return 'brain-backlog';
  if (/^OC-SWARM-DEPENDS-ON:/im.test(issue.body)) return 'dependency-gap';
  if (issue.labels.some((label) => /^oc-repair$/i.test(label)) || /^OC-VALIDATION-FAILED:/im.test(issue.body)) {
    return 'failed-validation';
  }
  if (issue.labels.some((label) => /^oc-runtime-backoff$/i.test(label)) || /^OC-EVIDENCE-STALE:/im.test(issue.body)) {
    return 'stale-evidence';
  }
  if (/^OC-SWARM-WRITES:.*integration/im.test(issue.body) || /^OC-INTEGRATION-GAP:/im.test(issue.body)) {
    return 'integration-gap';
  }
  if (capability?.startsWith('improvement:')) return 'improvement-discovery';
  if (capability && /(schema|data|contract|check)/i.test(capability)) return 'deterministic-check';
  return 'issue';
}

function priority(labels: string[]): number {
  const label = labels.find((value) => /^oc-p[0-5]$/i.test(value));
  return label ? Number(label.slice(-1)) : 5;
}

function lifecycleState(
  issue: SupervisorIssueSnapshot,
  status: SupervisorTaskStatus,
): SupervisorTaskPacket['lifecycleState'] {
  if (status === 'completed') return 'completed';
  if (status === 'owner-gate') return 'owner-gate';
  if (status === 'blocked') return 'blocked';
  if (issue.labels.some((label) => /^oc-validating$/i.test(label))) return 'validating';
  if (issue.labels.some((label) => /^oc-running$/i.test(label))) return 'executing';
  if (issue.labels.some((label) => /^oc-(queued|prepared)$/i.test(label))) return 'queued';
  if (status === 'eligible') return 'discovered';
  return 'parked';
}

function taskStatus(issue: SupervisorIssueSnapshot, capability: string | null): SupervisorTaskStatus {
  const gate = ownerGateStatus(issue.labels, issue.body);
  if (gate === 'owner-gate') return 'owner-gate';
  if (gate === 'blocked') return 'blocked';
  if (issue.labels.some((label) => /^oc-done$/i.test(label))) return 'completed';
  if (issue.labels.some((label) => /^oc-(running|validating|runtime-backoff)$/i.test(label))) return 'parked';
  if (!capability || !PROVIDER_FREE_CAPABILITIES.has(capability)) return 'parked';
  return 'eligible';
}

function issuePacket(issue: SupervisorIssueSnapshot): SupervisorTaskRecord | null {
  const capability = markerCapability(issue.body, issue.labels);
  if (!capability) return null;

  const status = taskStatus(issue, capability);
  const owner = ownerGateStatus(issue.labels, issue.body);
  const nodeId = graphNodeId(issue.body);
  const kind = sourceKind(issue, capability);
  const semanticKey = nodeId
    ? issue.repository + ':' + nodeId + ':' + capability
    : issue.repository + '#' + issue.number + ':' + capability;
  const taskId = nodeId
    ? 'graph:' + nodeId + ':' + capability
    : 'issue:' + issue.repository + '#' + issue.number + ':' + capability;
  const criteria = [
    'Execute only the declared fixed capability on the exact admitted revision.',
    'Do not infer completion from issue prose, provider output, or an unrelated pull request.',
  ];

  return {
    schema: 'oc.supervisor-task.v1',
    taskId,
    source: { kind, repository: issue.repository, reference: nodeId ?? '#' + issue.number },
    targetRepo: issue.repository,
    targetModule: issue.title,
    capability,
    executionMode: PROVIDER_FREE_CAPABILITIES.has(capability) ? 'deterministic' : 'provider',
    dependencies: dependencies(issue.body),
    riskClass: riskClass(issue.labels),
    ownerGateStatus: owner,
    providerRequirement: PROVIDER_FREE_CAPABILITIES.has(capability) ? 'none' : 'required',
    validationCriteria: criteria,
    completionEvidenceRequirements: [
      'Record the task ID, implementation SHA, lease/run identity, exit code, and provider spend.',
      'Preserve the issue owner-gate or blocked state when the governing condition is not satisfied.',
    ],
    validationContract: { criteria, failClosed: true },
    evidenceContract: {
      schema: PROVIDER_FREE_CAPABILITIES.has(capability)
        ? 'oc.provider-free-evidence.v1'
        : 'oc.task-evidence.v1',
      requiredFields: ['taskId', 'implementationSha', 'runId', 'leaseId', 'lifecycleState'],
    },
    deduplication: {
      fingerprint: packetFingerprint([semanticKey]),
      semanticKey,
    },
    priority: priority(issue.labels),
    lifecycleState: lifecycleState(issue, status),
    status,
    action: status === 'eligible'
      ? (issue.labels.some((label) => /^oc-queued$/i.test(label)) ? 'reuse' : 'queue')
      : 'observe',
    existingIssueNumber: issue.number,
  };
}

function existingGraphIssue(
  node: CompletionNode,
  issues: SupervisorIssueSnapshot[],
): SupervisorIssueSnapshot | undefined {
  const marker = 'OC-GRAPH-NODE: ' + node.id;
  return issues.find((issue) =>
    issue.body.includes(marker) ||
    issue.labels.some((label) => label.toLowerCase() === 'oc-node:' + node.id.toLowerCase()),
  );
}

function shouldSuppressExistingGraphIssue(issue: SupervisorIssueSnapshot): boolean {
  return issue.labels.some((label) => /^oc-(?:done|blocked|owner-gate|validating|running|runtime-backoff)$/i.test(label));
}

function cloneAndRestrictToDeterministicLeaves(
  root: CompletionNode,
  frontendIssues: SupervisorIssueSnapshot[],
): CompletionNode {
  const copy = structuredClone(root);
  const walk = (node: CompletionNode) => {
    if (node.children.length === 0) {
      if (!DETERMINISTIC_GRAPH_TASKS[node.id]) {
        node.status = 'OWNER_ACTION';
      } else {
        const existing = existingGraphIssue(node, frontendIssues);
        if (existing && shouldSuppressExistingGraphIssue(existing)) node.status = 'OWNER_ACTION';
      }
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
  frontendIssues: SupervisorIssueSnapshot[],
): AdmissionDecision | null {
  const result = selectAdmissibleLeaf(cloneAndRestrictToDeterministicLeaves(root, frontendIssues), {
    now,
    openWorkRefs,
  });
  return result.selected;
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
    lifecycleState: existing ? lifecycleState(existing, taskStatus(existing, packet.capability)) : 'discovered',
    existingIssueNumber: existing?.number,
  };
}

export function discoverSupervisorWork(
  root: CompletionNode,
  repositories: SupervisorRepositorySnapshot[],
  now: string,
): SupervisorDiscoveryResult {
  const frontend = repositories.find((entry) => entry.repository === 'jsp1440/orchid-continuum-frontend');
  const frontendIssues = frontend?.issues ?? [];
  const openWorkRefs = new Set(
    frontendIssues.filter((issue) => issue.state === 'open').map((issue) => '#' + issue.number),
  );
  const selection = graphSelection(root, now, openWorkRefs, frontendIssues);
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
      if (!packets.some((candidate) => candidate.deduplication.fingerprint === packet.deduplication.fingerprint)) {
        packets.push(packet);
      }
    }
  }

  const sourceCounts = packets.reduce<Record<string, number>>((counts, packet) => {
    counts[packet.source.kind] = (counts[packet.source.kind] ?? 0) + 1;
    return counts;
  }, {});

  return {
    scannedRepositories: repositories.map((entry) => entry.repository),
    issueCounts: Object.fromEntries(repositories.map((entry) => [entry.repository, entry.issues.length])),
    graphSelection: selection
      ? { nodeId: selection.node.id, reasons: selection.reasons }
      : null,
    packets,
    parkedSources,
    reasons: selection
      ? ['deterministic graph selection: ' + selection.node.id, 'source packets: ' + JSON.stringify(sourceCounts)]
      : [
          'no explicitly bound provider-free graph leaf is currently admissible',
          'source packets: ' + JSON.stringify(sourceCounts),
        ],
  };
}
