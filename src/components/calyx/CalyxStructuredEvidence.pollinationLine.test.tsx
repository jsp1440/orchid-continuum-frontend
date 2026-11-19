// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import CalyxEvidencePanel from "@/components/calyx/CalyxEvidencePanel";
import { evidenceOf } from "@/lib/__fixtures__/calyxScientificEvidence";
import { readScientificEvidence } from "@/lib/calyxScientificEvidence";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const pollinationLine = () => container.querySelector('[data-testid="calyx-evidence-pollination"]');
function show(raw: unknown) {
  act(() => root.render(<CalyxEvidencePanel evidence={readScientificEvidence(raw)} />));
}

describe("pollination line follows the topics the backend says it read", () => {
  it.each(["distribution-species", "conservation-note", "synonymy-list-truncated", "mycorrhiza-species"])(
    "%s carries pollination_verified:false but is not a pollination turn, so no pollination line",
    (name) => {
      expect((evidenceOf(name) as { pollination_verified: boolean }).pollination_verified).toBe(false);
      show(evidenceOf(name));
      expect(pollinationLine()).toBeNull();
    },
  );

  it("pollination turns keep the line, as #978 prints it", () => {
    show(evidenceOf("pollination-species"));
    expect(pollinationLine()?.getAttribute("data-pollination")).toBe("not-established");
  });
});
