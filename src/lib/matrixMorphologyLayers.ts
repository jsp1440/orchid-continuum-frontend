import type { VisionSuggestion } from "@/lib/matrixIdentification";

/**
 * CALYX-MATRIX-UI-002 "deconstruct-the-flower" rendering contract:
 * every layer must render truthfully as unavailable rather than being
 * synthesized in the browser. This module derives layer state from only
 * the fields the Vision-to-Matrix API actually returns today
 * (`VisionSuggestion`) — it never invents geometry, imagery, or schematic
 * content that the backend has not supplied.
 */

export type MorphologyLayerId =
  | "original_image"
  | "labels"
  | "masks"
  | "contours"
  | "landmarks"
  | "symmetry_axes"
  | "measurements"
  | "schematic"
  | "candidate_comparison";

export type MorphologyLayerState = {
  id: MorphologyLayerId;
  title: string;
  available: boolean;
  /** Populated when available is true. */
  content?: string[];
  /** Populated when available is false: the concrete reason, not a generic placeholder. */
  reason?: string;
};

const NO_GEOMETRY_REASON =
  "This suggestion carries a text evidence region only. The Vision API does not yet return pixel-level region geometry (bounding box, mask, or landmark coordinates) for Matrix review.";

function labelsLayer(suggestion: VisionSuggestion): MorphologyLayerState {
  const content: string[] = [`Character: ${suggestion.character.replaceAll("_", " ")}`];
  if (suggestion.evidence_region) content.push(`Evidence region: ${suggestion.evidence_region}`);
  if (suggestion.region_id) content.push(`Region reference: ${suggestion.region_id}`);
  const available = content.length > 1 || Boolean(suggestion.evidence_region || suggestion.region_id);
  if (!available) {
    return {
      id: "labels",
      title: "Labels",
      available: false,
      reason: "This suggestion does not report an evidence region or region reference to label.",
    };
  }
  return { id: "labels", title: "Labels", available: true, content };
}

function measurementsLayer(suggestion: VisionSuggestion): MorphologyLayerState {
  const content: string[] = [];
  if (suggestion.numeric_value != null) {
    content.push(`Value: ${suggestion.numeric_value}${suggestion.unit ? ` ${suggestion.unit}` : ""}`);
  }
  if (suggestion.relative_value != null) content.push(`Relative value: ${suggestion.relative_value}`);
  if (suggestion.measurement_basis) content.push(`Basis: ${suggestion.measurement_basis.replaceAll("_", " ")}`);
  if (content.length === 0) {
    return {
      id: "measurements",
      title: "Measurements",
      available: false,
      reason: "This suggestion did not include a numeric or relative measurement.",
    };
  }
  return { id: "measurements", title: "Measurements", available: true, content };
}

function candidateComparisonLayer(): MorphologyLayerState {
  return {
    id: "candidate_comparison",
    title: "Candidate comparison",
    available: false,
    reason:
      "Per-structure candidate comparison overlays are not available here. Ranked candidate comparison is shown in the Matrix results panel, driven by scored evidence rather than this suggestion alone.",
  };
}

/**
 * Derive the full set of deconstruct-the-flower layers for one Vision
 * suggestion. Layers with no supporting data are returned with
 * `available: false` and a specific reason rather than being omitted or
 * silently synthesized, so the caller can render an honest "not analyzed"
 * state per the UI-002 contract.
 */
export function computeMorphologyLayers(suggestion: VisionSuggestion): MorphologyLayerState[] {
  return [
    {
      id: "original_image",
      title: "Original image",
      available: false,
      reason:
        "The Vision suggestion API returns an internal image identifier, not a resolvable image URL, so the source photograph cannot be displayed from this data.",
    },
    labelsLayer(suggestion),
    {
      id: "masks",
      title: "Organ masks",
      available: false,
      reason: NO_GEOMETRY_REASON,
    },
    {
      id: "contours",
      title: "Contours",
      available: false,
      reason: NO_GEOMETRY_REASON,
    },
    {
      id: "landmarks",
      title: "Landmarks",
      available: false,
      reason: NO_GEOMETRY_REASON,
    },
    {
      id: "symmetry_axes",
      title: "Symmetry axes",
      available: false,
      reason: NO_GEOMETRY_REASON,
    },
    measurementsLayer(suggestion),
    {
      id: "schematic",
      title: "Schematic / blueprint",
      available: false,
      reason: "No governed schematic representation has been generated for this suggestion.",
    },
    candidateComparisonLayer(),
  ];
}

export function countAvailableLayers(layers: MorphologyLayerState[]): number {
  return layers.filter((layer) => layer.available).length;
}
