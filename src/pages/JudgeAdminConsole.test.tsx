// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import captured from "@/lib/__fixtures__/judgePortal.realBackend.json";
import { createJudgeAdminClient } from "@/lib/judgeAdmin";
import JudgeAdminConsole from "@/pages/JudgeAdminConsole";

/**
 * Owner console for judge credentials, driven through the REAL admin client
 * with a fetch stub answering from responses captured from
 * orchid-calyx-backend PR #1704 (head 5657dd07) running LOCALLY on synthetic
 * show data. Overrides that are not captured responses are labelled SYNTHETIC.
 */

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Captured = { status: number; body: unknown };
const C = captured as unknown as Record<string, Captured>;
const ISSUED = C.owner_issue_credential.body as { token: string; judge_id: string; credential_id: string };
const TOKEN = ISSUED.token;
const JUDGE_ID = ISSUED.judge_id;
const EVENT_ID = (C.owner_reissue_qr_tokens.body as { judging_event_id: string }).judging_event_id;
const BASE = "https://calyx.example";

let routes: Record<string, Captured>;
let calls: Array<{ method: string; url: string; headers: Headers; body: unknown; credentials?: RequestCredentials }>;

const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = String(input);
  const method = init.method ?? "GET";
  calls.push({ method, url, headers: new Headers(init.headers), body: init.body ? JSON.parse(String(init.body)) : undefined, credentials: init.credentials });
  const { pathname } = new URL(url);
  const hit = routes[`${method} ${pathname}`];
  if (!hit) return new Response(JSON.stringify({ detail: "unmapped" }), { status: 599 });
  return new Response(typeof hit.body === "string" ? hit.body : JSON.stringify(hit.body), { status: hit.status });
});

let container: HTMLDivElement;
let root: Root;
const flush = async () => {
  for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });
};
const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function render() {
  const client = createJudgeAdminClient({ fetchImpl, calyxBase: BASE });
  await act(async () => {
    root.render(createElement(MemoryRouter, null, createElement(JudgeAdminConsole, { client })));
  });
  await flush();
}

async function click(id: string) {
  const element = byTestId(id);
  expect(element, id).not.toBeNull();
  await act(async () => { element!.click(); });
  await flush();
}

async function type(id: string, value: string) {
  const element = byTestId(id) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function storageText(): string {
  const dump = (s: Storage) => Array.from({ length: s.length }, (_, i) => `${s.key(i)}=${s.getItem(s.key(i)!)}`).join("|");
  return `${dump(localStorage)}#${dump(sessionStorage)}#${document.cookie}`;
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  calls = [];
  fetchImpl.mockClear();
  routes = {
    [`POST /api/judges/${JUDGE_ID}/credentials`]: C.owner_issue_credential,
    [`GET /api/judges/${JUDGE_ID}/credentials`]: C.owner_list_credentials,
    [`POST /api/judge-credentials/${ISSUED.credential_id}/revoke`]: C.owner_revoke_credential,
    "GET /api/judging/judge-audit": C.owner_judge_audit,
    [`POST /api/judging/events/${EVENT_ID}/reissue-qr-tokens`]: C.owner_reissue_qr_tokens,
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("judge credential issuance", () => {
  it("shows the issued token exactly once, copies it, and never stores it", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await render();
    await type("judge-admin-judge-id", JUDGE_ID);
    await type("judge-admin-label", "tablet 1");
    await click("judge-admin-issue");

    const issue = calls.find((c) => c.method === "POST")!;
    expect(issue.url).toBe(`${BASE}/api/judges/${JUDGE_ID}/credentials`);
    expect(issue.body).toEqual({ rotate: true, label: "tablet 1", expires_in_minutes: 1440 });

    expect(container.querySelectorAll("[data-testid='judge-admin-token-once']")).toHaveLength(1);
    expect(byTestId("judge-admin-token-value")?.textContent).toBe(TOKEN);
    expect(container.innerHTML.split(TOKEN).length - 1).toBe(1); // rendered in exactly one place
    // The refreshed credential list (real capture) carries metadata only.
    expect(byTestId("judge-admin-credential-list")?.textContent).not.toContain(TOKEN);
    expect(storageText()).not.toContain(TOKEN);

    await click("judge-admin-token-copy");
    expect(writeText).toHaveBeenCalledWith(TOKEN);

    await click("judge-admin-token-done");
    expect(byTestId("judge-admin-token-once")).toBeNull();
    expect(container.innerHTML).not.toContain(TOKEN);

    // Reloading the list never brings it back.
    await click("judge-admin-load");
    expect(container.innerHTML).not.toContain(TOKEN);
    expect(storageText()).not.toContain(TOKEN);
  });

  it("owner requests never carry the owner key or a judge bearer", async () => {
    await render();
    await type("judge-admin-judge-id", JUDGE_ID);
    await click("judge-admin-issue");
    await click("judge-admin-load");
    await click("judge-admin-audit-load");
    for (const call of calls) {
      expect(call.url.startsWith(`${BASE}/api/`)).toBe(true);
      expect(call.headers.has("X-API-Key")).toBe(false);
      expect(call.headers.get("Authorization") ?? "").not.toMatch(/ocj_/);
      expect(call.credentials).toBe("include"); // the owner-session transport attaches the owner session
    }
  });

  it("revokes a credential and shows the backend's state", async () => {
    await render();
    await type("judge-admin-judge-id", JUDGE_ID);
    await click("judge-admin-load");
    expect(byTestId("judge-admin-credential-state")?.textContent).toBe("active");
    routes[`GET /api/judges/${JUDGE_ID}/credentials`] = {
      status: 200,
      body: [C.owner_revoke_credential.body], // the real revoke response is the credential's new metadata
    };
    await click(`judge-admin-revoke-${ISSUED.credential_id}`);
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith(`/api/judge-credentials/${ISSUED.credential_id}/revoke`))).toBe(true);
    expect(byTestId("judge-admin-credential-state")?.textContent).toBe("revoked");
  });

  it("explains the real owner-route 401 honestly and shows no token", async () => {
    routes[`POST /api/judges/${JUDGE_ID}/credentials`] = C.owner_issue_without_owner_key_401;
    await render();
    await type("judge-admin-judge-id", JUDGE_ID);
    await click("judge-admin-issue");
    expect(byTestId("judge-admin-credentials-error")?.textContent).toMatch(/did not accept this owner session/);
    expect(byTestId("judge-admin-credentials-error")?.textContent).toContain("Invalid or missing API key");
    expect(byTestId("judge-admin-token-once")).toBeNull();
  });

  it("a real 503 from issuance says judge credentials are not configured", async () => {
    routes[`POST /api/judges/${JUDGE_ID}/credentials`] = C.owner_issue_unconfigured_503;
    await render();
    await type("judge-admin-judge-id", JUDGE_ID);
    await click("judge-admin-issue");
    expect(byTestId("judge-admin-credentials-error")?.textContent).toMatch(/CALYX_JUDGE_TOKEN_SECRET/);
  });
});

