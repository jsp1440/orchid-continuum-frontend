/**
 * fieldHypotheses — client for the Calyx field-hypothesis loop (Release-1 journey 6).
 *
 * Backend contract: orchid-calyx-backend `app/field_hypotheses` (PR #1462),
 * contract version `field-hypotheses/v1`. The loop is:
 *
 *   field observation → ≥2 competing, testable hypotheses →
 *   per-hypothesis SUPPORTING / CONTRADICTING / UNKNOWN evidence →
 *   non-destructive field follow-up → human scientific review.
 *
 * Epistemic rules this client enforces on its side of the wire:
 * - a hypothesis is never a fact: every record carries `epistemic_status: "HYPOTHESIS"`
 *   and `knowledge_graph_publication: "blocked_pending_human_scientific_review"`;
 * - protected locality never leaves the browser through this client. The snapshot
 *   contract has no coordinate or place fields, and {@link assertNoSensitiveLocality}
 *   fails closed before any request is sent (the backend rejects it too — 422).
 *
 * No generative model is invoked by these endpoints; the backend library is
 * deterministic and provider-free.
 */

import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";

export const FIELD_HYPOTHESES_CONTRACT_VERSION = "field-hypotheses/v1";
export const MINIMUM_COMPETING_HYPOTHESES = 2;
export const KNOWLEDGE_GRAPH_PUBLICATION_BLOCKED = "blocked_pending_human_scientific_review";

// ── Vocabularies (mirror backend app/field_hypotheses/schemas.py) ────────────

export const OBSERVER_CERTAINTIES = ["CONFIRMED", "PROBABLE", "POSSIBLE", "UNCERTAIN"] as const;
export type ObserverCertainty = (typeof OBSERVER_CERTAINTIES)[number];

export const LOCALITY_SENSITIVITIES = ["PRIVATE", "RESEARCH_RESTRICTED", "PUBLIC"] as const;
export type LocalitySensitivity = (typeof LOCALITY_SENSITIVITIES)[number];

export const VISITOR_GROUPS = [
  "bee", "male_bee", "euglossine_bee", "oil_collecting_bee", "wasp", "male_wasp", "fly", "fungus_gnat",
  "moth", "butterfly", "beetle", "bird", "ant", "other", "unknown",
] as const;
export type VisitorGroup = (typeof VISITOR_GROUPS)[number];

export const VISITOR_BEHAVIORS = [
  "probing_for_nectar", "pseudocopulation_like_contact", "attempted_oviposition", "resting_or_sheltering",
  "pollen_or_fragrance_collection", "brief_landing_no_column_contact", "pollinarium_seen_on_visitor",
  "pollinia_removed", "pollinia_deposited",
] as const;
export type VisitorBehavior = (typeof VISITOR_BEHAVIORS)[number];

export const REWARD_CHECKS = ["nectar_present", "nectar_absent", "not_checked"] as const;
export type RewardCheck = (typeof REWARD_CHECKS)[number];

export const FLORAL_SIGNAL_CUES = [
  "scent_detected", "no_scent_detected", "insect_like_labellum", "resembles_rewarding_flower_nearby",
  "dark_spots_or_fungal_resemblance", "carrion_or_dung_odor", "motile_parts", "warmth_detected",
  "oil_or_resin_secretion",
] as const;
export type FloralSignalCue = (typeof FLORAL_SIGNAL_CUES)[number];

export const REPRODUCTIVE_OUTCOMES = ["fruit_set_observed", "no_fruit_set_observed", "unknown"] as const;
export type ReproductiveOutcomeCue = (typeof REPRODUCTIVE_OUTCOMES)[number];

export const EVIDENCE_STANCES = ["SUPPORTING", "CONTRADICTING", "UNKNOWN"] as const;
export type EvidenceStance = (typeof EVIDENCE_STANCES)[number];

export const POLLINATION_EVIDENCE_TYPES = [
  "directly_observed_visit", "pollen_transfer_observed", "pollinarium_attached_to_pollinator",
  "fruit_set_after_visit", "experimental_exclusion", "scent_chemistry_match", "morphology_match",
  "literature_report", "inferred_syndrome", "ai_suggested_hypothesis", "unknown",
] as const;
export type PollinationEvidenceType = (typeof POLLINATION_EVIDENCE_TYPES)[number];

export const EVIDENCE_SOURCE_KINDS = ["field_observation", "media", "literature", "atlas", "expert_note", "other"] as const;
export type EvidenceSourceKind = (typeof EVIDENCE_SOURCE_KINDS)[number];

export type HypothesisClass =
  | "sexual_deception" | "food_deception" | "brood_site_deception" | "shelter_mimicry" | "reward_based"
  | "autogamy" | "unobserved_pollinator" | "non_pollinating_visit" | "identification_uncertainty" | string;

export type HypothesisStatus = "PROPOSED" | "UNDER_EVALUATION" | "REFINED" | "RETIRED" | string;
export type ReviewState = "machine_assisted" | "human_reviewed" | "expert_reviewed" | "needs_followup" | string;
export type EvidenceState = "no_evidence" | "supporting_only" | "contradicting_only" | "conflicting" | "unknown_only" | string;

