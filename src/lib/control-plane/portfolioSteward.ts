import {
  planQueueBridge,
  sourceKey,
  type ExistingWorkRef,
  type QueueBridgeCandidate,
  type QueueBridgePlan,
  type QueueSourceKind,
} from './orchestratorQueueBridge';

export type CapabilityState = 'implemented' | 'missing' | 'unknown';
export type BrainIntentState = 'required' | 'absent' | 'ambiguous';
export type PortfolioPriority = QueueBridgeCandidate['priority'];

export interface ModuleCapabilityObservation {
  module: string;
  brainIntent: BrainIntentState;
  frontend: CapabilityState;
  backend: CapabilityState;
  priority: PortfolioPriority;
  evidence: string[];
  protectedClasses?: string[];
}

export interface PortfolioRepositoryState {
  brain: 'available' | 'unavailable';
  frontend: 'available' | 'unavailable';
  backend: 'available' | 'unavailable';
}

export interface QueueBridgeSourceObservation {
  sourceKind: QueueSourceKind;
  state: 'connected' | 'unavailable' | 'unknown';
  evidence: string[];
}

export interface PortfolioStewardInput {
  observations: ModuleCapabilityObservation[];
  /** Omit only when a caller has not yet adopted durable source coverage reporting. */
  queueBridgeSources?: QueueBridgeSourceObservation[];
  repositories: PortfolioRepositoryState;
  existing: ExistingWorkRef[];
  actionableCount: number;
  maxActiveLanes: number;
  wavesAhead: number;
  targetFloor: number;
  maxCreatePerCycle: number;
}

export interface PortfolioStewardDiagnostics {
  mode: 'deterministic-no-api';
  paidProviderCalls: 0;
  actionableCount: number;
  targetDepth: number;
  refillDeficit: number;
  discoveredGaps: string[];
  dedupeSuppressions: Array<{ sourceKey: string; reason: string }>;
  blockers: string[];
  queueBridgeCoverage: {
    tracked: boolean;
    complete: boolean;
    connected: QueueSourceKind[];
    unresolved: Array<{
      sourceKind: QueueSourceKind;
      state: 'unavailable' | 'unknown';
      evidence: string[];
    }>;
  };
  inventory: {
    persistedBridgeDepth: number;
    createdCount: number;
    retiredCount: number;
    projectedActionableCount: number;
    duplicateSuppressionCount: number;
    protectedParkedCount: number;
  };
}

export interface PortfolioStewardResult {
  plan: QueueBridgePlan;
  diagnostics: PortfolioStewardDiagnostics;
}

const BRAIN_REPO = 'jsp1440/OrchidContinuumBrain';
const REPOSITORY_NAMES = ['brain', 'frontend', 'backend'] as const;
const QUEUE_BRIDGE_SOURCES: QueueSourceKind[] = [
  'autonomous-orchestrator',
  'brain-knowledge-gap',
  'self-audit',
  'connector-queue',
  'bounded-engineering-executor',
];

function positiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
}

function nonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
}

function slug(value: string): string {
  const result = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!result) throw new Error('module must have a stable identity');
  return result;
}

function evidenceText(observation: ModuleCapabilityObservation): string {
  const evidence = [...new Set(observation.evidence.map((item) => item.trim()).filter(Boolean))].sort();
  return evidence.length ? evidence.join('; ') : 'No repository evidence supplied; reconciliation required.';
}

