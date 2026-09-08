import {
  planQueueBridge,
  sourceKey,
  type ExistingWorkRef,
  type QueueBridgeCandidate,
  type QueueBridgePlan,
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

export interface PortfolioStewardInput {
  observations: ModuleCapabilityObservation[];
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
}

export interface PortfolioStewardResult {
  plan: QueueBridgePlan;
  diagnostics: PortfolioStewardDiagnostics;
}

const BRAIN_REPO = 'jsp1440/OrchidContinuumBrain';
const REPOSITORY_NAMES = ['brain', 'frontend', 'backend'] as const;

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
  const candidates = [
    ...repositoryBlockers(input.repositories),
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
    },
  };
}
