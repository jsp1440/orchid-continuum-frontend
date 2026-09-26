// @vitest-environment jsdom
/**
 * Ported from #867 (eb059802 "prove exact member bearer scope"), converged
 * into #868's single helper. Differences from #867, on purpose:
 * - session ids are canonical UUIDs (the backend issues uuid4 ids); a
 *   non-UUID id such as "session-1" gets no member token in #868;
 * - #867's `isMatrixMemberRequest` / `withMatrixMemberAuth` are #868's
 *   `isMemberMatrixRequest` / `withMemberAuth` (one decision for every route).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MEMBER_TOKEN = "synthetic-matrix-member-token";
const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";
import { isMemberMatrixRequest, withMemberAuth } from "@/lib/memberReadAuth";

const base = CALYX_BACKEND_BASE_URL;
const OWNER_BEARER_KEY = "calyx_owner_session_bearer_v1";
const SESSION = "0f8e3a52-6c1d-4f7b-9a2e-5d4c3b2a1f00";

function authorizationOf(init: RequestInit): string | null {
  return new Headers(init.headers).get("Authorization");
}

beforeEach(() => {
  sessionStorage.clear();
  mocks.getSession.mockResolvedValue({
    data: { session: { access_token: MEMBER_TOKEN } },
    error: null,
  });
});

afterEach(() => {
  mocks.getSession.mockReset();
  sessionStorage.clear();
});

describe("Matrix member bearer scope", () => {
  it.each([
    ["GET", "/api/matrix-identification/registry"],
    ["GET", "/api/matrix-identification/registry/orchid-core/2026.1"],
    ["POST", "/api/matrix-identification/sessions"],
    ["GET", `/api/matrix-identification/sessions/${SESSION}`],
    ["POST", `/api/matrix-identification/sessions/${SESSION}/observations`],
    ["POST", `/api/matrix-identification/sessions/${SESSION}/evaluate`],
    ["POST", `/api/matrix-identification/sessions/${SESSION}/explain`],
  ])("authorizes %s %s", async (method, path) => {
    const url = `${base}${path}`;
    expect(isMemberMatrixRequest(url, method)).toBe(true);
    const init = await withMemberAuth(url, { method });
    expect(authorizationOf(init)).toBe(`Bearer ${MEMBER_TOKEN}`);
  });

  it.each([
    ["POST", "/api/matrix-identification/registry"],
    ["GET", "/api/matrix-identification/sessions"],
    ["DELETE", `/api/matrix-identification/sessions/${SESSION}`],
    ["GET", `/api/matrix-identification/sessions/${SESSION}/vision/suggestions`],
    ["POST", `/api/matrix-identification/sessions/${SESSION}/vision/suggestions/s-1/review`],
    ["GET", "/api/vision-lexicon/status"],
    ["GET", "/api/matrix-identification/reports"],
    ["GET", "/api/matrix-identification/readiness"],
    ["GET", "/api/matrix-identification/admin"],
    // #868 only: a non-UUID session id is not a member session route.
    ["GET", "/api/matrix-identification/sessions/session-1"],
    ["POST", "/api/matrix-identification/sessions/session-1/evaluate"],
  ])("withholds the member token from %s %s", async (method, path) => {
    const url = `${base}${path}`;
    expect(isMemberMatrixRequest(url, method)).toBe(false);
    const init = await withMemberAuth(url, { method });
    expect(authorizationOf(init)).toBeNull();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("withholds the token from a lookalike origin", async () => {
    const calyx = new URL(base);
    const url = `${calyx.protocol}//${calyx.host}.attacker.test/api/matrix-identification/registry`;
    expect(isMemberMatrixRequest(url, "GET")).toBe(false);
    expect(authorizationOf(await withMemberAuth(url))).toBeNull();
  });

  it("preserves explicit authorization and defers to the owner session", async () => {
    const url = `${base}/api/matrix-identification/registry`;
    const explicit = await withMemberAuth(url, {
      headers: { Authorization: "Bearer caller-owned" },
    });
    expect(authorizationOf(explicit)).toBe("Bearer caller-owned");

    sessionStorage.setItem(OWNER_BEARER_KEY, "owner-bearer");
    const owner = await withMemberAuth(url);
    expect(authorizationOf(owner)).toBeNull();
  });
});
