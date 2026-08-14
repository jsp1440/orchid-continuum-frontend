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
export type BrainMission = {
  mission_id: string; project_id: string; question: string; state: string; current_stage: string; steps_executed: number;
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
export type CalyxServerMessage = {
  message_id: string;
  conversation_id: string;
  role: "operator" | "calyx" | "system" | "tool";
  content: string;
  content_hash?: string;
  created_at: string;
  metadata?: Record<string, unknown> & { citations?: CalyxCitation[] };
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
export type CalyxTurnResponse = {
  conversation_id: string;
  operator_message: CalyxServerMessage;
  calyx_message: CalyxServerMessage;
  answer: string;
  provider: { name: string; model: string; request_hash: string; provider_response_id?: string | null; fallback_error?: string | null; configuration?: Record<string, unknown> };
  research: { casual: boolean; mission: BrainMission | null; mission_error: string | null; retrieval: Record<string, unknown>; continuum?: Record<string, unknown>; climate?: Record<string, unknown>; citations?: CalyxCitation[] };
  deliverables?: Record<string, unknown>;
  persistence_mode: string;
  epistemic_policy: Record<string, boolean>;
};
export type CalyxApiErrorKind = "authentication_required" | "route_unavailable" | "validation_failed" | "server_error" | "network_error";
export class CalyxApiError extends Error {
  constructor(public readonly kind: CalyxApiErrorKind, message: string, public readonly status?: number) { super(message); this.name = "CalyxApiError"; }
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

export const startBrainMission = (payload: BrainMissionRequest) => missionRequest("/api/brain/missions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
export const getBrainMission = (missionId: string) => missionRequest(`/api/brain/missions/${encodeURIComponent(missionId)}`);

export const createCalyxConversation = (payload: { title?: string; project_id?: string; context?: Record<string, unknown> } = {}) =>
  calyxRequest<CalyxConversation>("/api/calyx/speak/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

export const getCalyxConversation = (conversationId: string) =>
  calyxRequest<CalyxConversation>(`/api/calyx/speak/conversations/${encodeURIComponent(conversationId)}`);

export const listCalyxConversations = (limit = 20) =>
  calyxRequest<{ conversations: Array<Omit<CalyxConversation, "messages"> & { message_count?: number }>; persistence_mode: string }>(`/api/calyx/speak/conversations?limit=${encodeURIComponent(String(limit))}`);

export const sendCalyxTurn = (conversationId: string, payload: { message: string; project_id?: string; context?: Record<string, unknown>; research_mode?: "auto" | "always" | "never"; retrieval_limit?: number }) =>
  calyxRequest<CalyxTurnResponse>(`/api/calyx/speak/conversations/${encodeURIComponent(conversationId)}/turns`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

async function getOrchestratorStatus(): Promise<{ data: Record<string, unknown> | null; state: CalyxWorkspaceSnapshot["orchestratorState"]; error?: string }> {
  try {
    const response = await fetch(`${CALYX_BACKEND_BASE_URL}/brain/orchestrator/status`, { credentials: "include", headers: { Accept: "application/json" } });
    if (response.status === 401 || response.status === 403) return { data: null, state: "authentication_required" };
    if (!response.ok) return { data: null, state: "unavailable", error: `Orchestrator status ${response.status}` };
    return { data: (await response.json()) as Record<string, unknown>, state: "available" };
  } catch (error) { return { data: null, state: "unavailable", error: error instanceof Error ? error.message : "Orchestrator request failed" }; }
}

export async function loadCalyxWorkspace(): Promise<CalyxWorkspaceSnapshot> {
  const [capabilitiesResult, homepageResult, orchestratorResult] = await Promise.allSettled([getPlatformCapabilities(), getHomepageDocument(), getOrchestratorStatus()]);
  const errors: string[] = [];
  const capabilities = capabilitiesResult.status === "fulfilled" ? capabilitiesResult.value : null;
  const homepage = homepageResult.status === "fulfilled" ? homepageResult.value : null;
  const orchestrator = orchestratorResult.status === "fulfilled" ? orchestratorResult.value : null;
  if (capabilitiesResult.status === "rejected") errors.push(String(capabilitiesResult.reason));
  if (homepageResult.status === "rejected") errors.push(String(homepageResult.reason));
  if (orchestratorResult.status === "rejected") errors.push(String(orchestratorResult.reason));
  if (orchestrator?.error) errors.push(orchestrator.error);
  return { capabilities, homepage, orchestrator: orchestrator?.data ?? null, orchestratorState: orchestrator?.state ?? "unavailable", errors };
}