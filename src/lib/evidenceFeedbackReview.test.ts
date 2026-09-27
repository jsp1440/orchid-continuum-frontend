import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import captured from "@/lib/__fixtures__/evidenceFeedbackReview.realBackend.json";
import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";
import {
  EvidenceFeedbackReviewError,
  REVIEW_PAGE_SIZE,
  createEvidenceFeedbackReviewClient,
  parseReviewCaseDetail,
  parseReviewDecisionResult,
  parseReviewQueuePage,
  reviewAccessState,
  reviewErrorMessage,
  reviewQueuePath,
} from "@/lib/evidenceFeedbackReview";

/**
 * Every response body below comes from `__fixtures__/evidenceFeedbackReview.realBackend.json`:
 * REAL responses from orchid-calyx-backend PR #1663 running LOCALLY (see its
 * `_meta`; synthetic inputs, never production). Bodies marked SYNTHETIC are
 * error shapes the backend can emit but the captured sequence cannot reach.
 */

type Captured = { status: number; body: unknown };
const C = captured as unknown as {
  _meta: { case_ids: Record<"A" | "B" | "C" | "E", string>; inputs_used: { REJECT_REASON: string; GOVERNED_NOTE: string; corrected_payload_B: Record<string, unknown> } };
  auth: Record<"anonymous" | "api_key" | "member" | "member_decision", Captured>;
  lists: Record<string, Record<string, Captured>>;
  details: Record<string, Captured>;
  decisions: Record<string, Captured>;
  errors: Record<string, Captured>;
};
const IDS = C._meta.case_ids;
const REVIEW = `${CALYX_BACKEND_BASE_URL}/api/evidence-feedback/review`;

const fetchMock = vi.fn();

function respond(result: Captured) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(result.body), { status: result.status, headers: { "Content-Type": "application/json" } }));
}

