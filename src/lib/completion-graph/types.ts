/**
 * Canonical completion graph — shared types.
 *
 * Represents the recursive hierarchy required by OC-OBSERVATORY-001:
 *   Portfolio -> Domain -> Module -> Capability -> Integration -> Acceptance Gate
 *
 * A "leaf" is any node with no children, regardless of its declared `type` —
 * a capability that has not yet been decomposed further is a valid (UNKNOWN) leaf.
 */

export type CompletionNodeType =
  | 'portfolio'
  | 'domain'
  | 'module'
  | 'capability'
  | 'integration'
  | 'acceptance_gate';

export type CompletionStatus =
  | 'DONE'
  | 'PARTIAL'
  | 'MISSING'
  | 'BLOCKED'
  | 'OWNER_ACTION'
  | 'EXTERNAL_BLOCKER'
  | 'UNKNOWN';

/** One of the "three levels of done" tracked independently per the mission spec. */
export type CompletionLevelState = 'MET' | 'PARTIAL' | 'NOT_MET' | 'NOT_APPLICABLE' | 'UNKNOWN';

export type ThreeLevelsOfDone = {
  codeComplete: CompletionLevelState;
  integratedComplete: CompletionLevelState;
  productComplete: CompletionLevelState;
};

/** Execution lanes the scheduler and Mission Control must surface separately. */
export type ExecutionLane =
  | 'PRODUCT_COMPLETION'
  | 'INTEGRATION_COMPLETION'
  | 'SCIENTIFIC_DATA_COMPLETION'
  | 'RELEASE_ACCEPTANCE';

export type EvidenceKind = 'file' | 'route' | 'test' | 'pr' | 'issue' | 'ci' | 'doc' | 'commit';

export type Evidence = {
  kind: EvidenceKind;
  ref: string;
  note?: string;
};

/**
 * Acceptance-gate sub-scores, one per default weighting category.
 *
 * Value contract (deliberately coarse to avoid inventing precision we don't have):
 *   1    = criterion confirmed met by cited evidence
 *   0    = criterion confirmed NOT met/absent by cited evidence
 *   null = not yet evaluated in this pass, OR not applicable to this node
 * A leaf with no gateScores at all has not been scored — its status carries the
 * only signal (usually UNKNOWN) and its percentage must render as "not yet scored",
 * never as 0.
 */
export type AcceptanceGateScores = {
  architectureContracts: number | null;
  implementationPresent: number | null;
  integrationCanonicalBranch: number | null;
  scientificProvenanceSecurity: number | null;
  browserEndToEnd: number | null;
  deployedOperational: number | null;
};

export type CompletionNode = {
  id: string;
  parentId: string | null;
  name: string;
  type: CompletionNodeType;
  status: CompletionStatus;
  threeLevels: ThreeLevelsOfDone;
  lane?: ExecutionLane;
  /** Only meaningful when this node has been directly scored (see AcceptanceGateScores contract). */
  gateScores?: AcceptanceGateScores;
  evidence: Evidence[];
  issues?: string[];
  prs?: string[];
  blockers?: string[];
  ownerActions?: string[];
  externalBlockers?: string[];
  nextAction: string;
  lastAccomplishment?: string;
  lastUpdated: string;
  /** Lower = more urgent for scheduler ordering. Default applied when absent. */
  priority?: number;
  /**
   * Ids of other nodes in this graph that must independently roll up to DONE
   * before the scheduler may admit this leaf. An id that does not resolve in
   * the graph is treated as unsatisfied (fail closed) rather than ignored.
   */
  dependsOn?: string[];
  /**
   * Marks this leaf as a cross-cutting security/governance acceptance gate.
   * Per OC-COMPLETE-004, such leaves must never be treated as cosmetic lane
   * work: the scheduler exempts them from lane-fairness deprioritization so
   * an otherwise-busy lane can never starve a pending security gate.
   */
  securityGate?: boolean;
  children: CompletionNode[];
};

export const DEFAULT_PRIORITY = 50;
