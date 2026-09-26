import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";
import { getHomepageDocument, getPlatformCapabilities, type HomepageDocument } from "@/lib/parallelPlatform";

export type CalyxWorkspaceSnapshot = { capabilities: Record<string, unknown> | null; homepage: HomepageDocument | null; orchestrator: Record<string, unknown> | null; orchestratorState: "available" | "authentication_required" | "unavailable"; errors: string[] };
export type BrainMissionRequest = { question: string; project_id: string; max_sources?: number; max_execution_steps?: number; timeout_seconds?: number };
export type MissionBlocker = { code: string; stage: string; detail?: string };
export type MissionSource = {
  result_id?: string;
  title?: string | null;
  object_type?: string;
  authorized_excerpt?: string | null;
  citation?: { revision_id?: number | string; source_anchor_ids?: Array<number | string>; locator?: unknown };
};
export type MissionEvidence = { candidate_id?: number | string; candidate_version?: number; subject?: string; predicate?: string; value?: unknown; source_revision_id?: number | string; source_anchor_ids?: Array<number | string>; provenance?: Record<string, unknown>; [key: string]: unknown };
export type MissionConclusion = { type?: string; text: string; claim_ids?: Array<number | string> };
export type BrainMissionPlan = {
  question: string;
  domains: string[];
  retrieval_queries: string[];
  source_budget: number;
  per_domain_source_budget: number;
  claims_and_inferences_separated: true;
};
export type BrainMission = {
  mission_id: string; project_id: string; question: string; state: string; current_stage: string; steps_executed: number;
  plan?: BrainMissionPlan | null;
  sources: MissionSource[]; supporting_evidence: MissionEvidence[]; contradicting_evidence: MissionEvidence[]; missing_evidence: string[];
  confidence: number | null; conclusions: MissionConclusion[]; reasoning_ledger: { ledger_id: string; version: number } | null;
  validation: { valid: boolean; blockers: string[] }; review_status: string;
  publication_eligibility: { eligible: boolean; automatic_publication: false; blockers: string[] };
  blockers: MissionBlocker[]; partial: boolean; created_at: string; updated_at: string;
};
export type CalyxCitation = {
  title: string;
  authors?: string | null;
  publication_date?: string | null;
  journal?: string | null;
  doi?: string | null;
  pmid?: string | null;
  pmcid?: string | null;
  provider?: string | null;
  review_state?: string | null;
  canonical_evidence?: boolean;
};
/**
 * Server-composed synthesis structure for one Calyx answer.
 *
 * This is the machinery the conversational answer deliberately does NOT narrate
 * at the user: claim coverage, contradictions, gaps and provenance. It exists so
 * the workspace can offer that detail as an inspectable secondary surface
 * without the primary answer reading like a database dump.
 *
 * Supplied by CALYX-CONVERSATIONAL-SYNTHESIS-001. Absent on older backends, so
 * every consumer must treat it as optional.
 */
