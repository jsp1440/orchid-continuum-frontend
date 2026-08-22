import type { BrainMission, MissionConclusion, MissionEvidence, MissionSource } from "@/lib/calyxWorkspace";

export type CalyxVerificationCheckStatus = "pass" | "needs_review" | "fail";

export type CalyxVerificationCheck = {
  id: string;
  label: string;
  status: CalyxVerificationCheckStatus;
  summary: string;
};

export type CalyxVerificationEvidence = {
  candidateId: string;
  role: "support" | "counterevidence";
  statement: string;
  sourceRevisionId: string | null;
  anchorIds: string[];
  exactExcerpt: string | null;
  locator: unknown;
  sourceTitle: string | null;
  contentHash: string | null;
  displayPolicy: string | null;
};

export type CalyxScientificArgumentStep = {
  kind: "question" | "evidence" | "counterevidence" | "inference" | "claim" | "gap";
  text: string;
  evidenceIds?: string[];
};

export type CalyxVerificationResult = {
  operation: "CHECK_CALYX";
  verdict: "structurally_verified" | "contested" | "provisional" | "insufficient_evidence" | "verification_failed";
  verificationStatus: "verified" | "review_required" | "failed";
  claimText: string;
  claimIds: string[];
  checks: CalyxVerificationCheck[];
  evidence: CalyxVerificationEvidence[];
  scientificArgument: {
    type: "externally_auditable_scientific_argument";
    privateChainOfThoughtIncluded: false;
    steps: CalyxScientificArgumentStep[];
    rationaleStatus: "supplied" | "bounded_system_rationale_only" | "missing";
  };
  gaps: string[];
  provenance: {
    missionId: string;
    reasoningLedgerId: string | null;
    reasoningLedgerVersion: number | null;
    sourceRevisionIds: string[];
    reviewStatus: string;
    publicationEligible: boolean;
    automaticPublication: false;
  };
};

type CanonicalAnchor = {
  anchor_id?: number | string;
  locator?: unknown;
};

type CanonicalEvidence = {
  revision_id?: number | string;
  text?: string;
  source_anchors?: CanonicalAnchor[];
  display_policy?: string;
  metadata?: Record<string, unknown>;
};

