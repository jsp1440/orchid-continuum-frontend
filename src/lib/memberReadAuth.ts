import { CALYX_BACKEND_BASE_URL, hasOwnerBearerSession } from "@/lib/backendConfig";
import { calyxRelativePath } from "@/lib/calyxOrigin";

/**
 * Member access to the Calyx product endpoints: which requests may carry a
 * signed-in member's Supabase access token.
 *
 * (The file keeps its original name, from when every member route was a read;
 * it now also covers the Matrix identification session writes below.)
 *
 * Owner decisions (2026-09-26):
 *  1. "Allow member reads: accept Supabase member sessions on the product
 *     endpoints" (narrowed in backend #1643 @ b0c1acbcd).
 *  2. Release 1 journey 4: Matrix identification is available to signed-in
 *     members, and an identification session is private to the account that
 *     created it (backend #1647, merged at 92e381c). A member may list the
 *     registry, read one registry version's character definitions, create a
 *     session, read their own session, and add observations to / evaluate /
 *     request the deterministic explanation of their own session.
 *
 *  3. Release 1 ledger: "Members submit, owner reviews". A signed-in member may
 *     register the snapshot they saw, submit evidence feedback on it, and read
 *     the status of their OWN case (backend `@member_writable` /
 *     `@member_readable` under `owner_or_member_write`, kill switch
 *     OC_MEMBER_FEEDBACK_ENABLED). Accept-trivial and the whole owner review
 *     queue stay owner-only.
 *
 * Everything else stays owner-only for members: other writes, Speak, the
 * Relationship Matrix build, and every other Matrix identification route
 * (Vision, reports, persistence, /contract, stateless /evaluate, registry
 * create / derive / concept-mapping-status / evaluate).
 *
 * This module is the ONE place the frontend decides whether a request carries
 * the member's Supabase access token. It is deliberately narrow and
 * default-deny:
 *
 * - Exact method + path pairs only (MEMBER_ROUTES). The method must match
 *   exactly (a POST to a GET-only path, or a GET to a POST-only path, gets
 *   nothing), and each path is an anchored pattern.
 * - Identifier segments are matched safely: a session id must be a canonical
 *   UUID (the backend addresses member sessions by UUID only, which also keeps
 *   `sessions/persistence-status` out of scope); a registry id / version is a
 *   single segment with no '/', no '.'/'..' segment and no encoded '/', '\',
 *   '.', '%' or NUL.
 * - The Calyx origin only. The URL is parsed and its origin compared with the
 *   configured Calyx base (calyxOrigin); a string prefix check would accept
 *   `https://calyx.example.com.attacker.test`. Any other origin gets nothing.
 * - Never overrides a caller's own Authorization header, and never displaces
 *   an owner bearer session: when the owner transport holds one, the owner
 *   identity is what the request must carry.
 * - The token is read from supabase-js on every request (`getSession`
 *   refreshes an expired session) and is never logged, stored or copied
 *   anywhere by this module.
 *
 * Callers keep `credentials: "include"`, so an owner-session cookie still
 * works exactly as before (the backend prefers a valid owner cookie over a
 * member bearer).
 */

/** Which member-access decision a route belongs to. */
export type MemberScope = "read" | "matrix" | "feedback";

type MemberRoute = { method: "GET" | "POST"; pattern: RegExp; scope: MemberScope };

/** A canonical UUID: the only way a member addresses a Matrix session. */
const UUID_SEGMENT = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

/**
 * One path segment for a registry id or version, as `encodeURIComponent`
 * produces it: unreserved characters and percent-escapes, never a '.' or '..'
 * segment, and never an escape for '/', '\', '.', '%' or NUL (so no encoded
 * traversal or double encoding).
 */
const SAFE_SEGMENT =
  "(?!\\.{1,2}(?:/|$))(?:[A-Za-z0-9_.~!*'()-]|%(?!2[Ff]|5[Cc]|2[Ee]|25|00)[0-9A-Fa-f]{2})+";

const MATRIX = "/api/matrix-identification";

const FEEDBACK = "/api/evidence-feedback";

