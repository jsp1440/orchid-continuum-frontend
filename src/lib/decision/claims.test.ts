import { describe, expect, it } from "vitest";

import {
  makeClaim,
  makeMissingClaim,
  makeRelation,
  isCounterEvidence,
  isQualifying,
  partitionRelations,
  independentSupportCount,
  retractClaim,
  supersedeClaim,
  markStale,
  isActiveClaim,
  appraisalProfile,
} from "./claims";
import { validateClaim, type EvidenceAppraisal } from "./contracts";

const APPRAISAL: EvidenceAppraisal = {
  sourceType: "peer-reviewed",
  sourceAuthority: "high",
  directness: "moderate",
  relevanceToQuestion: "high",
  methodologicalFit: "moderate",
  independence: "low",
  temporalRelevance: "moderate",
  completeness: "unknown",
};

describe("makeMissingClaim keeps 'missing' anchor-free", () => {
  it("produces a valid, anchor-free missing claim even if code later tries to add anchors", () => {
    const gap = makeMissingClaim("night-min data unavailable for most taxa", ["phalaenopsis"]);
    expect(gap.kind).toBe("missing");
    expect(gap.anchors).toHaveLength(0);
    expect(validateClaim(gap)).toHaveLength(0);
  });

  it("makeClaim forces a missing claim's anchors empty, structurally", () => {
    // Even if a caller passes anchors for a missing kind, they are dropped.
    const gap = makeClaim({
      kind: "missing",
      statement: "unknown",
      anchors: [
        {
          anchorId: "x",
          sourceKind: "literature",
          title: null,
          revisionId: null,
          sourceAnchorIds: [],
          contentHash: null,
          locator: null,
          retrievedAt: null,
          license: null,
          attribution: null,
          displayPolicy: null,
          excerptAbsence: null,
        },
      ],
    });
    expect(gap.anchors).toHaveLength(0);
  });
});

describe("counterevidence is preserved, never netted", () => {
  const supportA = makeRelation({ relation: "SUPPORTS", fromClaimId: "s1", toRef: "target" });
  const supportB = makeRelation({ relation: "SUPPORTS", fromClaimId: "s2", toRef: "target" });
  const contra = makeRelation({ relation: "CONTRADICTS", fromClaimId: "k1", toRef: "target" });
  const qual = makeRelation({ relation: "QUALIFIES", fromClaimId: "q1", toRef: "target" });
  const relations = [supportA, supportB, contra, qual];

  it("classifies counter and qualifying relations", () => {
    expect(isCounterEvidence("CONTRADICTS")).toBe(true);
    expect(isCounterEvidence("RETRACTS")).toBe(true);
    expect(isCounterEvidence("SUPPORTS")).toBe(false);
    expect(isQualifying("QUALIFIES")).toBe(true);
  });

  it("partitions relations without merging support and contradiction", () => {
    const p = partitionRelations("target", relations);
    expect(p.supports).toHaveLength(2);
    expect(p.contradicts).toHaveLength(1);
    expect(p.qualifies).toHaveLength(1);
    // The contradiction is still there; it did not cancel a support.
    expect(p.supports.length + p.contradicts.length).toBe(3);
  });
});

describe("duplicate sources do not inflate support", () => {
  it("collapses DUPLICATES so an echoed source is counted once", () => {
    const s1 = makeRelation({ relation: "SUPPORTS", fromClaimId: "c", toRef: "srcA" });
    const s2 = makeRelation({ relation: "SUPPORTS", fromClaimId: "c", toRef: "srcB" });
    const dupOfB = makeRelation({ relation: "DUPLICATES", fromClaimId: "c", toRef: "srcB" });
    const count = independentSupportCount("c", [s1, s2, dupOfB]);
    expect(count).toBe(1); // srcB is a duplicate, so only srcA counts as independent
  });
});

describe("lifecycle: retraction and supersession are preserved, not deleted", () => {
  it("retracted and superseded claims drop out of the active set but keep their history", () => {
    const base = makeClaim({ kind: "sourced_assertion", statement: "x", anchors: [
      { anchorId: "a", sourceKind: "literature", title: null, revisionId: null, sourceAnchorIds: [], contentHash: null, locator: null, retrievedAt: null, license: null, attribution: null, displayPolicy: null, excerptAbsence: null },
    ] });
    const retracted = retractClaim(base, "author error");
    expect(retracted.lifecycle.retractedReason).toBe("author error");
    expect(isActiveClaim(retracted)).toBe(false);

    const superseded = supersedeClaim(base, "c99");
    expect(superseded.lifecycle.supersededBy).toBe("c99");
    expect(isActiveClaim(superseded)).toBe(false);

    const stale = markStale(base, "taxonomy release moved");
    expect(stale.lifecycle.stale).toBe(true);
    expect(isActiveClaim(stale)).toBe(true); // stale is a warning, not a removal
  });
});

describe("appraisal is a decomposed profile, not one score", () => {
  it("reports a per-grade tally and the weakest graded dimension", () => {
    const profile = appraisalProfile(APPRAISAL);
    expect(profile.totalDimensions).toBe(7);
    expect(profile.tally.high).toBe(2);
    expect(profile.tally.unknown).toBe(1);
    expect(profile.appraisedDimensions).toBe(6);
    // independence is LOW — the honest floor of this appraisal.
    expect(profile.weakestGraded).toBe("low");
    // Crucially, there is no single collapsed number field.
    expect((profile as Record<string, unknown>).score).toBeUndefined();
  });
});
