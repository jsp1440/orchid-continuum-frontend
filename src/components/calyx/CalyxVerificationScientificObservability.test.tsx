// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/calyx/GovernedEvidenceSearch", () => ({
  default: () => <div data-testid="evidence-search" />,
}));
vi.mock("@/components/calyx/ReasoningLedgerInspector", () => ({
  default: () => <div data-testid="ledger-inspector" />,
}));
vi.mock("@/components/calyx/ScientificObservabilityTrace", () => ({
  default: ({ correlationId }: { correlationId: string }) => (
    <div data-testid="observability-trace">{correlationId}</div>
  ),
}));

import CalyxVerificationWorkbench from "./CalyxVerificationWorkbench";
import type { BrainMission, MissionConclusion } from "@/lib/calyxWorkspace";

const conclusion: MissionConclusion = { text: "Bounded conclusion" };

function mission(extra: Record<string, unknown> = {}): BrainMission {
  return {
    mission_id: "mission-1",
    project_id: "project-1",
    question: "question",
    state: "AWAITING_HUMAN_REVIEW",
    current_stage: "review",
    steps_executed: 1,
    sources: [],
    supporting_evidence: [],
    contradicting_evidence: [],
    missing_evidence: [],
    confidence: null,
    conclusions: [],
    reasoning_ledger: null,
    validation: { valid: true, blockers: [] },
    review_status: "HUMAN_REVIEW_REQUIRED",
    publication_eligibility: { eligible: false, automatic_publication: false, blockers: [] },
    blockers: [],
    partial: false,
    created_at: "2026-09-05T00:00:00Z",
    updated_at: "2026-09-05T00:00:00Z",
    ...extra,
  } as BrainMission;
}

let container: HTMLDivElement;
let root: Root;

async function open(value: BrainMission) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<CalyxVerificationWorkbench mission={value} conclusion={conclusion} />);
  });
  const button = [...container.querySelectorAll("button")].find((item) =>
    /check calyx/i.test(item.textContent ?? ""),
  );
  if (!button) throw new Error("verification toggle not found");
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe("Verification Workbench scientific observability", () => {
  it("fails closed when the mission supplies no explicit correlation id", async () => {
    await open(mission());
    expect(container.querySelector('[data-testid="observability-trace"]')).toBeNull();
    expect(container.textContent).toMatch(/no explicit correlation id was supplied/i);
    expect(container.textContent).toMatch(/mission id is not substituted/i);
  });

  it("mounts the canonical trace consumer only for an explicit correlation id", async () => {
    await open(mission({ observability_correlation_id: "trace-123" }));
    expect(container.querySelector('[data-testid="observability-trace"]')?.textContent).toBe("trace-123");
    expect(container.querySelector('[data-testid="scientific-observability-unavailable"]')).toBeNull();
  });
});
