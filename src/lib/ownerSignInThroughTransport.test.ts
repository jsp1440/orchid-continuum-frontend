// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The owner access code through the REAL frontend code, against a FAKE backend.
 *
 * Real: `createOwnerSession` (ownerOperationsConsole.ts), the fetch transport in
 * backendConfig.ts, calyxOrigin.ts and the request function of calyxWorkspace.ts.
 * Fake: only the browser's native `fetch`, replaced before backendConfig is
 * imported (the transport wraps whatever `window.fetch` is at import time).
 * The fake answers as the backend's routes do: POST /session-token returns the
 * signed token in its JSON body (owner_session_token.py); GET /session answers
 * 200 either way and says `authenticated` (owner_operations.py inspect_session).
 */

const BASE = "https://orchid-calyx-backend.onrender.com";
const CODE = "owner-code-9921-qwerty";
const TOKEN = "payload.signature-of-the-backend";
const BEARER_KEY = "calyx_owner_session_bearer_v1";

type Seen = { url: string; method: string; headers: Record<string, string>; body: string | null; credentials?: string };
let seen: Seen[];
let cookieAccepted: boolean; // the fake browser kept the HttpOnly cookie from the login
let loginStatus: number;
let loginToken: string;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fakeBackend(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = String(input);
  const method = (init.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, key) => { headers[key] = value; });
  seen.push({ url, method, headers, body: typeof init.body === "string" ? init.body : null, credentials: init.credentials });
  const path = url.replace(BASE, "");
  const bearerOk = headers.authorization === `Bearer ${TOKEN}`;
  if (path === "/api/mission-control/owner/session-token" && method === "POST") {
    const body = JSON.parse(String(init.body)) as { access_code?: string };
    if (loginStatus === 503) return Promise.resolve(json(503, { detail: "Owner access is not configured" }));
    if (body.access_code !== CODE) return Promise.resolve(json(401, { detail: "Invalid owner access code" }));
    cookieAccepted = true;
    return Promise.resolve(json(200, { authenticated: true, status: "authenticated", owner: "owner", expires_at: 1900000000, token: loginToken, allowedActions: {}, credential_transport: "httponly_cookie_or_bearer" }));
  }
  if (path === "/api/mission-control/owner/session" && method === "GET") {
    const ok = bearerOk || cookieAccepted;
    return Promise.resolve(json(200, ok
      ? { authenticated: true, status: "authenticated", owner: "owner", expires_at: 1900000000, allowedActions: {}, reason: null }
      : { authenticated: false, status: "unauthenticated", expires_at: null, allowedActions: {}, reason: "missing_session" }));
  }
  if (path === "/api/mission-control/owner/session-token/refresh") return Promise.resolve(json(401, { detail: "Owner session is required" }));
  if (path === "/api/calyx/speak/conversations" && method === "POST") {
    return Promise.resolve(bearerOk
      ? json(201, { conversation_id: "c1", created_at: "t", updated_at: "t", messages: [] })
      : json(401, { detail: "Owner session or API key is required" }));
  }
  return Promise.resolve(json(404, { detail: "not found" }));
}

async function loadReal() {
  window.fetch = fakeBackend as typeof window.fetch;
  (window as { __calyxOwnerSessionTransportInstalled?: boolean }).__calyxOwnerSessionTransportInstalled = false;
  vi.resetModules();
  const { createOwnerSession } = await import("./ownerOperationsConsole");
  const { createCalyxConversation, CalyxApiError } = await import("./calyxWorkspace");
  return { createOwnerSession, createCalyxConversation, CalyxApiError };
}

beforeEach(() => {
  seen = [];
  cookieAccepted = false;
  loginStatus = 200;
  loginToken = TOKEN;
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.spyOn(window, "alert").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

const login = () => seen.filter((r) => r.url === `${BASE}/api/mission-control/owner/session-token` && r.method === "POST");
const withCode = (r: Seen) => JSON.stringify(r).includes(CODE);
const storageDump = () => JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage });

