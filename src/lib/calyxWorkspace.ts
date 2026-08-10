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
  citation?: {
    revision_id?: number | string;
    source_anchor_ids?: Array<number | string>;
    locator?: unknown;
  };
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
export type CalyxConversationTurn = {
  id: string;
  role: "user" | "calyx";
  text: string;
  created_at: string;
  mission?: BrainMission;
};
export type BrainMissionErrorKind = "authentication_required" | "route_unavailable" | "validation_failed" | "server_error" | "network_error";
export class BrainMissionApiError extends Error {
  constructor(public readonly kind: BrainMissionErrorKind, message: string, public readonly status?: number) { super(message); this.name = "BrainMissionApiError"; }
}

function detailMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && typeof (detail as { code?: unknown }).code === "string") return (detail as { code: string }).code;
  return null;
}

async function missionRequest(path: string, init?: RequestInit): Promise<BrainMission> {
  let response: Response;
  try {
    response = await fetch(`${CALYX_BACKEND_BASE_URL}${path}`, { ...init, credentials: "include", headers: { Accept: "application/json", ...(init?.headers ?? {}) } });
  } catch (error) {
    throw new BrainMissionApiError("network_error", error instanceof Error ? error.message : "Calyx mission request failed");
  }
  if (!response.ok) {
    const message = detailMessage(await response.json().catch(() => null));
    if (response.status === 401 || response.status === 403) throw new BrainMissionApiError("authentication_required", message ?? "Owner authentication is required.", response.status);
    if (response.status === 404) throw new BrainMissionApiError("route_unavailable", message ?? "The Brain mission API is not deployed.", response.status);
    if (response.status === 400 || response.status === 422) throw new BrainMissionApiError("validation_failed", message ?? "The mission request was not valid.", response.status);
    throw new BrainMissionApiError("server_error", message ?? `Brain mission request failed (${response.status}).`, response.status);
  }
  return response.json() as Promise<BrainMission>;
}

export const startBrainMission = (payload: BrainMissionRequest) => missionRequest("/api/brain/missions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
export const getBrainMission = (missionId: string) => missionRequest(`/api/brain/missions/${encodeURIComponent(missionId)}`);

export function isCasualCalyxTurn(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[!.?]+$/g, "");
  return /^(hi|hello|hey|good morning|good afternoon|good evening|thanks|thank you|how are you)$/.test(normalized);
}

export function casualCalyxReply(text: string): string {
  const normalized = text.trim().toLowerCase();
  if (normalized.includes("thank")) return "You’re welcome. I’m ready to work with the Orchid Continuum’s governed evidence and project context whenever you are.";
  if (normalized.includes("how are you")) return "I’m operational as a governed Orchid Continuum workspace. Ask me a scientific or project question and I can escalate it into a Brain mission when evidence is needed.";
  return "Hello. I’m Calyx. We can talk normally here, and when your question needs evidence I’ll use the governed Brain mission system and keep the research details attached to the conversation.";
}

export function buildConversationalMissionQuestion(question: string, turns: CalyxConversationTurn[]): string {
  const priorUserTurns = turns.filter((turn) => turn.role === "user").slice(-3).map((turn) => turn.text.trim()).filter(Boolean);
  if (!priorUserTurns.length) return question.trim().slice(0, 1000);
  const context = priorUserTurns.map((value, index) => `Prior user turn ${index + 1}: ${value}`).join("\n");
  const prefix = `Conversation context:\n${context}\n\nCurrent question: `;
  const available = Math.max(1, 1000 - prefix.length);
  return `${prefix}${question.trim().slice(0, available)}`;
}

export function summarizeMissionForConversation(mission: BrainMission): string {
  const conclusions = mission.conclusions.map((item) => item.text.trim()).filter(Boolean);
  const evidenceCount = mission.supporting_evidence.length + mission.contradicting_evidence.length;
  const parts: string[] = [];
  if (conclusions.length) parts.push(conclusions.join(" "));
  else if (mission.partial) parts.push("I could only complete a partial governed research mission for that question.");
  else parts.push("I completed the governed research mission, but it did not produce a scientific conclusion.");
  parts.push(`I found ${evidenceCount} evidence record${evidenceCount === 1 ? "" : "s"} across ${mission.sources.length} canonical source${mission.sources.length === 1 ? "" : "s"}.`);
  if (mission.missing_evidence.length) parts.push(`Important gaps remain: ${mission.missing_evidence.slice(0, 3).join("; ")}${mission.missing_evidence.length > 3 ? "; and additional gaps shown in Research details" : ""}.`);
  if (mission.confidence !== null) parts.push(`Backend confidence is ${mission.confidence.toFixed(2)}.`);
  if (mission.review_status) parts.push(`Review status: ${mission.review_status.replaceAll("_", " ").toLowerCase()}.`);
  parts.push("Open Research details below this reply to inspect sources, provenance, contradictions, the reasoning ledger, and publication boundary.");
  return parts.join(" ");
}

async function getOrchestratorStatus(): Promise<{ data: Record<string, unknown> | null; state: CalyxWorkspaceSnapshot["orchestratorState"]; error?: string }> {
  try {
    const response = await fetch(`${CALYX_BACKEND_BASE_URL}/brain/orchestrator/status`, { credentials: "include", headers: { Accept: "application/json" } });
    if (response.status === 401 || response.status === 403) return { data: null, state: "authentication_required" };
    if (!response.ok) return { data: null, state: "unavailable", error: `Orchestrator status ${response.status}` };
    return { data: await response.json() as Record<string, unknown>, state: "available" };
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