describe("blind display name", () => {
  it("shows the backend's exhibitor-mention warning (real 409) and resends only on confirmation", async () => {
    const plantPath = (C.owner_set_blind_display_name_warning_409 as unknown as { request: { path: string } }).request.path;
    routes[`PUT ${plantPath}`] = C.owner_set_blind_display_name_warning_409;
    await render();
    await type("judge-admin-blind-plant", plantPath.split("/")[4]);
    await type("judge-admin-blind-value", "Phal. Featherstonehaugh's Delight");
    await click("judge-admin-blind-save");
    expect(byTestId("judge-admin-blind-error")?.textContent).toMatch(/may identify the exhibitor \(contains an exhibitor name word\)/);
    expect(calls[0].body).toEqual({ blind_display_name: "Phal. Featherstonehaugh's Delight", confirm_despite_warnings: false });
    // SYNTHETIC success for the confirmed resend (the capture did not confirm it).
    routes[`PUT ${plantPath}`] = { status: 200, body: { plant_id: "p", blind_display_name: "Phal. Featherstonehaugh's Delight", warnings: ["contains an exhibitor name word"] } };
    await click("judge-admin-blind-confirm");
    expect(calls[1].body).toEqual({ blind_display_name: "Phal. Featherstonehaugh's Delight", confirm_despite_warnings: true });
    expect(byTestId("judge-admin-blind-result")?.textContent).toMatch(/Kept despite/);
  });

  it("saves an owner-approved name (real 200)", async () => {
    const plantId = (C.owner_set_blind_display_name.body as { plant_id: string }).plant_id;
    routes[`PUT /api/judging/plants/${plantId}/blind-display-name`] = C.owner_set_blind_display_name;
    await render();
    await type("judge-admin-blind-plant", plantId);
    await type("judge-admin-blind-value", "Cattleya labiata");
    await click("judge-admin-blind-save");
    expect(byTestId("judge-admin-blind-result")?.textContent).toContain("Judges will see “Cattleya labiata”.");
  });
});

describe("judge audit and tags", () => {
  it("renders the real judge audit rows", async () => {
    await render();
    await click("judge-admin-audit-load");
    const rows = container.querySelectorAll("[data-testid='judge-admin-audit-row']");
    expect(rows).toHaveLength((C.owner_judge_audit.body as unknown[]).length);
    expect(byTestId("judge-admin-audit-table")?.textContent).toContain("not_found");
    expect(calls[0].url).toContain("/api/judging/judge-audit?limit=200");
  });

  it("re-issues tag codes only after confirmation and reports the real count", async () => {
    await render();
    await type("judge-admin-tags-event", EVENT_ID);
    await click("judge-admin-tags-reissue");
    expect(calls).toHaveLength(0);
    await click("judge-admin-tags-confirm");
    expect(calls[0].url).toBe(`${BASE}/api/judging/events/${EVENT_ID}/reissue-qr-tokens`);
    const { reissued, plants } = C.owner_reissue_qr_tokens.body as { reissued: number; plants: number };
    expect(byTestId("judge-admin-tags-result")?.textContent).toContain(`Re-issued ${reissued} of ${plants}`);
  });
});
