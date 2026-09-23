import { selectAdmissibleLeaf, type AdmissionDecision } from '../completion-graph/scheduler';
import {
  DETERMINISTIC_GRAPH_TASKS,
  deterministicGraphTaskFor,
  type SupervisorEvidenceReference,
  type SupervisorLane,
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

export type SupervisorPullRequestSnapshot = {
  number: number;
  repository: string;
  state: 'open' | 'closed';
  title: string;
  body: string;
  labels: string[];
  draft: boolean;
  headSha?: string;
  baseBranch?: string;
  updatedAt?: string;
};

export type SupervisorCiRunSnapshot = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  headSha?: string;
  createdAt?: string;
};

export type SupervisorRepositorySnapshot = {
  repository: string;
  issues: SupervisorIssueSnapshot[];
  pullRequests?: SupervisorPullRequestSnapshot[];
  ciRuns?: SupervisorCiRunSnapshot[];
  defaultBranch?: string;
  headSha?: string;
  available?: boolean;
  accessError?: string;
};

export type PortfolioModuleState = 'complete' | 'partial' | 'planned' | 'blocked' | 'unknown';

export type PortfolioModuleDefinition = {
  moduleId: string;
  name: string;
  lane: SupervisorLane;
  repository: string;
  evidenceReference: string;
  state: PortfolioModuleState;
  knownIssueNumbers?: number[];
};

export type PortfolioModuleObservation = PortfolioModuleDefinition & {
  access: 'available' | 'unavailable';
  openIssueNumbers: number[];
  openPullRequestNumbers: number[];
  ciRunsObserved: number;
};

export type PortfolioDiscoverySummary = {
  modules: PortfolioModuleObservation[];
  sourceCounts: Record<string, number>;
  laneCounts: Record<string, number>;
  dedupedFingerprints: string[];
  accessGaps: string[];
};

export type PortfolioIssueBinding = {
  repository: string;
  issueNumber: number;
  targetModule: string;
  lane: SupervisorLane;
  capability: string;
  sourceKind: SupervisorSourceKind;
  evidenceReference: string;
  validationCriteria: string[];
  completionEvidenceRequirements: string[];
  dependencies?: string[];
  riskClass: SupervisorTaskPacket['riskClass'];
  priority: number;
  executionMode: SupervisorTaskPacket['executionMode'];
  providerRequirement: SupervisorTaskPacket['providerRequirement'];
};

export const PORTFOLIO_REPOSITORIES = Object.freeze([
  'jsp1440/Orchid-Continuum-Brain',
  'jsp1440/orchid-calyx-backend',
  'jsp1440/orchid-continuum-frontend',
  'jsp1440/orchid-research-station',
  'jsp1440/orchid-research-station-frontend',
  'jsp1440/OrchidContinuumHarvester',
  'jsp1440/orchid-conservatory',
  'jsp1440/orchid-lexicon-botany',
  'jsp1440/Orchid_continuum_JB',
  'jsp1440/orchid-continuum-image-worker',
  'jsp1440/orchid-continuum-control-panel',
]);

/**
 * Concrete portfolio surfaces are references to implementation truth, not
 * quotas. A module observation is useful even when it cannot become executable
 * work this cycle; a packet is emitted only when an issue or graph node proves a
 * bounded contract.
 */
