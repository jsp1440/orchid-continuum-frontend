// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CalyxVerificationWorkbench from "./CalyxVerificationWorkbench";
import { checkCalyxMissionClaim } from "@/lib/calyxVerification";
import type { BrainMission, MissionConclusion } from "@/lib/calyxWorkspace";

/**
 * What the Workbench has NOT verified.
 *
 * Two overclaims, opposite in shape.
 *
 * The reasoning-ledger check passed on the strength of an identifier and said
 * "A versioned reasoning ledger exists for this mission." There is no ledger
 * retrieval contract in this frontend at all — the mission carries only an id
 * and a version. A scientist reading a green check next to "reasoning ledger"
 * would reasonably conclude the reasoning is auditable here. It is not.
 * Verifying that a record exists is not verifying what it says.
 *
 * And mission.confidence, a value the backend computed, was surfaced nowhere.
 * Hiding a real number is its own misreport — but a bare "0.78" invites being
 * read as a probability that the claim is true, which it is not.
 */

const CONCLUSION: MissionConclusion = {
  type: "inference",
  text: "Seasonal dormancy is associated with cooler thermal niches in the current evidence.",
  claim_ids: [17],
};

function mission(overrides: Partial<BrainMission> = {}): BrainMission {
  return {
    mission_id: "mission-verify-1",
    project_id: "project-1",
    question: "Which traits distinguish cool-growing Phalaenopsis from warm-growing species?",
    state: "AWAITING_HUMAN_REVIEW",
    current_stage: "eligible_for_publication_state",
    steps_executed: 10,
    sources: [],
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
    ...overrides,
  } as BrainMission;
}

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

describe("verification workbench states what it has not verified", () => {
  it("does not present a recorded ledger as an inspectable one", async () => {
    await open(mission());
    expect(text()).toMatch(/contents are not retrievable from this surface/i);
    expect(text()).toMatch(/its existence is verified; its contents are not/i);
    // The old wording implied the reasoning itself had been checked.
    expect(text()).not.toMatch(/A versioned reasoning ledger exists for this mission\./);
  });

  it("still reports the ledger's presence as genuinely verified", async () => {
    // Presence really is checked, so the check must not be downgraded — the
    // fix is to say what "pass" covers, not to pretend it failed.
    const result = checkCalyxMissionClaim(mission(), CONCLUSION);
    const ledger = result.checks.find((check) => check.id === "reasoning_ledger");
    expect(ledger?.status).toBe("pass");
    expect(result.provenance.reasoningLedgerId).toBe("ledger-1");
    expect(result.provenance.reasoningLedgerVersion).toBe(5);
  });

  it("surfaces the mission's confidence without letting it read as truth", async () => {
    await open(mission());
    expect(text()).toContain("0.78");
    expect(text()).toMatch(/not a probability that the claim is true/i);
    expect(text()).toMatch(/not a measure of evidence strength/i);
  });

  it("renders an absent confidence as not supplied, never as zero", async () => {
    // A missing self-assessment is not a confidence of nothing.
    expect(checkCalyxMissionClaim(mission({ confidence: null }), CONCLUSION).provenance
      .missionConfidence).toBeNull();

    await open(mission({ confidence: null }));
    expect(text()).toMatch(/Mission confidence:\s*not supplied/i);
  });

  it("keeps a genuine zero distinct from an absent value", async () => {
    // 0 is a real self-assessment and must survive the null check.
    expect(checkCalyxMissionClaim(mission({ confidence: 0 }), CONCLUSION).provenance
      .missionConfidence).toBe(0);

    await open(mission({ confidence: 0 }));
    expect(text()).not.toMatch(/Mission confidence:\s*not supplied/i);
  });
});
