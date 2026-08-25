/**
 * artifact — build the reproducible RunEvidenceManifest, the cited
 * DecisionArtifact, and the proposal-only KnowledgeGraphProposal.
 *
 * The manifest is the reproducibility contract: its `inputFingerprint` is a pure
 * function of the governed inputs (frame, plan, and the *identities* of claims
 * and anchors — not their volatile review timestamps), so the same inputs always
 * reproduce the same id, and any material change changes it. The DecisionArtifact
 * binds to that exact manifest and never claims to be a published finding. The KG
 * proposal has no `accepted` state — governed human review, elsewhere, decides.
 */

import { contentFingerprint } from "./fingerprint";
import {
  DECISION_CONTRACT_VERSION,
  initialReview,
  type CitationRef,
  type ComparisonTable,
  type DecisionAlternative,
  type DecisionArtifact,
  type DecisionFrame,
  type EvidenceClaim,
  type KnowledgeGraphProposal,
  type ProvisionalSynthesis,
  type ResearchPlan,
  type RunEvidenceManifest,
  type SourceAnchor,
  type StageTelemetry,
} from "./contracts";
import { partitionRelations } from "./claims";
import type { EvidenceRelation } from "./contracts";

/** Distil the governed identity of a claim — what makes it reproducible, nothing volatile. */
function claimIdentity(claim: EvidenceClaim) {
  return {
    claimId: claim.claimId,
    kind: claim.kind,
    statement: claim.statement,
    taxonIds: [...claim.taxonIds].sort(),
    anchorIds: claim.anchors.map((a) => a.anchorId).sort(),
  };
}

function anchorIdentity(anchor: SourceAnchor) {
  return {
    anchorId: anchor.anchorId,
    sourceKind: anchor.sourceKind,
    revisionId: anchor.revisionId,
    sourceAnchorIds: [...anchor.sourceAnchorIds].map(String).sort(),
    contentHash: anchor.contentHash,
  };
}

export type ManifestInput = {
  runId: string;
  projectId: string;
  taxonomyRelease: string;
  createdAt: string;
  frame: DecisionFrame;
  plan: ResearchPlan;
  claims: EvidenceClaim[];
  anchors: SourceAnchor[];
  stages: StageTelemetry[];
  /** Outputs to fingerprint (synthesis/comparison); null when the run is partial. */
  outputs?: unknown;
  partial: boolean;
  resumeFrom?: RunEvidenceManifest["resumeFrom"];
};

/**
 * Build the immutable run manifest. The input fingerprint is stable across runs
 * with identical governed inputs; `outputFingerprint` is null on a partial run so
 * nothing implies a complete, reproducible output that does not exist.
 */
export function buildRunManifest(input: ManifestInput): RunEvidenceManifest {
  const inputFingerprint = contentFingerprint({
    contractVersion: DECISION_CONTRACT_VERSION,
    taxonomyRelease: input.taxonomyRelease,
    frame: input.frame,
    plan: { steps: input.plan.steps, taxonomyRelease: input.plan.taxonomyRelease },
    claims: input.claims.map(claimIdentity).sort((a, b) => a.claimId.localeCompare(b.claimId)),
    anchors: input.anchors.map(anchorIdentity).sort((a, b) => a.anchorId.localeCompare(b.anchorId)),
  });

  const outputFingerprint = input.partial || input.outputs === undefined ? null : contentFingerprint(input.outputs);

  return {
    runId: input.runId,
    projectId: input.projectId,
    contractVersion: DECISION_CONTRACT_VERSION,
    taxonomyRelease: input.taxonomyRelease,
    createdAt: input.createdAt,
    inputFingerprint,
    outputFingerprint,
    stages: input.stages,
    partial: input.partial,
    resumeFrom: input.resumeFrom ?? null,
    claimIds: input.claims.map((c) => c.claimId).sort(),
    anchorIds: input.anchors.map((a) => a.anchorId).sort(),
  };
}