export const PORTFOLIO_MODULES: ReadonlyArray<PortfolioModuleDefinition> = Object.freeze([
  { moduleId: 'brain-reasoning', name: 'Brain / reasoning', lane: 'brain-reasoning', repository: 'jsp1440/Orchid-Continuum-Brain', evidenceReference: 'repository issue and module inventory scan', state: 'unknown' },
  { moduleId: 'calyx', name: 'Calyx runtime', lane: 'backend', repository: 'jsp1440/orchid-calyx-backend', evidenceReference: 'open issue / PR / CI inventory', state: 'partial', knownIssueNumbers: [1401, 1402, 1403, 1501] },
  { moduleId: 'research-station', name: 'Research Station', lane: 'research-tools', repository: 'jsp1440/orchid-research-station', evidenceReference: 'open issue / PR / CI inventory', state: 'partial', knownIssueNumbers: [18, 26] },
  { moduleId: 'illustrated-glossary', name: 'Illustrated Glossary / Lexicon', lane: 'taxonomy-data', repository: 'jsp1440/orchid-calyx-backend', evidenceReference: 'open issue #418 and backend contract inventory', state: 'partial', knownIssueNumbers: [418] },
  { moduleId: 'literature-ingestion', name: 'Literature ingestion', lane: 'literature', repository: 'jsp1440/orchid-calyx-backend', evidenceReference: 'open issues #1181 and #1361', state: 'partial', knownIssueNumbers: [1181, 1361] },
  { moduleId: 'journal-club', name: 'Journal Club ingestion', lane: 'literature', repository: 'jsp1440/Orchid_continuum_JB', evidenceReference: 'repository issue and CI inventory', state: 'unknown' },
  { moduleId: 'matrix-id', name: 'Matrix ID', lane: 'scientific-validation', repository: 'jsp1440/orchid-continuum-frontend', evidenceReference: 'completion issue #660 and cross-system contract checks', state: 'partial', knownIssueNumbers: [660] },
  { moduleId: 'atlas', name: 'Atlas', lane: 'taxonomy-data', repository: 'jsp1440/orchid-continuum-frontend', evidenceReference: 'open issue #167 and Atlas route registry', state: 'partial', knownIssueNumbers: [167] },
  { moduleId: 'interaction-graph', name: 'Interaction Graph', lane: 'integration', repository: 'jsp1440/orchid-continuum-frontend', evidenceReference: 'open issue #169 and completion graph', state: 'partial', knownIssueNumbers: [169] },
  { moduleId: 'vision-lab', name: 'Vision Lab', lane: 'media-vision', repository: 'jsp1440/orchid-continuum-frontend', evidenceReference: 'src/lib/missionControlOps.ts#vision_lab', state: 'planned' },
  { moduleId: 'university', name: 'University / education', lane: 'education', repository: 'jsp1440/orchid-continuum-frontend', evidenceReference: 'src/lib/missionControlOps.ts#ocu', state: 'partial' },
  { moduleId: 'conservatory', name: 'Conservatory', lane: 'conservatory', repository: 'jsp1440/orchid-conservatory', evidenceReference: 'open issue #15 and frontend completion issue #243', state: 'partial', knownIssueNumbers: [15] },
  { moduleId: 'improvement-discovery', name: 'Improvement Discovery Loop', lane: 'improvement-discovery', repository: 'jsp1440/orchid-calyx-backend', evidenceReference: 'open issue #1396', state: 'blocked', knownIssueNumbers: [1396] },
  { moduleId: 'taxonomy-data', name: 'Taxonomy / data integrations', lane: 'taxonomy-data', repository: 'jsp1440/orchid-calyx-backend', evidenceReference: 'open issue #1403 and frontend issue #523', state: 'partial', knownIssueNumbers: [1403] },
  { moduleId: 'testing', name: 'Testing and validation', lane: 'testing', repository: 'jsp1440/orchid-continuum-frontend', evidenceReference: 'open issue #47 and CI inventory', state: 'partial', knownIssueNumbers: [47] },
  { moduleId: 'integration', name: 'Integration contracts', lane: 'integration', repository: 'jsp1440/orchid-continuum-frontend', evidenceReference: 'scripts/verify-cross-system-contracts.mjs and issue #168', state: 'partial', knownIssueNumbers: [168] },
  { moduleId: 'completion-graph', name: 'Completion graph leaves', lane: 'integration', repository: 'jsp1440/orchid-continuum-frontend', evidenceReference: 'src/lib/completion-graph/completionGraphData.ts', state: 'partial' },
  { moduleId: 'infrastructure', name: 'Infrastructure and release readiness', lane: 'infrastructure', repository: 'jsp1440/orchid-continuum-frontend', evidenceReference: 'open issue #47 and workflow/CI inventory', state: 'partial', knownIssueNumbers: [47] },
  { moduleId: 'security-governance', name: 'Security / governance', lane: 'security-governance', repository: 'jsp1440/orchid-calyx-backend', evidenceReference: 'open issue / PR / CI inventory', state: 'partial' },
]);

