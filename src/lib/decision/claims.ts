/**
 * claims — constructors and integrity-preserving operations over EvidenceClaim,
 * EvidenceRelation, and appraisal.
 *
 * The functions here are the only sanctioned way to build claims inside the
 * decision layer, because they encode the rules that keep the science honest:
 * a missing-information claim can never acquire an anchor and become "support",
 * counterevidence is preserved as its own relation and never netted against
 * support, and a duplicate source is recorded as DUPLICATES rather than counted
 * twice.
 */

import {
  activeLifecycle,
  initialReview,
  type AppraisalGrade,
  type ClaimKind,
  type EvidenceAppraisal,
  type EvidenceClaim,
  type EvidenceRelation,
  type EvidenceRelationKind,
  type SourceAnchor,
} from "./contracts";

let counter = 0;
/** Deterministic-ish local id; callers may pass explicit ids for reproducible runs. */
function localId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}`;
}

export type NewClaimInput = {
  claimId?: string;
  kind: ClaimKind;
  statement: string;
  taxonIds?: string[];
  anchors?: SourceAnchor[];
  modelConfidence?: number | null;
  appraisal?: EvidenceAppraisal | null;
};

/**
 * Build a claim. `missing` claims are forced anchor-free here, structurally
 * preventing the most dangerous failure mode — a "we don't know" quietly
 * carrying evidence and reading as a finding.
 */
export function makeClaim(input: NewClaimInput): EvidenceClaim {
  const isMissing = input.kind === "missing";
  return {
    claimId: input.claimId ?? localId("claim"),
    kind: input.kind,
    statement: input.statement,
    taxonIds: input.taxonIds ?? [],
    anchors: isMissing ? [] : input.anchors ?? [],
    modelConfidence: input.modelConfidence ?? null,
    appraisal: input.appraisal ?? null,
    review: initialReview(),
    lifecycle: activeLifecycle(),
  };
}

/**
 * Record a gap as a first-class `missing` claim. This is the sanctioned bridge
 * from "the data does not exist / was not retrieved" to a claim — and it can only
 * ever produce a `missing` claim, so a gap can never be laundered into absence
 * or support.
 */
export function makeMissingClaim(statement: string, taxonIds: string[] = [], claimId?: string): EvidenceClaim {
  return makeClaim({ claimId, kind: "missing", statement, taxonIds });
}

export type NewRelationInput = {
  relationId?: string;
  relation: EvidenceRelationKind;
  fromClaimId: string;
  toRef: string;
  note?: string | null;
};

export function makeRelation(input: NewRelationInput): EvidenceRelation {
  return {
    relationId: input.relationId ?? localId("rel"),
    relation: input.relation,
    fromClaimId: input.fromClaimId,
    toRef: input.toRef,
    note: input.note ?? null,
  };
}

/** The relations that weaken or oppose a claim. Kept explicit so nothing nets them away. */
const COUNTER_RELATIONS: ReadonlySet<EvidenceRelationKind> = new Set(["CONTRADICTS", "RETRACTS"]);
const QUALIFYING_RELATIONS: ReadonlySet<EvidenceRelationKind> = new Set(["QUALIFIES"]);

export function isCounterEvidence(relation: EvidenceRelationKind): boolean {
  return COUNTER_RELATIONS.has(relation);
}

export function isQualifying(relation: EvidenceRelationKind): boolean {
  return QUALIFYING_RELATIONS.has(relation);
}

/**
 * Partition a claim's relations by role. Counterevidence and qualifications are
 * returned separately and are never merged into or subtracted from support —
 * preserving them is a hard requirement (the counterevidence-preservation tests
 * hold this).
 */
export function partitionRelations(claimId: string, relations: EvidenceRelation[]) {
  const forClaim = relations.filter((r) => r.fromClaimId === claimId || r.toRef === claimId);
  return {
    supports: forClaim.filter((r) => r.relation === "SUPPORTS"),
    contradicts: forClaim.filter((r) => r.relation === "CONTRADICTS"),
    qualifies: forClaim.filter((r) => r.relation === "QUALIFIES"),
    duplicates: forClaim.filter((r) => r.relation === "DUPLICATES"),
    independent: forClaim.filter((r) => r.relation === "INDEPENDENT_OF"),
    derivedFrom: forClaim.filter((r) => r.relation === "DERIVED_FROM"),
    supersedes: forClaim.filter((r) => r.relation === "SUPERSEDES"),
    retracts: forClaim.filter((r) => r.relation === "RETRACTS"),
  };
}

/**
 * Count independent supporting sources, collapsing anything marked DUPLICATES so
 * an echoed source does not inflate apparent support. A source appraised as LOW
 * independence is still counted (it may be partly independent) but the DUPLICATES
 * relation is the explicit "this is the same source" signal and is honoured.
 */
export function independentSupportCount(claimId: string, relations: EvidenceRelation[]): number {
  const { supports, duplicates } = partitionRelations(claimId, relations);
  const duplicateRefs = new Set(duplicates.map((r) => r.toRef));
  const seen = new Set<string>();
  for (const rel of supports) {
    if (duplicateRefs.has(rel.toRef)) continue;
    seen.add(rel.toRef);
  }
  return seen.size;
}

/** Mark a claim retracted without deleting it — retraction is preserved history. */
export function retractClaim(claim: EvidenceClaim, reason: string): EvidenceClaim {
  return { ...claim, lifecycle: { ...claim.lifecycle, retractedReason: reason } };
}

/** Mark a claim superseded by another, preserving the pointer. */
export function supersedeClaim(claim: EvidenceClaim, supersededById: string): EvidenceClaim {
  return { ...claim, lifecycle: { ...claim.lifecycle, supersededBy: supersededById } };
}

/** Mark a claim stale (e.g. its taxonomy release or source snapshot moved on). */
export function markStale(claim: EvidenceClaim, reason: string): EvidenceClaim {
  return { ...claim, lifecycle: { ...claim.lifecycle, stale: true, staleReason: reason } };
}

/** True when a claim should not count toward a live conclusion. */
export function isActiveClaim(claim: EvidenceClaim): boolean {
  return claim.lifecycle.retractedReason === null && claim.lifecycle.supersededBy === null;
}

const GRADE_SCORE: Record<AppraisalGrade, number> = { high: 3, moderate: 2, low: 1, unknown: 0 };

/**
 * A decomposed appraisal *profile*, not a single truth score. Returns the count
 * of dimensions at each grade so the UI can show the shape of the appraisal.
 * Deliberately does NOT return one collapsed number — collapsing appraisal into
 * an opaque score is exactly what the contract forbids.
 */
export function appraisalProfile(appraisal: EvidenceAppraisal) {
  const dims: AppraisalGrade[] = [
    appraisal.sourceAuthority,
    appraisal.directness,
    appraisal.relevanceToQuestion,
    appraisal.methodologicalFit,
    appraisal.independence,
    appraisal.temporalRelevance,
    appraisal.completeness,
  ];
  const tally: Record<AppraisalGrade, number> = { high: 0, moderate: 0, low: 0, unknown: 0 };
  for (const grade of dims) tally[grade] += 1;
  return {
    tally,
    /** Number of dimensions that were actually appraised (not `unknown`). */
    appraisedDimensions: dims.length - tally.unknown,
    totalDimensions: dims.length,
    /** Weakest graded dimension — the honest "this is only as strong as its floor" signal. */
    weakestGraded: dims
      .filter((g) => g !== "unknown")
      .sort((a, b) => GRADE_SCORE[a] - GRADE_SCORE[b])[0] ?? "unknown",
  };
}