// ── Request contracts ────────────────────────────────────────────────────────

export interface InteractionContext {
  visitor_observed?: boolean;
  visitor_group?: VisitorGroup;
  visitor_behaviors?: VisitorBehavior[];
  reward_check?: RewardCheck;
  floral_signal_cues?: FloralSignalCue[];
  reproductive_outcome?: ReproductiveOutcomeCue;
  time_of_day?: string | null;
  weather?: string | null;
}

/** The journey-5 observation as the browser holds it — minus any locality. */
export interface ObservationSnapshot {
  observer_id: string;
  observed_at: string;
  taxon_hint?: string | null;
  observation_text?: string | null;
  epistemic_certainty?: ObserverCertainty;
  locality_sensitivity?: LocalitySensitivity;
  media_content_hashes?: string[];
  interaction?: InteractionContext;
}

export interface EvidenceRecordInput {
  stance: EvidenceStance;
  evidence_type: PollinationEvidenceType;
  summary: string;
  source_kind: EvidenceSourceKind;
  source_reference?: string | null;
  /** Opaque identity — never an email address. */
  recorder_subject: string;
}

// ── Response contracts ───────────────────────────────────────────────────────

export interface EvidenceBalance { supporting: number; contradicting: number; unknown: number }

export interface EvidenceRecord extends EvidenceRecordInput {
  evidence_id: string;
  hypothesis_id: string;
  recorded_at: string;
  created?: boolean;
}

export interface FollowUpObservation {
  step_id: string;
  instruction: string;
  purpose: string;
  non_destructive: true;
  while_on_site: boolean;
  discriminates: HypothesisClass[];
}

export interface HumanReview { actor: string; auth_type: string; rationale: string; reviewed_at: string }

export interface FieldHypothesis {
  hypothesis_id: string;
  set_id: string;
  observation_id: string;
  template_id: string;
  hypothesis_class: HypothesisClass;
  ko_0038_strategy: string;
  epistemic_status: "HYPOTHESIS";
  statement: string;
  predictions: string[];
  would_support: string[];
  would_contradict: string[];
  cue_matches: string[];
  question_family_ids: string[];
  status: HypothesisStatus;
  review_state: ReviewState;
  human_review?: HumanReview | null;
  evidence_balance: EvidenceBalance;
  evidence_state: EvidenceState;
  evidence: EvidenceRecord[];
  knowledge_graph_publication: string;
}

export interface FieldHypothesisSet {
  set_id: string;
  observation_id: string;
  observation_fingerprint: string;
  created: boolean;
  generated_at: string;
  generation: {
    mode: "deterministic_rule_library" | string;
    library_version: string;
    contract_version: string;
    provider_called: false;
    basis: string;
    cue_tokens: string[];
  };
  observation: {
    observer_id: string;
    observed_at: string;
    taxon_hint: string | null;
    epistemic_certainty: ObserverCertainty;
    locality_sensitivity: LocalitySensitivity;
    media_count: number;
  };
  minimum_competing_hypotheses: number;
  hypotheses: FieldHypothesis[];
  follow_up_protocol: FollowUpObservation[];
  protocol_constraints: string[];
  review_state: ReviewState;
  knowledge_graph_publication: string;
}

export interface FieldHypothesisLibrary {
  library_version: string;
  contract_version: string;
  basis: string;
  minimum_competing_hypotheses: number;
  question_families: string[];
  templates: Array<{
    template_id: string;
    hypothesis_class: HypothesisClass;
    ko_0038_strategy: string;
    statement_template: string;
    positive_cues: string[];
    question_family_ids: string[];
    always_included_when: string[];
  }>;
  protocol_constraints: string[];
  knowledge_graph_publication: string;
}

// ── Locality guard (mirrors backend app/calyx_flywheel/locality.py) ──────────

/** Whole-key, case-insensitive matches that carry protected locality. */
export const SENSITIVE_LOCALITY_FIELDS: ReadonlySet<string> = new Set([
  "lat", "latitude", "decimal_latitude", "decimallatitude", "lon", "lng", "longitude", "decimal_longitude",
  "decimallongitude", "coord", "coords", "coordinate", "coordinates", "coordinate_uncertainty",
  "coordinate_uncertainty_in_meters", "locality", "verbatim_locality", "verbatimlocality", "location",
  "location_name", "site", "place", "grid", "gps", "elevation_m", "elevation_meters", "footprint_wkt", "geohash",
  "occurrence_id", "occurrenceid", "catalog_number", "catalogue_number", "collector", "recorded_by", "recordedby",
]);

export class SensitiveLocalityError extends Error {
  constructor(public readonly path: string) {
    super(`SENSITIVE_LOCALITY_FORBIDDEN: ${path}`);
    this.name = "SensitiveLocalityError";
  }
}

/**
 * Fail closed if a payload carries protected locality under a known key,
 * anywhere in its nesting. Only keys are inspected; values are never guessed.
 */
