// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import captured from "@/lib/__fixtures__/judgePortal.realBackend.json";
import { createJudgePortalClient } from "@/lib/judgePortal";
import { JUDGE_TOKEN_STORAGE_KEY, readJudgeToken, storeJudgeToken } from "@/lib/judgePortalAuth";
import JudgePortal from "@/pages/JudgePortal";

/**
 * Judge portal pages driven through the REAL client and transport, with a
 * fetch stub that answers from responses captured from orchid-calyx-backend
 * PR #1704 (head 5657dd07) running LOCALLY on synthetic show data. Overrides
 * that are not captured responses are labelled SYNTHETIC.
 */

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Captured = { status: number; body: unknown };
const C = captured as unknown as Record<string, Captured>;
const TOKEN = (C.owner_issue_credential.body as { token: string }).token;
const BASE = "https://calyx.example";
const EVENT_ID = (C.judge_events_blind.body as Array<{ id: string }>)[0].id;
const CARDS = C.judge_scorecards_blind.body as Array<{ scorecard_handle: string }>;
const HANDLE = CARDS[0].scorecard_handle;
const CRITERION = (C.judge_criteria.body as Array<{ criteria: Array<{ criteria_id: string }> }>)[0].criteria[0].criteria_id;
const EXHIBITOR_STRINGS = ["Rosalind", "Featherstonehaugh", "Bartholomew", "Quince", "exhibitor-", "rfeather", "bquince", "010-4477"];

type Route = { status: number; body: unknown };
let routes: Record<string, Route>;
let calls: Array<{ method: string; url: string; headers: Headers; body: unknown; credentials?: RequestCredentials }>;

function defaultRoutes(): Record<string, Route> {
  return {
    "GET /api/judge-portal/me": C.judge_me,
    "GET /api/judge-portal/events": C.judge_events_blind,
    [`GET /api/judge-portal/events/${EVENT_ID}/categories`]: C.judge_categories,
    [`GET /api/judge-portal/events/${EVENT_ID}/plants`]: C.judge_plants_blind,
    [`GET /api/judge-portal/scorecards/${HANDLE}`]: C.judge_get_scorecard,
    [`PUT /api/judge-portal/scorecards/${HANDLE}`]: C.judge_autosave_scorecard,
    [`POST /api/judge-portal/scorecards/${HANDLE}/submit`]: C.judge_submit_scorecard,
    "GET /api/judge-portal/criteria": C.judge_criteria,
    "GET /api/judge-portal/scan/QR-OUTOFSCOPE0000": C.judge_scan_out_of_scope_404,
    "GET /api/judge-portal/scan/QR-LEGACYTAG0000": C.judge_scan_blind_legacy_409,
    "GET /api/judge-portal/scan/QR-FRESHTAG00000": C.judge_scan_blind,
  };
}

const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = String(input);
  const method = init.method ?? "GET";
  calls.push({ method, url, headers: new Headers(init.headers), body: init.body ? JSON.parse(String(init.body)) : undefined, credentials: init.credentials });
  const { pathname, search } = new URL(url);
  const hit = routes[`${method} ${pathname}${search}`];
  if (!hit) return new Response(JSON.stringify({ detail: `unmapped ${method} ${pathname}` }), { status: 599 });
  return new Response(JSON.stringify(hit.body), { status: hit.status });
});

let container: HTMLDivElement;
let root: Root;

const flush = async () => {
  for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });
};

async function render(path = "/judge") {
  const client = createJudgePortalClient({ fetchImpl, calyxBase: BASE });
  await act(async () => {
    // Mounted under /judge/* exactly as App.tsx mounts it.
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(Routes, null, createElement(Route, { path: "/judge/*", element: createElement(JudgePortal, { client }) })),
      ),
    );
  });
  await flush();
}

const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function click(id: string) {
  const element = byTestId(id);
  expect(element, id).not.toBeNull();
  await act(async () => { element!.click(); });
  await flush();
}

