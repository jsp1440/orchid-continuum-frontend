import { describe, expect, it } from "vitest";

import { coerceObservationValue, explanationText } from "./matrixIdentification";

describe("guided Matrix observation handling", () => {
  it("preserves numeric measurements as numbers for numeric characters", () => {
    expect(coerceObservationValue("300", "numeric_range")).toBe(300);
    expect(coerceObservationValue("12.5", "numeric")).toBe(12.5);
  });

  it("does not invent numeric values from invalid measurements", () => {
    expect(coerceObservationValue("about 30", "numeric_range")).toBe("about 30");
  });

  it("supports comma-delimited multi-state observations without affecting single values", () => {
    expect(coerceObservationValue("white, greenish-white", "multi_state")).toEqual([
      "white",
      "greenish-white",
    ]);
    expect(coerceObservationValue("star-shaped", "categorical")).toBe("star-shaped");
  });
});

describe("Calyx explanation rendering", () => {
  it("reads the governed structured narrative text without interpreting invariants as prose", () => {
    expect(explanationText({
      narrative: {
        text: "Observe the spur next.",
        epistemic_state: "explanation_not_evidence",
      },
      invariants: { provider_output_mutates_matrix_state: false },
    })).toBe("Observe the spur next.");
    expect(explanationText({ narrative: "Candidate A is better supported." })).toBe(
      "Candidate A is better supported.",
    );
    expect(explanationText({ invariants: { provider_output_mutates_matrix_state: false } })).toBe("");
  });
});