/**
 * The first portfolio binding is deliberately narrow: issue #47 is a real
 * failed deterministic sentinel, and the repository already owns the exact
 * executable capability. No issue title is parsed into a command.
 */
export const PORTFOLIO_ISSUE_BINDINGS: ReadonlyArray<PortfolioIssueBinding> = Object.freeze([
  {
    repository: 'jsp1440/orchid-continuum-frontend',
    issueNumber: 47,
    targetModule: 'featured-genus-release-sentinel',
    lane: 'testing',
    capability: 'featured-genus-verification',
    sourceKind: 'failed-validation',
    evidenceReference: 'issue #47 body: failed deployed Featured Genus audit and named workflow run',
    validationCriteria: [
      'Run the repository-owned npm run verify:featured-genus sentinel against the exact admitted revision.',
      'Require the sentinel report to prove the expected deployed release, media provenance, browser render, and zero provider spend.',
      'Treat missing or malformed sentinel evidence as a failed validation; do not infer completion from issue comments.',
    ],
    completionEvidenceRequirements: [
      'Record the issue, exact implementation SHA, workflow run/lease identity, sentinel report, exit code, provider calls, and provider cost.',
      'Keep the task in validation or repair when the deployed sentinel remains red; do not claim a product fix from a failed check.',
    ],
    riskClass: 'medium',
    priority: 3,
    executionMode: 'deterministic',
    providerRequirement: 'none',
  },
]);

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
  portfolio: PortfolioDiscoverySummary;
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
  'module-state',
  'ci-evidence',
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

function portfolioBindingFor(issue: SupervisorIssueSnapshot): PortfolioIssueBinding | undefined {
  return PORTFOLIO_ISSUE_BINDINGS.find((binding) =>
    binding.repository === issue.repository && binding.issueNumber === issue.number,
  );
}

