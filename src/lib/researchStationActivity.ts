import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";
import { CalyxApiError } from "@/lib/calyxWorkspace";

export type ResearchActivityEvent = {
  event_id: string;
  project_id: string;
  actor_subject?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  occurred_at: string;
  change_summary?: Record<string, unknown> | null;
};

export type ResearchActivityPage = {
  items: ResearchActivityEvent[];
  total: number;
  limit: number;
  offset: number;
};

export type ResearchActivityPageOptions = {
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
};

const boundedInteger = (value: number, fallback: number, minimum: number, maximum: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
};

export function researchActivityRequestKey(projectId: string, limit: number, offset: number): string {
  return `${projectId}:${limit}:${offset}`;
}

export function reconcileResearchActivityOffset(offset: number, total: number, limit: number): number {
  const safeLimit = boundedInteger(limit, 25, 1, 200);
  const safeTotal = Math.max(0, Math.trunc(total));
  const safeOffset = Math.max(0, Math.trunc(offset));
  if (safeTotal === 0) return 0;
  const lastPageOffset = Math.floor((safeTotal - 1) / safeLimit) * safeLimit;
  return Math.min(safeOffset, lastPageOffset);
}

export function researchActivityRange(page: ResearchActivityPage): {
  start: number;
  end: number;
  total: number;
} {
  if (page.total <= 0 || page.items.length === 0) return { start: 0, end: 0, total: Math.max(0, page.total) };
  return {
    start: page.offset + 1,
    end: Math.min(page.total, page.offset + page.items.length),
    total: page.total,
  };
}

export function previousResearchActivityOffset(offset: number, limit: number): number {
  const safeLimit = boundedInteger(limit, 25, 1, 200);
  return Math.max(0, Math.trunc(offset) - safeLimit);
}

export function nextResearchActivityOffset(page: ResearchActivityPage): number | null {
  const next = page.offset + page.limit;
  return next < page.total ? next : null;
}

export async function listResearchActivity(
  projectId: string,
  options: ResearchActivityPageOptions = {},
): Promise<ResearchActivityPage> {
  const limit = boundedInteger(options.limit ?? 25, 25, 1, 200);
  const offset = boundedInteger(options.offset ?? 0, 0, 0, 100000);
  const path = `/api/research/projects/${encodeURIComponent(projectId)}/activity?limit=${limit}&offset=${offset}`;

  let response: Response;
  try {
    response = await fetch(`${CALYX_BACKEND_BASE_URL}${path}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new CalyxApiError(
      "network_error",
      error instanceof Error ? error.message : "Research activity request failed",
    );
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    const detail = typeof body?.detail === "string" ? body.detail : null;
    if (response.status === 401 || response.status === 403) {
      throw new CalyxApiError("authentication_required", detail ?? "Sign in to view project activity.", response.status);
    }
    if (response.status === 404) {
      throw new CalyxApiError("route_unavailable", detail ?? "Research activity is unavailable.", response.status);
    }
    if (response.status === 400 || response.status === 422) {
      throw new CalyxApiError("validation_failed", detail ?? "The activity page request was not valid.", response.status);
    }
    throw new CalyxApiError("server_error", detail ?? `Research activity request failed (${response.status}).`, response.status);
  }

  const payload = (await response.json()) as ResearchActivityPage;
  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    total: Number.isFinite(payload.total) ? Math.max(0, Math.trunc(payload.total)) : 0,
    limit: Number.isFinite(payload.limit) ? Math.max(1, Math.trunc(payload.limit)) : limit,
    offset: Number.isFinite(payload.offset) ? Math.max(0, Math.trunc(payload.offset)) : offset,
  };
}