/**
 * A backend evidence-feedback case id: `efc-` plus 24 lowercase hex digits
 * (the first 24 of the case fingerprint). Anything else — `review`, a
 * sub-path, an encoded separator — is not a member case.
 */
const FEEDBACK_CASE_ID = "efc-[0-9a-f]{24}";

/**
 * Method + path pairs, relative to the Calyx base, that accept a member
 * session. Default-deny: a request matching none of these never carries the
 * member token.
 *
 * Reads (backend #1643 @ b0c1acbcd marks four GETs `@member_readable`; this
 * frontend calls only the first two, so only those two are listed):
 *
 *   GET /api/research/traits
 *   GET /api/literature-extraction/papers        (the list only)
 *
 * Matrix identification (backend #1647 `@matrix_member_route`, own sessions):
 *
 *   GET  /api/matrix-identification/registry
 *   GET  /api/matrix-identification/registry/{registry_id}/{version}
 *   POST /api/matrix-identification/sessions
 *   GET  /api/matrix-identification/sessions/{session_id}
 *   POST /api/matrix-identification/sessions/{session_id}/observations
 *   POST /api/matrix-identification/sessions/{session_id}/evaluate
 *   POST /api/matrix-identification/sessions/{session_id}/explain
 *
 * Evidence feedback (Release 1 "Members submit, owner reviews"):
 *
 *   POST /api/evidence-feedback/objects
 *   POST /api/evidence-feedback/cases
 *   GET  /api/evidence-feedback/cases/{case_id}      (efc-<24 hex> only)
 *
 * Everything else — all of candidate-knowledge, every other
 * evidence-aggregation route, literature source-binding, paper full text,
 * coverage-audit, every reasoning-ledger read, and every other Matrix route —
 * is owner-only for members and never receives the member token. A refusal
 * there is shown as an owner-only view.
 */
const MEMBER_ROUTES: readonly MemberRoute[] = [
  { method: "GET", pattern: /^\/api\/research\/traits$/, scope: "read" },
  { method: "GET", pattern: /^\/api\/literature-extraction\/papers$/, scope: "read" },
  { method: "GET", pattern: new RegExp(`^${MATRIX}/registry$`), scope: "matrix" },
  { method: "GET", pattern: new RegExp(`^${MATRIX}/registry/${SAFE_SEGMENT}/${SAFE_SEGMENT}$`), scope: "matrix" },
  { method: "POST", pattern: new RegExp(`^${MATRIX}/sessions$`), scope: "matrix" },
  { method: "GET", pattern: new RegExp(`^${MATRIX}/sessions/${UUID_SEGMENT}$`), scope: "matrix" },
  {
    method: "POST",
    pattern: new RegExp(`^${MATRIX}/sessions/${UUID_SEGMENT}/(?:observations|evaluate|explain)$`),
    scope: "matrix",
  },
  { method: "POST", pattern: new RegExp(`^${FEEDBACK}/objects$`), scope: "feedback" },
  { method: "POST", pattern: new RegExp(`^${FEEDBACK}/cases$`), scope: "feedback" },
  { method: "GET", pattern: new RegExp(`^${FEEDBACK}/cases/${FEEDBACK_CASE_ID}$`), scope: "feedback" },
];

function requestMethod(method: string | undefined): string {
  return (method || "GET").toUpperCase();
}

/**
 * The member scope of a request against the configured Calyx origin, or null
 * when the member token must not be sent. Pure: no session is consulted.
 */
export function memberScopeOf(
  url: string,
  method?: string,
  calyxBase: string = CALYX_BACKEND_BASE_URL,
): MemberScope | null {
  // Shared exact-origin check (calyxOrigin): same scheme/host/port, no
  // userinfo, under the base path on a segment boundary; relative or
  // unparseable URLs are not provably the Calyx origin. The query string is
  // never part of the matched path.
  const relative = calyxRelativePath(url, calyxBase);
  if (relative === null) return null;
  const verb = requestMethod(method);
  const route = MEMBER_ROUTES.find((item) => item.method === verb && item.pattern.test(relative));
  return route ? route.scope : null;
}

