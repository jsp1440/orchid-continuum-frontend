/**
 * backendConfig — THE single source of truth for every Orchid Continuum backend
 * origin the frontend talks to.
 */

const env = import.meta.env as Record<string, string | undefined>;

export const BACKEND_BASE_URL = (
  env.VITE_BACKEND_BASE_URL ||
  env.VITE_API_BASE_URL ||
  'https://orchid-continuum-public-api.onrender.com'
).replace(/\/$/, '');

/**
 * Canonical Calyx backend origin for University, Mission Control, and reviewer traffic.
 * VITE_CALYX_API_URL is the deployment contract documented for Orchid University.
 * Older aliases remain supported for backward-compatible deployments.
 */
export const CALYX_BACKEND_BASE_URL = (
  env.VITE_CALYX_API_URL ||
  env.VITE_CALYX_BACKEND_BASE_URL ||
  env.VITE_MISSION_CONTROL_BACKEND_URL ||
  'https://orchid-calyx-backend.onrender.com'
).replace(/\/$/, '');

export const KNOWLEDGE_GRAPH_ENABLED =
  (env.VITE_ENABLE_KNOWLEDGE_GRAPH || '').trim().toLowerCase() === 'true';

const OWNER_SESSION_STORAGE_KEY = 'calyx_owner_session_bearer_v1';
const OWNER_SESSION_PATH = '/api/mission-control/owner/session';
const OWNER_TOKEN_SESSION_PATH = '/api/mission-control/owner/session-token';
const OWNER_TOKEN_REFRESH_PATH = '/api/mission-control/owner/session-token/refresh';

type OwnerTokenResponse = { token?: unknown };

type OwnerAuthFailurePayload = {
  detail?: unknown;
  message?: unknown;
  reason?: unknown;
};

function readOwnerBearerToken(): string | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(OWNER_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeOwnerBearerToken(token: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(OWNER_SESSION_STORAGE_KEY, token);
  } catch {
    // The HttpOnly cookie remains available in browsers that permit it.
  }
}

function clearOwnerBearerToken(): void {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(OWNER_SESSION_STORAGE_KEY);
  } catch {
    // Non-fatal.
  }
}

function ownerAuthFailureMessage(payload: OwnerAuthFailurePayload | null, status: number): string {
  const detail = payload?.detail ?? payload?.message ?? payload?.reason;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  return `Calyx backend rejected the owner session (${status}).`;
}

async function showOwnerAuthFailure(response: Response): Promise<void> {
  let payload: OwnerAuthFailurePayload | null = null;
  try {
    payload = await response.clone().json() as OwnerAuthFailurePayload;
  } catch {
    // Fall back to the status-based message below.
  }
  const message = ownerAuthFailureMessage(payload, response.status);
  window.dispatchEvent(new CustomEvent('oc-owner-auth-failure', { detail: { message, status: response.status } }));
  // Mission Control historically swallowed the locked-screen error state. Keep
  // owner authentication fail-closed, but make the failure impossible to miss
  // on Safari/iPad while the locked-screen component is being simplified.
  window.alert(`Mission Control sign-in failed:\n\n${message}`);
}

async function refreshOwnerBearerFromCookie(
  nativeFetch: typeof window.fetch,
): Promise<string | null> {
  try {
    const response = await nativeFetch(
      `${CALYX_BACKEND_BASE_URL}${OWNER_TOKEN_REFRESH_PATH}`,
      {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      },
    );
    if (!response.ok) return null;
    const payload = await response.json() as OwnerTokenResponse;
    if (typeof payload.token !== 'string' || !payload.token || payload.token === 'cookie') return null;
    storeOwnerBearerToken(payload.token);
    return payload.token;
  } catch {
    return null;
  }
}

/**
 * Install one owner-auth transport for every Calyx request.
 *
 * Mission Control creates one signed owner session. The same session is reused
 * automatically by taxonomy, runtime, harvester, governance, and other owner
 * tools. When Safari sends the valid cookie for reads but drops it on a later
 * cross-site POST/multipart request, the transport converts that same session
 * to a same-tab bearer and retries once. No second login is required.
 */
