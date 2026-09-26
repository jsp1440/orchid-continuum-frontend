// @vitest-environment jsdom

/**
 * R1 J4: a signed-in member identifies an orchid with their own Matrix session.
 *
 * Owner decision: Matrix identification is available to signed-in members;
 * sessions are private to their creator; Vision, reports, persistence and
 * evidence feedback stay owner-only (backend #1647).
 *
 * The page, the Matrix client and the member-token helper run for real; only
 * `fetch` and the supabase-js session are stubbed. Every response body is
 * CAPTURED from the real backend running locally
 * (src/lib/__fixtures__/matrixIdentification.memberBackend.json — a SYNTHETIC
 * registry, "Fixture taxon A/B/C", not a claim about any orchid), except the
 * lines marked SYNTHETIC. The member token below is a synthetic test string.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import member from "@/lib/__fixtures__/matrixIdentification.memberBackend.json";

const MEMBER_TOKEN = "synthetic-member-access-token";
const identity = vi.hoisted(() => ({ token: null as string | null }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: identity.token ? { access_token: identity.token, user: { id: "synthetic-member" } } : null },
        error: null,
      }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  },
}));
vi.mock("@/features/calyx-workspace/sessionContext", () => ({ recordCalyxSurfaceContext: vi.fn() }));
// The Lexicon guide's own member-token behaviour is pinned in matrixLexicon.test.ts.
vi.mock("@/components/matrix/MatrixLexiconGuide", () => ({ default: () => null }));

import { AuthProvider } from "@/contexts/AuthContext";
import OrchidIdentificationNext from "./OrchidIdentificationNext";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Captured = { status: number; body: unknown };
type Sent = { method: string; path: string; authorization: string | null; body: unknown };

const SESSION = member.create.body.session_id;
const S = `/api/matrix-identification/sessions/${SESSION}`;

let container: HTMLDivElement;
let root: Root;
let sent: Sent[];

function respond(captured: Captured) {
  return new Response(JSON.stringify(captured.body), {
    status: captured.status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * The real backend's member behaviour, replayed from the capture: member
 * routes answer for the member bearer, the anonymous request gets the real 401,
 * and anything else fails the test loudly.
 */
function memberBackend(overrides: Record<string, Captured> = {}) {
  let observed = 0;
  const evaluations = [member.evaluate0, member.evaluate1, member.evaluate2];
  const observations = [member.observe1, member.observe2];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("Authorization");
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    sent.push({ method, path: url.pathname, authorization, body });
    const key = `${method} ${url.pathname}`;
    if (overrides[key]) return respond(overrides[key]);
    if (!authorization) return respond(member.anon_registry_list);
    if (key === "GET /api/matrix-identification/registry") return respond(member.registry_list);
    if (key === "GET /api/matrix-identification/registry/r1-synthetic-member-matrix/1") return respond(member.registry_detail);
    if (key === "POST /api/matrix-identification/sessions") return respond(member.create);
    if (key === `POST ${S}/evaluate`) return respond(evaluations[observed]);
    if (key === `POST ${S}/observations`) return respond(observations[observed++]);
    if (key === `POST ${S}/explain`) return respond(member.explain2);
    // SYNTHETIC: an unexpected request is a test failure, not a silent pass.
    return new Response(JSON.stringify({ detail: `unexpected ${key}` }), { status: 599 });
  });
  vi.stubGlobal("fetch", fetchMock);
}

beforeEach(() => {
  sent = [];
  identity.token = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function flush(times = 6) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
}

function render() {
  act(() => root.render(<MemoryRouter><AuthProvider><OrchidIdentificationNext /></AuthProvider></MemoryRouter>));
}

function button(label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(label)) as HTMLButtonElement | undefined;
}

async function click(label: string) {
  const target = button(label);
  if (!target) throw new Error(`button ${label} not found`);
  await act(async () => { target.click(); });
  await flush();
}

