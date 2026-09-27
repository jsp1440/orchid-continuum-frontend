// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import captured from "@/lib/__fixtures__/evidenceFeedbackReview.realBackend.json";
import {
  EvidenceFeedbackReviewError,
  parseReviewCaseDetail,
  parseReviewDecisionResult,
  parseReviewQueuePage,
  type EvidenceFeedbackReviewClient,
} from "@/lib/evidenceFeedbackReview";
import FeedbackReview from "@/pages/FeedbackReview";

/**
 * Page states and decision flows, driven by REAL responses captured from
 * orchid-calyx-backend PR #1663 running LOCALLY
 * (`__fixtures__/evidenceFeedbackReview.realBackend.json`, synthetic inputs).
 */

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Captured = { status: number; body: unknown };
const C = captured as unknown as {
  _meta: { case_ids: Record<"A" | "B" | "C" | "E", string>; inputs_used: { REJECT_REASON: string; GOVERNED_NOTE: string; corrected_payload_B: Record<string, unknown> } };
  lists: Record<string, Record<string, Captured>>;
  details: Record<string, Captured>;
  decisions: Record<string, Captured>;
  errors: Record<string, Captured>;
  auth: Record<string, Captured>;
};
const IDS = C._meta.case_ids;
const page1 = parseReviewQueuePage(C.lists.stage0.page1.body);
const page2 = parseReviewQueuePage(C.lists.stage0.page2.body);
const detailOf = (key: string, id: string) => parseReviewCaseDetail(C.details[key].body, id);

function refusalFrom(result: Captured): EvidenceFeedbackReviewError {
  const detail = (result.body as { detail: unknown }).detail;
  if (typeof detail === "string") return new EvidenceFeedbackReviewError(result.status, `HTTP_${result.status}`);
  if (Array.isArray(detail)) return new EvidenceFeedbackReviewError(result.status, "REQUEST_VALIDATION_FAILED", { validationMessage: String((detail[0] as { msg: string }).msg).replace(/^Value error,\s*/, "") });
  const { code, current_status } = detail as { code: string; current_status?: string };
  return new EvidenceFeedbackReviewError(result.status, code, { currentStatus: current_status ?? null });
}

type FakeClient = EvidenceFeedbackReviewClient & {
  listCases: ReturnType<typeof vi.fn>;
  getCase: ReturnType<typeof vi.fn>;
  decide: ReturnType<typeof vi.fn>;
};

function fakeClient(overrides: Partial<Record<keyof EvidenceFeedbackReviewClient, ReturnType<typeof vi.fn>>> = {}): FakeClient {
  return {
    listCases: vi.fn(async (query?: { cursor?: string | null }) => (query?.cursor ? page2 : page1)),
    getCase: vi.fn(async (id: string) => {
      if (id === IDS.A) return detailOf("A_stage0", IDS.A);
      if (id === IDS.B) return detailOf("B_stage0", IDS.B);
      if (id === IDS.C) return detailOf("C_stage0", IDS.C);
      return detailOf("E_stage0", IDS.E);
    }),
    decide: vi.fn(),
    ...overrides,
  } as FakeClient;
}

let container: HTMLDivElement;
let root: Root;

const flush = async () => {
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
};