async function type(id: string, value: string) {
  const element = byTestId(id) as HTMLInputElement;
  expect(element, id).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submitForm(id: string) {
  const element = byTestId(id) as HTMLButtonElement;
  await act(async () => { element.form!.requestSubmit(element); });
  await flush();
}

function expectNoExhibitorText() {
  const text = container.textContent ?? "";
  for (const s of EXHIBITOR_STRINGS) expect(text, s).not.toContain(s);
}

function expectJudgeOnlyRequests() {
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    expect(call.url.startsWith(`${BASE}/api/judge-portal/`), call.url).toBe(true);
    expect(call.headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(call.headers.has("X-API-Key")).toBe(false);
    expect(call.headers.has("X-Judge-Id")).toBe(false);
    expect(call.credentials).toBe("omit");
    expect(call.url).not.toMatch(/exhibitor/);
  }
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  routes = defaultRoutes();
  calls = [];
  fetchImpl.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("judge sign-in", () => {
  it("signs in with a pasted judge token held in sessionStorage only, and lists assigned events", async () => {
    await render();
    expect(byTestId("judge-sign-in")).not.toBeNull();
    expect(calls).toHaveLength(0);
    await type("judge-token-input", `  ${TOKEN}  `);
    await submitForm("judge-sign-in-submit");
    expect(sessionStorage.getItem(JUDGE_TOKEN_STORAGE_KEY)).toBe(TOKEN);
    expect(localStorage.length).toBe(0);
    expect(document.cookie).not.toContain(TOKEN);
    expect(byTestId("judge-identity")?.textContent).toContain("Judge A");
    expect(container.querySelectorAll("[data-testid='judge-event']")).toHaveLength(1);
    expect(byTestId("judge-events")?.textContent).toContain("blind judging");
    expect(container.textContent).not.toContain(TOKEN);
    expect((byTestId("judge-token-input") as HTMLInputElement | null)?.value ?? "").toBe("");
    expectJudgeOnlyRequests();
  });

  it("refuses a value that is not a judge credential and sends nothing", async () => {
    await render();
    await type("judge-token-input", "show-day-test-key");
    await submitForm("judge-sign-in-submit");
    expect(byTestId("judge-sign-in-error")?.textContent).toMatch(/not a judge credential/);
    expect(sessionStorage.length).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("sign-out clears the token and returns to sign-in", async () => {
    storeJudgeToken(TOKEN);
    await render();
    await click("judge-sign-out");
    expect(readJudgeToken()).toBeNull();
    expect(byTestId("judge-sign-in")).not.toBeNull();
  });

  it("a real 401 (revoked credential) clears the token and says so", async () => {
    storeJudgeToken(TOKEN);
    routes["GET /api/judge-portal/me"] = C.judge_me_revoked_401;
    await render();
    expect(readJudgeToken()).toBeNull();
    expect(sessionStorage.getItem(JUDGE_TOKEN_STORAGE_KEY)).toBeNull();
    expect(byTestId("judge-sign-in")).not.toBeNull();
    expect(byTestId("judge-signed-out-notice")?.textContent).toMatch(/no longer accepts that judge credential/);
  });

  it("a real 503 (judge auth not configured) is shown honestly, with no data", async () => {
    storeJudgeToken(TOKEN);
    routes["GET /api/judge-portal/me"] = C.judge_me_unconfigured_503;
    await render();
    expect(byTestId("judge-error-unconfigured")?.textContent).toMatch(/not configured/);
    expect(byTestId("judge-events")).toBeNull();
  });
});

describe("blind event pages", () => {
  it("lists plants by handle, renders the withheld name honestly and shows no exhibitor data", async () => {
    storeJudgeToken(TOKEN);
    await render(`/judge/events/${EVENT_ID}`);
    expect(byTestId("judge-blind-notice")).not.toBeNull();
    const plants = container.querySelectorAll("[data-testid='judge-plant']");
    expect(plants).toHaveLength((C.judge_plants_blind.body as unknown[]).length);
    const withheld = container.querySelectorAll("[data-testid='judge-plant-name'][data-withheld='true']");
    expect(withheld).toHaveLength(1);
    expect(withheld[0].textContent).toBe("Name withheld (blind judging)");
    expect(container.textContent).not.toContain("bench 4"); // notes are dropped in blind events
    expect(byTestId("judge-discarded-notice")).toBeNull();
    expectNoExhibitorText();
    expectJudgeOnlyRequests();
  });

  it("defence in depth: a CONTAMINATED blind payload still shows no exhibitor data and flags it", async () => {
    storeJudgeToken(TOKEN);
    // SYNTHETIC contamination of the real blind plant list.
    const contaminated = (C.judge_plants_blind.body as Array<Record<string, unknown>>).map((p) => ({
      ...p,
      plant_name: p.plant_name ?? "Phal. Featherstonehaugh's Delight",
      exhibitor_name: "Rosalind Featherstonehaugh",
      exhibitor_email: "rfeather@exhibitor-one.test",
      exhibitor_phone: "+1 (555) 010-4477",
      notes: "Bartholomew Quince bench",
    }));
    routes[`GET /api/judge-portal/events/${EVENT_ID}/plants`] = { status: 200, body: contaminated };
    await render(`/judge/events/${EVENT_ID}`);
    expect(byTestId("judge-discarded-notice")).not.toBeNull();
    expect(container.querySelectorAll("[data-testid='judge-plant-name'][data-withheld='true']")).toHaveLength(1);
    expectNoExhibitorText();
  });

  it("an event outside the judge's assignments reads as not assigned", async () => {
    storeJudgeToken(TOKEN);
    await render("/judge/events/not-my-event");
    expect(byTestId("judge-error-not_assigned")?.textContent).toMatch(/Not assigned to you/);
  });
});

describe("scan page", () => {
  it.each([
    ["QR-OUTOFSCOPE0000", "judge-error-not_assigned", /Not assigned to you/],
    ["QR-LEGACYTAG0000", "judge-error-conflict", /must be re-issued/],
  ])("real refusal for %s is explained", async (tag, testId, message) => {
    storeJudgeToken(TOKEN);
    await render(`/judge/scan/${tag}`);
    expect(byTestId(testId)?.textContent).toMatch(message);
    expectJudgeOnlyRequests();
  });

  it("a scanned tag opens the judge's own scorecard by handle", async () => {
    storeJudgeToken(TOKEN);
    await render("/judge/scan");
    await type("judge-scan-input", "https://frontend.example/judge/scan/QR-FRESHTAG00000");
    await submitForm("judge-scan-submit");
    expect(byTestId("judge-scan-result")).not.toBeNull();
    const link = byTestId("judge-scan-open-scorecard") as HTMLAnchorElement;
    const scanned = (C.judge_scan_blind.body as { scorecard: { scorecard_handle: string } }).scorecard.scorecard_handle;
    expect(link.getAttribute("href")).toBe(`/judge/scorecards/${scanned}`);
    expectNoExhibitorText();
    expectJudgeOnlyRequests();
  });
});

describe("scorecard entry", () => {
  it("autosaves entered scores, then submits and becomes read-only", async () => {
    storeJudgeToken(TOKEN);
    await render(`/judge/scorecards/${HANDLE}`);
    expect(byTestId("judge-scorecard-status")?.textContent).toBe("draft");
    await type(`judge-criterion-${CRITERION}`, "42");
    await click("judge-submit");
    await click("judge-submit-confirm-button");
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.body).toEqual({ scores: [{ criterion_id: CRITERION, value: 42 }] });
    expect(calls.find((c) => c.method === "POST")?.url).toBe(`${BASE}/api/judge-portal/scorecards/${HANDLE}/submit`);
    expect(byTestId("judge-scorecard-status")?.textContent).toBe("submitted");
    expect(byTestId("judge-submitted")?.textContent).toContain("total 42");
    expect((byTestId(`judge-criterion-${CRITERION}`) as HTMLInputElement).closest("fieldset")?.disabled).toBe(true);
    expectJudgeOnlyRequests();
  });

  it("a real 409 on save (already submitted) is explained and nothing is claimed saved", async () => {
    storeJudgeToken(TOKEN);
    routes[`PUT /api/judge-portal/scorecards/${HANDLE}`] = C.judge_autosave_submitted_409;
    await render(`/judge/scorecards/${HANDLE}`);
    await type(`judge-criterion-${CRITERION}`, "7");
    await click("judge-submit");
    await click("judge-submit-confirm-button");
    expect(byTestId("judge-error-conflict")?.textContent).toMatch(/already submitted/);
    expect(byTestId("judge-save-state")?.textContent).not.toMatch(/Saved/);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("another judge's card reads as not assigned (real 404)", async () => {
    storeJudgeToken(TOKEN);
    routes[`GET /api/judge-portal/scorecards/${HANDLE}`] = C.judge_other_judges_card_404;
    await render(`/judge/scorecards/${HANDLE}`);
    expect(byTestId("judge-error-not_assigned")?.textContent).toMatch(/Not assigned to you/);
  });
});
