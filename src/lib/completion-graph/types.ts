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

/** CI run outcome, distinguished so skipped/cancelled runs never read as a pass. */
export type CiEvidenceState = 'success' | 'failure' | 'skipped' | 'cancelled' | 'pending';

/** PR lifecycle state, distinguished so a stale/superseded PR never counts as active proof. */
export type PrEvidenceState = 'merged' | 'open' | 'stale' | 'superseded' | 'closed';

export type Evidence = {
  kind: EvidenceKind;
  ref: string;
  note?: string;
  /** Only meaningful when kind === 'ci'. */
  ciState?: CiEvidenceState;
  /** Only meaningful when kind === 'pr'. */
  prState?: PrEvidenceState;
};

/**
 * A single acceptance-gate category's score.
 *   1     = criterion confirmed met by cited evidence
 *   0     = criterion confirmed NOT met/absent by cited evidence
 *   null  = not yet evaluated in this pass (a real coverage gap for this node)
 *   'N/A' = explicitly not applicable to this node (excluded from both the
 *           percentage and the coverage denominator — distinct from `null`,
 *           which still counts against coverage as unevaluated)
 */
export type GateScoreValue = 0 | 1 | null | 'N/A';

/**
 * Acceptance-gate sub-scores, one per default weighting category.
 *
 * A leaf with no gateScores at all has not been scored — its status carries the
 * only signal (usually UNKNOWN) and its percentage must render as "not yet scored",
 * never as 0.
 */
export type AcceptanceGateScores = {
  architectureContracts: GateScoreValue;
  implementationPresent: GateScoreValue;
  integrationCanonicalBranch: GateScoreValue;
  scientificProvenanceSecurity: GateScoreValue;
  browserEndToEnd: GateScoreValue;
  deployedOperational: GateScoreValue;
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
  children: CompletionNode[];
};

export const DEFAULT_PRIORITY = 50;
