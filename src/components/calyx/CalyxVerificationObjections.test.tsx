// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CalyxVerificationWorkbench from "./CalyxVerificationWorkbench";
import type { BrainMission, MissionConclusion } from "@/lib/calyxWorkspace";

/**
 * "Why should I believe this claim?" — answered with the mission's own reasons.
 *
 * The mission reports whether it passed structural validation, whether it was
 * blocked mid-run, and whether it may be published, each with reasons the
 * backend supplied. Those reasons reached the frontend and were dropped. The
 * Workbench displayed "Publication eligible: no" and said nothing about why,
 * and its validation check read "not structurally validated or has unresolved
 * blockers" — an "or" across two states the backend distinguishes.
 *
 * Rendered for real, because the deficiency was in the rendering.
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
  } as BrainMission;
}

let container: HTMLDivElement;
let root: Root;

/** Mounts the Workbench and opens it — the panel is collapsed by default. */
async function open(missionValue: BrainMission) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <CalyxVerificationWorkbench mission={missionValue} conclusion={CONCLUSION} />,
    );
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
const objections = () => container.querySelector('[data-testid="stated-objections"]');

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

describe("verification workbench shows why the mission objects", () => {
  it("gives the reason behind an ineligible publication verdict", async () => {
    await open(mission());
    expect(text()).toContain("Not eligible for publication");
    expect(text()).toContain("HUMAN_REVIEW_REQUIRED");
  });

  it("shows validation reasons rather than only the verdict", async () => {
    await open(
      mission({ validation: { valid: false, blockers: ["EVIDENCE_NOT_SOURCE_BOUND"] } }),
    );
    expect(text()).toContain("Failed structural validation");
    expect(text()).toContain("EVIDENCE_NOT_SOURCE_BOUND");
  });

  it("no longer collapses two distinct failures into an ambiguous 'or'", async () => {
    await open(
      mission({ validation: { valid: false, blockers: ["EVIDENCE_NOT_SOURCE_BOUND"] } }),
    );
    expect(text()).not.toContain("not structurally validated or has unresolved blockers");
  });

  it("surfaces a run blocker with its stage and detail", async () => {
    await open(
      mission({
        blockers: [
          { code: "RETRIEVAL_TIMEOUT", stage: "evidence_retrieval", detail: "index unavailable" },
        ],
      }),
    );
    expect(text()).toContain("Blocked during the run");
    expect(text()).toContain("RETRIEVAL_TIMEOUT");
    expect(text()).toContain("evidence_retrieval");
    expect(text()).toContain("index unavailable");
  });

  it("says an unexplained failure is unexplained rather than showing nothing", async () => {
    // The dangerous rendering: a mission fails validation, supplies no reason,
    // and the section appears empty — indistinguishable from no objection.
    await open(
      mission({
        validation: { valid: false, blockers: [] },
        publication_eligibility: { eligible: false, automatic_publication: false, blockers: [] },
      }),
    );
    expect(text()).toMatch(/supplied no reason/i);
    expect(text()).toMatch(/not evidence that the claim is sound/i);
    // And the absent publication blocker must not read as permission.
    expect(text()).toMatch(/not a statement that the claim is publishable/i);
  });

  it("shows no objections section when the mission raises none", async () => {
    await open(
      mission({
        validation: { valid: true, blockers: [] },
        publication_eligibility: { eligible: true, automatic_publication: false, blockers: [] },
        blockers: [],
      }),
    );
    expect(objections()).toBeNull();
  });

  it("does not present an objection as a judgement about the science", async () => {
    await open(mission());
    // A publication gate is a governance state. It is not a finding that the
    // claim is false, and the surface must not imply that it is.
    expect(text()).not.toMatch(/claim is (false|wrong|disproven|refuted)/i);
  });
});