function capabilityCandidate(observation: ModuleCapabilityObservation): QueueBridgeCandidate | null {
  const id = slug(observation.module);
  if (observation.brainIntent === 'absent') return null;

  if (observation.brainIntent === 'ambiguous') {
    return {
      sourceRepo: BRAIN_REPO,
      sourceKind: 'brain-knowledge-gap',
      sourceId: `intent-reconciliation-${id}`,
      title: `RECONCILE: ${observation.module} intent versus repository truth`,
      body:
        `Brain intent for ${observation.module} is ambiguous. Reconcile existing evidence without inventing requirements. ` +
        `Evidence: ${evidenceText(observation)}`,
      priority: observation.priority,
      unfinished: true,
      protectedClasses: observation.protectedClasses,
    };
  }

  const missing = [
    observation.frontend === 'missing' ? 'frontend' : null,
    observation.backend === 'missing' ? 'backend' : null,
  ].filter((item): item is string => Boolean(item));
  const unknown = observation.frontend === 'unknown' || observation.backend === 'unknown';

  if (unknown) {
    return {
      sourceRepo: BRAIN_REPO,
      sourceKind: 'brain-knowledge-gap',
      sourceId: `evidence-reconciliation-${id}`,
      title: `RECONCILE: verify ${observation.module} implementation evidence`,
      body:
        `Repository truth for ${observation.module} is incomplete. Verify the unknown implementation state before creating feature work. ` +
        `Evidence: ${evidenceText(observation)}`,
      priority: observation.priority,
      unfinished: true,
      protectedClasses: observation.protectedClasses,
    };
  }

  return {
    sourceRepo: BRAIN_REPO,
    sourceKind: 'brain-knowledge-gap',
    sourceId: `module-capability-${id}`,
    title: `CAPABILITY GAP: ${observation.module} ${missing.join(' + ')} parity`,
    body:
      missing.length > 0
        ? `Brain requires ${observation.module}; bounded implementation remains in: ${missing.join(', ')}. Evidence: ${evidenceText(observation)}`
        : `Brain-required ${observation.module} is implemented in frontend and backend. Evidence: ${evidenceText(observation)}`,
    priority: observation.priority,
    unfinished: missing.length > 0,
    integratedCompletion: missing.length === 0,
    protectedClasses: observation.protectedClasses,
  };
}

function repositoryBlockers(repositories: PortfolioRepositoryState): QueueBridgeCandidate[] {
  return REPOSITORY_NAMES.flatMap((repository) => {
    if (repositories[repository] === 'available') return [];
    return [{
      sourceRepo: BRAIN_REPO,
      sourceKind: 'bounded-engineering-executor' as const,
      sourceId: `repository-unavailable-${repository}`,
      title: `RECONCILE: ${repository} repository unavailable to Portfolio Steward`,
      body:
        `The ${repository} repository could not be inspected. Continue reconciling unaffected repositories and preserve exactly one diagnostic lineage until availability changes.`,
      priority: 'oc-p0' as const,
      unfinished: true,
    }];
  });
}

interface QueueBridgeCoverage {
  tracked: boolean;
  complete: boolean;
  connected: QueueSourceKind[];
  unresolved: Array<{
    sourceKind: QueueSourceKind;
    state: 'unavailable' | 'unknown';
    evidence: string[];
  }>;
}

function queueBridgeCoverage(
  observations: QueueBridgeSourceObservation[] | undefined,
): QueueBridgeCoverage {
  if (observations === undefined) {
    return { tracked: false, complete: false, connected: [], unresolved: [] };
  }

  const bySource = new Map<QueueSourceKind, QueueBridgeSourceObservation[]>();
  for (const observation of observations) {
    const current = bySource.get(observation.sourceKind) ?? [];
    current.push(observation);
    bySource.set(observation.sourceKind, current);
  }

  const connected: QueueSourceKind[] = [];
  const unresolved: QueueBridgeCoverage['unresolved'] = [];

  for (const sourceKind of QUEUE_BRIDGE_SOURCES) {
    const sourceObservations = bySource.get(sourceKind) ?? [];
    const evidence = [...new Set(
      sourceObservations.flatMap((item) => item.evidence.map((value) => value.trim())).filter(Boolean),
    )].sort();
    const states = new Set(sourceObservations.map((item) => item.state));
    const state = sourceObservations.length === 1 && states.has('connected') && evidence.length > 0
      ? 'connected'
      : states.has('unavailable')
        ? 'unavailable'
        : 'unknown';

    if (state === 'connected') connected.push(sourceKind);
    else unresolved.push({ sourceKind, state, evidence });
  }

  return {
    tracked: true,
    complete: unresolved.length === 0,
    connected,
    unresolved,
  };
}

