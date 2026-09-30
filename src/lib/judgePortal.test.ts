// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import captured from "@/lib/__fixtures__/judgePortal.realBackend.json";
import { storeJudgeToken } from "@/lib/judgePortalAuth";
import {
  JudgePortalError,
  WITHHELD_NAME_LABEL,
  createJudgePortalClient,
  errorFromStatus,
  judgeErrorMessage,
  parseJudgeScan,
  parseJudgeScorecard,
  plantDisplayName,
  projectJudgePlant,
  qrTokenFromScan,
} from "@/lib/judgePortal";

/**
 * Judge-portal contract, blind projection and error states, driven by REAL
 * responses captured from orchid-calyx-backend PR #1704 (head 5657dd07) run
 * LOCALLY with FastAPI TestClient on synthetic show data
 * (`__fixtures__/judgePortal.realBackend.json`). Shapes not captured are
 * labelled SYNTHETIC where they are used.
 */

type Captured = { status: number; body: unknown; request: { method: string; path: string } };
const C = captured as unknown as Record<string, Captured>;
const TOKEN = (C.owner_issue_credential.body as { token: string }).token;
const BASE = "https://calyx.example";

// Every exhibitor string the synthetic capture contains.
const EXHIBITOR_STRINGS = ["Rosalind", "Featherstonehaugh", "Bartholomew", "Quince", "exhibitor-one", "exhibitor-two", "rfeather", "bquince", "010-4477", "9921"];

