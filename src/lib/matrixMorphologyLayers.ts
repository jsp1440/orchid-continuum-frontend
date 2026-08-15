import type { VisionRegionGeometry, VisionSuggestion } from "@/lib/matrixIdentification";

/**
 * CALYX-MATRIX-UI-002 "deconstruct-the-flower" rendering contract:
 * every layer must render truthfully as unavailable rather than being
 * synthesized in the browser. This module derives layer state from only
 * the fields the Vision-to-Matrix API actually returns — a `VisionSuggestion`
 * plus, once fetched, its linked `VisionRegion` geometry — and never invents
 * geometry, imagery, or schematic content the backend has not supplied.
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

/**
 * `region === undefined` means the region has not been looked up yet.
 * `region === null` means it was looked up and this suggestion genuinely
 * has no recorded region geometry. These are kept distinct so the caller
 * can show "checking…" versus "confirmed not analyzed".
 */
export type RegionLookupState = VisionRegionGeometry | null | undefined;

function noGeometryReason(region: RegionLookupState): string {
  if (region === null) {
    return "This suggestion's region reference was checked against the Vision service and no geometry has been recorded for it yet.";
  }
  return "This suggestion carries a text evidence region only. Pixel-level region geometry has not been checked yet.";
}

function boundingBoxText(box: VisionRegionGeometry["bounding_box"]): string | null {
  if (!box || typeof box !== "object") return null;
  const { x, y, width, height } = box as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
  if ([x, y, width, height].some((value) => typeof value !== "number")) return null;
  return `Bounding box: x=${x}, y=${y}, width=${width}, height=${height}`;
}

function labelsLayer(suggestion: VisionSuggestion, region: RegionLookupState): MorphologyLayerState {
  const content: string[] = [`Character: ${suggestion.character.replaceAll("_", " ")}`];
  if (suggestion.evidence_region) content.push(`Evidence region: ${suggestion.evidence_region}`);
  if (suggestion.region_id) content.push(`Region reference: ${suggestion.region_id}`);
  if (region) {
    content.push(`Region label: ${region.label}`);
    const box = boundingBoxText(region.bounding_box);
    if (box) content.push(box);
  }
  const available = content.length > 1;
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

function masksLayer(region: RegionLookupState): MorphologyLayerState {
  if (region?.segmentation_ref) {
    return {
      id: "masks",
      title: "Organ masks",
      available: true,
      content: [
        `Segmentation reference: ${region.segmentation_ref}`,
        "This is an opaque reference to a governed mask asset, not a renderable image overlay in this view.",
      ],
    };
  }
  if (region) {
    return {
      id: "masks",
      title: "Organ masks",
      available: false,
      reason: "This region has a bounding box but no segmentation mask reference.",
    };
  }
  return { id: "masks", title: "Organ masks", available: false, reason: noGeometryReason(region) };
}

function landmarksLayer(region: RegionLookupState): MorphologyLayerState {
  if (region?.landmarks && region.landmarks.length > 0) {
    return {
      id: "landmarks",
      title: "Landmarks",
      available: true,
      content: region.landmarks.map((point) => `${point.name}: (${point.x}, ${point.y})`),
    };
  }
  if (region) {
    return {
      id: "landmarks",
      title: "Landmarks",
      available: false,
      reason: "This region carries no landmark coordinates.",
    };
  }
  return { id: "landmarks", title: "Landmarks", available: false, reason: noGeometryReason(region) };
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
 * state per the UI-002 contract. Pass `region` once it has been fetched
 * from `fetchVisionSuggestionRegion` — omit it (or pass `undefined`) while
 * the lookup is still pending, and pass `null` once the lookup has
 * completed and confirmed no region exists.
 */
export function computeMorphologyLayers(
  suggestion: VisionSuggestion,
  region?: RegionLookupState,
): MorphologyLayerState[] {
  return [
    {
      id: "original_image",
      title: "Original image",
      available: false,
      reason:
        "The Vision suggestion API returns an internal image identifier, not a resolvable image URL, so the source photograph cannot be displayed from this data.",
    },
    labelsLayer(suggestion, region),
    masksLayer(region),
    {
      id: "contours",
      title: "Contours",
      available: false,
      reason: "No contour data field exists in the current Vision region model.",
    },
    landmarksLayer(region),
    {
      id: "symmetry_axes",
      title: "Symmetry axes",
      available: false,
      reason: "No symmetry-axis data field exists in the current Vision region model.",
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
