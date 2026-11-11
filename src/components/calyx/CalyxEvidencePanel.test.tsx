// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import CalyxEvidencePanel from "@/components/calyx/CalyxEvidencePanel";
import recorded from "@/lib/__fixtures__/calyxScientificEvidence.realBackend.json";
import {
  composeAnswerWithEvidence,
  readSavedMessageEvidence,
  readScientificEvidence,
  type CalyxEvidenceView,
} from "@/lib/calyxScientificEvidence";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const turns = recorded.turns;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(evidence: CalyxEvidenceView) {
  act(() => root.render(<CalyxEvidencePanel evidence={evidence} />));
}
const panel = () => container.querySelector<HTMLElement>('[data-testid="calyx-evidence-panel"]');
const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe("CalyxEvidencePanel: nothing to show", () => {
  it.each([
    ["no block (production today)", undefined],
    ["null block", null],
    ["not_enabled", { status: "not_enabled", reading: [] }],
    ["not_requested (recorded)", turns.not_requested.scientific_evidence],
    ["not_applicable without explanation (recorded)", turns.not_applicable_silent.scientific_evidence],
  ])("renders nothing for %s", (_label, raw) => {
    render(readScientificEvidence(raw));
    expect(container.innerHTML).toBe("");
  });
});

describe("CalyxEvidencePanel: available (recorded Catasetum barbatum turn)", () => {
  beforeEach(() => render(readScientificEvidence(turns.available.scientific_evidence)));

  it("is a labelled region with a heading", () => {
    const section = panel();
    expect(section?.tagName).toBe("SECTION");
    expect(section?.dataset.evidenceKind).toBe("available");
    const heading = section?.querySelector("h3");
    expect(heading?.textContent).toBe("What the Continuum's evidence records show");
    expect(section?.getAttribute("aria-labelledby")).toBe(heading?.id);
  });

  it("lists every recorded sentence, in order, word for word", () => {
    const items = Array.from(byTestId("calyx-evidence-sentences")?.querySelectorAll("li") ?? []);
    expect(byTestId("calyx-evidence-sentences")?.tagName).toBe("UL");
    expect(items.map((item) => item.textContent)).toEqual(turns.available.scientific_evidence.reading);
  });

  it("names the species", () => {
    expect(byTestId("calyx-evidence-species")?.textContent).toBe("Catasetum barbatum");
  });

  it("says verified pollination is not established, and never that it is", () => {
    const status = byTestId("calyx-evidence-pollination");
    expect(status?.dataset.pollination).toBe("not-established");
    expect(status?.textContent).toContain("Verified pollination: not established.");
    expect(container.textContent).not.toMatch(/Verified pollination: established/);
  });

  it("states the boundary facts the backend reported", () => {
    const text = byTestId("calyx-evidence-boundary")?.textContent ?? "";
    expect(text).toContain("Unreviewed. These are records, not a reviewed conclusion.");
    expect(text).toContain("Read-only.");
    expect(text).toContain("Nothing was written to the Knowledge Graph.");
    expect(text).toContain("Nothing was published.");
  });

  it("keeps provenance in a native disclosure, closed by default, that opens", () => {
    const details = byTestId("calyx-evidence-provenance") as HTMLDetailsElement;
    expect(details.tagName).toBe("DETAILS");
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.textContent).toBe("Provenance");
    act(() => { details.open = true; });
    const text = details.textContent ?? "";
    expect(text).toContain(turns.available.scientific_evidence.mission.mission_id);
    expect(text).toContain(turns.available.scientific_evidence.evidence_packet_id);
    expect(text).toContain("evidence only");
    expect(text).toContain("unavailable no reasoning ledger");
    expect(text).toContain("Not eligible (no reasoning ledger review unavailable)");
    expect(text).toContain("complete");
  });
});

describe("CalyxEvidencePanel: pollination flag", () => {
  it("says established only when the backend sent true (synthetic: no such recording exists)", () => {
    render(readScientificEvidence({ ...turns.available.scientific_evidence, pollination_verified: true }));
    expect(byTestId("calyx-evidence-pollination")?.dataset.pollination).toBe("verified");
    expect(byTestId("calyx-evidence-pollination")?.textContent).toContain("Verified pollination: established");
  });

  it("says not reported when the flag is missing", () => {
    const { pollination_verified: _dropped, ...raw } = turns.available.scientific_evidence;
    render(readScientificEvidence(raw));
    const status = byTestId("calyx-evidence-pollination");
    expect(status?.dataset.pollination).toBe("not-reported");
    expect(status?.textContent).toContain("not reported");
    expect(status?.textContent).not.toMatch(/established/);
  });
});

