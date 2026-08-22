import { describe, expect, it } from "vitest";

import type { BrainMission, CalyxSynthesisStructure, MissionConclusion } from "@/lib/calyxWorkspace";
import { checkCalyxMissionClaim } from "@/lib/calyxVerification";
import { buildCalyxTurnContext, parseCalyxRouteContext } from "@/lib/calyxConversation";
import {
  featuredTaxonAtlasHref,
  featuredTaxonResearchHref,
} from "@/lib/featuredTaxonNavigation";
import { atlasOccurrenceEvidenceCalyxHref } from "@/features/atlas-next/calyxHandoff";
import {
  RESEARCH_STATION_ORIGIN,
  researchStationAtlasHref,
  researchStationCalyxHref,
} from "@/lib/researchStationNavigation";
import {
  groupClaimCoverage,
  hasUnresolvedConflict,
  synthesisGaps,
} from "@/lib/researchStationSynthesis";

/**
 * The canonical non-production scientific journey, walked as ONE chain.
 *
 * Every hop in this journey already has its own test. What none of them can
 * show is that the same investigation survives all five surfaces: per-hop tests
 * each re-invent their own subject, so a break in continuity BETWEEN two green
 * hops is invisible. This walks a single canonical subject —
 * Phalaenopsis — from the homepage through to the Verification Workbench and
 * asserts what must still hold at the far end.
 *
 * Continuity asserted across the whole chain:
 *   canonical taxon identity, project/research identity, conversation identity,
 *   carried user question, provenance, evidence status, contradiction state,
 *   and unknown/gap state.
 *
 * Two boundaries must remain explicit at every hop that carries them:
 *   research/user interaction context is not scientific evidence, and the
 *   carried question stays `question_is_evidence: false`.
 */

const CANONICAL_GENUS = "Phalaenopsis";
const CANONICAL_TAXON = "Phalaenopsis amabilis";
const PROJECT_ID = "naocc-phalaenopsis";
const CONVERSATION_ID = "conv-naocc-phalaenopsis-1";
const CARRIED_QUESTION =
  "Which traits distinguish cool-growing from warm-growing Phalaenopsis after accounting for elevation?";

/**
 * Record-level Atlas detail that must never cross a surface boundary.
 * Values are distinctive so a leak anywhere in the journey is unambiguous.
 */
const PROTECTED_OCCURRENCE = {
  decimalLatitude: "14.5995",
  decimalLongitude: "120.9842",
  locality: "Sitio Malabon ridge, exact grove",
  occurrenceID: "GBIF:2401991234",
  recordedBy: "M. Dela Cruz",
  catalogNumber: "PH-AMAB-0091",
} as const;

const PROTECTED_VALUES = Object.values(PROTECTED_OCCURRENCE);
const PROTECTED_KEYS = [
  "decimallatitude",
  "decimallongitude",
  "latitude",
  "longitude",
  "lat",
  "lon",
  "locality",
  "occurrenceid",
  "recordedby",
  "collector",
  "catalognumber",
];

/** Fails on a protected value or a protected key appearing anywhere in an artifact. */
function expectNoProtectedLeak(label: string, artifact: unknown): void {
  const serialized = JSON.stringify(artifact) ?? "";
  for (const value of PROTECTED_VALUES) {
    expect(serialized, `${label} leaked protected occurrence detail (${value})`).not.toContain(value);
  }
  const lowered = serialized.toLowerCase();
  for (const key of PROTECTED_KEYS) {
    expect(lowered, `${label} leaked a protected locality field (${key})`).not.toContain(`"${key}"`);
  }
}

/**
 * Backend-composed synthesis for the investigation.
 *
 * Deliberately mixed: one supported claim, one contradicted claim, and named
 * missing evidence. A journey that only carries agreement proves nothing about
 * whether disagreement and gaps survive the handoff.
 */
