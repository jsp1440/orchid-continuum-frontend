import { useState } from "react";
import { CheckCircle2, Layers, XCircle } from "lucide-react";

import { computeMorphologyLayers, countAvailableLayers } from "@/lib/matrixMorphologyLayers";
import type { VisionSuggestion } from "@/lib/matrixIdentification";

type Props = {
  suggestion: VisionSuggestion;
};

/**
 * CALYX-MATRIX-UI-002 "deconstruct-the-flower" viewer. Renders every
 * required layer (original image, labels, masks, contours, landmarks,
 * symmetry axes, measurements, schematic, candidate comparison) and shows
 * each one truthfully as available or not analyzed for this suggestion.
 * This component never fabricates overlay geometry that the API has not
 * supplied.
 */
export default function MatrixMorphologyViewer({ suggestion }: Props) {
  const layers = computeMorphologyLayers(suggestion);
  const [activeLayerId, setActiveLayerId] = useState(layers[0]?.id);
  const activeLayer = layers.find((layer) => layer.id === activeLayerId) ?? layers[0];
  const availableCount = countAvailableLayers(layers);

  return (
    <div className="rounded-2xl border bg-background p-4" data-testid="matrix-morphology-viewer">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Layers className="h-4 w-4" /> Deconstruct this structure · {availableCount} of {layers.length} layers analyzed
      </div>

      <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Morphology layers">
        {layers.map((layer) => (
          <button
            key={layer.id}
            type="button"
            role="tab"
            aria-selected={activeLayer?.id === layer.id}
            onClick={() => setActiveLayerId(layer.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
              activeLayer?.id === layer.id ? "border-emerald-700 bg-emerald-50/60" : "border-border"
            }`}
          >
            {layer.available ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            )}
            {layer.title}
          </button>
        ))}
      </div>

      {activeLayer && (
        <div className="mt-4 rounded-xl border p-4" role="tabpanel">
          {activeLayer.available ? (
            <ul className="space-y-1 text-sm">
              {(activeLayer.content ?? []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Not analyzed for this suggestion. </span>
              {activeLayer.reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
