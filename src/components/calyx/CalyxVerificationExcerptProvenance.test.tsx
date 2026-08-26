// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CalyxVerificationWorkbench from "./CalyxVerificationWorkbench";
import { checkCalyxMissionClaim } from "@/lib/calyxVerification";
import type { BrainMission, MissionConclusion } from "@/lib/calyxWorkspace";

/**
 * What exactly am I looking at when I read this excerpt?
 *
 * Two conflations lived on one line of traceEvidence:
 *
 *   exactExcerpt: canonical?.text || source?.authorized_excerpt || null
 *
 * The canonical record is hash-anchored; the mission's source summary carries
 * no content hash. Both rendered as the same blockquote, so an unverifiable
 * excerpt looked exactly as authoritative as a verifiable one.
 *
 * And when neither existed, the panel said "not available in this mission
 * response" — which reads as "the backend did not include it" even when the
 * real state is "the record exists and policy forbids showing you its text".
 * Withheld and absent are different scientific states. Absence of access is
 * not absence of evidence.
 */

const CONCLUSION: MissionConclusion = {
  type: "inference",
  text: "Seasonal dormancy is associated with cooler thermal niches in the current evidence.",
  claim_ids: [17],
};

const EXCERPT = "Seasonal dormancy was associated with cooler montane taxa.";

/** The canonical Phalaenopsis fixture, with its artifact layer parameterised. */
function mission(artifacts: unknown, sourceExcerpt: string | null = null): BrainMission {
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
        authorized_excerpt: sourceExcerpt,
        citation: { revision_id: 41, source_anchor_ids: [401], locator: { page: 7 } },
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
    publication_eligibility: { eligible: true, automatic_publication: false, blockers: [] },
    blockers: [],
    partial: false,
    created_at: "2026-08-21T00:00:00Z",
    updated_at: "2026-08-21T00:00:01Z",
    artifacts,
  } as unknown as BrainMission;
}

const canonicalRecord = (text: string | null, displayPolicy: string) => ({
  canonical_evidence: [
    {
      revision_id: 41,
      text,
      display_policy: displayPolicy,
      source_anchors: [{ anchor_id: 401, locator: { page: 7 } }],
      metadata: { content_hash: "a".repeat(64) },
    },
  ],
});

let container: HTMLDivElement;
let root: Root;

async function open(missionValue: BrainMission) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<CalyxVerificationWorkbench mission={missionValue} conclusion={CONCLUSION} />);
  });
  const button = [...container.querySelectorAll("button")].find((b) =>
    /check calyx/i.test(b.textContent ?? ""),
  );
  if (!button) throw new Error("verification toggle not found");
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const text = () => container.textContent ?? "";

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

describe("excerpt provenance and absence", () => {
  it("marks a hash-anchored canonical excerpt as canonical", () => {
    const result = checkCalyxMissionClaim(
      mission(canonicalRecord(EXCERPT, "AUTHORIZED_EXCERPT")),
      CONCLUSION,
    );
    expect(result.evidence[0].excerptSource).toBe("canonical");
    expect(result.evidence[0].excerptAbsence).toBeNull();
    expect(result.evidence[0].contentHash).toBe("a".repeat(64));
  });

  it("marks an unhashed source summary as a summary, and says so on screen", async () => {
    const target = mission({ canonical_evidence: [] }, EXCERPT);
    expect(checkCalyxMissionClaim(target, CONCLUSION).evidence[0].excerptSource).toBe(
      "source_summary",
    );

    await open(target);
    expect(text()).toContain(EXCERPT);
    expect(text()).toMatch(/not the hash-anchored canonical record/i);
    expect(text()).toMatch(/nothing here confirms it matches the source text/i);
  });

  it("reports a policy withholding as a withholding, not as an absence", async () => {
    // The record exists; its text is not releasable. This must never read as
    // "no evidence".
    const target = mission(canonicalRecord(null, "INTERNAL_RESEARCH_ONLY"));
    expect(checkCalyxMissionClaim(target, CONCLUSION).evidence[0].excerptAbsence).toBe(
      "withheld_by_policy",
    );

    await open(target);
    expect(text()).toMatch(/withheld by display policy/i);
    expect(text()).toContain("INTERNAL_RESEARCH_ONLY");
    expect(text()).toMatch(/this is not an absence of evidence/i);
  });

  it("reports a missing canonical record as a traceability gap, not a claim about the source", async () => {
    const target = mission({ canonical_evidence: [] });
    expect(checkCalyxMissionClaim(target, CONCLUSION).evidence[0].excerptAbsence).toBe(
      "not_supplied",
    );

    await open(target);
    expect(text()).toMatch(/traceability gap, not a statement about the source/i);
    // The old wording conflated the two states.
    expect(text()).not.toMatch(/not available in this mission response/i);
  });

  it("surfaces the display policy that governs the excerpt", async () => {
    await open(mission(canonicalRecord(EXCERPT, "AUTHORIZED_EXCERPT")));
    expect(text()).toContain("Display policy:");
    expect(text()).toContain("AUTHORIZED_EXCERPT");
  });

  it("never presents a withheld or missing excerpt as evidence against the claim", async () => {
    await open(mission(canonicalRecord(null, "INTERNAL_RESEARCH_ONLY")));
    expect(text()).not.toMatch(/contradicts|refutes|disproves/i);
  });
});
