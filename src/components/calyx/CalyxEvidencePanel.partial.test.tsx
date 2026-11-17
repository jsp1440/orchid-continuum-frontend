// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import CalyxEvidencePanel from "@/components/calyx/CalyxEvidencePanel";
import produced from "@/lib/__fixtures__/calyxScientificEvidence.partialProducedByBackend.json";
import recorded from "@/lib/__fixtures__/calyxScientificEvidence.realBackend.json";
import { readSavedMessageEvidence, readScientificEvidence, type CalyxEvidenceView } from "@/lib/calyxScientificEvidence";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const block = produced.block;
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

function show(evidence: CalyxEvidenceView) {
  act(() => root.render(<CalyxEvidencePanel evidence={evidence} />));
  return container;
}

function byTestId(id: string) {
  return container.querySelector(`[data-testid="${id}"]`);
}

describe("CalyxEvidencePanel: a partial block", () => {
  it("shows what was read, says that part was not read, and prints the backend's own sentences for the gaps", () => {
    show(readScientificEvidence(block));
    const panel = byTestId("calyx-evidence-panel");
    expect(panel?.getAttribute("data-evidence-kind")).toBe("available");
    expect(panel?.getAttribute("data-evidence-partial")).toBe("true");
    const note = byTestId("calyx-evidence-partial");
    expect(note?.textContent).toContain("Only part of the evidence was read for this turn.");
    expect(note?.textContent).toContain("not evidence of absence");
    const gaps = Array.from(byTestId("calyx-evidence-read-gaps")?.querySelectorAll("li") ?? []).map((li) => li.textContent);
    expect(gaps).toEqual(block.read_gaps.map((gap) => gap.statement));
    expect(byTestId("calyx-evidence-read-gaps-unreadable")).toBeNull();
    // what was read is still there
    expect(byTestId("calyx-evidence-species")?.textContent).toBe("Vanda coerulea");
    expect(container.textContent).toContain(block.reading[0]);
    expect(container.textContent).toContain("Part of the evidence records was read for this turn.");
    expect(container.textContent).not.toContain("Evidence records were retrieved for this turn.");
  });

  it("never words the pollination flag of a partial block as a finding", () => {
    show(readScientificEvidence(block));
    const line = byTestId("calyx-evidence-pollination");
    expect(line?.getAttribute("data-pollination")).toBe("not-established-partial-read");
    expect(line?.textContent).toContain("nothing is implied either way");
    expect(container.textContent).not.toContain("The records below do not show it.");
  });

  it("shows a reason code only for a gap without a sentence, and says so when the gaps cannot be read", () => {
    show(readScientificEvidence({ ...block, read_gaps: [{ component: "graph:cited", reason: "BUSY" }, { component: "graph:mission", reason: "BUSY" }] }));
    expect(byTestId("calyx-evidence-read-gaps")).toBeNull();
    expect(byTestId("calyx-evidence-read-gap-codes")?.textContent).toBe("Reported cause: BUSY");
    show(readScientificEvidence({ ...block, read_gaps: "graph:cited" }));
    expect(byTestId("calyx-evidence-partial")).not.toBeNull();
    expect(byTestId("calyx-evidence-read-gaps")).toBeNull();
    expect(byTestId("calyx-evidence-read-gaps-unreadable")?.textContent).toBe("Which part was not read could not be displayed.");
  });

  it("prints no internal key of a gap (the component name) as text of its own", () => {
    show(readScientificEvidence({ ...block, read_gaps: [{ component: "graph:secret_component", reason: "TIMEOUT" }] }));
    expect(byTestId("calyx-evidence-partial")?.textContent).not.toContain("graph:secret_component");
  });

  it("adds nothing to an available block", () => {
    show(readScientificEvidence(recorded.turns.available.scientific_evidence));
    expect(byTestId("calyx-evidence-partial")).toBeNull();
    expect(byTestId("calyx-evidence-panel")?.hasAttribute("data-evidence-partial")).toBe(false);
  });

  it("says on a reloaded turn that part was read, without inventing which part was not", () => {
    show(readSavedMessageEvidence({ scientific_evidence_status: "partial" }));
    expect(container.textContent).toContain("Part of the graph evidence was retrieved for this turn");
    expect(byTestId("calyx-evidence-partial")?.textContent).toContain("A saved conversation does not keep which part was not read");
    expect(byTestId("calyx-evidence-read-gaps")).toBeNull();
  });
});