describe("owner access code through the real transport", () => {
  it("is refused before sign-in, then the next Calyx request carries the bearer the backend returned", async () => {
    const { createOwnerSession, createCalyxConversation, CalyxApiError } = await loadReal();

    await expect(createCalyxConversation({})).rejects.toBeInstanceOf(CalyxApiError);
    seen.length = 0;

    const session = await createOwnerSession(CODE);
    expect(session.authenticated).toBe(true);

    // The login: one POST to /session-token (rewritten from /session), the code only in its JSON body.
    expect(login()).toHaveLength(1);
    expect(JSON.parse(login()[0].body!)).toEqual({ access_code: CODE, owner: "owner" });
    expect(login()[0].url).not.toContain(CODE);
    expect(login()[0].headers.authorization).toBeUndefined();
    expect(login()[0].credentials).toBe("include");
    expect(seen.some((r) => r.url === `${BASE}/api/mission-control/owner/session` && r.method === "POST")).toBe(false);

    // The inspection that follows is a GET of /session and carries the bearer.
    const inspections = seen.filter((r) => r.url === `${BASE}/api/mission-control/owner/session` && r.method === "GET");
    expect(inspections).toHaveLength(1);
    expect(inspections[0].headers.authorization).toBe(`Bearer ${TOKEN}`);

    // The tab now holds the bearer.
    expect(window.sessionStorage.getItem(BEARER_KEY)).toBe(TOKEN);

    // The page's next request, through the real calyxWorkspace request function.
    seen.length = 0;
    const conversation = await createCalyxConversation({ title: "Speak with Calyx" });
    expect(conversation.conversation_id).toBe("c1");
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe(`${BASE}/api/calyx/speak/conversations`);
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("puts the access code in no storage and in no request other than the login", async () => {
    const { createOwnerSession, createCalyxConversation } = await loadReal();
    await createOwnerSession(CODE);
    await createCalyxConversation({});
    expect(seen.filter(withCode)).toEqual([expect.objectContaining({ method: "POST", url: `${BASE}/api/mission-control/owner/session-token` })]);
    expect(storageDump()).not.toContain(CODE);
  });

  it("a wrong code: the backend's detail is thrown, no bearer is stored, the next request is still refused", async () => {
    const { createOwnerSession, createCalyxConversation, CalyxApiError } = await loadReal();
    await expect(createOwnerSession("not-the-code")).rejects.toThrow("Calyx backend 401: Invalid owner access code");
    expect(window.sessionStorage.getItem(BEARER_KEY)).toBeNull();
    await expect(createCalyxConversation({})).rejects.toBeInstanceOf(CalyxApiError);
    expect(window.alert).toHaveBeenCalledTimes(1); // the transport's own alert, untouched
    expect(storageDump()).not.toContain("not-the-code");
  });

  it("an unconfigured backend (503): its sentence is thrown", async () => {
    loginStatus = 503;
    const { createOwnerSession } = await loadReal();
    await expect(createOwnerSession(CODE)).rejects.toThrow("Calyx backend 503: Owner access is not configured");
    expect(window.sessionStorage.getItem(BEARER_KEY)).toBeNull();
  });

  // Characterisation: the form reports success on whatever createOwnerSession resolves.
  it("CASE: storage refuses the token, the cookie carries the inspection: sign-in succeeds but the tab holds no bearer", async () => {
    const { createOwnerSession, createCalyxConversation, CalyxApiError } = await loadReal();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("blocked", "QuotaExceededError"); });
    const session = await createOwnerSession(CODE);
    expect(session.authenticated).toBe(true);
    expect(window.sessionStorage.getItem(BEARER_KEY)).toBeNull();
    seen.length = 0;
    // The fake's Calyx route needs the bearer, as it does for a browser that drops the cross-site cookie.
    await expect(createCalyxConversation({})).rejects.toBeInstanceOf(CalyxApiError);
    expect(seen[0].headers.authorization).toBeUndefined();
  });

  it("CASE: the backend answers the login with token \"cookie\": success is reported and no bearer is stored", async () => {
    loginToken = "cookie";
    const { createOwnerSession } = await loadReal();
    const session = await createOwnerSession(CODE);
    expect(session.authenticated).toBe(true);
    expect(window.sessionStorage.getItem(BEARER_KEY)).toBeNull();
  });
});
