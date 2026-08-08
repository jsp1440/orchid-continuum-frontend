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
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const originalUrl = input instanceof Request ? input.url : String(input);
    const originalMethod = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const isCalyxRequest = originalUrl.startsWith(CALYX_BACKEND_BASE_URL);
    const originalPath = isCalyxRequest ? originalUrl.slice(CALYX_BACKEND_BASE_URL.length).split('?')[0] : '';
    const isOwnerLogin = isCalyxRequest && originalPath === OWNER_SESSION_PATH && originalMethod === 'POST';
    const isOwnerLogout = isCalyxRequest && originalPath === OWNER_SESSION_PATH && originalMethod === 'DELETE';
    const isTokenRefresh = isCalyxRequest && originalPath === OWNER_TOKEN_REFRESH_PATH;

    let requestInput: RequestInfo | URL = input;
    if (isOwnerLogin) requestInput = `${CALYX_BACKEND_BASE_URL}${OWNER_TOKEN_SESSION_PATH}`;

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));

    const existingBearer = readOwnerBearerToken();
    if (isCalyxRequest && existingBearer && !isOwnerLogin && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${existingBearer}`);
    }

    let response = await nativeFetch(requestInput, { ...init, headers, credentials: init.credentials ?? 'include' });

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

    if (isOwnerLogout) clearOwnerBearerToken();
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