function expectNoExhibitorData(value: unknown) {
  const text = JSON.stringify(value);
  for (const s of EXHIBITOR_STRINGS) expect(text, s).not.toContain(s);
  expect(text).not.toMatch(/"exhibitor/);
  expect(text).not.toMatch(/"(plant_id|qr_code|email|phone)"/);
}

beforeEach(() => {
  sessionStorage.clear();
});

describe("blind projection (defence in depth)", () => {
  it("renders the backend's withheld plant name honestly", () => {
    const raw = C.judge_plants_blind.body as Array<{ plant_name_withheld: boolean }>;
    const plants = raw.map((p) => projectJudgePlant(p, true));
    const withheld = plants.filter((p) => p.plant_name_withheld);
    expect(withheld.length).toBe(raw.filter((p) => p.plant_name_withheld).length);
    expect(withheld.length).toBeGreaterThan(0);
    for (const plant of withheld) {
      expect(plant.plant_name).toBeNull();
      expect(plant.plant_name_source).toBe("withheld");
      expect(plantDisplayName(plant)).toBe(WITHHELD_NAME_LABEL);
    }
    // The one plant whose blind display name the owner approved (real capture).
    const approved = plants.filter((p) => p.plant_name_source === "owner_approved");
    expect(approved.map((p) => p.plant_name)).toEqual(["Cattleya labiata"]);
    expect(WITHHELD_NAME_LABEL).toBe("Name withheld (blind judging)");
    expectNoExhibitorData(plants);
    expect(plants.every((p) => p.withheld_fields_discarded === false)).toBe(true);
  });

  it("never copies exhibitor fields, even from the real non-blind payload that carries exhibitor_name", () => {
    const raw = C.judge_plants_open.body as Array<Record<string, unknown>>;
    expect(raw.some((p) => typeof p.exhibitor_name === "string")).toBe(true); // the capture really has them
    const plants = raw.map((p) => projectJudgePlant(p, false));
    expectNoExhibitorData(plants.map((p) => ({ ...p, plant_name: null })));
    expect(plants.every((p) => !("exhibitor_name" in p))).toBe(true);
    // Non-blind notes are shown; the real plant name is shown.
    expect(plants[0].notes).toBe("bench 4");
  });

  it("drops exhibitor fields, notes and a withheld name from a CONTAMINATED blind payload and flags it", () => {
    // SYNTHETIC contamination of a real captured blind plant: the backend never
    // sends these, and the projection must discard them if it ever did.
    const real = (C.judge_plants_blind.body as Array<Record<string, unknown>>).find((p) => p.plant_name_withheld === true)!;
    const contaminated = {
      ...real,
      plant_name: "Phal. Featherstonehaugh's Delight",
      exhibitor_name: "Rosalind Featherstonehaugh",
      exhibitor_id: "exh-1",
      exhibitor_email: "rfeather@exhibitor-one.test",
      exhibitor_phone: "+1 (555) 010-4477",
      plant_id: "plant-raw-id",
      qr_code: "QR-0123456789ABCDEF0123",
      notes: "Rosalind's bench",
    };
    const plant = projectJudgePlant(contaminated, true);
    expect(plant.withheld_fields_discarded).toBe(true);
    expect(plant.plant_name).toBeNull();
    expect(plant.notes).toBeNull();
    expect(plantDisplayName(plant)).toBe(WITHHELD_NAME_LABEL);
    expectNoExhibitorData(plant);
  });

  it("fails closed when the blind flags are missing: treated as blind and withheld", () => {
    // SYNTHETIC: a plant without `blind` / `plant_name_withheld`.
    const plant = projectJudgePlant({ plant_handle: "p_abc", judging_event_id: "e", category_id: "c", plant_name: "X", notes: "n" });
    expect(plant.blind).toBe(true);
    expect(plant.plant_name_withheld).toBe(true);
    expect(plant.plant_name).toBeNull();
    expect(plant.notes).toBeNull();
  });

  it("the enclosing blind event makes the plant blind even if the plant says otherwise", () => {
    const openPlant = (C.judge_plants_open.body as unknown[])[0];
    const plant = projectJudgePlant(openPlant, true);
    expect(plant.blind).toBe(true);
    expect(plant.notes).toBeNull();
    expect(plant.withheld_fields_discarded).toBe(true); // exhibitor_name arrived in a blind context
    expectNoExhibitorData(plant);
  });

  it("parses real scorecards and scans by opaque handle, never by id", () => {
    const card = parseJudgeScorecard(C.judge_submit_scorecard.body, true);
    expect(card.scorecard_handle).toMatch(/^s_[0-9a-f]{24}$/);
    expect(card.plant.plant_handle).toMatch(/^p_[0-9a-f]{24}$/);
    expect(card.status).toBe("submitted");
    expect(card.total).toBe(42);
    const scan = parseJudgeScan(C.judge_scan_blind.body);
    expect(scan.judging_event.is_blind).toBe(true);
    expect(scan.scorecard?.scorecard_handle).toMatch(/^s_/);
    expectNoExhibitorData(scan);
  });

  it("fails closed on an incomplete payload", () => {
    expect(() => projectJudgePlant({ plant_name: "x" })).toThrow(JudgePortalError);
    expect(() => projectJudgePlant({ plant_handle: "plant-1", judging_event_id: "e", category_id: "c" })).toThrow(/handle/);
    expect(() => parseJudgeScorecard({ scorecard_handle: "s_1" })).toThrow(JudgePortalError);
  });
});

describe("error states", () => {
  const cases: Array<[string, string, RegExp]> = [
    ["judge_scan_out_of_scope_404", "not_assigned", /Not assigned to you/],
    ["judge_other_judges_card_404", "not_assigned", /Not assigned to you/],
    ["judge_scan_blind_legacy_409", "conflict", /must be re-issued/],
    ["judge_autosave_submitted_409", "conflict", /already submitted/],
    ["judge_me_revoked_401", "unauthenticated", /signed out on this device/],
    ["judge_me_no_token_401", "unauthenticated", /not accepted/],
    ["judge_me_unconfigured_503", "unconfigured", /not configured/],
    ["judge_me_rate_limited_429", "rate_limited", /Too many failed/],
  ];
  it.each(cases)("real %s maps to %s", (key, kind, message) => {
    const { status, body } = C[key];
    const error = errorFromStatus(status, (body as { detail: string }).detail);
    expect(error.kind).toBe(kind);
    expect(judgeErrorMessage(error)).toMatch(message);
  });

  it("SYNTHETIC locked / closed 409s (backend detail strings from app/show_lock.py and judging.py, not captured)", () => {
    expect(judgeErrorMessage(errorFromStatus(409, "Judging is locked for this show. Edits are frozen."))).toMatch(/locked/);
    expect(judgeErrorMessage(errorFromStatus(409, "Judging event is closed. Edits are frozen."))).toMatch(/closed/);
  });
});

describe("judge client against the captured contract", () => {
  function routeFixture(method: string, url: string): Captured | undefined {
    const path = new URL(url).pathname + new URL(url).search;
    const eventId = (C.judge_events.body as Array<{ id: string }>)[0].id;
    const handle = (C.judge_scorecards_blind.body as Array<{ scorecard_handle: string }>)[0].scorecard_handle;
    const map: Record<string, string> = {
      "GET /api/judge-portal/me": "judge_me",
      "GET /api/judge-portal/events": "judge_events_blind",
      [`GET /api/judge-portal/events/${eventId}/categories`]: "judge_categories",
      [`GET /api/judge-portal/events/${eventId}/plants`]: "judge_plants_blind",
      [`GET /api/judge-portal/events/${eventId}/scorecards`]: "judge_scorecards_blind",
      [`GET /api/judge-portal/scorecards/${handle}`]: "judge_get_scorecard",
      [`PUT /api/judge-portal/scorecards/${handle}`]: "judge_autosave_scorecard",
      [`POST /api/judge-portal/scorecards/${handle}/submit`]: "judge_submit_scorecard",
      "GET /api/judge-portal/criteria": "judge_criteria",
    };
    return C[map[`${method} ${path}`]];
  }

  it("uses only /api/judge-portal routes with the bearer and never an owner header", async () => {
    storeJudgeToken(TOKEN);
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      const hit = routeFixture(init.method ?? "GET", String(url));
      return new Response(JSON.stringify(hit?.body ?? { detail: "unmapped" }), { status: hit?.status ?? 599 });
    });
    const client = createJudgePortalClient({ fetchImpl, calyxBase: BASE });
    const me = await client.me();
    expect(me.judge_name).toBe("Judge A");
    const [event] = await client.events();
    await client.categories(event.id);
    const plants = await client.plants(event.id, event.is_blind);
    const cards = await client.scorecards(event.id, event.is_blind);
    await client.scorecard(cards[0].scorecard_handle);
    await client.autosave(cards[0].scorecard_handle, [{ criterion_id: "c", value: 42 }]);
    await client.submit(cards[0].scorecard_handle, "fine");
    await client.criteria();
    expectNoExhibitorData({ plants, cards });
    expect(calls.length).toBe(9);
    for (const { url, init } of calls) {
      expect(url.startsWith(`${BASE}/api/judge-portal/`)).toBe(true);
      const headers = new Headers(init.headers);
      expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
      expect(headers.has("X-API-Key")).toBe(false);
      expect(headers.has("X-Judge-Id")).toBe(false);
      expect(init.credentials).toBe("omit");
    }
    const put = calls.find((c) => c.init.method === "PUT")!;
    expect(JSON.parse(String(put.init.body))).toEqual({ scores: [{ criterion_id: "c", value: 42 }] });
    const post = calls.find((c) => c.init.method === "POST")!;
    expect(JSON.parse(String(post.init.body))).toEqual({ final_comment: "fine" });
  });

  it("turns a transport refusal into an honest error without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const client = createJudgePortalClient({ fetchImpl, calyxBase: BASE });
    await expect(client.me()).rejects.toMatchObject({ kind: "refused" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("tag scan input", () => {
  it("accepts a bare token or a tag link ending in the token", () => {
    expect(qrTokenFromScan(" QR-0123456789ABCDEF0123 ")).toBe("QR-0123456789ABCDEF0123");
    expect(qrTokenFromScan("https://frontend.example/judge/scan/QR-0123456789ABCDEF0123")).toBe("QR-0123456789ABCDEF0123");
    expect(qrTokenFromScan("")).toBeNull();
    expect(qrTokenFromScan("../../api/judges")).toBeNull();
  });
});

describe("the judge UI never uses the owner key or X-Judge-Id", () => {
  it.each(["../pages/JudgePortal.tsx", "./judgePortal.ts"])("%s has no X-API-Key / X-Judge-Id", (file) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    expect(source).not.toMatch(/x-api-key/i);
    expect(source).not.toMatch(/x-judge-id/i);
    expect(source).not.toMatch(/localStorage|document\.cookie/);
  });
});