/** Whether a request is one of the two in-scope member READS (#858). */
export function isMemberReadRequest(
  url: string,
  method?: string,
  calyxBase: string = CALYX_BACKEND_BASE_URL,
): boolean {
  return memberScopeOf(url, method, calyxBase) === "read";
}

/** Whether a request is one of the member Matrix identification pairs (R1 J4). */
export function isMemberMatrixRequest(
  url: string,
  method?: string,
  calyxBase: string = CALYX_BACKEND_BASE_URL,
): boolean {
  return memberScopeOf(url, method, calyxBase) === "matrix";
}

/** Whether a request is one of the member evidence-feedback pairs (R1 J12). */
export function isMemberFeedbackRequest(
  url: string,
  method?: string,
  calyxBase: string = CALYX_BACKEND_BASE_URL,
): boolean {
  return memberScopeOf(url, method, calyxBase) === "feedback";
}

/** Whether a request may carry the member token at all (any member scope). */
export function isMemberScopedRequest(
  url: string,
  method?: string,
  calyxBase: string = CALYX_BACKEND_BASE_URL,
): boolean {
  return memberScopeOf(url, method, calyxBase) !== null;
}

type SupabaseModule = typeof import("@/lib/supabase");
let supabaseLoaded: SupabaseModule | null = null;
let supabaseLoading: Promise<SupabaseModule> | null = null;
function loadSupabase(): Promise<SupabaseModule> {
  // One import per page; a failed import is retried on the next request.
  supabaseLoading ??= import("@/lib/supabase").then(
    (module) => (supabaseLoaded = module),
    (error) => {
      supabaseLoading = null;
      throw error;
    },
  );
  return supabaseLoading;
}
// In a browser, start loading at module load exactly as the former static
// import did (AuthContext imports the same module statically, so this adds no
// chunk or request), so the first member request keeps its timing. Node never
// starts it.
if (typeof window !== "undefined") void loadSupabase().catch(() => undefined);

/** The current member access token, or null when signed out / unavailable. */
async function currentMemberAccessToken(): Promise<string | null> {
  // A member session only exists in a browser (supabase-js keeps it in
  // localStorage). Node-side validation imports this module through the
  // Matrix / Research clients; it must not construct the Supabase client
  // (whose Realtime transport needs a native WebSocket) just by importing
  // them, nor when it decides there is no member session. Hence the browser
  // check and the lazy import — adopted from #867 (cfe2a7bf / ad63bb78),
  // moved here so every importer of this helper is covered, not only Matrix.
  if (typeof window === "undefined") return null;
  try {
    const { supabase } = supabaseLoaded ?? await loadSupabase();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return typeof token === "string" && token ? token : null;
  } catch {
    // Identity unavailable is "no member session", never a thrown request.
    return null;
  }
}

/**
 * Return `init` with the member's Supabase access token attached when — and
 * only when — `url`/`init.method` is an in-scope member pair on the Calyx
 * origin (see MEMBER_ROUTES), a member session exists, the caller set no
 * Authorization header and no owner bearer session is held. Otherwise `init`
 * is returned unchanged (the same object).
 */
