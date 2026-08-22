import { describe, expect, it } from "vitest";

import type { BrainMission, MissionConclusion } from "@/lib/calyxWorkspace";
import { checkCalyxMissionClaim } from "@/lib/calyxVerification";

function mission(overrides: Partial<BrainMission> = {}): BrainMission {
  return {
    mission_id: "mission-verify-1",
    project_id: "project-1",
    question: "Which traits distinguish cool-growing Phalaenopsis from warm-growing species?",
    state: "AWAITING_HUMAN_REVIEW",
    current_stage: "eligible_for_publication_state",
    steps_executed: 10,
    sources: [
      {
        result_id: "source-1",
        title: "Phalaenopsis thermal-trait study",
        object_type: "literature",
        authorized_excerpt: "Seasonal dormancy was associated with cooler montane taxa.",
        citation: {
          revision_id: 41,
          source_anchor_ids: [401],
          locator: { page: 7, section: "Results", char_start: 1200, char_end: 1310 },
        },
      },
    ],
    supporting_evidence: [
      {
        candidate_id: 17,
        subject: "seasonal dormancy",
        predicate: "associated_with",
        value: "cooler thermal niche",
        source_revision_id: 41,
        source_anchor_ids: [401],
      },
    ],
    contradicting_evidence: [],
    missing_evidence: [],
    confidence: 0.78,
    conclusions: [],
    reasoning_ledger: { ledger_id: "ledger-1", version: 5 },
    validation: { valid: true, blockers: [] },
    review_status: "HUMAN_REVIEW_REQUIRED",
    publication_eligibility: {
      eligible: false,
      automatic_publication: false,
      blockers: ["HUMAN_REVIEW_REQUIRED"],
    },
    blockers: [],
    partial: false,
    created_at: "2026-08-21T00:00:00Z",
    updated_at: "2026-08-21T00:00:01Z",
    ...overrides,
    artifacts: {
      canonical_evidence: [
        {
          revision_id: 41,
          text: "Seasonal dormancy was associated with cooler montane taxa.",
          display_policy: "AUTHORIZED_EXCERPT",
          source_anchors: [
            {
              anchor_id: 401,
              ordered_span: 0,
              locator: { page: 7, section: "Results", char_start: 1200, char_end: 1310 },
            },
          ],
          metadata: { content_hash: "a".repeat(64) },
        },
      ],
    },
  } as BrainMission;
}

const conclusion: MissionConclusion = {
  type: "inference",
  text: "Seasonal dormancy is associated with cooler thermal niches in the current evidence.",
  claim_ids: [17],
};

describe("Check Calyx mission claim", () => {
  it("builds an auditable evidence and reasoning trace without private chain-of-thought", () => {
    const result = checkCalyxMissionClaim(mission(), conclusion);

    expect(result.operation).toBe("CHECK_CALYX");
    expect(result.verdict).toBe("structurally_verified");
    expect(result.verificationStatus).toBe("verified");
    expect(result.scientificArgument.type).toBe("externally_auditable_scientific_argument");
    expect(result.scientificArgument.privateChainOfThoughtIncluded).toBe(false);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].exactExcerpt).toContain("Seasonal dormancy");
    expect(result.evidence[0].locator).toEqual({
      page: 7,
      section: "Results",
      char_start: 1200,
      char_end: 1310,
    });
    expect(result.evidence[0].contentHash).toHaveLength(64);
    expect(result.provenance.reasoningLedgerId).toBe("ledger-1");
  });

  it("makes conflicting evidence visible and returns a contested verdict", () => {
    const result = checkCalyxMissionClaim(
      mission({
        contradicting_evidence: [
          {
            candidate_id: 18,
            subject: "leaf thickness",
            predicate: "not_diagnostic_of",
            value: "cool-growing niche",
            source_revision_id: 41,
            source_anchor_ids: [401],
          },
        ],
      }),
      { ...conclusion, claim_ids: [17, 18] },
    );

    expect(result.verdict).toBe("contested");
    expect(result.verificationStatus).toBe("review_required");
    expect(result.evidence.some((item) => item.role === "counterevidence")).toBe(true);
    expect(result.scientificArgument.steps.some((step) => step.kind === "counterevidence")).toBe(true);
  });

  it("fails closed when a conclusion has no claim-to-evidence identity", () => {
    const result = checkCalyxMissionClaim(
      mission({ supporting_evidence: [] }),
      { text: "An unlinked conclusion." },
    );

    expect(result.verificationStatus).toBe("failed");
    expect(result.verdict).toBe("insufficient_evidence");
    expect(result.checks.find((item) => item.id === "claim_identity")?.status).toBe("fail");
    expect(result.checks.find((item) => item.id === "support_present")?.status).toBe("fail");
  });

  it("never treats unresolved evidence gaps as proof against the biology", () => {
    const result = checkCalyxMissionClaim(
      mission({ missing_evidence: ["phylogenetically controlled comparative model"] }),
      conclusion,
    );

    expect(result.verdict).toBe("provisional");
    expect(result.gaps).toContain("phylogenetically controlled comparative model");
    expect(result.checks.find((item) => item.id === "evidence_gaps")?.status).toBe("needs_review");
  });
});