export function assertNoSensitiveLocality(payload: unknown, path = ""): void {
  if (payload === null || payload === undefined) return;
  if (Array.isArray(payload)) {
    payload.forEach((item, index) => assertNoSensitiveLocality(item, `${path}[${index}]`));
    return;
  }
  if (typeof payload === "object") {
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      const where = path ? `${path}.${key}` : key;
      if (SENSITIVE_LOCALITY_FIELDS.has(key.trim().toLowerCase())) throw new SensitiveLocalityError(where);
      assertNoSensitiveLocality(value, where);
    }
  }
}

// ── Transport ────────────────────────────────────────────────────────────────

export type FieldHypothesisApiErrorKind =
  | "authentication_required" | "route_unavailable" | "validation_failed" | "server_error" | "network_error";

export class FieldHypothesisApiError extends Error {
  constructor(public readonly kind: FieldHypothesisApiErrorKind, message: string, public readonly status?: number) {
    super(message);
    this.name = "FieldHypothesisApiError";
  }
}

function detailMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: unknown; loc?: unknown };
    if (typeof first?.msg === "string") {
      const loc = Array.isArray(first.loc) ? first.loc.join(".") : "";
      return loc ? `${first.msg} (${loc})` : first.msg;
    }
  }
  return null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${CALYX_BACKEND_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    });
  } catch (error) {
    throw new FieldHypothesisApiError("network_error", error instanceof Error ? error.message : "Field hypothesis request failed");
  }
  if (!response.ok) {
    const message = detailMessage(await response.json().catch(() => null));
    if (response.status === 401 || response.status === 403) {
      throw new FieldHypothesisApiError("authentication_required", message ?? "Authentication is required.", response.status);
    }
    if (response.status === 404) {
      throw new FieldHypothesisApiError("route_unavailable", message ?? "The field hypothesis API is not deployed.", response.status);
    }
    if (response.status === 400 || response.status === 422) {
      throw new FieldHypothesisApiError("validation_failed", message ?? "The observation snapshot was not valid.", response.status);
    }
    throw new FieldHypothesisApiError("server_error", message ?? `Field hypothesis request failed (${response.status}).`, response.status);
  }
  return response.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** Generate (idempotently) the competing hypothesis set for an observation. */
export async function generateFieldHypotheses(observationId: string, snapshot: ObservationSnapshot): Promise<FieldHypothesisSet> {
  assertNoSensitiveLocality(snapshot);
  return request<FieldHypothesisSet>(`/api/field-observations/${encodeURIComponent(observationId)}/hypotheses`, json(snapshot));
}

/** Latest hypothesis set for an observation; `route_unavailable` when none exists yet. */
export const getLatestFieldHypotheses = (observationId: string) =>
  request<FieldHypothesisSet>(`/api/field-observations/${encodeURIComponent(observationId)}/hypotheses`);

export const getFieldHypothesis = (hypothesisId: string) =>
  request<FieldHypothesis>(`/api/field-hypotheses/${encodeURIComponent(hypothesisId)}`);

/** Record one supporting / contradicting / unknown evidence item. Idempotent on content. */
export async function recordHypothesisEvidence(hypothesisId: string, evidence: EvidenceRecordInput): Promise<FieldHypothesis> {
  assertNoSensitiveLocality(evidence);
  return request<FieldHypothesis>(`/api/field-hypotheses/${encodeURIComponent(hypothesisId)}/evidence`, json(evidence));
}

export const getFieldHypothesisLibrary = () => request<FieldHypothesisLibrary>("/api/field-hypotheses/library");

// ── Presentation helpers ─────────────────────────────────────────────────────

export const HYPOTHESIS_CLASS_LABELS: Record<string, string> = {
  sexual_deception: "Sexual deception",
  food_deception: "Food deception",
  brood_site_deception: "Brood-site deception",
  shelter_mimicry: "Shelter or warmth use",
  reward_based: "Genuine reward",
  autogamy: "Self-pollination",
  unobserved_pollinator: "Pollinator not present in this window",
  non_pollinating_visit: "Visitor is not an effective pollinator",
  identification_uncertainty: "Orchid or visitor misidentified",
};

export function hypothesisClassLabel(hypothesisClass: HypothesisClass): string {
  return HYPOTHESIS_CLASS_LABELS[hypothesisClass] ?? hypothesisClass.replace(/_/g, " ");
}

export const EVIDENCE_STATE_LABELS: Record<string, string> = {
  no_evidence: "No evidence recorded",
  supporting_only: "Only supporting evidence so far",
  contradicting_only: "Only contradicting evidence so far",
  conflicting: "Supporting and contradicting evidence conflict",
  unknown_only: "Evidence recorded, bearing unknown",
};

export function evidenceStateLabel(state: EvidenceState): string {
  return EVIDENCE_STATE_LABELS[state] ?? state.replace(/_/g, " ");
}

/** Human-readable cue token, e.g. `behavior:pseudocopulation_like_contact` → "behavior: pseudocopulation like contact". */
export function cueLabel(token: string): string {
  const [kind, ...rest] = token.split(":");
  return `${kind}: ${rest.join(":").replace(/_/g, " ")}`;
}
