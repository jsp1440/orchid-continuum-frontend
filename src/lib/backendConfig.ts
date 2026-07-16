/**
 * backendConfig — THE single source of truth for every Orchid Continuum backend
 * origin the frontend talks to.
 *
 * CURRENT PRODUCTION HOSTS
 *
 *   API / Species / Atlas:
 *   https://orchid-continuum-public-api.onrender.com
 *
 *   Calyx Backend / Mission Control:
 *   https://orchid-calyx-backend.onrender.com
 *
 *   Images:
 *   https://orchidcontinuumharvester2.onrender.com
 *
 * Legacy:
 *   https://orchidcontinuum.onrender.com
 */

const env = import.meta.env as Record<string, string | undefined>;

/**
 * Canonical Orchid Continuum Public API
 *
 * Serves:
 * - species search
 * - species detail
 * - atlas
 * - diagnostics
 * - campaign statistics
 */
export const BACKEND_BASE_URL = (
  env.VITE_BACKEND_BASE_URL ||
  env.VITE_API_BASE_URL ||
  'https://orchid-continuum-public-api.onrender.com'
).replace(/\/$/, '');

/**
 * Calyx backend
 *
 * Serves:
 * - runner health
 * - connector health
 * - runtime summary
 * - mission-control operational telemetry
 */
export const CALYX_BACKEND_BASE_URL = (
  env.VITE_CALYX_BACKEND_BASE_URL ||
  env.VITE_MISSION_CONTROL_BACKEND_URL ||
  'https://orchid-calyx-backend.onrender.com'
).replace(/\/$/, '');

/**
 * BUILD-069 public Knowledge Graph consumer gate.
 *
 * The panel stays absent unless explicitly enabled at build time. This keeps
 * publication and deployment decisions outside the implementation branch.
 */
export const KNOWLEDGE_GRAPH_ENABLED =
  (env.VITE_ENABLE_KNOWLEDGE_GRAPH || '').trim().toLowerCase() === 'true';

const OWNER_SESSION_STORAGE_KEY = 'calyx_owner_session_bearer_v1';
const OWNER_SESSION_PATH = '/api/mission-control/owner/session';
const OWNER_TOKEN_SESSION_PATH = '/api/mission-control/owner/session-token';

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

/**
 * Safari and other privacy-focused browsers may block the Calyx backend's
 * cross-site HttpOnly cookie. Install a narrow fetch transport shim that uses
 * the backend's signed session token as a same-tab Bearer fallback.
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

    let requestInput: RequestInfo | URL = input;
    if (isOwnerLogin) {
      requestInput = `${CALYX_BACKEND_BASE_URL}${OWNER_TOKEN_SESSION_PATH}`;
    }

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));

    const bearer = readOwnerBearerToken();
    if (isCalyxRequest && bearer && !isOwnerLogin && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${bearer}`);
    }

    const response = await nativeFetch(requestInput, { ...init, headers });

    if (isOwnerLogin && response.ok) {
      try {
        const payload = await response.clone().json() as OwnerTokenResponse;
        if (typeof payload.token === 'string' && payload.token && payload.token !== 'cookie') {
          storeOwnerBearerToken(payload.token);
        }
      } catch {
        // createOwnerSession will reject the follow-up inspection if no valid transport exists.
      }
    }

    if (isOwnerLogout) clearOwnerBearerToken();
    return response;
  };
}

installOwnerSessionTransport();

/**
 * Image backend
 *
 * Genus images are currently served by the harvester image backend:
 *   GET /images/genus/{genus}
 *
 * Do not point this at the public API unless that endpoint has been migrated.
 */
export const IMAGES_BACKEND_BASE_URL = (
  env.VITE_IMAGES_BACKEND_BASE_URL ||
  env.VITE_IMAGE_BACKEND_BASE_URL ||
  'https://orchidcontinuumharvester2.onrender.com'
).replace(/\/$/, '');

/**
 * Legacy backend
 *
 * Retained only for endpoints that have not yet been migrated.
 */
export const LEGACY_ONRENDER_BASE_URL = (
  env.VITE_LEGACY_ONRENDER_BASE_URL ||
  'https://orchidcontinuum.onrender.com'
).replace(/\/$/, '');

/**
 * Ecuador expedition embedded application.
 */
export const ECUADOR_EMBED_BASE_URL = (
  env.VITE_ECUADOR_EMBED_BASE_URL ||
  env.VITE_ECUADOR_EXPEDITION_EMBED_URL ||
  'https://orchid-continuum-ecuador-expedition.onrender.com'
).replace(/\/$/, '');

/**
 * Atlas occurrences endpoint.
 */
export const ATLAS_OCCURRENCES_URL =
  `${BACKEND_BASE_URL}/atlas/occurrences`;

/**
 * Atlas health probe.
 */
export const ATLAS_OCCURRENCES_PROBE_URL =
  `${BACKEND_BASE_URL}/api/atlas/occurrences?limit=1`;
