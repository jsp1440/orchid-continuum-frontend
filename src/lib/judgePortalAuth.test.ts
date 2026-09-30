// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import captured from "@/lib/__fixtures__/judgePortal.realBackend.json";
import {
  JUDGE_SIGNED_OUT_EVENT,
  JUDGE_TOKEN_STORAGE_KEY,
  JudgeTransportRefusal,
  clearJudgeToken,
  isJudgePortalUrl,
  judgeFetch,
  normalizeJudgeTokenInput,
  readJudgeToken,
  storeJudgeToken,
} from "@/lib/judgePortalAuth";

/**
 * The judge credential on a judge device: where it is kept, where it may be
 * sent, and what a judge request carries. Tokens are the REAL ones minted by
 * backend PR #1704 in a throwaway in-memory capture (see the fixture's
 * `_capture`); they authenticate nothing on any deployed backend.
 */

type Captured = { status: number; body: unknown };
const C = captured as unknown as Record<string, Captured>;
const TOKEN = (C.owner_issue_credential.body as { token: string }).token;
const BASE = "https://calyx.example";

function okResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("judge token shape", () => {
  it("accepts the backend's token format, with or without a Bearer prefix", () => {
    expect(TOKEN).toMatch(/^ocj_[0-9a-f]{32}_/);
    expect(normalizeJudgeTokenInput(`  ${TOKEN}\n`)).toBe(TOKEN);
    expect(normalizeJudgeTokenInput(`Bearer ${TOKEN}`)).toBe(TOKEN);
  });

  it("refuses anything that is not a judge token, including owner-style credentials", () => {
    for (const value of [
      "",
      "ocj_",
      "show-day-test-key", // an owner API key shape
      "eyJvd25lciI.abc123", // an owner session token shape (contains a dot)
      `${TOKEN}.x`,
      TOKEN.replace("ocj_", "ocx_"),
      "ocj_" + "Z".repeat(32) + "_" + "x".repeat(43),
    ]) {
      expect(normalizeJudgeTokenInput(value), value).toBeNull();
      expect(storeJudgeToken(value), value).toBe(false);
    }
    expect(sessionStorage.length).toBe(0);
  });
});

describe("judge token storage", () => {
  it("keeps the token in sessionStorage only — never localStorage or a cookie", () => {
    expect(storeJudgeToken(TOKEN)).toBe(true);
    expect(sessionStorage.getItem(JUDGE_TOKEN_STORAGE_KEY)).toBe(TOKEN);
    expect(readJudgeToken()).toBe(TOKEN);
    expect(localStorage.length).toBe(0);
    for (let i = 0; i < localStorage.length; i += 1) {
      expect(localStorage.getItem(localStorage.key(i)!)).not.toContain(TOKEN);
    }
    expect(document.cookie).not.toContain(TOKEN);
  });

  it("sign-out clears the token and announces it", () => {
    storeJudgeToken(TOKEN);
    const seen: unknown[] = [];
    const listener = (event: Event) => seen.push((event as CustomEvent).detail);
    window.addEventListener(JUDGE_SIGNED_OUT_EVENT, listener);
    clearJudgeToken("sign_out");
    window.removeEventListener(JUDGE_SIGNED_OUT_EVENT, listener);
    expect(readJudgeToken()).toBeNull();
    expect(sessionStorage.getItem(JUDGE_TOKEN_STORAGE_KEY)).toBeNull();
    expect(seen).toEqual([{ reason: "sign_out" }]);
  });

  it("ignores a stored value that is not a judge token", () => {
    sessionStorage.setItem(JUDGE_TOKEN_STORAGE_KEY, "show-day-test-key");
    expect(readJudgeToken()).toBeNull();
  });
});

