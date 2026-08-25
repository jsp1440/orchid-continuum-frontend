/**
 * contracts — the canonical evidence-to-decision contracts for the Orchid
 * Continuum Research Workbench.
 *
 * This is the missing foundation identified by the reality audit for
 * frontend #359 / Brain #103: the existing systems (evidence retrieval, the
 * research workspace, Check Calyx / the Verification Workbench, species
 * dossiers) each hold a piece of a rigorous decision, but nothing binds a
 * *complex question* to an *explicit decision frame*, an evidence ledger, an
 * uncertainty assessment, a reproducible run manifest, and a review-gated
 * decision artifact. These contracts do exactly that, and only that — they add
 * no second evidence store, no second taxonomy, no second citation model. Where
 * an identity already exists (taxon ids, source anchor / revision ids, evidence
 * relation vocabulary) these contracts reference it rather than mint a rival.
 *
 * Scientific-integrity rules encoded structurally, not by convention:
 *   - Missing information is a first-class claim kind, never coerced into
 *     biological absence or fabricated support.
 *   - Counterevidence and conflicts are preserved as their own relations, never
 *     netted away against support.
 *   - Evidence quality is a decomposed appraisal, never one opaque truth score.
 *   - Model confidence is labelled as such and kept distinct from empirical
 *     certainty.
 *   - Every durable object carries review state; nothing is "verified" or
 *     "accepted" without a recorded human gate. Knowledge-graph write-back is
 *     proposal-only in this layer.
 */

/**
 * Contract family version. Bump the MINOR for additive, backward-compatible
 * fields; bump the MAJOR when an existing field's meaning changes. Stamped into
 * every RunEvidenceManifest so a stored run declares exactly which contract it
 * was produced under.
 */
export const DECISION_CONTRACT_VERSION = "1.0.0" as const;

/* ------------------------------------------------------------------ *
 * Shared vocabularies
 * ------------------------------------------------------------------ */

/**
 * The epistemic kind of a claim. Keeping these distinct is the whole point:
 * a direct observation and an interpretation must never render as the same
 * grade of fact, and "we do not know" must never silently become "it is absent".
 */
export const CLAIM_KINDS = [
  "direct_observation",
  "sourced_assertion",
  "computation",
  "interpretation",
  "hypothesis",
  "missing",
] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

/**
 * How one piece of evidence relates to a claim or to other evidence. Mirrors and
 * extends the disagreement vocabulary the research workspace already uses
 * (`CONTRADICTS`) so the two surfaces speak the same language. Support and
 * contradiction are never collapsed.
 */
export const EVIDENCE_RELATIONS = [
  "SUPPORTS",
  "CONTRADICTS",
  "QUALIFIES",
  "DUPLICATES",
  "INDEPENDENT_OF",
  "DERIVED_FROM",
  "SUPERSEDES",
  "RETRACTS",
] as const;
export type EvidenceRelationKind = (typeof EVIDENCE_RELATIONS)[number];

/**
 * Decomposed appraisal dimensions. Confidence is NOT one of these on purpose:
 * a reader appraises source authority, directness, relevance, method, and so on,
 * and only then forms a judgement. Each dimension is graded on an explicit,
 * inspectable scale, or left `unknown` — which is itself informative.
 */
export const APPRAISAL_GRADES = ["high", "moderate", "low", "unknown"] as const;
export type AppraisalGrade = (typeof APPRAISAL_GRADES)[number];

export type EvidenceAppraisal = {
  /** Peer-reviewed vs. dataset vs. horticultural report vs. model output, etc. */
  sourceType: string;
  sourceAuthority: AppraisalGrade;
  /** Direct measurement/observation vs. inference several steps removed. */
  directness: AppraisalGrade;
  /** Relevance to *this* taxon and *this* question, not the topic in general. */
  relevanceToQuestion: AppraisalGrade;
  methodologicalFit: AppraisalGrade;
  /** LOW here flags a source that merely echoes another already counted. */
  independence: AppraisalGrade;
  temporalRelevance: AppraisalGrade;
  completeness: AppraisalGrade;
};