function queueBridgeSourceCandidates(coverage: QueueBridgeCoverage): QueueBridgeCandidate[] {
  if (!coverage.tracked) return [];

  return coverage.unresolved.map((source) => ({
    sourceRepo: 'jsp1440/orchid-continuum-frontend',
    sourceKind: source.sourceKind,
    sourceId: `portfolio-source-reconciliation-${source.sourceKind}`,
    title: `RECONCILE: ${source.sourceKind} Queue Bridge source coverage`,
    body:
      `Portfolio Steward cannot prove the ${source.sourceKind} durable source is connected. ` +
      'Reconcile existing implementation evidence before creating replacement feature work. ' +
      `Evidence: ${source.evidence.length ? source.evidence.join('; ') : 'none supplied'}`,
    priority: 'oc-p0',
    unfinished: true,
  }));
}

export function derivePortfolioStewardTarget(
  maxActiveLanes: number,
  wavesAhead: number,
  targetFloor: number,
): number {
  positiveInteger(maxActiveLanes, 'maxActiveLanes');
  positiveInteger(wavesAhead, 'wavesAhead');
  nonNegativeInteger(targetFloor, 'targetFloor');
  return Math.max(targetFloor, maxActiveLanes * wavesAhead);
}

/**
 * Provider-free Portfolio Steward planning.
 *
 * Repository observations are supplied by a read-only adapter. This pure layer
 * converts only evidenced gaps into Queue Bridge candidates, creates one bounded
 * diagnostic for ambiguous/unavailable evidence, and delegates all duplicate,
 * completion, protection, and priority behavior to the canonical Queue Bridge.
 */
export function planPortfolioSteward(input: PortfolioStewardInput): PortfolioStewardResult {
  nonNegativeInteger(input.actionableCount, 'actionableCount');
  nonNegativeInteger(input.maxCreatePerCycle, 'maxCreatePerCycle');

  const targetDepth = derivePortfolioStewardTarget(
    input.maxActiveLanes,
    input.wavesAhead,
    input.targetFloor,
  );
  const refillDeficit = Math.max(0, targetDepth - input.actionableCount);
  const bridgeOpenCount = input.existing.filter(
    (item) => item.state === 'open' && Boolean(item.sourceKey),
  ).length;
  const boundedSlots = Math.min(refillDeficit, input.maxCreatePerCycle);
  const coverage = queueBridgeCoverage(input.queueBridgeSources);
  const candidates = [
    ...repositoryBlockers(input.repositories),
    ...queueBridgeSourceCandidates(coverage),
    ...input.observations
      .slice()
      .sort((a, b) => slug(a.module).localeCompare(slug(b.module)))
      .map(capabilityCandidate)
      .filter((item): item is QueueBridgeCandidate => item !== null),
  ];

  const rawPlan = planQueueBridge(
    candidates,
    input.existing,
    bridgeOpenCount + boundedSlots,
  );
  const plan = {
    ...rawPlan,
    targetDepth,
  };

  return {
    plan,
    diagnostics: {
      mode: 'deterministic-no-api',
      paidProviderCalls: 0,
      actionableCount: input.actionableCount,
      targetDepth,
      refillDeficit,
      discoveredGaps: candidates
        .filter((candidate) => candidate.unfinished)
        .map(sourceKey)
        .sort(),
      dedupeSuppressions: plan.suppressed,
      blockers: plan.protected
        .map((item) => `${item.sourceKey}: ${item.blockedReasons.join(', ')}`)
        .sort(),
      queueBridgeCoverage: coverage,
      inventory: {
        persistedBridgeDepth: plan.preparedOpenCount,
        createdCount: plan.create.length,
        retiredCount: plan.retire.length,
        projectedActionableCount: Math.max(
          0,
          input.actionableCount - plan.retire.length + plan.create.length,
        ),
        duplicateSuppressionCount: plan.suppressed.length,
        protectedParkedCount: plan.protected.length,
      },
    },
  };
}
