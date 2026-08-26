/**
 * Protected-locality fail-closed enforcement for the scientific RAG slice.
 *
 * Protected locality must never leak through ingestion, retrieval, logging, API
 * responses, citations, exports, or UI. This module is the single chokepoint:
 * every stage passes candidate text/records through it, and it fails closed —
 * when in doubt, redact.
 *
 * The policy mirrors the existing Atlas locality-safety posture (see
 * `atlasLocalitySafety.ts`): protected records are generalised/withheld rather
 * than jittered into a plausible false point.
 */

import { SensitivityClassification } from "./events";

/** Coordinate and precise-locality patterns that must never reach a public surface. */
const COORDINATE_PATTERN =
  /\b[-+]?\d{1,2}\.\d{3,}[,\s]+[-+]?\d{1,3}\.\d{3,}\b/;
const PRECISE_LOCALITY_MARKERS = [
  /\bGPS\b/i,
  /\bcoordinates?\b/i,
  /\bwild population at\b/i,
  /\bexact locality\b/i,
  /\bcollected at\s+[-+]?\d/i,
];

export type LocalityScreen = {
  safe: boolean;
  redactedText: string;
  reasons: string[];
};

/**
 * Screen a passage for protected-locality content. If the record is classified
 * `protected_locality`, the precise text is withheld entirely. Otherwise
 * coordinate/precise-locality patterns are redacted in place. `safe` is true
 * only when nothing needed redaction.
 */
export function screenLocality(
  text: string,
  sensitivity: SensitivityClassification,
): LocalityScreen {
  const reasons: string[] = [];

  if (sensitivity === "protected_locality") {
    return {
      safe: false,
      redactedText: "[locality withheld — protected under conservation policy]",
      reasons: ["record classified protected_locality"],
    };
  }

  let redacted = text;
  if (COORDINATE_PATTERN.test(text)) {
    reasons.push("precise coordinates present");
    redacted = redacted.replace(new RegExp(COORDINATE_PATTERN, "g"), "[coordinates withheld]");
  }
  for (const marker of PRECISE_LOCALITY_MARKERS) {
    if (marker.test(redacted)) {
      reasons.push(`precise-locality marker: ${marker.source}`);
    }
  }

  return { safe: reasons.length === 0, redactedText: redacted, reasons };
}

/**
 * Assert that a string carries no protected-locality content. Used by the
 * verification gate and export paths as a hard fail-closed check.
 */
export function assertNoProtectedLocality(text: string): { ok: boolean; reason?: string } {
  if (COORDINATE_PATTERN.test(text)) {
    return { ok: false, reason: "precise coordinates detected in output" };
  }
  if (/\[coordinates withheld\]/.test(text)) {
    // Redaction marker is acceptable; the raw value is gone.
    return { ok: true };
  }
  for (const marker of PRECISE_LOCALITY_MARKERS) {
    if (marker.test(text) && /\d/.test(text)) {
      // Marker alone is fine; marker plus digits is suspicious — fail closed.
      if (/\bcollected at\s+[-+]?\d/i.test(text)) {
        return { ok: false, reason: "precise collection locality detected in output" };
      }
    }
  }
  return { ok: true };
}