function synthesisStructure(): CalyxSynthesisStructure {
  return {
    composer_contract: "CALYX-CONVERSATIONAL-SYNTHESIS-001",
    generative: true,
    resolved_subject: CANONICAL_TAXON,
    follow_up_turn: true,
    claim_coverage: [
      {
        claim_id: "claim-seasonal-persistence",
        claim: "Seasonal leaf persistence tracks thermal niche in Phalaenopsis.",
        coverage: "supported",
        source_families: ["literature", "trait"],
        supporting_count: 3,
        contradicting_count: 0,
      },
      {
        claim_id: "claim-leaf-thickness",
        claim: "Leaf thickness alone predicts cool-growing habit.",
        coverage: "contradicted",
        source_families: ["literature"],
        supporting_count: 1,
        contradicting_count: 2,
      },
    ],
    integrated_across_source_families: true,
    cited_source_families: ["literature", "trait"],
    missing_evidence: [
      "Species-level thermal niche estimates",
      "A phylogenetically controlled comparative analysis",
    ],
    unresolved_conflict: true,
    governed_provenance: {
      mission_id: "naocc-phalaenopsis-mission",
      evidence_packet_id: "packet-4411",
      review_status: "HUMAN_REVIEW_REQUIRED",
    },
  };
}

const conclusion: MissionConclusion = {
  type: "inference",
  text: "Seasonal leaf persistence is the better-supported thermal discriminator for Phalaenopsis amabilis.",
  claim_ids: [1701],
};

/** The governed mission the Verification Workbench audits at the end of the journey. */
function governedMission(): BrainMission {
  return {
    mission_id: "naocc-phalaenopsis-mission",
    project_id: PROJECT_ID,
    question: CARRIED_QUESTION,
    state: "AWAITING_HUMAN_REVIEW",
    current_stage: "eligible_for_publication_state",
    steps_executed: 12,
    sources: [
      {
        result_id: "naocc-source-1",
        title: "Thermal niche and leaf persistence in Phalaenopsis",
        object_type: "literature",
        authorized_excerpt: "Seasonal leaf persistence covaried with thermal niche across sampled taxa.",
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
        subject: CANONICAL_TAXON,
        predicate: "supported_by",
        value: "seasonal leaf persistence measurements",
        source_revision_id: 501,
        source_anchor_ids: [9001],
      },
    ],
    contradicting_evidence: [
      {
        candidate_id: 1701,
        subject: CANONICAL_TAXON,
        predicate: "contradicted_by",
        value: "leaf thickness not independently diagnostic",
        source_revision_id: 502,
        source_anchor_ids: [9002],
      },
    ],
    missing_evidence: ["Species-level thermal niche estimates"],
    confidence: 0.72,
    conclusions: [conclusion],
    reasoning_ledger: { ledger_id: "naocc-ledger-1", version: 2 },
    validation: { valid: true, blockers: [] },
    review_status: "HUMAN_REVIEW_REQUIRED",
    publication_eligibility: {
      eligible: false,
      automatic_publication: false,
      blockers: ["HUMAN_REVIEW_REQUIRED"],
    },
    blockers: [],
    partial: false,
    created_at: "2026-08-22T00:00:00Z",
    updated_at: "2026-08-22T00:00:01Z",
    artifacts: {
      canonical_evidence: [
        {
          revision_id: 501,
          text: "Seasonal leaf persistence covaried with thermal niche across sampled taxa.",
          display_policy: "AUTHORIZED_EXCERPT",
          source_anchors: [
            {
              anchor_id: 9001,
              ordered_span: 0,
              locator: { page: 12, section: "Results", char_start: 210, char_end: 276 },
            },
          ],
          metadata: { content_hash: "a".repeat(64) },
        },
        {
          revision_id: 502,
          text: "Leaf thickness did not separate the thermal groups once elevation was controlled.",
          display_policy: "AUTHORIZED_EXCERPT",
          source_anchors: [
            {
              anchor_id: 9002,
              ordered_span: 0,
              locator: { page: 14, section: "Discussion", char_start: 88, char_end: 171 },
            },
          ],
          metadata: { content_hash: "c".repeat(64) },
        },
      ],
    },
  } as BrainMission;
}

