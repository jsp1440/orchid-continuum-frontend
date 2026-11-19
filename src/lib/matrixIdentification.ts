import { CALYX_BACKEND_BASE_URL, hasOwnerBearerSession } from "@/lib/backendConfig";
import {
  errorCodeOf,
  isMemberMatrixRequest,
  MEMBER_ACCESS_UNCONFIGURED_MESSAGE,
  MEMBER_AUTH_CODES,
  MEMBER_AUTH_UNAVAILABLE_MESSAGE,
  memberAuthServiceRefusal,
  withMemberAuth,
} from "@/lib/memberReadAuth";

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
  created_at?: string;
};

/**
 * One character definition from `GET /registry/{id}/{version}`. A member
 * receives the definitions only (`member_view: true`): no candidate states,
 * no provenance.
 */
export type RegistryCharacter = {
  character: string;
  label?: string | null;
  description?: string | null;
  value_type?: string | null;
  weight?: number | null;
  concept_id?: string | null;
};

export type RegistryVersionDetail = RegistrySummary & {
  schema_version?: string;
  characters: RegistryCharacter[];
  member_view?: boolean;
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
  /**
   * `true` on the member-shaped session (backend app/matrix_member_views.py):
   * the backend verified a member principal and returned the member view.
   * Owner and API-key payloads never carry it.
   */
  mine?: boolean;
  status?: string;
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

/**
 * Why a Matrix request could not be answered, in terms a visitor can act on.
 *
 * Owner decision (Release 1 journey 4): Matrix identification is available to
 * signed-in members, with sessions private to their creator (backend #1647).
 * The member Supabase token is sent on exactly the member Matrix routes (see
 * memberReadAuth). So:
 *
 * - On a member route, a 401 without an owner session means "sign in"
 *   (`sign_in_required`) when no member session was offered, or "sign in
 *   again" (`member_session_unverified`) when one was offered and refused.
 * - A 401 while an owner bearer session is held means the owner session itself
 *   was not accepted (`owner_session_unverified`).
 * - A 403, or any 401 on a route that is owner-only for members (Vision,
 *   reports, persistence), means "this is limited to owner access"
 *   (`owner_access_required`) — never a sign-in loop.
 * - 503 `MEMBER_AUTH_NOT_CONFIGURED` / `MEMBER_AUTH_UNAVAILABLE` are member-auth
 *   states, not outages; any other 5xx, or no answer at all, is an outage the
 *   visitor can retry (`unavailable`).
 */
export type MatrixAccessState =
  | "owner_access_required"
  | "owner_session_unverified"
  | "sign_in_required"
  | "member_session_unverified"
  | "member_access_unconfigured"
  | "member_auth_unavailable"
  | "unavailable";

export const MATRIX_OWNER_ACCESS_MESSAGE = "Matrix identification currently requires owner access.";
export const MATRIX_OWNER_ONLY_PANEL_MESSAGE = "This view is limited to owner access.";
export const MATRIX_OWNER_SESSION_UNVERIFIED_MESSAGE =
  "Your owner session could not be verified. Sign in again as the owner to use Matrix identification.";
export const MATRIX_SIGN_IN_MESSAGE = "Sign in to use Matrix identification. It is available to signed-in members.";
export const MATRIX_MEMBER_SESSION_UNVERIFIED_MESSAGE =
  "Your session could not be verified — sign in again to use Matrix identification.";
export const MATRIX_UNAVAILABLE_MESSAGE = "Matrix identification is temporarily unavailable. Try again.";
export const MATRIX_SESSION_NOT_FOUND_MESSAGE =
  "This identification session was not found for your account. Sessions are private to the account that started them.";
export const MATRIX_RATE_LIMITED_MESSAGE =
  "Too many Matrix identification requests for this account. Wait a little and try again.";
export const MATRIX_OBSERVATION_LIMIT_MESSAGE =
  "This identification session has reached its observation limit. Start a new session.";

const MATRIX_ACCESS_MESSAGE: Record<MatrixAccessState, string> = {
  owner_access_required: MATRIX_OWNER_ACCESS_MESSAGE,
  owner_session_unverified: MATRIX_OWNER_SESSION_UNVERIFIED_MESSAGE,
  sign_in_required: MATRIX_SIGN_IN_MESSAGE,
  member_session_unverified: MATRIX_MEMBER_SESSION_UNVERIFIED_MESSAGE,
  member_access_unconfigured: MEMBER_ACCESS_UNCONFIGURED_MESSAGE,
  member_auth_unavailable: MEMBER_AUTH_UNAVAILABLE_MESSAGE,
  unavailable: MATRIX_UNAVAILABLE_MESSAGE,
};

/** What was known about the request when it was refused. */
export type MatrixRequestContext = {
  /** The method+path is one of the member Matrix routes. */
  memberRoute?: boolean;
  /** This request carried the member's Supabase token. */
  memberTokenSent?: boolean;
  /** The backend's error code, when it sent one. */
  code?: string | null;
};

/** Classify a failed Matrix response; null for statuses with their own meaning (400/404/409/422…). */
export function matrixAccessState(
  status: number | null,
  ownerSession: boolean = hasOwnerBearerSession(),
  context: MatrixRequestContext = {},
): MatrixAccessState | null {
  if (status === null || status === 0) return "unavailable";
  const service = memberAuthServiceRefusal(status, context.code);
  if (service) return service;
  if (status >= 500) return "unavailable";
  if (status === 403) return "owner_access_required";
  if (status === 401) {
    if (ownerSession) return "owner_session_unverified";
    if (!context.memberRoute) return "owner_access_required";
    if (context.memberTokenSent || context.code === MEMBER_AUTH_CODES.invalidToken) {
      return "member_session_unverified";
    }
    return "sign_in_required";
  }
  return null;
}

/** Whether a retry, without the visitor doing anything else, could change the answer. */
export function isRetryableMatrixAccess(access: MatrixAccessState | null): boolean {
  return access === "unavailable" || access === "member_auth_unavailable";
}

export class MatrixApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly access: MatrixAccessState | null,
    public readonly code: string | null = null,
  ) {
    super(message);
    this.name = "MatrixApiError";
  }
}

