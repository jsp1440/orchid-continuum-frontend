// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MEMBER_TOKEN = "synthetic-matrix-member-token";
const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";
import { isMatrixMemberRequest, withMatrixMemberAuth } from "@/lib/memberReadAuth";

const base = CALYX_BACKEND_BASE_URL;
const OWNER_BEARER_KEY = "calyx_owner_session_bearer_v1";

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
    ["GET", "/api/matrix-identification/sessions/session-1"],
    ["POST", "/api/matrix-identification/sessions/session-1/observations"],
    ["POST", "/api/matrix-identification/sessions/session-1/evaluate"],
    ["POST", "/api/matrix-identification/sessions/session-1/explain"],
  ])("authorizes %s %s", async (method, path) => {
    const url = `${base}${path}`;
    expect(isMatrixMemberRequest(url, method)).toBe(true);
    const init = await withMatrixMemberAuth(url, { method });
    expect(authorizationOf(init)).toBe(`Bearer ${MEMBER_TOKEN}`);
  });

  it.each([
    ["POST", "/api/matrix-identification/registry"],
    ["GET", "/api/matrix-identification/sessions"],
    ["DELETE", "/api/matrix-identification/sessions/session-1"],
    ["GET", "/api/matrix-identification/sessions/session-1/vision/suggestions"],
    ["POST", "/api/matrix-identification/sessions/session-1/vision/suggestions/s-1/review"],
    ["GET", "/api/vision-lexicon/status"],
    ["GET", "/api/matrix-identification/reports"],
    ["GET", "/api/matrix-identification/readiness"],
    ["GET", "/api/matrix-identification/admin"],
  ])("withholds the member token from %s %s", async (method, path) => {
    const url = `${base}${path}`;
    expect(isMatrixMemberRequest(url, method)).toBe(false);
    const init = await withMatrixMemberAuth(url, { method });
    expect(authorizationOf(init)).toBeNull();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("withholds the token from a lookalike origin", async () => {
    const calyx = new URL(base);
    const url = `${calyx.protocol}//${calyx.host}.attacker.test/api/matrix-identification/registry`;
    expect(isMatrixMemberRequest(url, "GET")).toBe(false);
    expect(authorizationOf(await withMatrixMemberAuth(url))).toBeNull();
  });

  it("preserves explicit authorization and defers to the owner session", async () => {
    const url = `${base}/api/matrix-identification/registry`;
    const explicit = await withMatrixMemberAuth(url, {
      headers: { Authorization: "Bearer caller-owned" },
    });
    expect(authorizationOf(explicit)).toBe("Bearer caller-owned");

    sessionStorage.setItem(OWNER_BEARER_KEY, "owner-bearer");
    const owner = await withMatrixMemberAuth(url);
    expect(authorizationOf(owner)).toBeNull();
  });
});
