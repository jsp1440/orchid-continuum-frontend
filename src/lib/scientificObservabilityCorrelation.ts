import type { BrainMission } from "@/lib/calyxWorkspace";

/**
 * Resolve the only identifier that may be used to request a scientific-
 * observability trace from a mission payload.
 *
 * Scientific observability traces are keyed by `correlation_id`; a mission id
 * is a different identifier and must never be substituted merely because it is
 * available. Older mission payloads may not expose a trace correlation yet, so
 * consumers must fail closed and render an unavailable/not-supplied state.
 */
export function getScientificObservabilityCorrelationId(
  mission: BrainMission | Record<string, unknown>,
): string | null {
  const record = mission as Record<string, unknown>;
  const direct = record.observability_correlation_id;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const observability = record.scientific_observability;
  if (observability && typeof observability === "object") {
    const nested = (observability as Record<string, unknown>).correlation_id;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }

  return null;
}
