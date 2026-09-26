import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";

export type Certainty = "certain" | "probable" | "uncertain" | "unknown";
export type ExplanationAudience = "beginner" | "intermediate" | "expert";
export type VisionReviewDecision = "accept" | "revise" | "reject";

export type RegistrySummary = {
  registry_id: string;
  version: string;
  title?: string;
  scope?: Record<string, unknown>;
  candidate_count?: number;
  character_count?: number;
  checksum_sha256?: string;
  publication_state?: string;
};

/** Per-character statuses `rank_candidates` emits (runtime/matrix_identification.py). */
export type CharacterEvidenceStatus =
  | "matched"
  | "partial"
  | "conflict"
  | "candidate_state_missing"
  | "ignored_unknown_observation";

export type CandidateExplanation = {
  character: string;
  observation: unknown;
  candidate_state: unknown;
  certainty: Certainty;
  /** Registry weight x certainty factor; 0 for an unknown observation. */
  effective_weight?: number;
  similarity: number | null;
  /** effective_weight x similarity: this character's share of the score numerator. */
  contribution?: number;
  status: CharacterEvidenceStatus | string;
};

export type CandidateResult = {
  taxon_id: string;
  scientific_name: string;
  /** Sum of contributions / compared_weight. Ranking evidence, not a probability. */
  score: number;
  /** compared_weight / possible_weight. */
  coverage: number;
  compared_weight?: number;
  possible_weight?: number;
  explanations: CandidateExplanation[];
  provenance?: Record<string, unknown> | null;
};

export type NextObservation = {
  character: string;
  label: string;
  description?: string | null;
  value_type?: string;
  candidate_coverage?: number;
  distinct_state_count?: number;
  candidate_count?: number;
  reason_code?: string;
  selection_score?: number;
  matrix_weight?: number;
  concept_id?: string | null;
  explanation_boundary?: string;
};

export type SessionRecord = {
  session_id: string;
  revision: number;
  registry: RegistrySummary;
  observations: Array<{
    observation_id: string;
    character: string;
    value: unknown;
    certainty: Certainty;
    source?: Record<string, unknown>;
    review_state?: string;
  }>;
  next_observation?: NextObservation | null;
};

export type EvaluationReport = {
  candidates: CandidateResult[];
  observation_count: number;
  compared_character_count: number;
  disclaimer: string;
  registry?: RegistrySummary;
  session_id?: string;
  revision?: number;
};

export type SessionEvaluation = {
  session: SessionRecord;
  report: EvaluationReport;
  next_observation: NextObservation | null;
};

/** One candidate as `build_explanation_evidence` summarizes it for Calyx. */
export type ExplanationCandidateEvidence = {
  taxon_id: string;
  scientific_name: string;
  score: number;
  coverage: number;
  supporting_characters?: string[];
  partial_characters?: string[];
  conflicting_characters?: string[];
  missing_characters?: string[];
  provenance?: Record<string, unknown> | null;
};

export type CalyxExplanation = {
  schema_version?: string;
  session_id?: string;
  evidence?: {
    candidates?: ExplanationCandidateEvidence[];
    candidate_order?: string[];
    authority?: Record<string, boolean>;
    evidence_digest_sha256?: string;
    [key: string]: unknown;
  };
  narrative?: {
    text?: string;
    provider?: string;
    model?: string;
    epistemic_state?: string;
    fallback_error?: string | null;
  } | string;
  invariants?: Record<string, unknown>;
  answer?: string;
  explanation?: string;
};

export type VisionAnalysisSummary = {
  analysis_id: string;
  image_id: string;
  reference_set_id?: string | null;
  vision_model: string;
  vision_model_version: string;
  analysis_version: number;
  taxon_context?: string | null;
  taxon_confidence?: number | null;
  calibration_state: string;
  image_quality: string;
  analysis_status: string;
  review_state: string;
  warnings: string[];
  limitations: string[];
};

export type VisionAnalysisDiscovery = {
  session_id: string;
  image_id: string;
  analyses: VisionAnalysisSummary[];
  analysis_count: number;
  provider_inference_requested: false;
  matrix_state_mutated: false;
  rule?: string;
};