export async function withMemberAuth(url: string, init: RequestInit = {}): Promise<RequestInit> {
  if (!isMemberScopedRequest(url, init.method)) return init;
  const headers = new Headers(init.headers);
  if (headers.has("Authorization")) return init;
  if (hasOwnerBearerSession()) return init;
  const token = await currentMemberAccessToken();
  if (!token) return init;
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

/**
 * The #858 name for `withMemberAuth`, kept for the read clients and their
 * tests. It is the same single decision: a request outside MEMBER_ROUTES gets
 * nothing, whichever name is used.
 */
export const withMemberReadAuth = withMemberAuth;

/* ------------------------------------------------------------------------ */
/* Refusal states                                                           */
/* ------------------------------------------------------------------------ */

/** Exact error codes from the backend member-read contract (backend #1643). */
export const MEMBER_AUTH_CODES = {
  notConfigured: "MEMBER_AUTH_NOT_CONFIGURED",
  unavailable: "MEMBER_AUTH_UNAVAILABLE",
  invalidToken: "INVALID_MEMBER_TOKEN",
  ownerAccessRequired: "OWNER_ACCESS_REQUIRED",
} as const;

/**
 * Why the backend refused a read.
 *
 * - `session_unverified`: 401 on a member read — the token was missing,
 *   expired or invalid (`INVALID_MEMBER_TOKEN`). Signing in again helps.
 * - `forbidden`: 403 on a member read without a more specific code.
 * - `owner_only`: 403 `OWNER_ACCESS_REQUIRED` — a verified member reached an
 *   owner-only view — or any 401/403 on a read that is owner-only for members
 *   (the member token is never sent there, so a plain 401 is about the view,
 *   not the session). Signing in again does NOT help, and the copy says so.
 * - `member_access_unconfigured`: 503 `MEMBER_AUTH_NOT_CONFIGURED` — the server
 *   has not been given its member-auth settings. A deployment state, not an
 *   outage; a retry cannot change it.
 * - `member_auth_unavailable`: 503 `MEMBER_AUTH_UNAVAILABLE` — the identity
 *   provider could not be reached to verify the session. Transient; retryable.
 */
export type MemberReadRefusal =
  | "session_unverified"
  | "forbidden"
  | "owner_only"
  | "member_access_unconfigured"
  | "member_auth_unavailable";

export const MEMBER_SESSION_UNVERIFIED_MESSAGE = "Your session could not be verified — sign in again.";
export const MEMBER_FORBIDDEN_MESSAGE = "Access is not permitted for this account.";
export const MEMBER_ACCESS_UNCONFIGURED_MESSAGE = "Member access is not yet configured on the server.";
export const MEMBER_AUTH_UNAVAILABLE_MESSAGE = "Member verification is temporarily unavailable — try again.";
export const OWNER_ONLY_MESSAGE = "This view is limited to owner access.";
export const OWNER_ONLY_PAPER_MESSAGE =
  "This view is limited to owner access — full paper text can be restricted by its licence.";

/** Whether a refusal can change on a retry without the reader doing anything. */
export function isRetryableRefusal(refusal: MemberReadRefusal | null): boolean {
  return refusal === "member_auth_unavailable";
}

/**
 * The error code carried by a FastAPI error body: `detail` when it is a
 * string, `detail.code` when it is an object, or a top-level `code`.
 */
export function errorCodeOf(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    const code = (detail as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  const code = (payload as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

/** 503 codes that are member-auth states rather than outages. */
export function memberAuthServiceRefusal(
  status: number | null | undefined,
  code: string | null | undefined,
): "member_access_unconfigured" | "member_auth_unavailable" | null {
  if (status !== 503) return null;
  if (code === MEMBER_AUTH_CODES.notConfigured) return "member_access_unconfigured";
  if (code === MEMBER_AUTH_CODES.unavailable) return "member_auth_unavailable";
  return null;
}

/**
 * Classify a refusal. `memberScoped` says whether the request was a member
 * read (see `isMemberReadRequest`); for a read that is owner-only for members
 * any 401/403 is `owner_only`, because no member session was offered there.
 * Returns null for anything that is not a refusal (an outage stays an outage).
 */
export function memberReadRefusal(
  status: number | null | undefined,
  code?: string | null,
  options: { memberScoped?: boolean } = {},
): MemberReadRefusal | null {
  const memberScoped = options.memberScoped ?? true;
  const service = memberAuthServiceRefusal(status, code);
  if (service) return service;
  if (status === 403 && code === MEMBER_AUTH_CODES.ownerAccessRequired) return "owner_only";
  if (!memberScoped && (status === 401 || status === 403)) return "owner_only";
  if (status === 401) return "session_unverified";
  if (status === 403) return "forbidden";
  return null;
}

export const REFUSAL_MESSAGE: Record<MemberReadRefusal, string> = {
  session_unverified: MEMBER_SESSION_UNVERIFIED_MESSAGE,
  forbidden: MEMBER_FORBIDDEN_MESSAGE,
  owner_only: OWNER_ONLY_MESSAGE,
  member_access_unconfigured: MEMBER_ACCESS_UNCONFIGURED_MESSAGE,
  member_auth_unavailable: MEMBER_AUTH_UNAVAILABLE_MESSAGE,
};
