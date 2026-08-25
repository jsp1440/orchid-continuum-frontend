import { describe, expect, it } from "vitest";

import {
  CLAIM_KINDS,
  DECISION_CONTRACT_VERSION,
  DECISION_STAGES,
  EVIDENCE_RELATIONS,
  isClaimKind,
  isEvidenceRelationKind,
  initialReview,
  activeLifecycle,
  validateClaim,
  isValidClaim,
  type EvidenceClaim,
  type SourceAnchor,
} from "./contracts";

/**
 * The contract layer is where scientific-integrity rules are encoded
 * structurally. These tests hold the load-bearing invariants: the claim-kind and
 * evidence-relation vocabularies are closed sets, and claim validation fails
 * closed for the dangerous shapes (an unanchored observation, or a
 * missing-information claim smuggling in an anchor).
 */

function anchor(id = "a1"): SourceAnchor {
  return {
    anchorId: id,
    sourceKind: "literature",
    title: "t",
    revisionId: 1,
    sourceAnchorIds: [10],
    contentHash: "h",
    locator: null,
    retrievedAt: null,
    license: null,
    attribution: null,
    displayPolicy: null,
    excerptAbsence: null,
  };
}

function claim(overrides: Partial<EvidenceClaim>): EvidenceClaim {
  return {
    claimId: "c1",
    kind: "sourced_assertion",
    statement: "x",
    taxonIds: [],
    anchors: [anchor()],
    modelConfidence: null,
    appraisal: null,
    review: initialReview(),
    lifecycle: activeLifecycle(),
    ...overrides,
  };
}

describe("contract vocabularies", () => {
  it("pins a semantic contract version", () => {
    expect(DECISION_CONTRACT_VERSION).toBe("1.0.0");
  });

  it("exposes the six claim kinds including missing", () => {
    expect(CLAIM_KINDS).toContain("missing");
    expect(CLAIM_KINDS).toContain("direct_observation");
    expect(CLAIM_KINDS).toHaveLength(6);
  });

  it("exposes the eight evidence relations, support and contradiction distinct", () => {
    expect(EVIDENCE_RELATIONS).toContain("SUPPORTS");
    expect(EVIDENCE_RELATIONS).toContain("CONTRADICTS");
    expect(EVIDENCE_RELATIONS).toContain("SUPERSEDES");
    expect(EVIDENCE_RELATIONS).toContain("RETRACTS");
    expect(new Set(EVIDENCE_RELATIONS).size).toBe(EVIDENCE_RELATIONS.length);
  });

  it("runs the ten orchestration stages in order", () => {
    expect(DECISION_STAGES[0]).toBe("FRAME");
    expect(DECISION_STAGES[DECISION_STAGES.length - 1]).toBe("REVIEW");
    expect(DECISION_STAGES).toHaveLength(10);
  });

  it("guards reject unknown vocabulary members", () => {
    expect(isClaimKind("missing")).toBe(true);
    expect(isClaimKind("absent")).toBe(false);
    expect(isEvidenceRelationKind("SUPPORTS")).toBe(true);
    expect(isEvidenceRelationKind("PROVES")).toBe(false);
  });
});

describe("claim validation fails closed", () => {
  it("accepts a well-formed anchored assertion", () => {
    expect(isValidClaim(claim({}))).toBe(true);
  });

  it("rejects an observation/sourced/computation claim with no anchor", () => {
    for (const kind of ["direct_observation", "sourced_assertion", "computation"] as const) {
      const issues = validateClaim(claim({ kind, anchors: [] }));
      expect(issues.some((i) => i.path === "anchors")).toBe(true);
    }
  });

  it("rejects a missing claim that carries an anchor", () => {
    const issues = validateClaim(claim({ kind: "missing", anchors: [anchor()] }));
    expect(issues.some((i) => i.path === "anchors")).toBe(true);
  });

  it("accepts a missing claim with no anchor (that is the point)", () => {
    expect(isValidClaim(claim({ kind: "missing", anchors: [] }))).toBe(true);
  });

  it("accepts a hypothesis with no anchor", () => {
    expect(isValidClaim(claim({ kind: "hypothesis", anchors: [] }))).toBe(true);
  });

  it("rejects an empty statement and an out-of-range model confidence", () => {
    expect(validateClaim(claim({ statement: "  " })).some((i) => i.path === "statement")).toBe(true);
    expect(validateClaim(claim({ modelConfidence: 1.5 })).some((i) => i.path === "modelConfidence")).toBe(true);
    expect(validateClaim(claim({ modelConfidence: 0.5 })).some((i) => i.path === "modelConfidence")).toBe(false);
  });
});