describe("canonical scientific journey (Phalaenopsis)", () => {
  it("carries one investigation from homepage to Verification Workbench without losing identity or state", () => {
    // ---- Stage 1: Homepage -> Atlas ------------------------------------
    const atlasHref = featuredTaxonAtlasHref(CANONICAL_GENUS);
    expect(atlasHref).toBe("/atlas?genera=Phalaenopsis");
    expectNoProtectedLeak("homepage -> Atlas", atlasHref);

    // ---- Stage 2: Atlas -> Calyx, question as interaction context ------
    // The visitor asks a question over occurrence evidence. Atlas holds the
    // records; only genus identity and the question itself may travel.
    const atlasCalyxHref = atlasOccurrenceEvidenceCalyxHref(CANONICAL_GENUS, CARRIED_QUESTION);
    expect(atlasCalyxHref).not.toBeNull();
    const atlasRoute = parseCalyxRouteContext(atlasCalyxHref!.split("?")[1] ?? "");
    expect(atlasRoute.featuredTaxon).toEqual({ rank: "genus", name: CANONICAL_GENUS });
    expect(atlasRoute.questionContext?.question).toBe(CARRIED_QUESTION);
    // Boundary 1: the carried user question is never evidence.
    expect(atlasRoute.questionContext?.question_is_evidence).toBe(false);
    expect(atlasRoute.questionContext?.question_source).toBe("user");
    expectNoProtectedLeak("Atlas -> Calyx", atlasCalyxHref);

    // ---- Stage 3: Homepage/Atlas -> Research Station -------------------
    const researchHref = featuredTaxonResearchHref(CANONICAL_GENUS);
    expect(researchHref).toContain(`genus=${CANONICAL_GENUS}`);
    expectNoProtectedLeak("-> Research Station", researchHref);

    // The station returns to Atlas on the same investigation. Project identity
    // now travels alongside the taxon.
    const researchAtlasHref = researchStationAtlasHref({
      taxon: CANONICAL_TAXON,
      projectId: PROJECT_ID,
    });
    expect(researchAtlasHref).toContain(`project=${PROJECT_ID}`);
    expect(researchAtlasHref).toContain(`origin=${RESEARCH_STATION_ORIGIN}`);
    expectNoProtectedLeak("Research Station -> Atlas", researchAtlasHref);

    // ---- Stage 4: Research Station -> Calyx ----------------------------
    // All three identities — taxon, project, conversation — must survive.
    const researchCalyxHref = researchStationCalyxHref({
      taxon: CANONICAL_TAXON,
      projectId: PROJECT_ID,
      conversationId: CONVERSATION_ID,
    });
    expect(researchCalyxHref).toContain(`project=${PROJECT_ID}`);
    expect(researchCalyxHref).toContain(`conversation=${CONVERSATION_ID}`);
    expect(researchCalyxHref).toContain(`origin=${RESEARCH_STATION_ORIGIN}`);
    expectNoProtectedLeak("Research Station -> Calyx", researchCalyxHref);

    const researchSearch = researchCalyxHref.slice(researchCalyxHref.indexOf("?"));
    const turnContext = buildCalyxTurnContext({
      projectId: PROJECT_ID,
      uploadedFiles: [],
      routeSearch: researchSearch,
    });
    const routeContext = (turnContext as { route_context: Record<string, unknown> }).route_context;

    expect(turnContext.project_id).toBe(PROJECT_ID);
    expect(routeContext.origin).toBe(RESEARCH_STATION_ORIGIN);
    expect(routeContext.taxon).toBe(CANONICAL_TAXON);
    // Boundary 2: the Research Station's taxon identity is interaction context,
    // not an observation the station has evidenced.
    expect(routeContext.taxon_is_evidence).toBe(false);
    expect(routeContext.taxon_source).toBe(RESEARCH_STATION_ORIGIN);
    expectNoProtectedLeak("Calyx turn context", turnContext);

    // ---- Stage 5: Calyx synthesis state --------------------------------
    // Agreement, disagreement and absence must each survive as themselves.
    const structure = synthesisStructure();
    const coverage = groupClaimCoverage(structure);
    expect(coverage.supported.map((claim) => claim.claim_id)).toEqual(["claim-seasonal-persistence"]);
    expect(coverage.contradicted.map((claim) => claim.claim_id)).toEqual(["claim-leaf-thickness"]);
    // Contradiction never collapses into support.
    expect(coverage.supported).toHaveLength(1);
    expect(hasUnresolvedConflict(structure)).toBe(true);
    // Unknowns stay named unknowns rather than becoming absence.
    expect(synthesisGaps(structure)).toEqual([
      "Species-level thermal niche estimates",
      "A phylogenetically controlled comparative analysis",
    ]);
    expect(structure.resolved_subject).toBe(CANONICAL_TAXON);
    expect(structure.follow_up_turn).toBe(true);

    // ---- Stage 6: Calyx -> Verification Workbench ----------------------
    const verification = checkCalyxMissionClaim(governedMission(), conclusion);

    expect(verification.operation).toBe("CHECK_CALYX");
    expect(verification.claimText).toBe(conclusion.text);

    // The same subject is still under audit at the far end of the journey.
    expect(JSON.stringify(verification.evidence)).toContain(CANONICAL_TAXON);

    // Support and counterevidence remain distinguishable, not merged.
    const roles = verification.evidence.map((item) => item.role);
    expect(roles).toContain("support");
    expect(roles).toContain("counterevidence");

    // Provenance survives: every traced item resolves to a source revision and
    // an anchor, and the governed review state is unchanged.
    for (const item of verification.evidence) {
      expect(item.sourceRevisionId).toBeTruthy();
      expect(item.anchorIds.length).toBeGreaterThan(0);
    }
    expect(verification.provenance.missionId).toBe("naocc-phalaenopsis-mission");
    expect(verification.provenance.reasoningLedgerId).toBe("naocc-ledger-1");
    expect(verification.provenance.reviewStatus).toBe("HUMAN_REVIEW_REQUIRED");

    // A journey never earns publication on its own.
    expect(verification.provenance.automaticPublication).toBe(false);
    expect(verification.provenance.publicationEligible).toBe(false);

    // The gap declared mid-journey is still declared at the end.
    expect(verification.gaps).toContain("Species-level thermal niche estimates");

    // Private reasoning never becomes an auditable artifact.
    expect(verification.scientificArgument.privateChainOfThoughtIncluded).toBe(false);

    expectNoProtectedLeak("Verification Workbench", verification);
  });

  it("never promotes the carried question or research identity into evidence", () => {
    // The two non-evidentiary boundaries, asserted together on one turn: a
    // question arriving from Atlas and a taxon arriving from the Research
    // Station must both remain interaction context on the same context object.
    const search = new URLSearchParams({
      genus: CANONICAL_GENUS,
      taxon: CANONICAL_TAXON,
      project: PROJECT_ID,
      origin: RESEARCH_STATION_ORIGIN,
      question: CARRIED_QUESTION,
      question_source: "user",
      question_is_evidence: "false",
    }).toString();

    const context = buildCalyxTurnContext({
      projectId: PROJECT_ID,
      uploadedFiles: [],
      routeSearch: `?${search}`,
    });
    const routeContext = (context as { route_context: Record<string, unknown> }).route_context;

    expect(routeContext.question).toBe(CARRIED_QUESTION);
    expect(routeContext.question_is_evidence).toBe(false);
    expect(routeContext.taxon).toBe(CANONICAL_TAXON);
    expect(routeContext.taxon_is_evidence).toBe(false);

    // Neither boundary field may be absent: a missing flag reads as unclaimed,
    // and unclaimed is how interaction context quietly becomes evidence.
    expect(Object.keys(routeContext)).toEqual(
      expect.arrayContaining(["question_is_evidence", "taxon_is_evidence"]),
    );

    // Nothing in the turn asserts that any carried context is evidence.
    expect(JSON.stringify(context)).not.toContain('"is_evidence":true');
    expect(JSON.stringify(context)).not.toContain('_is_evidence":true');
  });

  it("refuses to carry protected occurrence detail out of Atlas", () => {
    // The route contract is an allowlist. Appending protected fields to the
    // query string must not make them reachable as Calyx turn context.
    const hostile = new URLSearchParams({
      genus: CANONICAL_GENUS,
      origin: RESEARCH_STATION_ORIGIN,
      taxon: CANONICAL_TAXON,
      ...PROTECTED_OCCURRENCE,
    }).toString();

    const context = buildCalyxTurnContext({
      projectId: PROJECT_ID,
      uploadedFiles: [],
      routeSearch: `?${hostile}`,
    });

    expectNoProtectedLeak("hostile route context", context);
  });
});