describe("judge transport: exact Calyx origin, judge routes only", () => {
  const refused = [
    "https://attacker.test/api/judge-portal/me",
    "https://calyx.example.attacker.test/api/judge-portal/me",
    "https://calyx.example@attacker.test/api/judge-portal/me",
    "https://user:pw@calyx.example/api/judge-portal/me",
    "http://calyx.example/api/judge-portal/me",
    "https://calyx.example:8443/api/judge-portal/me",
    "//calyx.example/api/judge-portal/me",
    "/api/judge-portal/me",
    // Calyx origin, but not a judge route: owner routes never receive a judge token.
    "https://calyx.example/api/judges/x/credentials",
    "https://calyx.example/api/judging/judge-audit",
    "https://calyx.example/api/judge/scorecards/x",
    "https://calyx.example/api/judge-portalx/me",
    "https://calyx.example/api/judge-portal",
  ];

  it.each(refused)("never sends the token to %s", async (url) => {
    storeJudgeToken(TOKEN);
    const fetchImpl = vi.fn(async () => okResponse({}));
    expect(isJudgePortalUrl(url, BASE)).toBe(false);
    await expect(judgeFetch(url, { fetchImpl, calyxBase: BASE })).rejects.toBeInstanceOf(JudgeTransportRefusal);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends only Authorization: Bearer to the judge route, with no owner key, no X-Judge-Id and no cookies", async () => {
    storeJudgeToken(TOKEN);
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => okResponse(C.judge_me.body));
    const response = await judgeFetch(`${BASE}/api/judge-portal/me`, { fetchImpl, calyxBase: BASE });
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BASE}/api/judge-portal/me`);
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.has("X-API-Key")).toBe(false);
    expect(headers.has("X-Judge-Id")).toBe(false);
    expect(headers.has("Cookie")).toBe(false);
    expect(init?.credentials).toBe("omit");
    expect(String(url)).not.toContain(TOKEN);
  });

  it("refuses to send anything when no judge is signed in", async () => {
    const fetchImpl = vi.fn(async () => okResponse({}));
    await expect(judgeFetch(`${BASE}/api/judge-portal/me`, { fetchImpl, calyxBase: BASE })).rejects.toBeInstanceOf(JudgeTransportRefusal);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("clears the token on the backend's real 401 (revoked credential)", async () => {
    storeJudgeToken(TOKEN);
    const events: unknown[] = [];
    const listener = (event: Event) => events.push((event as CustomEvent).detail);
    window.addEventListener(JUDGE_SIGNED_OUT_EVENT, listener);
    const fetchImpl = vi.fn(async () => okResponse(C.judge_me_revoked_401.body, C.judge_me_revoked_401.status));
    const response = await judgeFetch(`${BASE}/api/judge-portal/me`, { fetchImpl, calyxBase: BASE });
    window.removeEventListener(JUDGE_SIGNED_OUT_EVENT, listener);
    expect(response.status).toBe(401);
    expect(readJudgeToken()).toBeNull();
    expect(events).toEqual([{ reason: "unauthorized" }]);
  });

  it("keeps the token on the backend's real 503 (judge auth not configured)", async () => {
    storeJudgeToken(TOKEN);
    const fetchImpl = vi.fn(async () => okResponse(C.judge_me_unconfigured_503.body, 503));
    await judgeFetch(`${BASE}/api/judge-portal/me`, { fetchImpl, calyxBase: BASE });
    expect(readJudgeToken()).toBe(TOKEN);
  });

  it("keeps the token on the backend's real 429 (failed sign-ins rate limited)", async () => {
    storeJudgeToken(TOKEN);
    const fetchImpl = vi.fn(async () => okResponse(C.judge_me_rate_limited_429.body, 429));
    await judgeFetch(`${BASE}/api/judge-portal/me`, { fetchImpl, calyxBase: BASE });
    expect(readJudgeToken()).toBe(TOKEN);
  });

  it("never logs the token", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    storeJudgeToken(TOKEN);
    const fetchImpl = vi.fn(async () => okResponse(C.judge_me_revoked_401.body, 401));
    await judgeFetch(`${BASE}/api/judge-portal/me`, { fetchImpl, calyxBase: BASE });
    await judgeFetch("https://attacker.test/api/judge-portal/me", { fetchImpl, calyxBase: BASE }).catch(() => {});
    for (const spy of spies) {
      for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain(TOKEN);
    }
  });
});
