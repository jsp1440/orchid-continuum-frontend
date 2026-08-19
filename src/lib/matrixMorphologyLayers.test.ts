import { describe, expect, it } from "vitest";

import { computeMorphologyLayers, countAvailableLayers } from "@/lib/matrixMorphologyLayers";
import type { VisionRegionGeometry, VisionSuggestion } from "@/lib/matrixIdentification";

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

function region(overrides: Partial<VisionRegionGeometry> = {}): VisionRegionGeometry {
  return {
    region_id: "region-42",
    analysis_id: "analysis-1",
    concept_id: null,
    label: "Labellum",
    bounding_box: null,
    segmentation_ref: null,
    landmarks: null,
    confidence: 0.8,
    review_state: "MACHINE_GENERATED",
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

  it("marks contours and symmetry axes unavailable regardless of region state, since no such field exists in the region model", () => {
    for (const regionState of [undefined, null, region({ segmentation_ref: "mask:1", landmarks: [{ name: "apex", x: 1, y: 2 }] })]) {
      const layers = computeMorphologyLayers(suggestion(), regionState);
      expect(layers.find((l) => l.id === "contours")?.available).toBe(false);
      expect(layers.find((l) => l.id === "symmetry_axes")?.available).toBe(false);
    }
  });

  it("marks masks and landmarks unavailable while the region has not been checked yet", () => {
    const layers = computeMorphologyLayers(suggestion());
    expect(layers.find((l) => l.id === "masks")?.available).toBe(false);
    expect(layers.find((l) => l.id === "masks")?.reason).toMatch(/not been checked yet/i);
    expect(layers.find((l) => l.id === "landmarks")?.available).toBe(false);
  });

  it("marks masks and landmarks unavailable with a confirmed-absent reason once the region lookup returns null", () => {
    const layers = computeMorphologyLayers(suggestion(), null);
    expect(layers.find((l) => l.id === "masks")?.reason).toMatch(/no geometry has been recorded/i);
    expect(layers.find((l) => l.id === "landmarks")?.reason).toMatch(/no geometry has been recorded/i);
  });

  it("marks masks available with the segmentation reference when the region carries one", () => {
    const layers = computeMorphologyLayers(suggestion(), region({ segmentation_ref: "mask:labellum:v1" }));
    const masks = layers.find((l) => l.id === "masks");
    expect(masks?.available).toBe(true);
    expect(masks?.content?.[0]).toBe("Segmentation reference: mask:labellum:v1");
  });

  it("marks masks unavailable when the region has a bounding box but no segmentation reference", () => {
    const layers = computeMorphologyLayers(
      suggestion(),
      region({ bounding_box: { x: 1, y: 2, width: 3, height: 4 } }),
    );
    const masks = layers.find((l) => l.id === "masks");
    expect(masks?.available).toBe(false);
    expect(masks?.reason).toMatch(/bounding box but no segmentation/i);
  });

  it("marks landmarks available with each point when the region carries landmark coordinates", () => {
    const layers = computeMorphologyLayers(
      suggestion(),
      region({ landmarks: [{ name: "labellum_apex", x: 160, y: 240 }] }),
    );
    const landmarks = layers.find((l) => l.id === "landmarks");
    expect(landmarks?.available).toBe(true);
    expect(landmarks?.content).toEqual(["labellum_apex: (160, 240)"]);
  });

  it("marks labels unavailable when no evidence region, region id, or region geometry is present", () => {
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

  it("adds the region label and bounding box to the labels layer once region geometry is loaded", () => {
    const layers = computeMorphologyLayers(
      suggestion({ evidence_region: "labellum" }),
      region({ label: "Labellum", bounding_box: { x: 1, y: 2, width: 3, height: 4 } }),
    );
    const labels = layers.find((layer) => layer.id === "labels");
    expect(labels?.content).toContain("Region label: Labellum");
    expect(labels?.content).toContain("Bounding box: x=1, y=2, width=3, height=4");
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

  it("counts masks and landmarks once real region geometry is supplied", () => {
    const layers = computeMorphologyLayers(
      suggestion(),
      region({ segmentation_ref: "mask:1", landmarks: [{ name: "apex", x: 1, y: 2 }] }),
    );
    expect(countAvailableLayers(layers)).toBe(3); // labels (region label) + masks + landmarks
  });
});