function installOwnerSessionTransport(): void {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  const marker = '__calyxOwnerSessionTransportInstalled';
  const markedWindow = window as Window & Record<string, unknown>;
  if (markedWindow[marker]) return;
  markedWindow[marker] = true;

  const nativeFetch = window.fetch.bind(window);
  let ownerLoginAttemptInProgress = false;

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const originalUrl = input instanceof Request ? input.url : String(input);
    const originalMethod = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const isCalyxRequest = originalUrl.startsWith(CALYX_BACKEND_BASE_URL);
    const originalPath = isCalyxRequest ? originalUrl.slice(CALYX_BACKEND_BASE_URL.length).split('?')[0] : '';
    const isOwnerLogin = isCalyxRequest && originalPath === OWNER_SESSION_PATH && originalMethod === 'POST';
    const isOwnerSessionInspection = isCalyxRequest && originalPath === OWNER_SESSION_PATH && originalMethod === 'GET';
    const isOwnerLogout = isCalyxRequest && originalPath === OWNER_SESSION_PATH && originalMethod === 'DELETE';
    const isTokenRefresh = isCalyxRequest && originalPath === OWNER_TOKEN_REFRESH_PATH;

    let requestInput: RequestInfo | URL = input;
    if (isOwnerLogin) {
      ownerLoginAttemptInProgress = true;
      requestInput = `${CALYX_BACKEND_BASE_URL}${OWNER_TOKEN_SESSION_PATH}`;
    }

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));

    const existingBearer = readOwnerBearerToken();
    if (isCalyxRequest && existingBearer && !isOwnerLogin && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${existingBearer}`);
    }

    // Only Calyx (first-party, cookie-based owner session) requests should
    // default to sending credentials. Forcing 'include' on every fetch —
    // including third-party/public reads like iNaturalist, Supabase, and the
    // harvester — breaks CORS for any of them that (correctly) serve a
    // wildcard Access-Control-Allow-Origin, which the Fetch spec forbids
    // combining with credentialed requests.
    const credentials = init.credentials ?? (isCalyxRequest ? 'include' : 'same-origin');
    let response = await nativeFetch(requestInput, { ...init, headers, credentials });

    if (isOwnerLogin && !response.ok) {
      ownerLoginAttemptInProgress = false;
      await showOwnerAuthFailure(response);
    }

    if (isOwnerLogin && response.ok) {
      try {
        const payload = await response.clone().json() as OwnerTokenResponse;
        if (typeof payload.token === 'string' && payload.token && payload.token !== 'cookie') {
          storeOwnerBearerToken(payload.token);
        }
      } catch {
        // The follow-up owner-session inspection will fail closed.
      }
    }

    const shouldRecoverExistingSession =
      isCalyxRequest &&
      response.status === 401 &&
      !isOwnerLogin &&
      !isOwnerLogout &&
      !isTokenRefresh &&
      !headers.has('Authorization');

    if (shouldRecoverExistingSession) {
      const recoveredBearer = await refreshOwnerBearerFromCookie(nativeFetch);
      if (recoveredBearer) {
        const retryHeaders = new Headers(headers);
        retryHeaders.set('Authorization', `Bearer ${recoveredBearer}`);
        response = await nativeFetch(requestInput, {
          ...init,
          headers: retryHeaders,
          credentials: init.credentials ?? 'include',
        });
      }
    }

    if (isOwnerSessionInspection && ownerLoginAttemptInProgress) {
      ownerLoginAttemptInProgress = false;
      if (!response.ok) await showOwnerAuthFailure(response);
    }

    if (isOwnerLogout) {
      ownerLoginAttemptInProgress = false;
      clearOwnerBearerToken();
    }
    return response;
  };
}

installOwnerSessionTransport();

export const IMAGES_BACKEND_BASE_URL = (
  env.VITE_IMAGES_BACKEND_BASE_URL ||
  env.VITE_IMAGE_BACKEND_BASE_URL ||
  'https://orchidcontinuumharvester2.onrender.com'
).replace(/\/$/, '');

export const LEGACY_ONRENDER_BASE_URL = (
  env.VITE_LEGACY_ONRENDER_BASE_URL ||
  'https://orchidcontinuum.onrender.com'
).replace(/\/$/, '');

export const ECUADOR_EMBED_BASE_URL = (
  env.VITE_ECUADOR_EMBED_BASE_URL ||
  env.VITE_ECUADOR_EXPEDITION_EMBED_URL ||
  'https://orchid-continuum-ecuador-expedition.onrender.com'
).replace(/\/$/, '');

export const ATLAS_OCCURRENCES_URL = `${BACKEND_BASE_URL}/atlas/occurrences`;
export const ATLAS_OCCURRENCES_PROBE_URL = `${BACKEND_BASE_URL}/api/atlas/occurrences?limit=1`;
