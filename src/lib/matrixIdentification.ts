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

export type CandidateExplanation = {
  character: string;
  observation: unknown;
  candidate_state: unknown;
  certainty: Certainty;
  similarity: number | null;
  status: string;
};

export type CandidateResult = {
  taxon_id: string;
  scientific_name: string;
  score: number;
  coverage: number;
  explanations: CandidateExplanation[];
  provenance?: Record<string, unknown>;
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
};

export type SessionEvaluation = {
  session: SessionRecord;
  report: EvaluationReport;
  next_observation: NextObservation | null;
};

export type CalyxExplanation = {
  schema_version?: string;
  session_id?: string;
  evidence?: Record<string, unknown>;
  narrative?: {
    text?: string;
    provider?: string;
    model?: string;
    epistemic_state?: string;
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
  return payload as T;
}

export async function listMatrixRegistries(): Promise<RegistrySummary[]> {
  const payload = await request<{ versions: RegistrySummary[] }>("/api/matrix-identification/registry");
  return Array.isArray(payload.versions) ? payload.versions : [];
}

export async function createIdentificationSession(registry: RegistrySummary): Promise<SessionRecord> {
  return request<SessionRecord>("/api/matrix-identification/sessions", {
    method: "POST",
    body: JSON.stringify({
      registry_id: registry.registry_id,
      version: registry.version,
      metadata: { input_mode: "guided", client: "orchid-continuum-frontend" },
    }),
  });
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
  return request<SessionEvaluation>(`/api/matrix-identification/sessions/${encodeURIComponent(sessionId)}/evaluate`, {
    method: "POST",
    body: JSON.stringify({ limit: 20 }),
  });
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
