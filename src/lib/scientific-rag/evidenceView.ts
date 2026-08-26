/**
 * View model for the user-visible evidence / provenance surface.
 *
 * Pure and testable: it maps a grounded answer, its verification result, and the
 * backing claim store into rows the UI renders, assigning each row exactly one
 * evidence state. The UI must be able to distinguish verified, inferred,
 * disputed, ambiguous, quarantined, insufficient, and blocked — so that
 * distinction is computed here, not left to presentation.
 */

import type { ScientificClaim } from "./claims";
import type { GroundedAnswer } from "./answer";
import type { VerificationResult } from "./verification";

export type EvidenceState =
  | "verified"
  | "inferred"
  | "disputed"
  | "ambiguous"
  | "quarantined"
  | "insufficient"
  | "blocked";

export type EvidenceRow = {
  statement: string;
  state: EvidenceState;
  claimId: string | null;
  acceptedTaxon: string | null;
  publishedTaxon: string | null;
  citationTitle: string | null;
  supportingPassage: string | null;
  locator: string | null;
  evidenceType: string | null;
  confidence: number;
  taxonomyVersion: string | null;
  extractionVersion: string | null;
  lastProcessed: string | null;
};

export type EvidenceViewModel = {
  question: string;
  correlationId: string;
  overallVerdict: "verified" | "blocked";
  blockReasons: string[];
  rows: EvidenceRow[];
  checks: VerificationResult["checks"];
  contradictions: VerificationResult["contradictions"];
};

function locatorString(claim: ScientificClaim): string {
  const l = claim.provenance.locator;
  return [l.section, l.page ? `p.${l.page}` : null, l.paragraph ? `¶${l.paragraph}` : null]
    .filter(Boolean)
    .join(", ");
}

export function buildEvidenceViewModel(
  answer: GroundedAnswer,
  verification: VerificationResult,
  claims: ScientificClaim[],
): EvidenceViewModel {
  const byId = new Map(claims.map((c) => [c.claimId, c] as const));
  const disputedClaimIds = new Set(
    verification.contradictions.map((c) => c.conflictingClaimId),
  );

  const rows: EvidenceRow[] = answer.statements.map((statement) => {
    if (statement.kind === "insufficient" || statement.claimIds.length === 0) {
      return {
        statement: statement.text,
        state: "insufficient",
        claimId: null,
        acceptedTaxon: null,
        publishedTaxon: null,
        citationTitle: null,
        supportingPassage: null,
        locator: null,
        evidenceType: null,
        confidence: statement.confidence,
        taxonomyVersion: null,
        extractionVersion: null,
        lastProcessed: null,
      };
    }

    const claim = byId.get(statement.claimIds[0]);
    let state: EvidenceState;
    if (verification.verdict === "blocked") state = "blocked";
    else if (!claim) state = "blocked";
    else if (claim.reviewStatus === "quarantined") state = "quarantined";
    else if (claim.taxon.ambiguous) state = "ambiguous";
    else if (disputedClaimIds.has(claim.claimId)) state = "disputed";
    else if (statement.kind === "inference") state = "inferred";
    else state = "verified";

    return {
      statement: statement.text,
      state,
      claimId: claim?.claimId ?? statement.claimIds[0],
      acceptedTaxon: claim?.taxon.acceptedName ?? null,
      publishedTaxon: claim?.taxon.nameAsPublished ?? null,
      citationTitle: claim?.provenance.citation.title ?? null,
      supportingPassage: claim?.provenance.supportingPassage ?? null,
      locator: claim ? locatorString(claim) : null,
      evidenceType: claim?.evidenceType ?? null,
      confidence: statement.confidence,
      taxonomyVersion: claim?.taxon.taxonomyVersion ?? null,
      extractionVersion: claim?.extractorVersion ?? null,
      lastProcessed: claim?.extractedAt ?? null,
    };
  });

  return {
    question: answer.question,
    correlationId: answer.correlationId,
    overallVerdict: verification.verdict,
    blockReasons: verification.blockReasons,
    rows,
    checks: verification.checks,
    contradictions: verification.contradictions,
  };
}

export const EVIDENCE_STATE_LABEL: Record<EvidenceState, string> = {
  verified: "Verified",
  inferred: "Inferred",
  disputed: "Disputed",
  ambiguous: "Ambiguous",
  quarantined: "Quarantined",
  insufficient: "Insufficient evidence",
  blocked: "Blocked",
};