function laneFor(
  repository: string,
  capability: string,
  source: SupervisorSourceKind,
  targetModule: string,
): SupervisorLane {
  const text = (repository + ' ' + capability + ' ' + source + ' ' + targetModule).toLowerCase();
  if (text.includes('brain') || source === 'brain-backlog') return 'brain-reasoning';
  if (text.includes('literature') || text.includes('journal')) return 'literature';
  if (text.includes('vision') || text.includes('image') || text.includes('media')) return 'media-vision';
  if (text.includes('university') || text.includes('education')) return 'education';
  if (text.includes('taxonomy') || text.includes('lexicon') || text.includes('atlas') || text.includes('matrix')) return 'taxonomy-data';
  if (text.includes('conservatory')) return 'conservatory';
  if (text.includes('test') || text.includes('lint') || text.includes('typecheck') || text.includes('validation')) return 'testing';
  if (text.includes('route') || text.includes('release') || text.includes('infra')) return 'infrastructure';
  if (text.includes('security') || text.includes('govern')) return 'security-governance';
  if (text.includes('improvement')) return 'improvement-discovery';
  if (repository.includes('calyx-backend')) return 'backend';
  if (repository.includes('continuum-frontend')) return 'frontend';
  return 'integration';
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
  if (/^OC-CI-(?:FAILED|STALE):/im.test(issue.body)) return 'ci-evidence';
  if (/^OC-MODULE-STATE:/im.test(issue.body)) return 'module-state';
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
  const binding = portfolioBindingFor(issue);
  const capability = binding?.capability ?? markerCapability(issue.body, issue.labels);
  if (!capability) return null;

  const status = taskStatus(issue, capability);
  const owner = ownerGateStatus(issue.labels, issue.body);
  const nodeId = graphNodeId(issue.body);
  const kind = binding?.sourceKind ?? sourceKind(issue, capability);
  const targetModule = binding?.targetModule ?? issue.title;
  const lane = binding?.lane ?? laneFor(issue.repository, capability, kind, targetModule);
  const semanticKey = nodeId
    ? issue.repository + ':' + nodeId + ':' + capability
    : issue.repository + '#' + issue.number + ':' + capability;
  const taskId = nodeId
    ? 'graph:' + nodeId + ':' + capability
    : 'issue:' + issue.repository + '#' + issue.number + ':' + capability;
  const criteria = binding?.validationCriteria ?? [
    'Execute only the declared fixed capability on the exact admitted revision.',
    'Do not infer completion from issue prose, provider output, or an unrelated pull request.',
  ];
  const sourceEvidence: SupervisorEvidenceReference[] = [{
    kind: 'issue',
    repository: issue.repository,
    reference: '#' + issue.number,
    detail: binding?.evidenceReference ?? 'Open issue with an explicit executable capability declaration.',
  }];
  if (binding) {
    sourceEvidence.push({
      kind: 'module-manifest',
      repository: issue.repository,
      reference: binding.evidenceReference,
      detail: 'Portfolio Steward binding maps an existing issue to a repository-owned fixed executor.',
    });
  }

  return {
    schema: 'oc.supervisor-task.v1',
    taskId,
    source: { kind, repository: issue.repository, reference: nodeId ?? '#' + issue.number },
    lane,
    sourceEvidence,
    targetRepo: issue.repository,
    targetModule,
    capability,
    executionMode: binding?.executionMode ?? (PROVIDER_FREE_CAPABILITIES.has(capability) ? 'deterministic' : 'provider'),
    dependencies: [...new Set([...(binding?.dependencies ?? []), ...dependencies(issue.body)])],
    riskClass: binding?.riskClass ?? riskClass(issue.labels),
    ownerGateStatus: owner,
    providerRequirement: binding?.providerRequirement ?? (PROVIDER_FREE_CAPABILITIES.has(capability) ? 'none' : 'required'),
    validationCriteria: criteria,
    completionEvidenceRequirements: binding?.completionEvidenceRequirements ?? [
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
      fingerprint: packetFingerprint([semanticKey, binding?.evidenceReference ?? 'explicit-capability']),
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

function portfolioSummary(
  repositories: SupervisorRepositorySnapshot[],
  packets: SupervisorTaskRecord[],
): PortfolioDiscoverySummary {
  const observations = PORTFOLIO_MODULES.map((module): PortfolioModuleObservation => {
    const repository = repositories.find((entry) => entry.repository === module.repository);
    const available = repository?.available !== false;
    const issues = repository?.issues ?? [];
    const pullRequests = repository?.pullRequests ?? [];
    return {
      ...module,
      access: available ? 'available' : 'unavailable',
      openIssueNumbers: issues
        .filter((issue) => issue.state === 'open' && (module.knownIssueNumbers ?? []).includes(issue.number))
        .map((issue) => issue.number),
      openPullRequestNumbers: pullRequests
        .filter((pull) => pull.state === 'open')
        .map((pull) => pull.number),
      ciRunsObserved: repository?.ciRuns?.length ?? 0,
    };
  });
  const sourceCounts = packets.reduce<Record<string, number>>((counts, packet) => {
    counts[packet.source.kind] = (counts[packet.source.kind] ?? 0) + 1;
    return counts;
  }, {});
  const laneCounts = packets.reduce<Record<string, number>>((counts, packet) => {
    counts[packet.lane] = (counts[packet.lane] ?? 0) + 1;
    return counts;
  }, {});
  const accessGaps = observations
    .filter((module) => module.access === 'unavailable')
    .map((module) => module.repository + ' [' + module.moduleId + ']: ' + (repositories.find((entry) => entry.repository === module.repository)?.accessError ?? 'repository scan unavailable'));
  return {
    modules: observations,
    sourceCounts,
    laneCounts,
    dedupedFingerprints: [...new Set(packets.map((packet) => packet.deduplication.fingerprint))],
    accessGaps,
  };
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
    portfolio: portfolioSummary(repositories, packets),
    reasons: selection
      ? [
          'deterministic graph selection: ' + selection.node.id,
          'portfolio modules observed: ' + PORTFOLIO_MODULES.length,
          'source packets: ' + JSON.stringify(sourceCounts),
        ]
      : [
          'no explicitly bound provider-free graph leaf is currently admissible',
          'portfolio modules observed: ' + PORTFOLIO_MODULES.length,
          'source packets: ' + JSON.stringify(sourceCounts),
        ],
  };
}