export type CalyxClaimCoverage = {
  claim_id: string;
  claim: string;
  /** Whether the linked evidence supports, contests, contradicts, or misses this claim. */
  coverage: "supported" | "contested" | "contradicted" | "unresolved" | string;
  source_families: string[];
  supporting_count: number;
  contradicting_count: number;
};
export type CalyxEvidenceClassReadiness = {
  status: "ready" | "evidence_incomplete";
  literature_present: boolean;
  literature_review_required: boolean;
  continuum_evidence_classes: string[];
  continuum_evidence_class_count: number;
  required_continuum_evidence_class_count: number;
  missing_requirements: string[];
};
export type CalyxSynthesisStructure = {
  composer_contract?: string;
  /** False when the answer was composed from linked evidence, not reasoned generatively. */
  generative?: boolean;
  degraded_composition?: boolean;
  /** The investigation subject this turn continues, resolved server-side. */
  resolved_subject?: string | null;
  /** Canonical taxonomy release pinned by the governed backend for this synthesis. */
  taxonomy_snapshot_id?: string | null;
  follow_up_turn?: boolean;
  claim_coverage?: CalyxClaimCoverage[];
  integrated_across_source_families?: boolean;
  cited_source_families?: string[];
  source_families?: string[];
  missing_evidence?: string[];
  canonical_retrieval_gap?: boolean;
  /** Governed proof that literature and distinct canonical Continuum evidence classes are present. */
  evidence_class_readiness?: CalyxEvidenceClassReadiness | null;
  external_literature_review_required?: boolean;
  unresolved_conflict?: boolean;
  mission_unavailable?: boolean;
  citations?: string[];
  governed_provenance?: {
    mission_id?: string | null;
    evidence_packet_id?: string | null;
    interpretation_id?: string | number | null;
    confidence?: number | null;
    review_status?: string | null;
  };
};
export type CalyxServerMessage = {
  message_id: string;
  conversation_id: string;
  role: "operator" | "calyx" | "system" | "tool";
  content: string;
  content_hash?: string;
  created_at: string;
  metadata?: Record<string, unknown> & {
    citations?: CalyxCitation[];
    synthesis_structure?: CalyxSynthesisStructure | null;
  };
};
export type CalyxConversation = {
  conversation_id: string;
  owner?: string;
  project_id?: string | null;
  title?: string | null;
  created_at: string;
  updated_at: string;
  context?: Record<string, unknown>;
  status?: string;
  messages: CalyxServerMessage[];
  persistence_mode?: "postgres" | "memory" | string;
};
export type CalyxWorkspaceOutputKind = "image" | "diagram" | "chart" | "table" | "text";
export type CalyxWorkspaceOutputEvidenceStatus = "evidence" | "derived" | "illustrative" | "unknown";
export type CalyxWorkspaceOutput = {
  id: string;
  kind: CalyxWorkspaceOutputKind;
  title: string;
  subtitle?: string | null;
  provenance: {
    source_module: string;
    source_id?: string | null;
    generated?: boolean;
    evidence_status: CalyxWorkspaceOutputEvidenceStatus;
  };
  payload: Record<string, unknown>;
  created_at: string;
};
export type CalyxTurnResponse = {
  conversation_id: string;
  operator_message: CalyxServerMessage;
  calyx_message: CalyxServerMessage;
  answer: string;
  provider: { name: string; model: string; request_hash: string; provider_response_id?: string | null; fallback_error?: string | null; configuration?: Record<string, unknown> };
  research: { casual: boolean; mission: BrainMission | null; mission_error: string | null; retrieval: Record<string, unknown>; continuum?: Record<string, unknown>; climate?: Record<string, unknown>; citations?: CalyxCitation[] };
  synthesis_structure?: CalyxSynthesisStructure | null;
  workspace_outputs?: CalyxWorkspaceOutput[];
  deliverables?: Record<string, unknown>;
  persistence_mode: string;
  epistemic_policy: Record<string, boolean>;
};
export type CalyxApiErrorKind = "authentication_required" | "route_unavailable" | "validation_failed" | "server_error" | "network_error";
export class CalyxApiError extends Error {
  constructor(public readonly kind: CalyxApiErrorKind, message: string, public readonly status?: number, public readonly code?: string) { super(message); this.name = "CalyxApiError"; }
}
export class BrainMissionApiError extends CalyxApiError {
  constructor(kind: CalyxApiErrorKind, message: string, status?: number) { super(kind, message, status); this.name = "BrainMissionApiError"; }
}

function detailMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && typeof (detail as { code?: unknown }).code === "string") return (detail as { code: string }).code;
  return null;
}