type MissionWithArtifacts = BrainMission & {
  artifacts?: {
    canonical_evidence?: CanonicalEvidence[];
    evidence_packet_id?: string | number;
    interpretation_id?: string | number;
    [key: string]: unknown;
  };
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function idSet(values: Array<number | string> | undefined): Set<string> {
  return new Set((values ?? []).map(clean).filter(Boolean));
}

function evidenceStatement(item: MissionEvidence): string {
  return [item.subject, item.predicate, item.value]
    .map(clean)
    .filter(Boolean)
    .join(" ");
}

function sourceForEvidence(
  evidence: MissionEvidence,
  sources: MissionSource[],
): MissionSource | null {
  const revision = clean(evidence.source_revision_id);
  const anchors = idSet(evidence.source_anchor_ids);
  return (
    sources.find((source) => {
      if (revision && clean(source.citation?.revision_id) !== revision) return false;
      const sourceAnchors = idSet(source.citation?.source_anchor_ids);
      if (!anchors.size) return Boolean(revision);
      return [...anchors].every((anchor) => sourceAnchors.has(anchor));
    }) ?? null
  );
}

function canonicalForEvidence(
  evidence: MissionEvidence,
  canonical: CanonicalEvidence[],
): CanonicalEvidence | null {
  const revision = clean(evidence.source_revision_id);
  const anchors = idSet(evidence.source_anchor_ids);
  return (
    canonical.find((record) => {
      if (revision && clean(record.revision_id) !== revision) return false;
      const recordAnchors = idSet(record.source_anchors?.map((anchor) => clean(anchor.anchor_id)));
      if (!anchors.size) return Boolean(revision);
      return [...anchors].every((anchor) => recordAnchors.has(anchor));
    }) ?? null
  );
}

function traceEvidence(
  item: MissionEvidence,
  role: CalyxVerificationEvidence["role"],
  mission: MissionWithArtifacts,
): CalyxVerificationEvidence {
  const canonical = canonicalForEvidence(item, mission.artifacts?.canonical_evidence ?? []);
  const source = sourceForEvidence(item, mission.sources ?? []);
  const metadata = canonical?.metadata ?? {};
  const contentHash = clean(metadata.content_hash) || null;
  const anchorIds = (item.source_anchor_ids ?? []).map(clean).filter(Boolean);
  const matchingAnchor = canonical?.source_anchors?.find((anchor) =>
    anchorIds.includes(clean(anchor.anchor_id)),
  );

  return {
    candidateId: clean(item.candidate_id) || "unidentified-evidence",
    role,
    statement: evidenceStatement(item) || "Source-bound evidence record",
    sourceRevisionId: clean(item.source_revision_id) || null,
    anchorIds,
    exactExcerpt: clean(canonical?.text) || clean(source?.authorized_excerpt) || null,
    locator: matchingAnchor?.locator ?? source?.citation?.locator ?? null,
    sourceTitle: clean(source?.title) || clean(source?.object_type) || null,
    contentHash,
    displayPolicy: clean(canonical?.display_policy) || null,
  };
}

function check(
  id: string,
  label: string,
  status: CalyxVerificationCheckStatus,
  summary: string,
): CalyxVerificationCheck {
  return { id, label, status, summary };
}

export function checkCalyxMissionClaim(
  missionInput: BrainMission,
  conclusion: MissionConclusion,
): CalyxVerificationResult {
  const mission = missionInput as MissionWithArtifacts;
  const claimIds = (conclusion.claim_ids ?? []).map(clean).filter(Boolean);
  const claimIdSet = new Set(claimIds);
  const linkedSupport = (mission.supporting_evidence ?? []).filter((item) =>
    claimIdSet.has(clean(item.candidate_id)),
  );
  const linkedConflict = (mission.contradicting_evidence ?? []).filter((item) =>
    claimIdSet.has(clean(item.candidate_id)),
  );
  const evidence = [
    ...linkedSupport.map((item) => traceEvidence(item, "support", mission)),
    ...linkedConflict.map((item) => traceEvidence(item, "counterevidence", mission)),
  ];

  const evidenceIdsResolve = claimIds.length > 0 && evidence.length > 0;
  const supportPresent = linkedSupport.length > 0;
  const exactAnchorsPresent = evidence.length > 0 && evidence.every((item) =>
    Boolean(item.sourceRevisionId && item.anchorIds.length && item.locator),
  );
  const excerptsPresent = evidence.length > 0 && evidence.every((item) => Boolean(item.exactExcerpt));
  const hashesPresent = evidence.length > 0 && evidence.every((item) => Boolean(item.contentHash));
  const ledgerPresent = Boolean(mission.reasoning_ledger?.ledger_id && mission.reasoning_ledger?.version);
  const missionValid = mission.validation?.valid === true;
  const incomplete = mission.partial === true || (mission.missing_evidence ?? []).length > 0;

  const checks: CalyxVerificationCheck[] = [
    check(
      "claim_identity",
      "Claim identity",
      claimIds.length ? "pass" : "fail",
      claimIds.length
        ? `The conclusion is bound to ${claimIds.length} explicit scientific claim identifier${claimIds.length === 1 ? "" : "s"}.`
        : "This conclusion has no explicit claim identifier, so its evidence cannot be audited reliably.",
    ),
    check(
      "claim_evidence_linkage",
      "Claim → evidence linkage",
      evidenceIdsResolve ? "pass" : "fail",
      evidenceIdsResolve
        ? `${evidence.length} linked evidence record${evidence.length === 1 ? "" : "s"} resolve to this claim.`
        : "The claim identifiers do not resolve to evidence records returned by the mission.",
    ),
    check(
      "support_present",
      "Supporting evidence",
      supportPresent ? "pass" : "fail",
      supportPresent
        ? `${linkedSupport.length} supporting evidence record${linkedSupport.length === 1 ? "" : "s"} are retained.`
        : "No supporting evidence record is linked to this claim.",
    ),
    check(
      "exact_source_anchors",
      "Exact source anchors",
      exactAnchorsPresent ? "pass" : "fail",
      exactAnchorsPresent
        ? "Every linked evidence record carries a source revision, exact anchor, and locator."
        : "At least one linked evidence record cannot yet be opened at an exact source location.",
    ),
    check(
      "source_excerpt",
      "What Calyx actually read",
      excerptsPresent ? "pass" : "needs_review",
      excerptsPresent
        ? "The exact authorized evidence span is available for every linked evidence record."
        : "At least one evidence record lacks an immediately displayable source excerpt.",
    ),
    check(
      "source_integrity_hash",
      "Source integrity",
      hashesPresent ? "pass" : "needs_review",
      hashesPresent
        ? "Every linked canonical evidence span carries a content hash."
        : "At least one evidence span lacks a visible content hash in this mission response.",
    ),
    check(
      "counterevidence",
      "Counterevidence retained",
      linkedConflict.length ? "needs_review" : "pass",
      linkedConflict.length
        ? `${linkedConflict.length} conflicting evidence record${linkedConflict.length === 1 ? "" : "s"} bear on this claim and must be weighed before acceptance.`
        : "No conflicting evidence was linked to this claim in the bounded mission.",
    ),
    check(
      "reasoning_ledger",
      "Reasoning audit trail",
      ledgerPresent ? "pass" : "fail",
      ledgerPresent
        ? "A versioned reasoning ledger exists for this mission."
        : "No versioned reasoning ledger is attached to this mission.",
    ),
    check(
      "mission_validation",
      "Mission validation",
      missionValid ? "pass" : "needs_review",
      missionValid
        ? "The mission passed its structural scientific validation gates."
        : "The mission is not structurally validated or has unresolved blockers.",
    ),
    check(
      "evidence_gaps",
      "Evidence gaps",
      incomplete ? "needs_review" : "pass",
      incomplete
        ? `${mission.missing_evidence?.length ?? 0} evidence gap${(mission.missing_evidence?.length ?? 0) === 1 ? "" : "s"} remain, or the mission returned a partial result.`
        : "The mission did not report an evidence gap for this bounded investigation.",
    ),
  ];

  const failed = checks.filter((item) => item.status === "fail");
  const review = checks.filter((item) => item.status === "needs_review");

  let verdict: CalyxVerificationResult["verdict"];
  if (failed.length) verdict = supportPresent ? "verification_failed" : "insufficient_evidence";
  else if (linkedConflict.length) verdict = "contested";
  else if (incomplete || review.length) verdict = "provisional";
  else verdict = "structurally_verified";

  const verificationStatus: CalyxVerificationResult["verificationStatus"] = failed.length
    ? "failed"
    : review.length
      ? "review_required"
      : "verified";

  const argumentSteps: CalyxScientificArgumentStep[] = [
    { kind: "question", text: mission.question },
    {
      kind: "evidence",
      text: "Inspect the exact source-bound evidence that supports the conclusion.",
      evidenceIds: linkedSupport.map((item) => clean(item.candidate_id)).filter(Boolean),
    },
  ];
  if (linkedConflict.length) {
    argumentSteps.push({
      kind: "counterevidence",
      text: "Retain and evaluate the evidence that bears against the conclusion rather than averaging it away.",
      evidenceIds: linkedConflict.map((item) => clean(item.candidate_id)).filter(Boolean),
    });
  }
  argumentSteps.push({
    kind: "inference",
    text: conclusion.type?.toLowerCase().includes("inference")
      ? "Calyx labels this as an inference. The current mission exposes the evidence reconciliation and audit trail, but not private model chain-of-thought; the scientist must judge whether the evidence warrants the inferential step."
      : "Calyx presents this as a synthesis of the linked evidence rather than as a free-standing fact.",
    evidenceIds: evidence.map((item) => item.candidateId),
  });
  argumentSteps.push({ kind: "claim", text: conclusion.text });
  for (const gap of mission.missing_evidence ?? []) {
    argumentSteps.push({ kind: "gap", text: gap });
  }

  return {
    operation: "CHECK_CALYX",
    verdict,
    verificationStatus,
    claimText: conclusion.text,
    claimIds,
    checks,
    evidence,
    scientificArgument: {
      type: "externally_auditable_scientific_argument",
      privateChainOfThoughtIncluded: false,
      steps: argumentSteps,
      rationaleStatus: conclusion.type?.toLowerCase().includes("inference")
        ? "bounded_system_rationale_only"
        : "supplied",
    },
    gaps: mission.missing_evidence ?? [],
    provenance: {
      missionId: mission.mission_id,
      reasoningLedgerId: mission.reasoning_ledger?.ledger_id ?? null,
      reasoningLedgerVersion: mission.reasoning_ledger?.version ?? null,
      sourceRevisionIds: [...new Set(evidence.map((item) => item.sourceRevisionId).filter((value): value is string => Boolean(value)))],
      reviewStatus: mission.review_status,
      publicationEligible: mission.publication_eligibility?.eligible === true,
      automaticPublication: false,
    },
  };
}
