// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import MatrixMorphologyViewer from "@/components/matrix/MatrixMorphologyViewer";
import type { VisionSuggestion } from "@/lib/matrixIdentification";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const suggestion: VisionSuggestion = {
  suggestion_id: "sugg-1",
  session_id: "session-1",
  analysis_id: "analysis-1",
  vision_observation_id: "obs-1",
  image_id: "image-1",
  region_id: "region-42",
  concept_id: null,
  character: "labellum_shape",
  registry_character_found: true,
  proposed_value: "trilobed",
  character_state_id: null,
  numeric_value: 4.2,
  relative_value: null,
  unit: "cm",
  measurement_basis: "calibrated_scale",
  machine_confidence: 0.62,
  method: null,
  evidence_region: "labellum, distal margin",
  vision_review_state: null,
  limitations: [],
  state: "pending_review",
  review: null,
  matrix_observation_id: null,
  accepted_value: undefined,
};

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

describe("MatrixMorphologyViewer", () => {
  it("renders a tab per deconstruct-the-flower layer and an availability count", () => {
    act(() => {
      root.render(<MatrixMorphologyViewer suggestion={suggestion} />);
    });
    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(9);
    expect(container.textContent).toContain("2 of 9 layers analyzed");
  });

  it("defaults to the first layer panel and shows its unavailable reason", () => {
    act(() => {
      root.render(<MatrixMorphologyViewer suggestion={suggestion} />);
    });
    expect(container.textContent).toContain("Not analyzed for this suggestion.");
    expect(container.textContent).toContain("resolvable image URL");
  });

  it("switches panel content when a different layer tab is activated", () => {
    act(() => {
      root.render(<MatrixMorphologyViewer suggestion={suggestion} />);
    });
    const measurementsTab = Array.from(container.querySelectorAll('[role="tab"]')).find((el) =>
      el.textContent?.includes("Measurements"),
    ) as HTMLButtonElement;
    expect(measurementsTab).toBeTruthy();

    act(() => {
      measurementsTab.click();
    });

    expect(measurementsTab.getAttribute("aria-selected")).toBe("true");
    expect(container.textContent).toContain("Value: 4.2 cm");
  });
});
