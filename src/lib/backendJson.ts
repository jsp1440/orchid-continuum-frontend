/**
 * backendJson — honest JSON transport for public intake surfaces.
 *
 * The public site is a static host that rewrites every unknown path to
 * index.html with HTTP 200, so a bare relative `/api/…` fetch against a route that is
 * not live "succeeds" with an HTML body. Every request here targets the
 * canonical Calyx backend origin, and success requires a parsed JSON object:
 *   - 401/403/404/405/501–503, or any non-JSON body  → `unavailable`
 *   - non-2xx JSON                                   → `rejected` (+ backend detail)
 *   - fetch threw                                    → `network`
 */
import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

export const COMMUNITY_API_BASE = `${CALYX_BACKEND_BASE_URL}/api/community`;

export type BackendJsonResult<T> =
  | { ok: true; kind: 'ok'; data: T }
  | { ok: false; kind: 'unavailable'; status?: number }
  | { ok: false; kind: 'rejected'; status: number; detail: string }
  | { ok: false; kind: 'network' };

const UNAVAILABLE_STATUSES = new Set([401, 403, 404, 405, 501, 502, 503]);

export async function backendJsonRequest<T>(
  url: string,
  init: RequestInit = {},
): Promise<BackendJsonResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    return { ok: false, kind: 'network' };
  }

  if (UNAVAILABLE_STATUSES.has(res.status)) {
    return { ok: false, kind: 'unavailable', status: res.status };
  }
  const contentType = (res.headers?.get?.('content-type') ?? '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return { ok: false, kind: 'unavailable', status: res.status };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, kind: 'unavailable', status: res.status };
  }
  if (!res.ok) {
    const detail =
      body && typeof body === 'object' && typeof (body as { detail?: unknown }).detail === 'string'
        ? (body as { detail: string }).detail
        : `HTTP ${res.status}`;
    return { ok: false, kind: 'rejected', status: res.status, detail };
  }
  if (body === null || typeof body !== 'object') {
    return { ok: false, kind: 'unavailable', status: res.status };
  }
  return { ok: true, kind: 'ok', data: body as T };
}

export function jsonInit(method: 'POST' | 'PATCH', payload: unknown, extra: RequestInit = {}): RequestInit {
  return {
    ...extra,
    method,
    headers: { 'Content-Type': 'application/json', ...(extra.headers ?? {}) },
    body: JSON.stringify(payload),
  };
}
