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
 * Kept as anchored patterns so a new route under one of these prefixes that
 * the backend does not open to members is not silently widened here beyond
 * the prefixes the owner decision names.
 */
const MEMBER_READ_PATHS: readonly RegExp[] = [
  /^\/api\/research\/traits$/,
  /^\/api\/candidate-knowledge(?:\/[^?#]*)?$/,
  /^\/api\/evidence-aggregation(?:\/[^?#]*)?$/,
  /^\/api\/literature-extraction(?:\/[^?#]*)?$/,
  // Reasoning-ledger reads. Publication routes (`eligible-for-publication`,
  // `/{id}/publications`) belong to the governed publication lane and are not
  // named by the decision, so they are excluded.
  /^\/api\/reasoning-ledgers\/(?!eligible-for-publication$)[^/]+(?:\/(?:history|epistemic-memory|revisions\/[^/]+))?$/,
  /^\/api\/research\/projects\/[^/]+\/reasoning-ledgers$/,
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

/**
 * Why the backend refused a member read.
 *
 * - `session_unverified`: 401 — the token was missing, expired or invalid.
 * - `forbidden`: 403 — the account is known and not permitted.
 * - `member_access_unconfigured`: 503 with the backend's member-auth-not-
 *   configured code — the server has not been given its member-auth settings.
 *   This is a deployment state, distinct from an outage, and saying so is the
 *   honest answer.
 */
export type MemberReadRefusal = "session_unverified" | "forbidden" | "member_access_unconfigured";

export const MEMBER_SESSION_UNVERIFIED_MESSAGE = "Your session could not be verified — sign in again.";
export const MEMBER_FORBIDDEN_MESSAGE = "Access is not permitted for this account.";
export const MEMBER_ACCESS_UNCONFIGURED_MESSAGE = "Member access is not yet configured on the server.";

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

/**
 * Whether an error code says member authentication is not configured on the
 * server — e.g. `member_auth_not_configured` or "Member authentication is not
 * configured". Owner-side configuration errors ("Owner session signing is not
 * configured") are NOT this state and stay an outage.
 */
export function isMemberAuthNotConfigured(code: string | null | undefined): boolean {
  if (!code) return false;
  return /member[\s_-]*(?:auth|access|session)[\s\S]*not[\s_-]*configured/i.test(code);
}

export function memberReadRefusal(status: number | null | undefined, code?: string | null): MemberReadRefusal | null {
  if (status === 401) return "session_unverified";
  if (status === 403) return "forbidden";
  if (status === 503 && isMemberAuthNotConfigured(code)) return "member_access_unconfigured";
  return null;
}