async function type(selector: string, value: string) {
  const element = container.querySelector(selector) as HTMLInputElement | HTMLSelectElement;
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

const statusMessage = () => container.querySelector('[data-testid="matrix-status-message"]')?.textContent ?? "";
const text = () => container.textContent ?? "";

describe("anonymous visitor", () => {
  it("is asked to sign in (real 401), not told Matrix is owner-only, and no token is sent", async () => {
    memberBackend();
    render();
    await flush();

    expect(statusMessage()).toBe("Sign in to use Matrix identification. It is available to signed-in members.");
    expect(text()).toContain("sign in");
    expect(button("Sign in")).toBeTruthy();
    expect(text()).not.toMatch(/owner access|Matrix API|401|API key/i);
    expect(button("Begin guided identification")?.disabled).toBe(true);
    expect(button("Try again")).toBeUndefined();
    expect(sent).toEqual([{ method: "GET", path: "/api/matrix-identification/registry", authorization: null, body: null }]);
  });
});

describe("signed-in member", () => {
  it("picks a registry, answers characters (skipping a withheld one), sees the ranking and the explanation", async () => {
    identity.token = MEMBER_TOKEN;
    memberBackend();
    render();
    await flush();

    expect(statusMessage()).toBe("Choose a governed matrix and begin.");
    expect(text()).toContain("SYNTHETIC R1 member Matrix fixture (not a scientific claim) · 1");
    await click("Begin guided identification");

    // The Matrix asks for its most discriminating character.
    expect(container.querySelector("h2")?.textContent).not.toBeNull();
    expect(text()).toContain("Spur length");
    expect(container.querySelector('[data-testid="matrix-session-private"]')?.textContent).toBe("Your session · private to your account");
    await type("#observation-answer", "25");
    await type("#certainty", "certain");
    await click("Record observation");

    // The next character is withheld in the member view: it is not shown as a
    // real character and cannot be answered; the member answers another one.
    const withheld = container.querySelector('[data-testid="matrix-next-withheld"]');
    expect(withheld?.textContent).toContain("withheld from the member view");
    expect(text()).toContain("The next character is withheld from the member view");
    const options = Array.from(container.querySelectorAll("#alternate-character option")).map((item) => item.textContent);
    // Registry detail lists spur length (answered), a withheld character, and flower color.
    expect(options).toEqual(["Choose a character…", "Flower color"]);
    expect(container.querySelector("#observation-answer")).toBeNull();
    await type("#alternate-character", "flower_color");
    await type("#observation-answer", "white");
    await type("#certainty", "probable");
    await click("Record observation");

    // Ranked candidates with the Matrix's own basis and registry provenance.
    const candidates = Array.from(container.querySelectorAll('[data-testid="matrix-candidate"]'));
    expect(candidates.map((item) => item.querySelector("h3")?.textContent?.trim())).toEqual([
      "Fixture taxon A",
      "Fixture taxon C",
      "Fixture taxon B",
    ]);
    expect(candidates[0].querySelector('[data-testid="matrix-candidate-score"]')?.textContent).toBe("100%");
    expect(candidates[1].querySelector('[data-testid="matrix-candidate-score"]')?.textContent).toBe("80%");
    expect(candidates[0].querySelector('[data-testid="matrix-candidate-provenance"]')?.textContent)
      .toContain("source: SYNTHETIC R1 fixture · citation: synthetic-fixture-a");
    // A candidate state the member view withheld is said as withheld, never as a value.
    const withheldState = candidates[2].querySelector('[data-testid="matrix-character-flower_color"]')?.textContent ?? "";
    expect(withheldState).toContain("Matrix recordswithheld (not shown in the member view)");
    expect(container.querySelector('[data-testid="matrix-ranking-basis"]')?.textContent).toBe("2 observations recorded · 2 used for ranking");

    // Owner-only panels are said as owner-only, and never requested.
    expect(container.querySelector('[data-testid="matrix-vision-owner-only"]')?.textContent).toContain("This view is limited to owner access.");
    expect(container.querySelector('[data-testid="matrix-feedback-owner-only"]')?.textContent).toContain("This view is limited to owner access.");
    expect(text()).not.toContain("Report, correct, or add evidence");
    expect(text()).not.toContain("Freeze evidence report");

    await click("Explain the identification so far");
    expect(text()).toContain("The current leading candidate is Fixture taxon A based on the supplied Matrix evidence.");
    expect(container.querySelector('[data-testid="calyx-explanation-provenance"]')?.textContent)
      .toContain("Produced by matrix-deterministic-governed (calyx-matrix-explanation-v1) · explanation not evidence");

    // What the browser sent: member token on every Matrix request, the
    // captured bodies, never the withheld marker, never an owner-only route.
    const matrix = sent.filter((item) => item.path.startsWith("/api/matrix-identification/"));
    expect(matrix.map((item) => `${item.method} ${item.path.replace(SESSION, ":id")}`)).toEqual([
      "GET /api/matrix-identification/registry",
      "POST /api/matrix-identification/sessions",
      "POST /api/matrix-identification/sessions/:id/evaluate",
      "POST /api/matrix-identification/sessions/:id/observations",
      "POST /api/matrix-identification/sessions/:id/evaluate",
      "GET /api/matrix-identification/registry/r1-synthetic-member-matrix/1",
      "POST /api/matrix-identification/sessions/:id/observations",
      "POST /api/matrix-identification/sessions/:id/evaluate",
      "POST /api/matrix-identification/sessions/:id/explain",
    ]);
    for (const item of matrix) expect(item.authorization, item.path).toBe(`Bearer ${MEMBER_TOKEN}`);
    const writes = matrix.filter((item) => item.path.endsWith("/observations"));
    expect(writes.map((item) => item.body)).toEqual([
      member.observe1.request.body,
      member.observe2.request.body,
    ]);
    expect(JSON.stringify(sent.map((item) => item.body))).not.toContain("withheld");
    expect(sent.some((item) => /vision|reports|persistence|evidence-feedback/.test(item.path))).toBe(false);
    // Planted synthetic locality never reaches the page.
    expect(text()).not.toMatch(/SYNTHETIC-(LOCALITY|SITE)/);
  });

  it("member verification unavailable (real 503) is a retryable state, not a sign-in or owner message", async () => {
    identity.token = MEMBER_TOKEN;
    memberBackend({ "GET /api/matrix-identification/registry": member.identity_down_registry_list });
    render();
    await flush();

    expect(statusMessage()).toBe("Member verification is temporarily unavailable — try again.");
    expect(text()).toContain("error");
    expect(button("Try again")).toBeTruthy();
    expect(text()).not.toMatch(/owner access|MEMBER_AUTH|503/);
  });

  it("a member refused by a server with member Matrix access switched off (403 OWNER_ACCESS_REQUIRED) is told owner access", async () => {
    identity.token = MEMBER_TOKEN;
    memberBackend({ "GET /api/matrix-identification/registry": member.owner_only_contract });
    render();
    await flush();

    expect(statusMessage()).toBe("Matrix identification currently requires owner access.");
    expect(text()).toContain("owner access");
    expect(button("Sign in")).toBeUndefined();
  });
});
