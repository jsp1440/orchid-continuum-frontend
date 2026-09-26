// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import realBackend from "@/lib/__fixtures__/matrixIdentification.realBackend.json";
import type { SessionEvaluation } from "@/lib/matrixIdentification";

import MatrixCandidateEvidence from "./MatrixCandidateEvidence";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function render(evaluation: SessionEvaluation, index: number) {
  act(() => {
    root.render(<MatrixCandidateEvidence candidate={evaluation.report.candidates[index]} rank={index + 1} />);
  });
  return container;
}

const empty = realBackend.evaluate_empty as unknown as SessionEvaluation;
const observed = realBackend.evaluate_observed as unknown as SessionEvaluation;

describe("MatrixCandidateEvidence against captured backend payloads", () => {
  it("renders an uncompared candidate as not yet compared, never 0%", () => {
    const view = render(empty, 0);
    expect(view.querySelector('[data-testid="matrix-candidate-score"]')?.textContent).toBe("Not yet compared");
    expect(view.textContent).not.toContain("0%");
    expect(view.textContent).toContain("missing evidence, not a mismatch");
  });

  it("shows the basis, observed vs recorded states, and provenance for a compared candidate", () => {
    const view = render(observed, 1);
    expect(view.querySelector('[data-testid="matrix-candidate-score"]')?.textContent).toBe("15%");
    expect(view.querySelector('[data-testid="matrix-candidate-coverage"]')?.textContent).toBe("89%");
    expect(view.querySelector('[data-testid="matrix-candidate-basis"]')?.textContent).toContain(
      "weighted agreement 0.5 of 3.25 compared weight; 3.25 of 3.65 observed weight",
    );
    const spur = view.querySelector('[data-testid="matrix-character-spur_length_mm"]')?.textContent ?? "";
    expect(spur).toContain("conflicts");
    expect(spur).toContain("300 · probable");
    expect(spur).toContain("80–150");
    const shape = view.querySelector('[data-testid="matrix-character-flower_shape"]')?.textContent ?? "";
    expect(shape).toContain("not recorded for this candidate");
    expect(view.textContent).toContain("Ignored — you marked these unknown");
    expect(view.querySelector('[data-testid="matrix-candidate-provenance"]')?.textContent).toContain("source: governed fixture");
    expect(view.textContent).toContain("ranked hypothesis");
  });
});