/**
 * The objections a mission raises against itself.
 *
 * The Workbench exists to answer "why should I believe this claim". The mission
 * already answers a large part of that: it reports whether it passed structural
 * validation, whether it was blocked mid-run, and whether it may be published —
 * each with the reasons the backend supplied. Those reasons were computed,
 * returned, and then discarded before they reached the scientist.
 *
 * The canonical Phalaenopsis fixture demonstrates it unchanged: it is already
 * ineligible for publication because HUMAN_REVIEW_REQUIRED, and that reason
 * appeared nowhere.
 */
describe("stated objections", () => {
  it("surfaces the publication blocker the fixture already carries", () => {
    const result = checkCalyxMissionClaim(mission(), conclusion);
    expect(result.objections.publicationEligible).toBe(false);
    expect(result.objections.publication).toEqual(["HUMAN_REVIEW_REQUIRED"]);
  });

  it("keeps validation, run and publication objections apart", () => {
    // The backend distinguishes them, so the Workbench must not merge them into
    // one undifferentiated list of complaints.
    const result = checkCalyxMissionClaim(
      mission({
        validation: { valid: false, blockers: ["EVIDENCE_NOT_SOURCE_BOUND"] },
        blockers: [{ code: "RETRIEVAL_TIMEOUT", stage: "evidence_retrieval", detail: "index unavailable" }],
      }),
      conclusion,
    );

    expect(result.objections.validation).toEqual(["EVIDENCE_NOT_SOURCE_BOUND"]);
    expect(result.objections.mission).toEqual([
      { code: "RETRIEVAL_TIMEOUT", stage: "evidence_retrieval", detail: "index unavailable" },
    ]);
    expect(result.objections.publication).toEqual(["HUMAN_REVIEW_REQUIRED"]);
  });

  it("reports an unexplained failure as unexplained, not as no objection", () => {
    // A mission that fails validation and says nothing about why is less
    // trustworthy than one that explains itself. `stated` is what lets the UI
    // say so rather than rendering an empty list.
    const result = checkCalyxMissionClaim(
      mission({
        validation: { valid: false, blockers: [] },
        publication_eligibility: { eligible: false, automatic_publication: false, blockers: [] },
      }),
      conclusion,
    );

    expect(result.objections.validationValid).toBe(false);
    expect(result.objections.stated).toBe(false);
    expect(result.objections.validation).toEqual([]);
  });

  it("drops malformed empty reasons rather than rendering blank objections", () => {
    const result = checkCalyxMissionClaim(
      mission({
        validation: { valid: false, blockers: ["", "   ", "REAL_REASON"] },
        blockers: [{ code: "", stage: "", detail: "" }],
      }),
      conclusion,
    );

    expect(result.objections.validation).toEqual(["REAL_REASON"]);
    // A blocker with nothing in it is a malformed field, not an objection.
    expect(result.objections.mission).toEqual([]);
  });

  it("reports no objection when the mission genuinely raises none", () => {
    const result = checkCalyxMissionClaim(
      mission({
        validation: { valid: true, blockers: [] },
        publication_eligibility: { eligible: true, automatic_publication: false, blockers: [] },
        blockers: [],
      }),
      conclusion,
    );

    expect(result.objections.validationValid).toBe(true);
    expect(result.objections.publicationEligible).toBe(true);
    expect(result.objections.stated).toBe(false);
  });

  it("tolerates a backend that omits the objection fields entirely", () => {
    // Older backends. Absent must not throw, and must not be read as "valid".
    const result = checkCalyxMissionClaim(
      mission({
        validation: undefined as never,
        publication_eligibility: undefined as never,
        blockers: undefined as never,
      }),
      conclusion,
    );

    expect(result.objections.validationValid).toBe(false);
    expect(result.objections.publicationEligible).toBe(false);
    expect(result.objections.mission).toEqual([]);
  });
});
