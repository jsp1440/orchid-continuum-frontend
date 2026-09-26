/**
 * Reads the Matrix ranking evidence the backend already emits so the guided
 * identification page can say WHY a candidate ranks where it does.
 *
 * `rank_candidates` (orchid-calyx-backend runtime/matrix_identification.py)
 * returns, per candidate, the per-character observation, the registry's
 * recorded state, certainty, effective weight, similarity and contribution,
 * plus compared/possible weight and the candidate's registry provenance. The
 * page previously rendered only the character name and status, so a user saw
 * a percentage with no basis. Nothing here re-ranks or re-scores: every
 * number shown is one the Matrix produced.
 */

import type {
  CalyxExplanation,
  CandidateExplanation,
  CandidateResult,
  ExplanationCandidateEvidence,
} from "@/lib/matrixIdentification";

export type CandidateRankState = "compared" | "not_compared";

export type GroupedCharacterEvidence = {
  supporting: CandidateExplanation[];
  partial: CandidateExplanation[];
  conflicting: CandidateExplanation[];
  /** The registry records no state for this candidate: unknown, never absence. */
  missing: CandidateExplanation[];
  /** The observer marked the observation unknown, so the Matrix ignored it. */
  ignoredUnknown: CandidateExplanation[];
};

export type ScoreBasis = {
  contributionTotal: number;
  comparedWeight: number;
  possibleWeight: number;
};

export type ExplanationProvenance = {
  provider: string | null;
  model: string | null;
  epistemicState: string | null;
  fallbackError: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  matched: "matches",
  partial: "partly matches",
  conflict: "conflicts",
  candidate_state_missing: "not recorded for this candidate",
  ignored_unknown_observation: "ignored (observation marked unknown)",
};

/** Keys that would disclose a locality; never rendered from provenance. */
const LOCALITY_TOKENS = new Set([
  "lat", "latitude", "lon", "lng", "longitude", "latlng", "latlon", "coordinate", "coordinates",
  "coord", "coords", "locality", "location", "site", "gps", "elevation", "altitude", "geom", "geometry",
  "point", "wkt", "verbatim", "georeference", "georeferenced",
]);

/** Split snake_case, kebab-case, dotted and camelCase keys into lowercase tokens. */
function keyTokens(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
}

function isLocalityKey(key: string): boolean {
  return keyTokens(key).some((token) => LOCALITY_TOKENS.has(token));
}

/** True when a value carries a locality-shaped key at any depth. */
function containsLocality(value: unknown, depth = 0): boolean {
  if (depth > 8) return true; // too deep to inspect safely: withhold
  if (Array.isArray(value)) return value.some((item) => containsLocality(item, depth + 1));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) => isLocalityKey(key) || containsLocality(nested, depth + 1),
  );
}

export function characterStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

/** Render a Matrix value without inventing one: absent stays "not recorded". */
export function formatMatrixValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "not recorded";
  if (Array.isArray(value)) return value.length ? value.map((item) => formatMatrixValue(item)).join(", ") : "not recorded";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.min === "number" && typeof record.max === "number") {
      return `${record.min}–${record.max}`;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * A candidate with no compared weight was not compared at all (no usable
 * observation, or every observed character is unrecorded for it). Its score
 * of 0 is an absence of evidence and must not be shown as "0% match".
 */
export function candidateRankState(candidate: CandidateResult): CandidateRankState {
  if (typeof candidate.compared_weight === "number") {
    return candidate.compared_weight > 0 ? "compared" : "not_compared";
  }
  return candidate.explanations.some((item) => typeof item.similarity === "number")
    ? "compared"
    : "not_compared";
}

export function groupCharacterEvidence(candidate: CandidateResult): GroupedCharacterEvidence {
  const groups: GroupedCharacterEvidence = {
    supporting: [],
    partial: [],
    conflicting: [],
    missing: [],
    ignoredUnknown: [],
  };
  for (const item of candidate.explanations) {
    if (item.status === "matched") groups.supporting.push(item);
    else if (item.status === "partial") groups.partial.push(item);
    else if (item.status === "conflict") groups.conflicting.push(item);
    else if (item.status === "candidate_state_missing") groups.missing.push(item);
    else if (item.status === "ignored_unknown_observation") groups.ignoredUnknown.push(item);
  }
  return groups;
}

/** score = contributionTotal / comparedWeight; coverage = comparedWeight / possibleWeight. */
export function scoreBasis(candidate: CandidateResult): ScoreBasis {
  const contributionTotal = candidate.explanations.reduce(
    (sum, item) => sum + (typeof item.contribution === "number" ? item.contribution : 0),
    0,
  );
  return {
    contributionTotal: Math.round(contributionTotal * 1e6) / 1e6,
    comparedWeight: candidate.compared_weight ?? 0,
    possibleWeight: candidate.possible_weight ?? 0,
  };
}

/** Provenance entries safe to display; locality-shaped keys are dropped. */
export function provenanceEntries(provenance: Record<string, unknown> | null | undefined): Array<[string, string]> {
  if (!provenance || typeof provenance !== "object") return [];
  return Object.entries(provenance)
    .filter(([key, value]) => !isLocalityKey(key) && !containsLocality(value))
    .map(([key, value]) => [key.replaceAll("_", " "), formatMatrixValue(value)]);
}

export function explanationProvenance(payload: CalyxExplanation | null): ExplanationProvenance | null {
  if (!payload || typeof payload.narrative !== "object" || !payload.narrative) return null;
  const { provider, model, epistemic_state: epistemicState, fallback_error: fallbackError } = payload.narrative;
  return {
    provider: provider ?? null,
    model: model ?? null,
    epistemicState: epistemicState ?? null,
    fallbackError: fallbackError ?? null,
  };
}

/** The explanation packet's structured per-candidate character lists, in Matrix order. */
export function explanationCandidates(payload: CalyxExplanation | null): ExplanationCandidateEvidence[] {
  const candidates = payload?.evidence?.candidates;
  return Array.isArray(candidates) ? candidates : [];
}