async function render(client: EvidenceFeedbackReviewClient) {
  await act(async () => {
    root.render(createElement(MemoryRouter, null, createElement(FeedbackReview, { client })));
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
  const element = byTestId(id) as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function choose(id: string, value: string) {
  const element = byTestId(id) as HTMLSelectElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flush();
}

const reviewButton = () => byTestId("feedback-decision-review") as HTMLButtonElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("FeedbackReview queue", () => {
  it("lists the captured queue newest first with opaque submitter references and the publication boundary", async () => {
    await render(fakeClient());
    expect(byTestId("feedback-review-boundary-notice")?.textContent).toMatch(/never publish to the knowledge graph/);
    const rows = container.querySelectorAll("[data-testid^='feedback-review-item-']");
    expect(rows).toHaveLength(20);
    const first = byTestId(`feedback-review-item-${IDS.A}`);
    expect(first?.textContent).toContain("Pending review");
    expect(first?.textContent).toContain("1 duplicate");
    expect(first?.textContent).toContain(`submitter ref (opaque) ${page1.items[0].submitter_ref!}`);
    expect(byTestId("feedback-review-queue")?.textContent).not.toContain("@");
  });

  it("pages with the backend cursor and appends the next page", async () => {
    const client = fakeClient();
    await render(client);
    await click("feedback-review-load-more");
    expect(client.listCases).toHaveBeenLastCalledWith({ status: "", objectType: "", cursor: page1.next_cursor });
    expect(container.querySelectorAll("[data-testid^='feedback-review-item-']")).toHaveLength(23);
    expect(byTestId("feedback-review-load-more")).toBeNull();
  });

  it("re-queries from the start when a filter changes", async () => {
    const filtered = parseReviewQueuePage(C.lists.stage0.filter_taxonomy.body);
    const client = fakeClient({ listCases: vi.fn(async (query?: { objectType?: string }) => (query?.objectType === "taxonomy" ? filtered : page1)) });
    await render(client);
    await choose("feedback-review-filter-object-type", "taxonomy");
    expect(client.listCases).toHaveBeenLastCalledWith({ status: "", objectType: "taxonomy" });
    expect(container.querySelectorAll("[data-testid^='feedback-review-item-']")).toHaveLength(1);
    expect(byTestId(`feedback-review-item-${IDS.C}`)).not.toBeNull();
    await choose("feedback-review-filter-status", "governed_review_required");
    expect(client.listCases).toHaveBeenLastCalledWith({ status: "governed_review_required", objectType: "taxonomy" });
  });

  it("explains an expired cursor without dropping the rows already shown", async () => {
    const client = fakeClient({
      listCases: vi.fn(async (query?: { cursor?: string | null }) => {
        if (query?.cursor) throw refusalFrom(C.errors.invalid_cursor);
        return page1;
      }),
    });
    await render(client);
    await click("feedback-review-load-more");
    expect(byTestId("feedback-review-more-error")?.textContent).toMatch(/no longer valid/);
    expect(container.querySelectorAll("[data-testid^='feedback-review-item-']")).toHaveLength(20);
  });

  it("keeps the rows and offers a retry when paging hits a 503", async () => {
    const client = fakeClient({
      listCases: vi.fn(async (query?: { cursor?: string | null }) => {
        // SYNTHETIC shape: the backend's store-unavailable 503 (also returned on PostgreSQL for a cursor with control characters).
        if (query?.cursor) throw new EvidenceFeedbackReviewError(503, "EVIDENCE_FEEDBACK_STORE_UNAVAILABLE");
        return page1;
      }),
    });
    await render(client);
    await click("feedback-review-load-more");
    expect(byTestId("feedback-review-more-error")?.textContent).toMatch(/unavailable right now; try again/);
    expect(container.querySelectorAll("[data-testid^='feedback-review-item-']")).toHaveLength(20);
    expect(byTestId("feedback-review-load-more")).not.toBeNull();
  });

  it("says so when no case matches", async () => {
    await render(fakeClient({ listCases: vi.fn(async () => parseReviewQueuePage({ items: [], next_cursor: null, limit: 20 })) }));
    expect(byTestId("feedback-review-empty")?.textContent).toContain("No submitted cases match");
  });
});

describe("FeedbackReview access and outage states", () => {
  it.each([
    ["anonymous 401", C.auth.anonymous, "sign_in_required", /Sign in at Mission Control/],
    ["API key 403", C.auth.api_key, "owner_session_required", /service API key/],
    ["member 403", C.auth.member, "owner_access_required", /limited to the owner/],
  ])("shows the %s state and no queue", async (_label, result, state, copy) => {
    await render(fakeClient({ listCases: vi.fn().mockRejectedValue(refusalFrom(result)) }));
    const card = byTestId(`feedback-review-access-${state}`);
    expect(card?.textContent).toMatch(copy);
    expect(card?.textContent).toContain("Nothing was changed");
    expect(byTestId("feedback-review-queue")).toBeNull();
    if (state === "owner_access_required") expect(byTestId("feedback-review-sign-in")).toBeNull();
    else expect(byTestId("feedback-review-sign-in")?.getAttribute("href")).toBe("/mission-control");
  });

  it("shows an outage rather than an empty queue when the service cannot be reached", async () => {
    await render(fakeClient({ listCases: vi.fn().mockRejectedValue(new EvidenceFeedbackReviewError(0, "NETWORK_UNAVAILABLE")) }));
    expect(byTestId("feedback-review-access-outage")?.textContent).toMatch(/unavailable/);
    expect(byTestId("feedback-review-empty")).toBeNull();
  });
});

describe("FeedbackReview case detail", () => {
  it("renders the statement and the seen record version as escaped text, with history, duplicates and the boundary", async () => {
    await render(fakeClient());
    await click(`feedback-review-item-${IDS.A}`);
    const statement = byTestId("feedback-review-statement");
    expect(statement?.textContent).toContain("<script>alert('x')</script>");
    expect(container.querySelector("script")).toBeNull();
    expect(byTestId("feedback-review-object-version")?.textContent).toContain('"preferred_term": "Resupination (SYNTHETIC)"');
    expect(byTestId("feedback-review-events")?.textContent).toContain("duplicate submission suppressed");
    expect(byTestId("feedback-review-detail")?.textContent).toContain("Duplicate submissions1");
    expect(byTestId("feedback-review-publication-boundary")?.textContent).toContain(detailOf("A_stage0", IDS.A).publication_boundary);
  });

  it("never renders a raw submitter identity", async () => {
    const leaked = structuredClone(C.details.A_stage0.body) as { case: Record<string, unknown> };
    leaked.case.submitter_id = "submitter.private@example.org"; // SYNTHETIC leak
    await render(fakeClient({ getCase: vi.fn(async () => parseReviewCaseDetail(leaked, IDS.A)) }));
    await click(`feedback-review-item-${IDS.A}`);
    expect(container.textContent).not.toContain("submitter.private@example.org");
    expect(byTestId("feedback-review-detail")?.textContent).toContain(detailOf("A_stage0", IDS.A).case.submitter_ref!);
  });

  it("offers only the decisions the backend allows", async () => {
    await render(fakeClient());
    await click(`feedback-review-item-${IDS.A}`);
    const offered = Array.from(container.querySelectorAll("[data-testid^='feedback-decision-']"))
      .map((element) => element.getAttribute("data-testid"))
      .filter((id) => /^feedback-decision-(reject|needs_governed_review|accept_trivial)$/.test(id ?? ""));
    expect(offered).toEqual(["feedback-decision-reject", "feedback-decision-needs_governed_review"]);

    await click(`feedback-review-item-${IDS.B}`);
    expect(byTestId("feedback-decision-accept_trivial")).not.toBeNull();
  });

  it("shows no decision actions on a resolved case", async () => {
    await render(fakeClient({ getCase: vi.fn(async () => detailOf("A_stage1", IDS.A)) }));
    await click(`feedback-review-item-${IDS.A}`);
    expect(byTestId("feedback-review-no-decisions")?.textContent).toContain("resolved");
    expect(byTestId("feedback-decision-reject")).toBeNull();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("FeedbackReview stale case responses", () => {
  const highlighted = () => container.querySelector("[aria-current='true']")?.getAttribute("data-testid");
  const shownCaseId = () => byTestId("feedback-review-detail")?.querySelector("h2")?.textContent ?? null;

  it("never shows an earlier case that answers after the case now highlighted", async () => {
    const slowA = deferred<ReturnType<typeof detailOf>>();
    const fastB = deferred<ReturnType<typeof detailOf>>();
    const client = fakeClient({ getCase: vi.fn((id: string) => (id === IDS.A ? slowA.promise : fastB.promise)) });
    await render(client);

    await click(`feedback-review-item-${IDS.A}`);
    await click(`feedback-review-item-${IDS.B}`);
    expect(highlighted()).toBe(`feedback-review-item-${IDS.B}`);

    await act(async () => { fastB.resolve(detailOf("B_stage0", IDS.B)); });
    await flush();
    expect(shownCaseId()).toBe(IDS.B);

    // A answers last; it must be ignored.
    await act(async () => { slowA.resolve(detailOf("A_stage0", IDS.A)); });
    await flush();
    expect(highlighted()).toBe(`feedback-review-item-${IDS.B}`);
    expect(shownCaseId()).toBe(IDS.B);
    expect(byTestId("feedback-decision-accept_trivial")).not.toBeNull();
  });

  it("keeps loading the highlighted case when an earlier case answers first, then shows the right one", async () => {
    const slowA = deferred<ReturnType<typeof detailOf>>();
    const slowB = deferred<ReturnType<typeof detailOf>>();
    const client = fakeClient({ getCase: vi.fn((id: string) => (id === IDS.A ? slowA.promise : slowB.promise)) });
    await render(client);

    await click(`feedback-review-item-${IDS.A}`);
    await click(`feedback-review-item-${IDS.B}`);
    await act(async () => { slowA.resolve(detailOf("A_stage0", IDS.A)); });
    await flush();
    expect(byTestId("feedback-review-detail")).toBeNull();
    expect(byTestId("feedback-review-page")?.textContent).toContain("Loading case…");

    await act(async () => { slowB.resolve(detailOf("B_stage0", IDS.B)); });
    await flush();
    expect(highlighted()).toBe(`feedback-review-item-${IDS.B}`);
    expect(shownCaseId()).toBe(IDS.B);
  });

  it("ignores a late failure for an earlier case", async () => {
    const slowA = deferred<ReturnType<typeof detailOf>>();
    const client = fakeClient({
      getCase: vi.fn((id: string) => (id === IDS.A ? slowA.promise : Promise.resolve(detailOf("B_stage0", IDS.B)))),
    });
    await render(client);
    await click(`feedback-review-item-${IDS.A}`);
    await click(`feedback-review-item-${IDS.B}`);
    await act(async () => { slowA.reject(new EvidenceFeedbackReviewError(401, "HTTP_401")); });
    await flush();
    expect(byTestId("feedback-review-access-sign_in_required")).toBeNull();
    expect(byTestId("feedback-review-detail-error")).toBeNull();
    expect(shownCaseId()).toBe(IDS.B);
  });

  it("does not put a decision's refreshed case over another case opened meanwhile", async () => {
    const decision = deferred<ReturnType<typeof parseReviewDecisionResult>>();
    const client = fakeClient();
    client.decide.mockReturnValue(decision.promise);
    await render(client);
    await click(`feedback-review-item-${IDS.A}`);
    await click("feedback-decision-reject");
    await type("feedback-decision-input", C._meta.inputs_used.REJECT_REASON);
    await click("feedback-decision-review");
    await click("feedback-decision-confirm-button");

    await click(`feedback-review-item-${IDS.B}`);
    expect(shownCaseId()).toBe(IDS.B);
    const readsBefore = client.getCase.mock.calls.length;

    await act(async () => { decision.resolve(parseReviewDecisionResult(C.decisions.reject_A.body, "reject", IDS.A)); });
    await flush();
    expect(shownCaseId()).toBe(IDS.B);
    expect(highlighted()).toBe(`feedback-review-item-${IDS.B}`);
    expect(byTestId("feedback-review-decision-result")).toBeNull();
    expect(client.getCase.mock.calls.length).toBe(readsBefore);
    // The decided case's row still reflects the recorded decision.
    expect(byTestId(`feedback-review-item-${IDS.A}`)?.textContent).toContain("Resolved");
  });
});

describe("FeedbackReview decisions", () => {
  it("rejects only with a reason and a confirmation, then shows the recorded result and history", async () => {
    const client = fakeClient();
    client.decide.mockResolvedValue(parseReviewDecisionResult(C.decisions.reject_A.body, "reject", IDS.A));
    await render(client);
    await click(`feedback-review-item-${IDS.A}`);
    client.getCase.mockResolvedValueOnce(detailOf("A_stage1", IDS.A));

    await click("feedback-decision-reject");
    expect(reviewButton().disabled).toBe(true);
    await type("feedback-decision-input", "   ");
    expect(reviewButton().disabled).toBe(true);
    await type("feedback-decision-input", C._meta.inputs_used.REJECT_REASON);
    await click("feedback-decision-review");
    expect(client.decide).not.toHaveBeenCalled();
    expect(byTestId("feedback-decision-confirm")?.textContent).toMatch(/never publish to the knowledge graph/);
    await click("feedback-decision-confirm-button");

    expect(client.decide).toHaveBeenCalledWith(IDS.A, { decision: "reject", reason: C._meta.inputs_used.REJECT_REASON });
    expect(byTestId("feedback-review-decision-result")?.textContent).toBe(
      "Decision recorded: reject. The case is now resolved. Nothing was published.",
    );
    expect(byTestId("feedback-review-events")?.textContent).toContain("owner decision rejected");
    expect(byTestId(`feedback-review-item-${IDS.A}`)?.textContent).toContain("Resolved");
    expect(byTestId("feedback-review-no-decisions")).not.toBeNull();
  });

  it("routes to governed review only with a note, and shows the new unresolved status", async () => {
    const client = fakeClient();
    client.decide.mockResolvedValue(parseReviewDecisionResult(C.decisions.governed_C.body, "needs_governed_review", IDS.C));
    await render(client);
    await click(`feedback-review-item-${IDS.C}`);
    client.getCase.mockResolvedValueOnce(detailOf("C_stage2", IDS.C));
    await click("feedback-decision-needs_governed_review");
    expect(reviewButton().disabled).toBe(true);
    await type("feedback-decision-input", C._meta.inputs_used.GOVERNED_NOTE);
    await click("feedback-decision-review");
    await click("feedback-decision-confirm-button");
    expect(client.decide).toHaveBeenCalledWith(IDS.C, { decision: "needs_governed_review", note: C._meta.inputs_used.GOVERNED_NOTE });
    expect(byTestId("feedback-review-decision-result")?.textContent).toContain("governed review required");
    expect(byTestId(`feedback-review-item-${IDS.C}`)?.textContent).toContain("Governed review required");
    // From governed review the backend allows only a rejection.
    expect(byTestId("feedback-decision-reject")).not.toBeNull();
    expect(byTestId("feedback-decision-needs_governed_review")).toBeNull();
  });

  it("accepts a trivial correction only from valid, changed JSON", async () => {
    const client = fakeClient();
    client.decide.mockResolvedValue(parseReviewDecisionResult(C.decisions.accept_trivial_B.body, "accept_trivial", IDS.B));
    await render(client);
    await click(`feedback-review-item-${IDS.B}`);
    client.getCase.mockResolvedValueOnce(detailOf("B_stage3", IDS.B));
    await click("feedback-decision-accept_trivial");

    const editor = byTestId("feedback-decision-input") as HTMLTextAreaElement;
    expect(JSON.parse(editor.value)).toEqual(detailOf("B_stage0", IDS.B).object_version?.payload);
    expect(byTestId("feedback-decision-payload-error")?.textContent).toMatch(/identical/);
    expect(reviewButton().disabled).toBe(true);

    await type("feedback-decision-input", "{ not json");
    expect(byTestId("feedback-decision-payload-error")?.textContent).toBe("The corrected payload is not valid JSON.");
    expect(reviewButton().disabled).toBe(true);
    await type("feedback-decision-input", "[1, 2]");
    expect(byTestId("feedback-decision-payload-error")?.textContent).toBe("The corrected payload must be a JSON object.");

    await type("feedback-decision-input", JSON.stringify(C._meta.inputs_used.corrected_payload_B, null, 2));
    expect(byTestId("feedback-decision-payload-error")).toBeNull();
    await click("feedback-decision-review");
    await click("feedback-decision-confirm-button");
    expect(client.decide).toHaveBeenCalledWith(IDS.B, { decision: "accept_trivial", corrected_payload: C._meta.inputs_used.corrected_payload_B });
    expect(byTestId("feedback-review-resulting-version")?.textContent).toContain("modified median petal");
    expect(byTestId("feedback-review-decision-result")?.textContent).toContain("Nothing was published");
  });

  it("explains a refused decision in plain language and changes nothing", async () => {
    const client = fakeClient();
    client.decide.mockRejectedValue(refusalFrom(C.errors.accept_trivial_governed));
    await render(client);
    await click(`feedback-review-item-${IDS.B}`);
    await click("feedback-decision-accept_trivial");
    await type("feedback-decision-input", JSON.stringify(C._meta.inputs_used.corrected_payload_B));
    await click("feedback-decision-review");
    await click("feedback-decision-confirm-button");
    expect(byTestId("feedback-review-decision-error")?.textContent).toBe(
      "This correction cannot be accepted as a trivial fix; it needs governed review. Nothing was changed.",
    );
    expect(byTestId(`feedback-review-item-${IDS.B}`)?.textContent).toContain("Pending review");
    expect(byTestId("feedback-review-decision-result")).toBeNull();
  });

  it("explains an invalid transition with the backend's current status", async () => {
    const client = fakeClient();
    client.decide.mockRejectedValue(refusalFrom(C.errors.invalid_transition));
    await render(client);
    await click(`feedback-review-item-${IDS.A}`);
    await click("feedback-decision-needs_governed_review");
    await type("feedback-decision-input", "SYNTHETIC second decision");
    await click("feedback-decision-review");
    await click("feedback-decision-confirm-button");
    expect(byTestId("feedback-review-decision-error")?.textContent).toMatch(/the case is now resolved/);
  });

  it("sends exactly one decision request when the confirmation is clicked twice in the same tick", async () => {
    const client = fakeClient();
    let resolveDecision!: (value: unknown) => void;
    client.decide.mockImplementation(() => new Promise((resolve) => { resolveDecision = resolve; }));
    await render(client);
    await click(`feedback-review-item-${IDS.A}`);
    client.getCase.mockResolvedValueOnce(detailOf("A_stage1", IDS.A));
    await click("feedback-decision-reject");
    await type("feedback-decision-input", C._meta.inputs_used.REJECT_REASON);
    await click("feedback-decision-review");

    const confirmButton = byTestId("feedback-decision-confirm-button")!;
    // Both clicks land before React re-renders, so the button is still enabled
    // for the second one; only the synchronous guard can stop it.
    await act(async () => {
      confirmButton.click();
      confirmButton.click();
    });
    await flush();
    expect(client.decide).toHaveBeenCalledTimes(1);

    await act(async () => { resolveDecision(parseReviewDecisionResult(C.decisions.reject_A.body, "reject", IDS.A)); });
    await flush();
    expect(client.decide).toHaveBeenCalledTimes(1);
    expect(byTestId("feedback-review-decision-result")?.textContent).toContain("Decision recorded: reject");
  });

  it("allows a new decision once the previous request has settled", async () => {
    const client = fakeClient();
    client.decide.mockRejectedValueOnce(refusalFrom(C.errors.accept_trivial_governed));
    await render(client);
    await click(`feedback-review-item-${IDS.A}`);
    await click("feedback-decision-reject");
    await type("feedback-decision-input", C._meta.inputs_used.REJECT_REASON);
    await click("feedback-decision-review");
    await click("feedback-decision-confirm-button");
    expect(byTestId("feedback-review-decision-error")).not.toBeNull();

    client.decide.mockResolvedValueOnce(parseReviewDecisionResult(C.decisions.reject_A.body, "reject", IDS.A));
    await click("feedback-decision-confirm-button");
    expect(client.decide).toHaveBeenCalledTimes(2);
    expect(byTestId("feedback-review-decision-result")?.textContent).toContain("Decision recorded: reject");
  });

  it("says an idempotent repeat changed nothing", async () => {
    const client = fakeClient();
    client.decide.mockResolvedValue(parseReviewDecisionResult(C.decisions.reject_A_repeat.body, "reject", IDS.A));
    await render(client);
    await click(`feedback-review-item-${IDS.A}`);
    await click("feedback-decision-reject");
    await type("feedback-decision-input", C._meta.inputs_used.REJECT_REASON);
    await click("feedback-decision-review");
    await click("feedback-decision-confirm-button");
    expect(byTestId("feedback-review-decision-result")?.textContent).toMatch(/was already recorded; nothing changed/);
  });
});