/** Two manifests reproduce the same run iff their input fingerprints match. */
export function reproducesSameInputs(a: RunEvidenceManifest, b: RunEvidenceManifest): boolean {
  return a.inputFingerprint === b.inputFingerprint;
}

/** Collect citations from the anchors actually referenced by the given claims. */
export function citationsFromClaims(claims: EvidenceClaim[]): CitationRef[] {
  const seen = new Map<string, CitationRef>();
  for (const claim of claims) {
    for (const anchor of claim.anchors) {
      if (seen.has(anchor.anchorId)) continue;
      seen.set(anchor.anchorId, {
        anchorId: anchor.anchorId,
        title: anchor.title,
        attribution: anchor.attribution,
        revisionId: anchor.revisionId,
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.anchorId.localeCompare(b.anchorId));
}

export type ArtifactInput = {
  artifactId: string;
  projectId: string;
  runId: string;
  frame: DecisionFrame;
  synthesis: ProvisionalSynthesis;
  comparison: ComparisonTable;
  claims: EvidenceClaim[];
};

/**
 * Build a decision-ready artifact. It is explicitly `draft_decision_ready`:
 * cited, bound to a run, and carrying its own review gate — but never a published
 * scientific truth. Publication is a separate, owner-gated step this layer does
 * not perform.
 */
export function buildDecisionArtifact(input: ArtifactInput): DecisionArtifact {
  return {
    artifactId: input.artifactId,
    projectId: input.projectId,
    runId: input.runId,
    frame: input.frame,
    synthesis: input.synthesis,
    comparison: input.comparison,
    citations: citationsFromClaims(input.claims),
    review: initialReview(),
    publicationStatus: "draft_decision_ready",
  };
}

export type ProposalInput = {
  proposalId: string;
  projectId: string;
  runId: string;
  /** The claim being proposed. Must be a `hypothesis` or `interpretation`. */
  claim: EvidenceClaim;
  claims: EvidenceClaim[];
  relations: EvidenceRelation[];
};

export class ProposalNotProposable extends Error {
  constructor(kind: string) {
    super(`Only hypothesis or interpretation claims may be proposed to the knowledge graph, not '${kind}'.`);
    this.name = "ProposalNotProposable";
  }
}

/**
 * Build a proposal-only knowledge-graph contribution. Fails closed if asked to
 * propose an observation/sourced/computation/missing claim — only hypotheses and
 * interpretations are write-back candidates, and even those enter as `proposed`,
 * never `accepted`. Supporting and counter claims are both carried so review
 * sees the disagreement, not just the case for the proposal.
 */
export function buildKnowledgeGraphProposal(input: ProposalInput): KnowledgeGraphProposal {
  const kind = input.claim.kind;
  if (kind !== "hypothesis" && kind !== "interpretation") {
    throw new ProposalNotProposable(kind);
  }
  const { supports, contradicts } = partitionRelations(input.claim.claimId, input.relations);
  const supportingClaimIds = supports.map((r) => (r.fromClaimId === input.claim.claimId ? r.toRef : r.fromClaimId));
  const counterClaimIds = contradicts.map((r) => (r.fromClaimId === input.claim.claimId ? r.toRef : r.fromClaimId));

  return {
    proposalId: input.proposalId,
    projectId: input.projectId,
    runId: input.runId,
    claimId: input.claim.claimId,
    proposedNodeKind: kind,
    statement: input.claim.statement,
    supportingClaimIds: [...new Set(supportingClaimIds)].sort(),
    counterClaimIds: [...new Set(counterClaimIds)].sort(),
    citations: citationsFromClaims(input.claims.filter((c) => supportingClaimIds.includes(c.claimId) || counterClaimIds.includes(c.claimId) || c.claimId === input.claim.claimId)),
    review: initialReview(),
    status: "proposed",
  };
}

/** Convenience: a citation list for an arbitrary set of alternatives (e.g. artifact header). */
export function alternativesSummary(alternatives: DecisionAlternative[]): string {
  return alternatives.map((a) => a.label).join(" vs. ");
}
