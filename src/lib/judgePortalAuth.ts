/**
 * judgePortalAuth — the per-judge credential on a judge device (Gate 8).
 *
 * The owner issues each judge a token `ocj_<32 hex>_<secret>` (backend
 * `app/judge_auth.py`, PR #1704). The judge pastes it here. It is:
 *
 * - kept in `sessionStorage` for this tab only — never `localStorage`, never a
 *   cookie, never logged, never put in a URL;
 * - cleared on sign-out and whenever the backend answers 401;
 * - sent ONLY as `Authorization: Bearer <token>` and ONLY to the judge routes
 *   (`/api/judge-portal/*`) on the exact configured Calyx origin, using the same
 *   parsed-origin gate as the owner bearer transport (`calyxOrigin`, FE #860).
 *   A lookalike host, userinfo trick, other path or other origin never
 *   receives it: the request is refused before `fetch` is called.
 *
 * Judges never use the shared owner key: this transport strips `X-API-Key` and
 * `X-Judge-Id` from every judge request, and sends `credentials: 'omit'` so an
 * owner session cookie in the same browser is not attached either.
 */

import { CALYX_BACKEND_BASE_URL } from './backendConfig';
import { calyxRelativePath } from './calyxOrigin';

export const JUDGE_TOKEN_STORAGE_KEY = 'calyx_judge_bearer_v1';
export const JUDGE_PORTAL_PATH_PREFIX = '/api/judge-portal/';
export const JUDGE_SIGNED_OUT_EVENT = 'oc-judge-signed-out';

/** Shape check only; the backend is the authority on validity. */
const JUDGE_TOKEN_SHAPE = /^ocj_[0-9a-f]{32}_[A-Za-z0-9_-]{32,}$/;

/** Headers a judge request must never carry. */
const FORBIDDEN_JUDGE_HEADERS = ['x-api-key', 'x-judge-id', 'cookie'];

export function isJudgeTokenShape(token: string): boolean {
  return JUDGE_TOKEN_SHAPE.test(token);
}

/**
 * Normalise what a judge pasted (or a keyboard-wedge scanner typed): trims
 * whitespace and an optional leading `Bearer `. Returns null when the result is
 * not shaped like a judge token, so an owner key or anything else is never
 * stored or sent.
 */
export function normalizeJudgeTokenInput(raw: string): string | null {
  let value = (raw || '').trim();
  if (/^bearer\s+/i.test(value)) value = value.replace(/^bearer\s+/i, '').trim();
  return isJudgeTokenShape(value) ? value : null;
}

function sessionStore(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function readJudgeToken(): string | null {
  try {
    const value = sessionStore()?.getItem(JUDGE_TOKEN_STORAGE_KEY) ?? null;
    return value && isJudgeTokenShape(value) ? value : null;
  } catch {
    return null;
  }
}

export function hasJudgeToken(): boolean {
  return readJudgeToken() !== null;
}

/** Store a normalised token for this tab. Returns false if it was refused. */
export function storeJudgeToken(raw: string): boolean {
  const token = normalizeJudgeTokenInput(raw);
  if (!token) return false;
  try {
    const store = sessionStore();
    if (!store) return false;
    store.setItem(JUDGE_TOKEN_STORAGE_KEY, token);
    return true;
  } catch {
    return false;
  }
}

export function clearJudgeToken(reason: 'sign_out' | 'unauthorized' = 'sign_out'): void {
  try {
    sessionStore()?.removeItem(JUDGE_TOKEN_STORAGE_KEY);
  } catch {
    // Non-fatal: nothing else holds the token.
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(JUDGE_SIGNED_OUT_EVENT, { detail: { reason } }));
  }
}

export class JudgeTransportRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JudgeTransportRefusal';
  }
}

/**
 * Whether `url` is a judge-portal route on the exact configured Calyx origin.
 * Anything else — other origins, lookalike hosts, userinfo, other Calyx paths
 * (owner routes) — is refused.
 */
export function isJudgePortalUrl(url: string, calyxBase: string = CALYX_BACKEND_BASE_URL): boolean {
  const path = calyxRelativePath(url, calyxBase);
  return path !== null && path.startsWith(JUDGE_PORTAL_PATH_PREFIX);
}

export function judgePortalUrl(path: string, calyxBase: string = CALYX_BACKEND_BASE_URL): string {
  const suffix = path.replace(/^\/+/, '');
  return `${calyxBase.replace(/\/$/, '')}${JUDGE_PORTAL_PATH_PREFIX}${suffix}`;
}

export type JudgeFetchOptions = {
  method?: 'GET' | 'PUT' | 'POST';
  body?: unknown;
  /** Test seam; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  calyxBase?: string;
};

/**
 * Send one judge request. Throws JudgeTransportRefusal (without calling fetch)
 * when there is no token or the URL is not a judge route on the Calyx origin.
 * A 401 response clears the stored token.
 */
export async function judgeFetch(url: string, options: JudgeFetchOptions = {}): Promise<Response> {
  const calyxBase = options.calyxBase ?? CALYX_BACKEND_BASE_URL;
  if (!isJudgePortalUrl(url, calyxBase)) {
    throw new JudgeTransportRefusal('Refused: judge credentials are only sent to the Calyx judge portal.');
  }
  const token = readJudgeToken();
  if (!token) throw new JudgeTransportRefusal('No judge credential is signed in on this tab.');

  const headers = new Headers({ Accept: 'application/json' });
  let body: string | undefined;
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }
  for (const name of FORBIDDEN_JUDGE_HEADERS) headers.delete(name);
  headers.set('Authorization', `Bearer ${token}`);

  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(url, {
    method: options.method ?? 'GET',
    headers,
    body,
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  });
  if (response.status === 401) clearJudgeToken('unauthorized');
  return response;
}
