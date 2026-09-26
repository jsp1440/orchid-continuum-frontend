/**
 * constituentApi — the only path the public newsletter/contact pages use to
 * reach the Calyx constituent platform (`/api/constituent/*`).
 *
 * Honesty contract (COMMS-001): the public site is a static host that rewrites
 * every unknown path to index.html with HTTP 200, so a bare relative `/api/…` fetch
 * against a route that is not live "succeeds" with an HTML body. This client
 * therefore
 *   - always targets the canonical backend origin (CALYX_BACKEND_BASE_URL),
 *   - treats 401/403/404/405/501/503 and any non-JSON body as `unavailable`,
 *   - never lets a caller report success without a parsed JSON payload.
 */
import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

export const CONSTITUENT_API_BASE = `${CALYX_BACKEND_BASE_URL}/api/constituent`;

export type ConstituentResult<T> =
  | { ok: true; kind: 'ok'; data: T }
  | { ok: false; kind: 'unavailable'; status?: number }
  | { ok: false; kind: 'rejected'; status: number; detail: string }
  | { ok: false; kind: 'network' };

const UNAVAILABLE_STATUSES = new Set([401, 403, 404, 405, 501, 502, 503]);

export async function constituentRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<ConstituentResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${CONSTITUENT_API_BASE}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    return { ok: false, kind: 'network' };
  }

  if (UNAVAILABLE_STATUSES.has(res.status)) {
    return { ok: false, kind: 'unavailable', status: res.status };
  }

  const contentType = (res.headers?.get?.('content-type') ?? '').toLowerCase();
  if (!contentType.includes('application/json')) {
    // Static-host rewrite (HTML 200) or an unexpected body: the intake is not live.
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

export function jsonInit(method: 'POST' | 'PATCH', payload: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

/** Copy shared by every public intake surface when the backend route is not live. */
export const INTAKE_UNAVAILABLE_COPY =
  'This intake is in development and is not yet live. Nothing was recorded.';
export const CONTACT_EMAIL = 'info@orchidcontinuum.org';