/** The access state carried by an error thrown from this module, if any. */
export function matrixErrorAccess(error: unknown): MatrixAccessState | null {
  return error instanceof MatrixApiError ? error.access : null;
}

/** Plain words for refusals that are not access states (the backend's member codes). */
function nonAccessMessage(status: number, code: string | null, payload: unknown, path: string): string {
  if (status === 404 && path.startsWith("/api/matrix-identification/sessions/")) return MATRIX_SESSION_NOT_FOUND_MESSAGE;
  if (status === 429 || code === "MATRIX_MEMBER_RATE_LIMITED") return MATRIX_RATE_LIMITED_MESSAGE;
  if (code === "MATRIX_MEMBER_SESSION_OBSERVATION_LIMIT") return MATRIX_OBSERVATION_LIMIT_MESSAGE;
  const detail = payload && typeof payload === "object" && "detail" in payload
    ? JSON.stringify((payload as { detail?: unknown }).detail)
    : String(status);
  return `Matrix API ${status}: ${detail}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${CALYX_BACKEND_BASE_URL}${path}`;
  const baseInit: RequestInit = {
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  };
  const memberRoute = isMemberMatrixRequest(url, baseInit.method);
  let response: Response;
  let memberTokenSent = false;
  try {
    // The member Supabase token rides ONLY on the member Matrix routes (the
    // one decision lives in memberReadAuth); owner-only routes keep the owner
    // cookie / bearer transport exactly as before.
    const sent = await withMemberAuth(url, baseInit);
    memberTokenSent = sent !== baseInit;
    response = await fetch(url, sent);
  } catch {
    throw new MatrixApiError(MATRIX_UNAVAILABLE_MESSAGE, null, "unavailable");
  }
  const payload = await response.json().catch(() => null) as T | { detail?: unknown } | null;
  if (!response.ok) {
    const code = errorCodeOf(payload);
    const access = matrixAccessState(response.status, hasOwnerBearerSession(), { memberRoute, memberTokenSent, code });
    // Refusals and outages are said in plain words; the raw status and body
    // are not shown to the visitor.
    if (access) throw new MatrixApiError(MATRIX_ACCESS_MESSAGE[access], response.status, access, code);
    throw new MatrixApiError(nonAccessMessage(response.status, code, payload, path), response.status, null, code);
  }
  // A 2xx whose body is not JSON (a proxy page, a truncated response) is not
  // an answer. Returning null here let the guided page report "Session ready"
  // with no session behind it.
  if (payload === null) throw new Error(`Matrix API ${response.status}: response was not JSON`);
  return payload as T;
}

/* ------------------------------------------------------------------------ */
/* "withheld": the member view's privacy marker                             */
/* ------------------------------------------------------------------------ */

/**
 * The literal the backend's member view substitutes for any string or state
 * that fails its privacy screen (protected place, specimen or submitter material) —
 * app/matrix_member_views.py `WITHHELD`. It is a marker, never a value: it is
 * shown as "withheld" and is never submitted back as an observation.
 */
export const MATRIX_WITHHELD = "withheld";
export const MATRIX_WITHHELD_LABEL = "withheld (not shown in the member view)";

export function isWithheld(value: unknown): boolean {
  return value === MATRIX_WITHHELD;
}

/** A character a member can actually answer: a real id and label, not the marker. */
export function isAnswerableCharacter(
  item: { character?: unknown; label?: unknown } | null | undefined,
): boolean {
  return Boolean(item)
    && typeof item?.character === "string"
    && item.character.length > 0
    && !isWithheld(item.character)
    && !isWithheld(item.label);
}

/** Whether an observation value would submit the withheld marker. */
export function containsWithheld(value: unknown): boolean {
  if (typeof value === "string") return value.trim().toLowerCase() === MATRIX_WITHHELD;
  if (Array.isArray(value)) return value.some(containsWithheld);
  return false;
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

/** One registry version's character definitions (member view: definitions only). */
export async function getRegistryVersion(registryId: string, version: string): Promise<RegistryVersionDetail> {
  const detail = await request<RegistryVersionDetail>(
    `/api/matrix-identification/registry/${encodeURIComponent(registryId)}/${encodeURIComponent(version)}`,
  );
  if (!isRecord(detail) || !Array.isArray(detail.characters)) {
    throw new Error("Matrix API returned a registry version without character definitions.");
  }
  return detail;
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
  // The member view's privacy marker is never evidence: refuse to send it as
  // a character or a value rather than record "withheld" as an observation.
  if (isWithheld(character) || containsWithheld(value)) {
    throw new Error("A withheld character or value cannot be recorded as an observation.");
  }
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
  const text = rawExplanationText(payload);
  // A screened narrative arrives as the bare marker; say so rather than show it as prose.
  return isWithheld(text) ? `Explanation ${MATRIX_WITHHELD_LABEL}.` : text;
}

function rawExplanationText(payload: CalyxExplanation): string {
  if (typeof payload.narrative === "object" && payload.narrative?.text) {
    return payload.narrative.text.trim();
  }
  if (typeof payload.narrative === "string") return payload.narrative.trim();
  return String(payload.answer ?? payload.explanation ?? "").trim();
}
