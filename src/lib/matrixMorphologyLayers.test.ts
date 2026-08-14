import { describe, expect, it } from "vitest";

import { computeMorphologyLayers, countAvailableLayers } from "@/lib/matrixMorphologyLayers";
import type { VisionSuggestion } from "@/lib/matrixIdentification";

function suggestion(overrides: Partial<VisionSuggestion> = {}): VisionSuggestion {
  return {
    suggestion_id: "sugg-1",
    session_id: "session-1",
    analysis_id: "analysis-1",
    vision_observation_id: "obs-1",
    image_id: "image-1",
    region_id: null,
    concept_id: null,
    character: "labellum_shape",
    registry_character_found: true,
    proposed_value: "trilobed",
    character_state_id: null,
    numeric_value: null,
    relative_value: null,
    unit: null,
    measurement_basis: null,
    machine_confidence: 0.62,
    method: null,
    evidence_region: null,
    vision_review_state: null,
    limitations: [],
    state: "pending_review",
    review: null,
    matrix_observation_id: null,
    accepted_value: undefined,
    ...overrides,
  };
}

describe("computeMorphologyLayers", () => {
  it("always includes all nine deconstruct-the-flower layers", () => {
    const layers = computeMorphologyLayers(suggestion());
    expect(layers.map((layer) => layer.id)).toEqual([
      "original_image",
      "labels",
      "masks",
      "contours",
      "landmarks",
      "symmetry_axes",
      "measurements",
      "schematic",
      "candidate_comparison",
    ]);
  });

  it("never claims the original image is available, since the API only returns an opaque image id", () => {
    const layers = computeMorphologyLayers(suggestion());
    const originalImage = layers.find((layer) => layer.id === "original_image");
    expect(originalImage?.available).toBe(false);
    expect(originalImage?.reason).toMatch(/resolvable image URL/i);
  });

  it("marks geometry layers (masks, contours, landmarks, symmetry axes) unavailable with a specific reason", () => {
    const layers = computeMorphologyLayers(suggestion());
    for (const id of ["masks", "contours", "landmarks", "symmetry_axes"] as const) {
      const layer = layers.find((l) => l.id === id);
      expect(layer?.available).toBe(false);
      expect(layer?.reason).toMatch(/pixel-level region geometry/i);
    }
  });

  it("marks labels unavailable when no evidence region or region id is present", () => {
    const layers = computeMorphologyLayers(suggestion({ evidence_region: null, region_id: null }));
    const labels = layers.find((layer) => layer.id === "labels");
    expect(labels?.available).toBe(false);
  });

  it("marks labels available and lists the evidence region and region id when present", () => {
    const layers = computeMorphologyLayers(
      suggestion({ evidence_region: "labellum, distal margin", region_id: "region-42" }),
    );
    const labels = layers.find((layer) => layer.id === "labels");
    expect(labels?.available).toBe(true);
    expect(labels?.content).toEqual([
      "Character: labellum shape",
      "Evidence region: labellum, distal margin",
      "Region reference: region-42",
    ]);
  });

  it("marks measurements unavailable when no numeric or relative value is present", () => {
    const layers = computeMorphologyLayers(suggestion());
    const measurements = layers.find((layer) => layer.id === "measurements");
    expect(measurements?.available).toBe(false);
  });

  it("marks measurements available and reports value, unit, and basis when present", () => {
    const layers = computeMorphologyLayers(
      suggestion({ numeric_value: 4.2, unit: "cm", measurement_basis: "calibrated_scale" }),
    );
    const measurements = layers.find((layer) => layer.id === "measurements");
    expect(measurements?.available).toBe(true);
    expect(measurements?.content).toContain("Value: 4.2 cm");
    expect(measurements?.content).toContain("Basis: calibrated scale");
  });

  it("never marks schematic or candidate comparison as available, since no governed source exists yet", () => {
    const layers = computeMorphologyLayers(suggestion());
    expect(layers.find((layer) => layer.id === "schematic")?.available).toBe(false);
    expect(layers.find((layer) => layer.id === "candidate_comparison")?.available).toBe(false);
  });
});

describe("countAvailableLayers", () => {
  it("counts only layers marked available", () => {
    const layers = computeMorphologyLayers(
      suggestion({ evidence_region: "column", numeric_value: 1.1 }),
    );
    expect(countAvailableLayers(layers)).toBe(2);
  });

  it("returns zero when a suggestion carries no evidence region, region id, or measurement", () => {
    const layers = computeMorphologyLayers(suggestion());
    expect(countAvailableLayers(layers)).toBe(0);
  });
});