async function calyxRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${CALYX_BACKEND_BASE_URL}${path}`, { ...init, credentials: "include", headers: { Accept: "application/json", ...(init?.headers ?? {}) } });
  } catch (error) {
    throw new CalyxApiError("network_error", error instanceof Error ? error.message : "Calyx request failed");
  }
  if (!response.ok) {
    const message = detailMessage(await response.json().catch(() => null));
    if (response.status === 401 || response.status === 403) throw new CalyxApiError("authentication_required", message ?? "Owner authentication is required.", response.status);
    if (response.status === 404) throw new CalyxApiError("route_unavailable", message ?? "The Calyx conversation API is not deployed.", response.status);
    if (response.status === 400 || response.status === 422) throw new CalyxApiError("validation_failed", message ?? "The Calyx request was not valid.", response.status);
    throw new CalyxApiError("server_error", message ?? `Calyx request failed (${response.status}).`, response.status);
  }
  return response.json() as Promise<T>;
}

async function missionRequest(path: string, init?: RequestInit): Promise<BrainMission> {
  try {
    return await calyxRequest<BrainMission>(path, init);
  } catch (error) {
    if (error instanceof CalyxApiError) throw new BrainMissionApiError(error.kind, error.message, error.status);
    throw error;
  }
}

// The Brain scientific-mission API is mounted at /brain, not /api/brain. Its
// router carries prefix="/brain" and includes the missions router under it, so
// the served paths are /brain/missions and /brain/missions/{mission_id}. The
// /api/brain namespace exists but holds only imports and sources, so the old
// /api/brain/missions path 404'd and no mission could be started.
export const startBrainMission = (payload: BrainMissionRequest) => missionRequest("/brain/missions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
export const getBrainMission = (missionId: string) => missionRequest(`/brain/missions/${encodeURIComponent(missionId)}`);

export const createCalyxConversation = (payload: { title?: string; project_id?: string; context?: Record<string, unknown> } = {}) =>
  calyxRequest<CalyxConversation>("/api/calyx/speak/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

export const getCalyxConversation = (conversationId: string) =>
  calyxRequest<CalyxConversation>(`/api/calyx/speak/conversations/${encodeURIComponent(conversationId)}`);

export const listCalyxConversations = (limit = 20) =>
  calyxRequest<{ conversations: Array<Omit<CalyxConversation, "messages"> & { message_count?: number }>; persistence_mode: string }>(`/api/calyx/speak/conversations?limit=${encodeURIComponent(String(limit))}`);

export const sendCalyxTurn = (conversationId: string, payload: { message: string; project_id?: string; context?: Record<string, unknown>; research_mode?: "auto" | "always" | "never"; retrieval_limit?: number }) =>
  calyxRequest<CalyxTurnResponse>(`/api/calyx/speak/conversations/${encodeURIComponent(conversationId)}/turns`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

type WorkspaceSourceFailure = "unreachable" | "unavailable";

async function getOrchestratorStatus(): Promise<{ data: Record<string, unknown> | null; state: CalyxWorkspaceSnapshot["orchestratorState"]; failure?: WorkspaceSourceFailure }> {
  try {
    const response = await fetch(`${CALYX_BACKEND_BASE_URL}/brain/orchestrator/status`, { credentials: "include", headers: { Accept: "application/json" } });
    if (response.status === 401 || response.status === 403) return { data: null, state: "authentication_required" };
    if (!response.ok) return { data: null, state: "unavailable", failure: "unavailable" };
    return { data: (await response.json()) as Record<string, unknown>, state: "available" };
  } catch (error) { return { data: null, state: "unavailable", failure: isUnreachable(error) ? "unreachable" : "unavailable" }; }
}

/** Shown when the browser could not reach the Calyx backend at all. */
export const CALYX_BACKEND_UNREACHABLE = "Calyx backend is unreachable";

/**
 * A rejected `fetch` (connection refused, DNS failure, CORS, offline) surfaces
 * as a TypeError whose text is browser-specific ("Failed to fetch", "Load
 * failed", "NetworkError when attempting to fetch resource"). That text is a
 * transport detail, not something a visitor can act on.
 */
function isUnreachable(reason: unknown): boolean {
  return reason instanceof TypeError || (reason instanceof CalyxApiError && reason.kind === "network_error");
}

/**
 * Turn per-source load failures into visitor-facing sentences. Raw exception
 * text, stack fragments and HTTP status lines never reach the page: an
 * unreachable backend is named once, and any other failure says which part of
 * the workspace is unavailable without claiming why.
 */
export function describeWorkspaceLoadFailures(failures: Array<{ source: string; failure: WorkspaceSourceFailure }>): string[] {
  const unreachable = [...new Set(failures.filter((item) => item.failure === "unreachable").map((item) => item.source))];
  const unavailable = [...new Set(failures.filter((item) => item.failure === "unavailable").map((item) => item.source))];
  const messages: string[] = [];
  if (unreachable.length) {
    const parts = unreachable.length === 1 ? unreachable[0] : `${unreachable.slice(0, -1).join(", ")} and ${unreachable[unreachable.length - 1]}`;
    messages.push(`${CALYX_BACKEND_UNREACHABLE} — ${parts} could not be loaded. Check your connection or try again in a moment.`);
  }
  for (const source of unavailable) {
    messages.push(`${source.charAt(0).toUpperCase()}${source.slice(1)} could not be loaded from the Calyx backend right now.`);
  }
  return messages;
}

export async function loadCalyxWorkspace(): Promise<CalyxWorkspaceSnapshot> {
  const [capabilitiesResult, homepageResult, orchestratorResult] = await Promise.allSettled([getPlatformCapabilities(), getHomepageDocument(), getOrchestratorStatus()]);
  const failures: Array<{ source: string; failure: WorkspaceSourceFailure }> = [];
  const capabilities = capabilitiesResult.status === "fulfilled" ? capabilitiesResult.value : null;
  const homepage = homepageResult.status === "fulfilled" ? homepageResult.value : null;
  const orchestrator = orchestratorResult.status === "fulfilled" ? orchestratorResult.value : null;
  if (capabilitiesResult.status === "rejected") failures.push({ source: "platform capabilities", failure: isUnreachable(capabilitiesResult.reason) ? "unreachable" : "unavailable" });
  if (homepageResult.status === "rejected") failures.push({ source: "the homepage document", failure: isUnreachable(homepageResult.reason) ? "unreachable" : "unavailable" });
  if (orchestratorResult.status === "rejected") failures.push({ source: "orchestrator status", failure: isUnreachable(orchestratorResult.reason) ? "unreachable" : "unavailable" });
  if (orchestrator?.failure) failures.push({ source: "orchestrator status", failure: orchestrator.failure });
  return { capabilities, homepage, orchestrator: orchestrator?.data ?? null, orchestratorState: orchestrator?.state ?? "unavailable", errors: describeWorkspaceLoadFailures(failures) };
}