describe("CalyxEvidencePanel: available with gaps", () => {
  it("says no sentences were returned rather than showing an empty list", () => {
    render(readScientificEvidence({ ...turns.available.scientific_evidence, reading: [] }));
    expect(byTestId("calyx-evidence-sentences")).toBeNull();
    expect(byTestId("calyx-evidence-empty")?.textContent).toContain("missing evidence, not evidence of absence");
  });

  it("does not claim a boundary the block did not report", () => {
    render(readScientificEvidence({ status: "available", reading: ["One."] }));
    const text = byTestId("calyx-evidence-boundary")?.textContent ?? "";
    expect(text).toContain("were not reported");
    expect(text).not.toContain("Read-only.");
    expect(text).not.toContain("Nothing was written");
    expect(byTestId("calyx-evidence-species")?.textContent).toBe("Not reported");
  });

  it("shows a restored saved turn with its sentences and says what was not kept", () => {
    const { evidence } = composeAnswerWithEvidence(turns.available.answer, readSavedMessageEvidence(turns.available.saved_message_metadata));
    render(evidence);
    expect(byTestId("calyx-evidence-sentences")?.querySelectorAll("li")).toHaveLength(22);
    expect(byTestId("calyx-evidence-species")?.textContent).toBe("Not reported in the saved conversation");
    expect(byTestId("calyx-evidence-pollination")?.dataset.pollination).toBe("not-reported");
    expect(byTestId("calyx-evidence-boundary")?.textContent).toContain("Treat these records as unreviewed.");
    expect(byTestId("calyx-evidence-provenance")?.textContent).toContain("loaded from a saved conversation");
  });
});

describe("CalyxEvidencePanel: no evidence, stated", () => {
  it("shows the recorded ambiguous name as not resolved, with no sentences or pollination line", () => {
    render(readScientificEvidence(turns.not_resolved.scientific_evidence));
    expect(panel()?.dataset.evidenceKind).toBe("not_resolved");
    expect(panel()?.querySelector("h3")?.textContent).toBe("The name is not a single species in the Continuum graph");
    expect(panel()?.textContent).toContain("Ophrys apifera");
    expect(panel()?.textContent).toContain("graph resolution: ambiguous");
    expect(panel()?.textContent).toContain(turns.not_resolved.scientific_evidence.explanation);
    expect(byTestId("calyx-evidence-sentences")).toBeNull();
    expect(byTestId("calyx-evidence-pollination")).toBeNull();
  });

  it("shows the recorded failed retrieval as unavailable, with its cause", () => {
    render(readScientificEvidence(turns.unavailable.scientific_evidence));
    expect(panel()?.dataset.evidenceKind).toBe("unavailable");
    expect(panel()?.querySelector("h3")?.textContent).toBe("Graph evidence could not be retrieved this turn");
    expect(panel()?.textContent).toContain(turns.unavailable.scientific_evidence.explanation);
    expect(panel()?.textContent).toContain("MISSION_BLOCKED");
    expect(byTestId("calyx-evidence-sentences")).toBeNull();
    expect(byTestId("calyx-evidence-pollination")).toBeNull();
  });

  it("gives a failed retrieval without an explanation a neutral line", () => {
    render(readScientificEvidence({ status: "unavailable", reading: [], error: "RuntimeError" }));
    expect(panel()?.textContent).toContain("Nothing is concluded from a failed retrieval.");
    expect(byTestId("calyx-evidence-provenance")).toBeNull();
  });

  it("shows the recorded outside-the-path explanation as a quiet note", () => {
    render(readScientificEvidence(turns.not_applicable_with_explanation.scientific_evidence));
    expect(panel()?.dataset.evidenceKind).toBe("not_applicable");
    expect(panel()?.textContent).toContain(turns.not_applicable_with_explanation.scientific_evidence.explanation);
  });

  it("points a restored not-resolved turn at the reply instead of inventing a reason", () => {
    render(readSavedMessageEvidence(turns.not_resolved.saved_message_metadata));
    expect(panel()?.dataset.evidenceKind).toBe("not_resolved");
    expect(panel()?.textContent).toContain("The reply above states why.");
  });
});

describe("CalyxEvidencePanel: unreadable blocks", () => {
  it("shows no sentences from a block with an unknown status", () => {
    render(readScientificEvidence({ ...turns.available.scientific_evidence, status: "partially_available" }));
    expect(panel()?.dataset.evidenceKind).toBe("unrecognised");
    expect(panel()?.textContent).toContain("partially_available");
    expect(panel()?.textContent).not.toContain("Subject: Catasetum barbatum");
    expect(byTestId("calyx-evidence-pollination")).toBeNull();
  });

  it("shows no sentences from a malformed block", () => {
    render(readScientificEvidence({ ...turns.available.scientific_evidence, reading: "Subject: Catasetum barbatum" }));
    expect(panel()?.dataset.evidenceKind).toBe("malformed");
    expect(panel()?.textContent).toContain("could not read");
    expect(panel()?.textContent).not.toContain("Subject: Catasetum barbatum");
  });
});
