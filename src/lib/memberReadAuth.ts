import { CALYX_BACKEND_BASE_URL, hasOwnerBearerSession } from "@/lib/backendConfig";
import { supabase } from "@/lib/supabase";

/**
 * Member read access to the Calyx product endpoints.
 *
 * Owner decision (2026-09-26): "Allow member reads: accept Supabase member
 * sessions on the product endpoints." The backend accepts
 * `Authorization: Bearer <Supabase access token>` from a signed-in member on a
 * bounded set of GET routes, in addition to the owner session / API key.
 * Writes, Speak, Relationship Matrix build and Matrix identification sessions
 * stay owner-only.
 *
 * This module is the ONE place the frontend decides whether a request carries
 * the member's Supabase access token. It is deliberately narrow:
 *
 * - GET only. A write never carries the member token, whatever its path.
 * - The Calyx origin only. The URL is parsed and its origin compared with the
 *   configured Calyx base; a string prefix check would accept
 *   `https://calyx.example.com.attacker.test`. Any other origin gets nothing.
 * - The in-scope paths only (MEMBER_READ_PATHS). Anything else on the Calyx
 *   origin — including owner-only reads — gets nothing.
 * - Never overrides a caller's own Authorization header, and never displaces
 *   an owner bearer session: when the owner transport holds one, the owner
 *   identity is what the request must carry.
 * - The token is read from supabase-js on every request (`getSession`
 *   refreshes an expired session) and is never logged, stored or copied
 *   anywhere by this module.
 *
 * Callers keep `credentials: "include"`, so an owner-session cookie still
 * works exactly as before.
 */

/**
 * Paths, relative to the Calyx base, that accept a member session on GET.
 *
 * The owner narrowed member reads (backend #1643 @ b0c1acbcd, "narrow member
 * scope to fully schema-defined endpoints"). The backend marks exactly four
 * routes `@member_readable`:
 *
 *   GET /api/research/traits
 *   GET /api/literature-extraction/papers        (the list only)
 *   GET /api/evidence-aggregation/health
 *   GET /api/evidence-aggregation/registry
 *
 * This frontend calls only the first two, so only those two are listed here:
 * a path the frontend never requests has no business in the token scope.
 * Everything else — all of candidate-knowledge, every other
 * evidence-aggregation route (aggregates, aggregate detail, conflicts),
 * literature source-binding, paper full text, coverage-audit and every
 * reasoning-ledger read — is owner-only for members and never receives the
 * member token. A refusal there is shown as an owner-only view.
 */
const MEMBER_READ_PATHS: readonly RegExp[] = [
  /^\/api\/research\/traits$/,
  /^\/api\/literature-extraction\/papers$/,
];

function requestMethod(method: string | undefined): string {
  return (method || "GET").toUpperCase();
}

/**
 * Whether a request is an in-scope member read against the configured Calyx
 * origin. Pure: no session is consulted.
 */
export function isMemberReadRequest(
  url: string,
  method?: string,
  calyxBase: string = CALYX_BACKEND_BASE_URL,
): boolean {
  if (requestMethod(method) !== "GET") return false;
  let target: URL;
  let base: URL;
  try {
    base = new URL(calyxBase);
    target = new URL(url);
  } catch {
    // A relative or unparseable URL is not provably the Calyx origin.
    return false;
  }
  if (target.origin !== base.origin) return false;
  if (target.username || target.password) return false;
  const basePath = base.pathname.replace(/\/$/, "");
  if (basePath && !(target.pathname === basePath || target.pathname.startsWith(`${basePath}/`))) {
    return false;
  }
  const relative = target.pathname.slice(basePath.length) || "/";
  return MEMBER_READ_PATHS.some((pattern) => pattern.test(relative));
}

/** The current member access token, or null when signed out / unavailable. */
async function currentMemberAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return typeof token === "string" && token ? token : null;
  } catch {
    // Identity unavailable is "no member session", never a thrown read.
    return null;
  }
}

/**
 * Return `init` with the member's Supabase access token attached when — and
 * only when — `url`/`init.method` is an in-scope member read on the Calyx
 * origin, a member session exists, the caller set no Authorization header and
 * no owner bearer session is held. Otherwise `init` is returned unchanged.
 */
export async function withMemberReadAuth(url: string, init: RequestInit = {}): Promise<RequestInit> {
  if (!isMemberReadRequest(url, init.method)) return init;
  const headers = new Headers(init.headers);
  if (headers.has("Authorization")) return init;
  if (hasOwnerBearerSession()) return init;
  const token = await currentMemberAccessToken();
  if (!token) return init;
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

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
