// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchVisionSuggestionRegion: vi.fn(),
}));

vi.mock("@/lib/matrixIdentification", async () => {
  const actual = await vi.importActual<typeof import("@/lib/matrixIdentification")>(
    "@/lib/matrixIdentification",
  );
  return {
    ...actual,
    fetchVisionSuggestionRegion: mocks.fetchVisionSuggestionRegion,
  };
});

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
  mocks.fetchVisionSuggestionRegion.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("MatrixMorphologyViewer", () => {
  it("renders a tab per deconstruct-the-flower layer and shows a checking state before the region resolves", async () => {
    mocks.fetchVisionSuggestionRegion.mockReturnValue(new Promise(() => {})); // never resolves
    act(() => {
      root.render(<MatrixMorphologyViewer sessionId="session-1" suggestion={suggestion} />);
    });
    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(9);
    expect(container.textContent).toContain("2 of 9 layers analyzed");
    expect(container.textContent).toContain("checking for region geometry");
  });

  it("fetches the region for the current session and suggestion", async () => {
    mocks.fetchVisionSuggestionRegion.mockResolvedValue({
      session_id: "session-1",
      suggestion_id: "sugg-1",
      region: null,
    });
    act(() => {
      root.render(<MatrixMorphologyViewer sessionId="session-1" suggestion={suggestion} />);
    });
    await flush();
    expect(mocks.fetchVisionSuggestionRegion).toHaveBeenCalledWith("session-1", "sugg-1");
  });

  it("renders real geometry once the region resolves with masks and landmarks", async () => {
    mocks.fetchVisionSuggestionRegion.mockResolvedValue({
      session_id: "session-1",
      suggestion_id: "sugg-1",
      region: {
        region_id: "region-42",
        analysis_id: "analysis-1",
        concept_id: null,
        label: "Labellum",
        bounding_box: { x: 120, y: 200, width: 80, height: 60 },
        segmentation_ref: "mask:labellum:v1",
        landmarks: [{ name: "labellum_apex", x: 160, y: 240 }],
        confidence: 0.83,
        review_state: "MACHINE_GENERATED",
      },
    });
    act(() => {
      root.render(<MatrixMorphologyViewer sessionId="session-1" suggestion={suggestion} />);
    });
    await flush();

    expect(container.textContent).not.toContain("checking for region geometry");
    expect(container.textContent).toContain("4 of 9 layers analyzed");

    const masksTab = Array.from(container.querySelectorAll('[role="tab"]')).find((el) =>
      el.textContent?.includes("Organ masks"),
    ) as HTMLButtonElement;
    act(() => {
      masksTab.click();
    });
    expect(container.textContent).toContain("Segmentation reference: mask:labellum:v1");
  });

  it("shows an explicit error banner without claiming geometry is confirmed absent when the region fetch fails", async () => {
    mocks.fetchVisionSuggestionRegion.mockRejectedValue(new Error("service unavailable"));
    act(() => {
      root.render(<MatrixMorphologyViewer sessionId="session-1" suggestion={suggestion} />);
    });
    await flush();

    expect(container.textContent).toContain("Could not check this suggestion for region geometry");
    expect(container.textContent).toContain("service unavailable");
    // Still in the "not checked yet" wording, not the confirmed-absent wording.
    const masksTab = Array.from(container.querySelectorAll('[role="tab"]')).find((el) =>
      el.textContent?.includes("Organ masks"),
    ) as HTMLButtonElement;
    act(() => {
      masksTab.click();
    });
    expect(container.textContent).toContain("not been checked yet");
  });
});