export type VisionCapabilityStatus = {
  persistence_mode?: string;
  durable_persistence_enabled?: boolean;
  schema_ready?: boolean;
  migration_activated?: boolean;
  live_inference_enabled?: boolean;
  provider_status?: string;
  [key: string]: unknown;
};

export type VisionSuggestion = {
  suggestion_id: string;
  session_id: string;
  analysis_id: string;
  vision_observation_id: string;
  image_id?: string | null;
  region_id?: string | null;
  concept_id?: string | null;
  character: string;
  registry_character_found: boolean;
  proposed_value: unknown;
  character_state_id?: string | null;
  numeric_value?: number | null;
  relative_value?: number | null;
  unit?: string | null;
  measurement_basis?: string | null;
  machine_confidence?: number | null;
  method?: string | null;
  evidence_region?: string | null;
  vision_review_state?: string | null;
  limitations?: string[];
  state: "pending_review" | "needs_mapping" | "cannot_determine" | "accepted" | "revised" | "rejected";
  review?: Record<string, unknown> | null;
  matrix_observation_id?: string | null;
  accepted_value?: unknown;
};

export type VisionSuggestionList = {
  session_id: string;
  suggestions: VisionSuggestion[];
  vision_analyses?: Record<string, Record<string, unknown>>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${CALYX_BACKEND_BASE_URL}${path}`, {
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const payload = await response.json().catch(() => null) as T | { detail?: unknown } | null;
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "detail" in payload
      ? JSON.stringify(payload.detail)
      : response.statusText;
    throw new Error(`Matrix API ${response.status}: ${detail}`);
  }
  // A 2xx whose body is not JSON (a proxy page, a truncated response) is not
  // an answer. Returning null here let the guided page report "Session ready"
  // with no session behind it.
  if (payload === null) throw new Error(`Matrix API ${response.status}: response was not JSON`);
  return payload as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCandidateResult(value: unknown): boolean {
  return isRecord(value)
    && typeof value.taxon_id === "string"
    && typeof value.scientific_name === "string"
    && typeof value.score === "number"
    && typeof value.coverage === "number"
    && Array.isArray(value.explanations);
}

/**
 * Fail closed on an evaluation the page cannot render truthfully. A body
 * without a report or candidate list previously crashed the whole route into
 * the global error screen; it is now a Matrix error, and no ranking is shown.
 */
export function assertSessionEvaluation(payload: unknown): SessionEvaluation {
  const session = isRecord(payload) ? payload.session : null;
  const report = isRecord(payload) ? payload.report : null;
  const valid = isRecord(session)
    && typeof session.session_id === "string"
    && typeof session.revision === "number"
    && isRecord(session.registry)
    && Array.isArray(session.observations)
    && isRecord(report)
    && typeof report.observation_count === "number"
    && typeof report.compared_character_count === "number"
    && Array.isArray(report.candidates)
    && report.candidates.every(isCandidateResult);
  if (!valid) throw new Error("Matrix API returned a malformed evaluation; no ranking is shown.");
  return payload as SessionEvaluation;
}

export async function listMatrixRegistries(): Promise<RegistrySummary[]> {
  const payload = await request<{ versions: RegistrySummary[] }>("/api/matrix-identification/registry");
  return Array.isArray(payload.versions) ? payload.versions : [];
}

export async function createIdentificationSession(registry: RegistrySummary): Promise<SessionRecord> {
  const session = await request<SessionRecord>("/api/matrix-identification/sessions", {
    method: "POST",
    body: JSON.stringify({
      registry_id: registry.registry_id,
      version: registry.version,
      metadata: { input_mode: "guided", client: "orchid-continuum-frontend" },
    }),
  });
  if (!isRecord(session) || typeof session.session_id !== "string" || !session.session_id) {
    throw new Error("Matrix API returned a session without an identifier.");
  }
  return session;
}

export async function addSessionObservation(
  sessionId: string,
  character: string,
  value: unknown,
  certainty: Certainty,
): Promise<SessionRecord> {
  return request<SessionRecord>(`/api/matrix-identification/sessions/${encodeURIComponent(sessionId)}/observations`, {
    method: "POST",
    body: JSON.stringify({
      character,
      value,
      certainty,
      source: { kind: "user_observation", interface: "guided-identification" },
    }),
  });
}

export async function evaluateIdentificationSession(sessionId: string): Promise<SessionEvaluation> {
  return assertSessionEvaluation(await request<unknown>(`/api/matrix-identification/sessions/${encodeURIComponent(sessionId)}/evaluate`, {
    method: "POST",
    body: JSON.stringify({ limit: 20 }),
  }));
}

export async function explainIdentificationSession(
  sessionId: string,
  audience: ExplanationAudience,
  focus: "summary" | "next_observation" | "candidate_comparison" = "summary",
): Promise<CalyxExplanation> {
  return request<CalyxExplanation>(`/api/matrix-identification/sessions/${encodeURIComponent(sessionId)}/explain`, {
    method: "POST",
    body: JSON.stringify({ audience, focus }),
  });
}

export async function getVisionCapabilityStatus(): Promise<VisionCapabilityStatus> {
  return request<VisionCapabilityStatus>("/api/vision-lexicon/status");
}

export async function discoverVisionAnalysesForImage(
  sessionId: string,
  imageId: string,
): Promise<VisionAnalysisDiscovery> {
  return request<VisionAnalysisDiscovery>(
    `/api/matrix-identification/sessions/${encodeURIComponent(sessionId)}/vision/images/${encodeURIComponent(imageId)}/analyses`,
  );
}

export async function attachVisionAnalysis(
  sessionId: string,
  analysisId: string,
): Promise<VisionSuggestionList & { added: number; analysis_id: string; rule?: string }> {
  return request<VisionSuggestionList & { added: number; analysis_id: string; rule?: string }>(
    `/api/matrix-identification/sessions/${encodeURIComponent(sessionId)}/vision/analyses/${encodeURIComponent(analysisId)}/suggestions`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function listVisionSuggestions(sessionId: string): Promise<VisionSuggestionList> {
  return request<VisionSuggestionList>(
    `/api/matrix-identification/sessions/${encodeURIComponent(sessionId)}/vision/suggestions`,
  );
}

export type VisionRegionGeometry = {
  region_id: string;
  analysis_id: string;
  concept_id?: string | null;
  label: string;
  bounding_box?: { x: number; y: number; width: number; height: number } | Record<string, unknown> | null;
  segmentation_ref?: string | null;
  landmarks?: { name: string; x: number; y: number }[] | null;
  confidence?: number | null;
  review_state: string;
};

export type VisionSuggestionRegion = {
  session_id: string;
  suggestion_id: string;
  region: VisionRegionGeometry | null;
};

export async function fetchVisionSuggestionRegion(
  sessionId: string,
  suggestionId: string,
): Promise<VisionSuggestionRegion> {
  return request<VisionSuggestionRegion>(
    `/api/matrix-identification/sessions/${encodeURIComponent(sessionId)}/vision/suggestions/${encodeURIComponent(suggestionId)}/region`,
  );
}

export async function reviewVisionSuggestion(
  sessionId: string,
  suggestionId: string,
  decision: VisionReviewDecision,
  options: { certainty?: Certainty; revisedValue?: unknown; comments?: string } = {},
): Promise<{ session: SessionRecord; suggestion: VisionSuggestion; observation_added: boolean }> {
  return request<{ session: SessionRecord; suggestion: VisionSuggestion; observation_added: boolean }>(
    `/api/matrix-identification/sessions/${encodeURIComponent(sessionId)}/vision/suggestions/${encodeURIComponent(suggestionId)}/review`,
    {
      method: "POST",
      body: JSON.stringify({
        decision,
        certainty: options.certainty,
        revised_value: options.revisedValue,
        comments: options.comments,
      }),
    },
  );
}

export function coerceObservationValue(raw: string, valueType?: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (valueType?.startsWith("numeric")) {
    const number = Number(trimmed);
    return Number.isFinite(number) ? number : trimmed;
  }
  if (trimmed.includes(",")) {
    return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return trimmed;
}

export function explanationText(payload: CalyxExplanation | null): string {
  if (!payload) return "";
  if (typeof payload.narrative === "object" && payload.narrative?.text) {
    return payload.narrative.text.trim();
  }
  if (typeof payload.narrative === "string") return payload.narrative.trim();
  return String(payload.answer ?? payload.explanation ?? "").trim();
}
