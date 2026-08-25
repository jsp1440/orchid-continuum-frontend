import { describe, expect, it } from "vitest";

import {
  buildComparisonTable,
  deriveConflicts,
  deriveGaps,
  assessUncertainty,
  buildProvisionalSynthesis,
  type CellAssignment,
} from "./synthesis";
import { makeClaim, makeMissingClaim, makeRelation, retractClaim } from "./claims";
import type { ComparisonCriterion, DecisionAlternative, EvidenceClaim, EvidenceRelation, SourceAnchor } from "./contracts";

function anchor(): SourceAnchor {
  return {
    anchorId: "a",
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
  };
}

const ALTS: DecisionAlternative[] = [
  { alternativeId: "warm", label: "Warm", description: "" },
  { alternativeId: "cool", label: "Cool", description: "" },
];
const CRITS: ComparisonCriterion[] = [
  { criterionId: "elev", label: "Elevation", description: "", weight: 1 },
  { criterionId: "night", label: "Night temp", description: "", weight: 1 },
];

describe("comparison table renders empty cells as visible gaps", () => {
  it("marks unpopulated cells isGap instead of implying a zero", () => {
    const assignments: CellAssignment[] = [
      { alternativeId: "warm", criterionId: "elev", claimIds: ["c1"], summary: "low" },
      // warm/night, cool/elev, cool/night all left unassigned
    ];
    const table = buildComparisonTable(ALTS, CRITS, assignments);
    expect(table.cells).toHaveLength(4);
    const populated = table.cells.find((c) => c.alternativeId === "warm" && c.criterionId === "elev")!;
    expect(populated.isGap).toBe(false);
    const gaps = table.cells.filter((c) => c.isGap);
    expect(gaps).toHaveLength(3);
  });
});

describe("gaps come from missing claims only", () => {
  it("turns every active missing claim into an evidence gap", () => {
    const claims: EvidenceClaim[] = [
      makeClaim({ kind: "sourced_assertion", statement: "known", anchors: [anchor()] }),
      makeMissingClaim("night-min unknown", ["phal"], "g1"),
      makeMissingClaim("cool night unknown", ["phal"], "g2"),
    ];
    const gaps = deriveGaps(claims);
    expect(gaps).toHaveLength(2);
    expect(gaps.every((g) => g.claimId !== null)).toBe(true);
    expect(gaps.some((g) => g.couldBecomeMission)).toBe(true);
  });
});

describe("conflicts are derived from CONTRADICTS/QUALIFIES among active claims", () => {
  const a = makeClaim({ claimId: "a", kind: "sourced_assertion", statement: "elevation predicts band", anchors: [anchor()] });
  const b = makeClaim({ claimId: "b", kind: "sourced_assertion", statement: "plasticity weakens prediction", anchors: [anchor()] });
  const relations: EvidenceRelation[] = [
    makeRelation({ relation: "CONTRADICTS", fromClaimId: "b", toRef: "a" }),
  ];

  it("surfaces the conflict rather than resolving it", () => {
    const conflicts = deriveConflicts([a, b], relations);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].claimId).toBe("a");
    expect(conflicts[0].counterClaimId).toBe("b");
    expect(conflicts[0].relation).toBe("CONTRADICTS");
  });

  it("a retracted counter-claim produces no live conflict, but is not deleted", () => {
    const retractedB = retractClaim(b, "withdrawn");
    const conflicts = deriveConflicts([a, retractedB], relations);
    expect(conflicts).toHaveLength(0);
    expect(retractedB.lifecycle.retractedReason).toBe("withdrawn");
  });
});

describe("uncertainty is a labelled verdict, never a bare score", () => {
  it("reports 'contested' when conflicts rival support", () => {
    const a = makeClaim({ claimId: "a", kind: "sourced_assertion", statement: "x", anchors: [anchor()] });
    const b = makeClaim({ claimId: "b", kind: "sourced_assertion", statement: "y", anchors: [anchor()] });
    const relations = [
      makeRelation({ relation: "SUPPORTS", fromClaimId: "a", toRef: "concl" }),
      makeRelation({ relation: "CONTRADICTS", fromClaimId: "b", toRef: "a" }),
    ];
    const u = assessUncertainty([a, b], relations);
    expect(["contested", "moderate", "weak"]).toContain(u.overallSupport);
    // No numeric confidence masquerading as certainty.
    expect((u as Record<string, unknown>).confidence).toBeUndefined();
  });

  it("reports 'insufficient' when there is no supporting evidence at all", () => {
    const gap = makeMissingClaim("nothing known", [], "g");
    const u = assessUncertainty([gap], []);
    expect(u.overallSupport).toBe("insufficient");
    expect(u.gaps).toHaveLength(1);
  });
});

describe("provisional synthesis surfaces limitations up front", () => {
  it("prepends an explicit limitation for contested/insufficient evidence", () => {
    const gap = makeMissingClaim("nothing known", [], "g");
    const u = assessUncertainty([gap], []);
    const synth = buildProvisionalSynthesis({ conclusion: "provisional", limitations: [], uncertainty: u });
    expect(synth.limitations[0]).toMatch(/insufficient/i);
    expect(synth.review.state).toBe("draft"); // never auto-approved
  });
});