/** Review lifecycle. Nothing reaches `approved` without a recorded human review. */
export const REVIEW_STATES = ["draft", "in_review", "approved", "changes_requested", "rejected"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export type ReviewRecord = {
  state: ReviewState;
  /** Subject id of the reviewer; null while unreviewed. Never auto-filled. */
  reviewer: string | null;
  reviewedAt: string | null;
  note: string | null;
};

export function initialReview(): ReviewRecord {
  return { state: "draft", reviewer: null, reviewedAt: null, note: null };
}

/** Lifecycle a durable scientific object can enter after first authorship. */
export type LifecycleState = {
  /** Stale once its inputs (taxonomy release, source snapshot) move on. */
  stale: boolean;
  staleReason: string | null;
  /** Id of the object that supersedes this one, if any. */
  supersededBy: string | null;
  /** Set when a claim/evidence has been retracted; retraction is preserved, not deleted. */
  retractedReason: string | null;
};

export function activeLifecycle(): LifecycleState {
  return { stale: false, staleReason: null, supersededBy: null, retractedReason: null };
}

/* ------------------------------------------------------------------ *
 * Source anchoring — reuse, do not reinvent, provenance
 * ------------------------------------------------------------------ */

/**
 * A lawful pointer back to where a claim came from. This intentionally mirrors
 * the identifiers the governed backends already emit — `revision_id` and
 * `source_anchor_ids` from evidence retrieval, `content_hash` from Check Calyx,
 * dossier `EvidenceReceipt` source ids — so a SourceAnchor is a *reference into*
 * canonical provenance, never a competing record of it.
 *
 * `displayPolicy` and `excerptAbsence` carry the same governed distinction the
 * Verification Workbench already draws: an excerpt withheld by policy is not the
 * same scientific state as an excerpt that was never supplied, and neither is
 * "no evidence".
 */
export type SourceAnchor = {
  anchorId: string;
  /** Canonical class of the underlying source. `fixture` is explicit and honest. */
  sourceKind:
    | "literature"
    | "occurrence_dataset"
    | "trait_dataset"
    | "specimen"
    | "taxonomic_treatment"
    | "computation"
    | "fixture";
  title: string | null;
  /** Canonical revision id from the governed store, when the source has one. */
  revisionId: string | number | null;
  /** Canonical anchor ids into the governed evidence store. */
  sourceAnchorIds: (string | number)[];
  /** Content hash from the governed store; null when the source carries none. */
  contentHash: string | null;
  locator: unknown;
  retrievedAt: string | null;
  license: string | null;
  attribution: string | null;
  displayPolicy: string | null;
  excerptAbsence: "withheld_by_policy" | "not_supplied" | null;
};

/* ------------------------------------------------------------------ *
 * Evidence claims and relations
 * ------------------------------------------------------------------ */

export type EvidenceClaim = {
  claimId: string;
  kind: ClaimKind;
  /** The atomic statement. For `missing`, this states what is NOT known. */
  statement: string;
  /** Canonical taxon id(s) the claim is about; reuses taxonomy identity. */
  taxonIds: string[];
  /**
   * Anchors backing the claim. A `missing` claim legitimately has none — that is
   * the point — but a `direct_observation` or `sourced_assertion` with none is a
   * contract violation (see `validateClaim`).
   */
  anchors: SourceAnchor[];
  /**
   * Model confidence, explicitly labelled as a model self-report and kept in
   * [0,1]; null when not offered. Never presented as empirical certainty and
   * never the sole basis for a decision.
   */
  modelConfidence: number | null;
  appraisal: EvidenceAppraisal | null;
  review: ReviewRecord;
  lifecycle: LifecycleState;
};

/** A typed edge between a claim and evidence, or between two claims. */
export type EvidenceRelation = {
  relationId: string;
  relation: EvidenceRelationKind;
  /** The claim this relation bears on. */
  fromClaimId: string;
  /** The claim/evidence it relates to (another claim id, or an anchor id). */
  toRef: string;
  note: string | null;
};

/* ------------------------------------------------------------------ *
 * Decision frame — the "explicit decision frame" the mission demands
 * ------------------------------------------------------------------ */

export type DecisionFrame = {
  question: string;
  /** What the finished artifact is meant to be (e.g. a cultivation classification). */
  intendedOutput: string;
  audience: string[];
  scope: string;
  assumptions: string[];
  constraints: string[];
  inclusionCriteria: string[];
  exclusionCriteria: string[];
  /** The explicit stopping rule — when is the evidence "enough"? */
  stoppingRule: string;
};

/** A candidate answer the decision is choosing among. */
export type DecisionAlternative = {
  alternativeId: string;
  label: string;
  description: string;
};

/** A dimension along which alternatives are compared. */
export type ComparisonCriterion = {
  criterionId: string;
  label: string;
  description: string;
  /** Relative importance, explicit and editable; not a hidden weighting. */
  weight: number;
};

/* ------------------------------------------------------------------ *
 * Research plan
 * ------------------------------------------------------------------ */

export type ResearchPlanStep = {
  stepId: string;
  /** Which orchestration stage this step feeds. */
  stage: DecisionStage;
  description: string;
  /** Orchid Continuum data classes / literature scopes this step will draw on. */
  dataClasses: string[];
};

export type ResearchPlan = {
  planId: string;
  steps: ResearchPlanStep[];
  /** Pinned taxonomy release the whole plan resolves names against. */
  taxonomyRelease: string;
  editableByUser: true;
};

/* ------------------------------------------------------------------ *
 * Orchestration stages
 * ------------------------------------------------------------------ */

export const DECISION_STAGES = [
  "FRAME",
  "PLAN",
  "RETRIEVE",
  "SCREEN",
  "EXTRACT",
  "SYNTHESIZE",
  "CHALLENGE",
  "VERIFY",
  "RENDER",
  "REVIEW",
] as const;
export type DecisionStage = (typeof DECISION_STAGES)[number];

/* ------------------------------------------------------------------ *
 * Uncertainty and synthesis outputs
 * ------------------------------------------------------------------ */

export type EvidenceGap = {
  gapId: string;
  /** What is not known. Phrased as a missing-information statement. */
  description: string;
  /** Optional link to a `missing` claim that records the same gap. */
  claimId: string | null;
  /** Could become a bounded Continuum mission. */
  couldBecomeMission: boolean;
};

export type EvidenceConflict = {
  conflictId: string;
  claimId: string;
  /** The contradicting/qualifying claim. */
  counterClaimId: string;
  relation: Extract<EvidenceRelationKind, "CONTRADICTS" | "QUALIFIES">;
  description: string;
};

export type UncertaintyAssessment = {
  /** Prose statement of what remains uncertain and why. */
  summary: string;
  gaps: EvidenceGap[];
  conflicts: EvidenceConflict[];
  /**
   * Overall support strength as a decomposed, labelled judgement — never a bare
   * number masquerading as certainty. `insufficient` is a legitimate outcome.
   */
  overallSupport: "strong" | "moderate" | "weak" | "contested" | "insufficient";
};

export type ComparisonCell = {
  alternativeId: string;
  criterionId: string;
  /** Claim ids that bear on this cell. Empty is allowed and rendered as a gap. */
  claimIds: string[];
  /** Human/derived summary of what those claims say for this cell. */
  summary: string;
  /** True when no claims populate the cell — a visible gap, not an implied zero. */
  isGap: boolean;
};

export type ComparisonTable = {
  alternatives: DecisionAlternative[];
  criteria: ComparisonCriterion[];
  cells: ComparisonCell[];
};

export type ProvisionalSynthesis = {
  /** The provisional conclusion; explicitly provisional, never "established". */
  conclusion: string;
  /** Limitations stated up front, not buried. */
  limitations: string[];
  uncertainty: UncertaintyAssessment;
  review: ReviewRecord;
};

/* ------------------------------------------------------------------ *
 * Run manifest and decision artifact
 * ------------------------------------------------------------------ */

/** Per-stage telemetry captured during a run. */
export type StageTelemetry = {
  stage: DecisionStage;
  status: RunStageStatus;
  sourceCount: number;
  recordCount: number;
  latencyMs: number | null;
  /** Provider/model identity where a model was involved; null for pure steps. */
  provider: string | null;
  promptVersion: string | null;
  schemaVersion: string;
  tokensUsed: number | null;
  costUsd: number | null;
  /** Set when a provider failed or the stage completed only partially. */
  degradedReason: string | null;
};

export const RUN_STAGE_STATUSES = [
  "pending",
  "running",
  "complete",
  "degraded",
  "failed",
  "cancelled",
  "skipped",
] as const;
export type RunStageStatus = (typeof RUN_STAGE_STATUSES)[number];

/**
 * The immutable, reproducible record of one run. Fingerprinted over its inputs
 * so the same governed inputs reproduce the same id, and any material change
 * changes it. `partial` is truthful: a provider failure yields a partial,
 * resumable manifest — never a fabricated complete answer.
 */
export type RunEvidenceManifest = {
  runId: string;
  projectId: string;
  contractVersion: typeof DECISION_CONTRACT_VERSION;
  taxonomyRelease: string;
  createdAt: string;
  /** Fingerprint of the governed inputs (frame + plan + claim/anchor identities). */
  inputFingerprint: string;
  /** Fingerprint of the produced outputs. */
  outputFingerprint: string | null;
  stages: StageTelemetry[];
  /** True when the run did not reach REVIEW cleanly (failure/cancel/degradation). */
  partial: boolean;
  /** The stage a resume should continue from, when partial. */
  resumeFrom: DecisionStage | null;
  claimIds: string[];
  anchorIds: string[];
};

export type CitationRef = {
  anchorId: string;
  title: string | null;
  attribution: string | null;
  revisionId: string | number | null;
};

/**
 * A decision-ready, cited artifact. Binds to the exact run manifest and carries
 * its own review gate. It is *not* a published scientific truth — publication is
 * a separate, owner-gated step this layer never performs.
 */
export type DecisionArtifact = {
  artifactId: string;
  projectId: string;
  runId: string;
  frame: DecisionFrame;
  synthesis: ProvisionalSynthesis;
  comparison: ComparisonTable;
  citations: CitationRef[];
  review: ReviewRecord;
  /** Explicit flag so no consumer mistakes this for a published finding. */
  publicationStatus: "draft_decision_ready";
};

/**
 * A proposed knowledge-graph contribution. Proposal-only by contract: there is
 * no `accepted` state here. Governed human review, elsewhere, decides.
 */
export type KnowledgeGraphProposal = {
  proposalId: string;
  projectId: string;
  runId: string;
  /** The claim being proposed for the graph. */
  claimId: string;
  proposedNodeKind: "hypothesis" | "interpretation";
  statement: string;
  supportingClaimIds: string[];
  counterClaimIds: string[];
  citations: CitationRef[];
  review: ReviewRecord;
  status: "proposed";
};

/* ------------------------------------------------------------------ *
 * Validation — fail closed
 * ------------------------------------------------------------------ */

export type ValidationIssue = { path: string; message: string };

export function isClaimKind(value: unknown): value is ClaimKind {
  return typeof value === "string" && (CLAIM_KINDS as readonly string[]).includes(value);
}

export function isEvidenceRelationKind(value: unknown): value is EvidenceRelationKind {
  return typeof value === "string" && (EVIDENCE_RELATIONS as readonly string[]).includes(value);
}

/**
 * Validate a claim against the integrity rules. Returns issues rather than
 * throwing so a caller can surface every problem at once. The load-bearing rule:
 * observational/sourced/computational claims MUST be anchored; `missing` and
 * `hypothesis` legitimately need not be, and a `missing` claim that smuggles in
 * an anchor is itself suspect.
 */
export function validateClaim(claim: EvidenceClaim): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isClaimKind(claim.kind)) {
    issues.push({ path: "kind", message: `unknown claim kind: ${String(claim.kind)}` });
  }
  if (!claim.statement.trim()) {
    issues.push({ path: "statement", message: "claim statement must not be empty" });
  }
  const anchored = claim.anchors.length > 0;
  const mustBeAnchored = claim.kind === "direct_observation" || claim.kind === "sourced_assertion" || claim.kind === "computation";
  if (mustBeAnchored && !anchored) {
    issues.push({ path: "anchors", message: `a ${claim.kind} claim must carry at least one source anchor` });
  }
  if (claim.kind === "missing" && anchored) {
    issues.push({ path: "anchors", message: "a missing-information claim must not carry source anchors" });
  }
  if (claim.modelConfidence !== null && (claim.modelConfidence < 0 || claim.modelConfidence > 1)) {
    issues.push({ path: "modelConfidence", message: "modelConfidence must be within [0,1] or null" });
  }
  return issues;
}

export function isValidClaim(claim: EvidenceClaim): boolean {
  return validateClaim(claim).length === 0;
}
