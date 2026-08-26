import { describe, expect, it } from "vitest";

import type { BrainMission, MissionConclusion } from "@/lib/calyxWorkspace";
import { checkCalyxMissionClaim } from "@/lib/calyxVerification";
import { buildCalyxTurnContext } from "@/lib/calyxConversation";
import { researchStationCalyxHref } from "@/lib/researchStationNavigation";

const conclusion: MissionConclusion = {
  type: "inference",
  text: "The current governed evidence supports a bounded ecological interpretation for Phalaenopsis amabilis.",
  claim_ids: [1701],
};

function governedMission(): BrainMission {
  return {
    mission_id: "naocc-phalaenopsis-mission",
    project_id: "naocc-phalaenopsis",
    question: "What governed evidence supports this ecological interpretation of Phalaenopsis amabilis?",
    state: "AWAITING_HUMAN_REVIEW",
    current_stage: "eligible_for_publication_state",
    steps_executed: 10,
    sources: [
      {
        result_id: "naocc-source-1",
        title: "Governed Phalaenopsis evidence",
        object_type: "literature",
        authorized_excerpt: "The reviewed source span supports the bounded ecological claim.",
        citation: {
          revision_id: 501,
          source_anchor_ids: [9001],
          locator: { page: 12, section: "Results", char_start: 210, char_end: 276 },
        },
      },
    ],
    supporting_evidence: [
      {
        candidate_id: 1701,
        subject: "Phalaenopsis amabilis",
        predicate: "supported_by",
        value: "reviewed ecological evidence",
        source_revision_id: 501,
        source_anchor_ids: [9001],
      },
    ],
    contradicting_evidence: [],
    missing_evidence: [],
    confidence: 0.8,
    conclusions: [conclusion],
    reasoning_ledger: { ledger_id: "naocc-ledger-1", version: 1 },
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
    artifacts: {
      canonical_evidence: [
        {
          revision_id: 501,
          text: "The reviewed source span supports the bounded ecological claim.",
          display_policy: "AUTHORIZED_EXCERPT",
          source_anchors: [
            {
              anchor_id: 9001,
              ordered_span: 0,
              locator: { page: 12, section: "Results", char_start: 210, char_end: 276 },
            },
          ],
          metadata: { content_hash: "b".repeat(64) },
        },
      ],
    },
  } as BrainMission;
}

describe("NAOCC governed verification continuity", () => {
  it("keeps Research identity non-evidentiary while Check Calyx audits only governed evidence", () => {
    const href = researchStationCalyxHref({
      taxon: "Phalaenopsis amabilis",
      projectId: "naocc-phalaenopsis",
      conversationId: "conversation-phalaenopsis",
    });
    const calyxUrl = new URL(href, "https://orchidcontinuum.org");

    const turnContext = buildCalyxTurnContext({
      projectId: calyxUrl.searchParams.get("project") ?? "",
      uploadedFiles: [],
      routeSearch: calyxUrl.search,
    });

    expect(turnContext.project_id).toBe("naocc-phalaenopsis");
    expect(turnContext.route_context).toMatchObject({
      origin: "research-station",
      featured_taxon: { rank: "genus", accepted_name: "Phalaenopsis" },
      taxon: "Phalaenopsis amabilis",
      taxon_source: "research-station",
      taxon_is_evidence: false,
    });

    const verification = checkCalyxMissionClaim(governedMission(), conclusion);

    expect(verification.operation).toBe("CHECK_CALYX");
    expect(verification.verificationStatus).toBe("verified");
    expect(verification.verdict).toBe("structurally_verified");
    expect(verification.evidence).toHaveLength(1);
    expect(verification.evidence[0]).toMatchObject({
      role: "support",
      sourceRevisionId: "501",
      anchorIds: ["9001"],
      exactExcerpt: "The reviewed source span supports the bounded ecological claim.",
      contentHash: "b".repeat(64),
    });
    expect(verification.provenance).toMatchObject({
      missionId: "naocc-phalaenopsis-mission",
      reasoningLedgerId: "naocc-ledger-1",
      reasoningLedgerVersion: 1,
      publicationEligible: false,
      automaticPublication: false,
    });
    expect(verification.scientificArgument.privateChainOfThoughtIncluded).toBe(false);
    expect(verification.scientificArgument.steps.some((step) => step.kind === "evidence")).toBe(true);
    expect(verification.scientificArgument.steps.some((step) => step.kind === "claim")).toBe(true);
  });
});