async function refusal(promise: Promise<unknown>): Promise<EvidenceFeedbackReviewError> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(EvidenceFeedbackReviewError);
  return error as EvidenceFeedbackReviewError;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("review queue requests", () => {
  it("asks for the owner queue with credentials and no client-set Authorization header", async () => {
    respond(C.lists.stage0.page1);
    const page = await createEvidenceFeedbackReviewClient().listCases();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${REVIEW}/cases?limit=${REVIEW_PAGE_SIZE}`);
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
    // The owner transport (backendConfig) adds the owner bearer; this client
    // never attaches any token itself, so no member token can ride along.
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(page.items).toHaveLength(20);
    expect(page.next_cursor).toBe((C.lists.stage0.page1.body as { next_cursor: string }).next_cursor);
  });

  it("encodes filters and the cursor exactly as the backend reads them", () => {
    expect(reviewQueuePath({ status: "pending_review", objectType: "lexicon" })).toBe("/cases?status=pending_review&object_type=lexicon&limit=20");
    expect(reviewQueuePath({ status: "", objectType: "", cursor: "eyJj+/=" })).toBe("/cases?limit=20&cursor=eyJj%2B%2F%3D");
  });

  it("parses the captured second page and its end-of-queue cursor", async () => {
    respond(C.lists.stage0.page2);
    const page = await createEvidenceFeedbackReviewClient().listCases({ cursor: "abc" });
    expect(page.items).toHaveLength(3);
    expect(page.next_cursor).toBeNull();
  });

  it("posts exactly one decision field, trimmed", async () => {
    respond(C.decisions.reject_A);
    const client = createEvidenceFeedbackReviewClient();
    const result = await client.decide(IDS.A, { decision: "reject", reason: `  ${C._meta.inputs_used.REJECT_REASON}  ` });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${REVIEW}/cases/${IDS.A}/decision`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ decision: "reject", reason: C._meta.inputs_used.REJECT_REASON });
    expect(result.case.status).toBe("resolved");
    expect(result.allowed_decisions).toEqual([]);

    respond(C.decisions.governed_C);
    await client.decide(IDS.C, { decision: "needs_governed_review", note: C._meta.inputs_used.GOVERNED_NOTE });
    expect(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body))).toEqual({
      decision: "needs_governed_review",
      note: C._meta.inputs_used.GOVERNED_NOTE,
    });

    respond(C.decisions.accept_trivial_B);
    const accepted = await client.decide(IDS.B, { decision: "accept_trivial", corrected_payload: C._meta.inputs_used.corrected_payload_B });
    expect(JSON.parse(String((fetchMock.mock.calls[2] as [string, RequestInit])[1].body))).toEqual({
      decision: "accept_trivial",
      corrected_payload: C._meta.inputs_used.corrected_payload_B,
    });
    expect(accepted.case.resulting_version_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("fail-closed projections of the captured payloads", () => {
  it("keeps the case, its history, the seen version and the backend's publication boundary", () => {
    const detail = parseReviewCaseDetail(C.details.A_stage0.body, IDS.A);
    expect(detail.case.statement).toContain("<script>");
    expect(detail.duplicate_count).toBe(1);
    expect(detail.events.map((event) => event.event)).toEqual(["case_submitted", "duplicate_submission_suppressed"]);
    expect(detail.object_version_available).toBe(true);
    expect(detail.object_version?.payload.preferred_term).toBe("Resupination (SYNTHETIC)");
    expect(detail.allowed_decisions).toEqual(["reject", "needs_governed_review"]);
    expect(detail.publication_boundary).toMatch(/never publish to the knowledge graph/);
    expect(parseReviewCaseDetail(C.details.B_stage0.body, IDS.B).allowed_decisions).toEqual(["reject", "needs_governed_review", "accept_trivial"]);
    expect(parseReviewCaseDetail(C.details.C_stage2.body, IDS.C).case.status).toBe("governed_review_required");
    expect(parseReviewCaseDetail(C.details.B_stage3.body, IDS.B).resulting_object_version?.payload.quick_definition).toBe(
      C._meta.inputs_used.corrected_payload_B.quick_definition,
    );
  });

  it("never carries a raw identity field into the page, even if a backend sent one", () => {
    const leaked = structuredClone(C.details.A_stage0.body) as { case: Record<string, unknown> };
    leaked.case.submitter_id = "submitter.private@example.org"; // SYNTHETIC leak
    leaked.case.reviewer_id = "owner.private@example.org"; // SYNTHETIC leak
    const detail = parseReviewCaseDetail(leaked, IDS.A);
    expect(JSON.stringify(detail)).not.toContain("@example.org");
    const list = structuredClone(C.lists.stage0.page1.body) as { items: Array<Record<string, unknown>> };
    list.items[0].submitter_email = "submitter.private@example.org"; // SYNTHETIC leak
    expect(JSON.stringify(parseReviewQueuePage(list))).not.toContain("@example.org");
  });

  it.each([
    ["no publication boundary", (body: Record<string, unknown>) => { delete body.publication_boundary; }],
    ["a blank publication boundary", (body: Record<string, unknown>) => { body.publication_boundary = "  "; }],
    ["events that are not a list", (body: Record<string, unknown>) => { body.events = null; }],
    ["a case without a status", (body: Record<string, unknown>) => { delete (body.case as Record<string, unknown>).status; }],
    ["a negative duplicate count", (body: Record<string, unknown>) => { body.duplicate_count = -1; }],
    ["an object version without a payload", (body: Record<string, unknown>) => { (body.object_version as Record<string, unknown>).payload = "x"; }],
  ])("refuses a detail with %s (SYNTHETIC corruption of the capture)", (_label, corrupt) => {
    const body = structuredClone(C.details.A_stage0.body) as Record<string, unknown>;
    corrupt(body);
    expect(() => parseReviewCaseDetail(body, IDS.A)).toThrow(expect.objectContaining({ code: "INVALID_RESPONSE" }));
  });

  it("refuses a detail for a different case than the one requested", () => {
    expect(() => parseReviewCaseDetail(C.details.A_stage0.body, IDS.B)).toThrow(expect.objectContaining({ code: "INVALID_RESPONSE" }));
  });

  it("refuses a queue page whose items are not a list or whose cursor is malformed", () => {
    expect(() => parseReviewQueuePage({ items: null, next_cursor: null, limit: 20 })).toThrow(expect.objectContaining({ code: "INVALID_RESPONSE" }));
    expect(() => parseReviewQueuePage({ items: [], next_cursor: 7, limit: 20 })).toThrow(expect.objectContaining({ code: "INVALID_RESPONSE" }));
    expect(() => parseReviewQueuePage({ items: [], next_cursor: "", limit: 20 })).toThrow(expect.objectContaining({ code: "INVALID_RESPONSE" }));
  });

  it("refuses a decision result for another decision or another case", () => {
    expect(() => parseReviewDecisionResult(C.decisions.reject_A.body, "needs_governed_review", IDS.A)).toThrow(expect.objectContaining({ code: "INVALID_RESPONSE" }));
    expect(() => parseReviewDecisionResult(C.decisions.reject_A.body, "reject", IDS.B)).toThrow(expect.objectContaining({ code: "INVALID_RESPONSE" }));
    expect(parseReviewDecisionResult(C.decisions.reject_A_repeat.body, "reject", IDS.A).idempotent).toBe(true);
  });

  it("drops decision names it does not implement", () => {
    const body = structuredClone(C.details.B_stage0.body) as Record<string, unknown>;
    body.allowed_decisions = ["reject", "publish_to_graph"]; // SYNTHETIC unknown decision
    expect(parseReviewCaseDetail(body, IDS.B).allowed_decisions).toEqual(["reject"]);
  });
});

describe("refusals, in plain language", () => {
  it.each([
    ["anonymous", C.auth.anonymous, 401, "HTTP_401", "sign_in_required", /Sign in at Mission Control/],
    ["service API key", C.auth.api_key, 403, "OWNER_SESSION_REQUIRED", "owner_session_required", /API key is not accepted/],
    ["verified member", C.auth.member, 403, "OWNER_ACCESS_REQUIRED", "owner_access_required", /limited to the owner/],
    ["invalid cursor", C.errors.invalid_cursor, 422, "INVALID_REVIEW_CURSOR", null, /Reload the queue/],
  ])("maps the captured %s refusal on the queue", async (_label, result, status, code, access, copy) => {
    respond(result);
    const error = await refusal(createEvidenceFeedbackReviewClient().listCases());
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
    expect(reviewAccessState(error)).toBe(access);
    expect(reviewErrorMessage(error)).toMatch(copy);
  });

  it("maps the captured decision refusals", async () => {
    const client = createEvidenceFeedbackReviewClient();
    respond(C.errors.invalid_transition);
    const transition = await refusal(client.decide(IDS.A, { decision: "needs_governed_review", note: "x" }));
    expect(transition.status).toBe(409);
    expect(transition.currentStatus).toBe("resolved");
    expect(reviewErrorMessage(transition)).toBe(
      "This decision is not allowed any more: the case is now resolved. Reload the case to see its current decisions. Nothing was changed.",
    );

    respond(C.errors.accept_trivial_governed);
    const governed = await refusal(client.decide(IDS.E, { decision: "accept_trivial", corrected_payload: {} }));
    expect([governed.status, governed.code]).toEqual([409, "GOVERNED_REVIEW_REQUIRED"]);
    expect(reviewErrorMessage(governed)).toMatch(/needs governed review/);

    respond(C.errors.reject_blank_reason);
    const blank = await refusal(client.decide(IDS.A, { decision: "reject", reason: "   " }));
    expect([blank.status, blank.code]).toEqual([422, "REQUEST_VALIDATION_FAILED"]);
    expect(reviewErrorMessage(blank)).toBe("The decision was incomplete: reason is required for decision reject. Nothing was changed.");

    respond(C.errors.not_found);
    const missing = await refusal(client.getCase("efc-000000000000000000000000"));
    expect([missing.status, missing.code]).toEqual([404, "CASE_NOT_FOUND"]);
    expect(reviewAccessState(missing)).toBeNull();

    respond(C.auth.member_decision);
    expect(reviewAccessState(await refusal(client.decide(IDS.A, { decision: "reject", reason: "x" })))).toBe("owner_access_required");
  });

  it.each([
    // SYNTHETIC: codes the backend emits for trivial-correction guards that the captured sequence cannot reach.
    [409, "SCIENTIFIC_OBJECT_CANNOT_AUTO_CORRECT", /Only lexicon wording/],
    [422, "DEFECT_CLASS_NOT_AUTO_CORRECTABLE", /Only typo or formatting defects/],
    [409, "STALE_OBJECT_VERSION", /record changed/],
  ])("explains %s %s", async (status, code, copy) => {
    respond({ status, body: { detail: { code } } });
    const error = await refusal(createEvidenceFeedbackReviewClient().decide(IDS.B, { decision: "accept_trivial", corrected_payload: {} }));
    expect(reviewErrorMessage(error)).toMatch(copy);
    expect(reviewAccessState(error)).toBeNull();
  });

  it("treats network failure, 503, a non-JSON body and an unmounted route as outage/unavailable, never as an empty queue", async () => {
    const client = createEvidenceFeedbackReviewClient();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(reviewAccessState(await refusal(client.listCases()))).toBe("outage");
    respond({ status: 503, body: { detail: { code: "EVIDENCE_FEEDBACK_STORE_UNAVAILABLE" } } }); // SYNTHETIC shape
    expect(reviewAccessState(await refusal(client.listCases()))).toBe("outage");
    fetchMock.mockResolvedValueOnce(new Response("<html>bad gateway</html>", { status: 502 }));
    expect(reviewAccessState(await refusal(client.listCases()))).toBe("outage");
    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 200 }));
    expect((await refusal(client.listCases())).code).toBe("INVALID_RESPONSE");
    respond({ status: 404, body: { detail: "Not Found" } }); // FastAPI's unmounted-route body
    expect(reviewAccessState(await refusal(client.listCases()))).toBe("unavailable");
  });
});
