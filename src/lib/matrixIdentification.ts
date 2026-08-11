import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";

export type Certainty = "certain" | "probable" | "uncertain" | "unknown";
export type ExplanationAudience = "beginner" | "intermediate" | "expert";

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
      actor: "matrix-guided-ui",
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
