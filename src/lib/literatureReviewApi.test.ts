// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backendConfig", () => ({ CALYX_BACKEND_BASE_URL: "https://calyx.test" }));

import {
  LiteratureReviewError,
  REVIEWER_TOKEN_STORAGE_KEY,
  DECISION_LABELS,
  VERDICT_LABELS,
  describeReviewFailure,
  enumLabel,
  getContributor,
  getCurationQueue,
  safeHttpsUrl,
  topicLabel,
  getItem,
  getMe,
  listContributors,
  listItems,
  readReviewerToken,
  registerReviewer,
  storeReviewerToken,
  submitCardReview,
  updateRecognition,
} from "./literatureReviewApi";

type Call = { url: string; init: RequestInit };

function stubFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(body === undefined ? "" : JSON.stringify(body), { status, headers });
    }),
  );
  return calls;
}

const TOKEN = "synthetic-reviewer-token-abc";
const CARD = {
  item_id: "card:f-1",
  kind: "card",
  item_version: 2,
  doi: "10.0000/synthetic.1",
  paper_title: "A synthetic paper",
  citation: "Author A (2020) A synthetic paper.",
  topic: "pollination",
  input_note: "Abstract and results section",
  status: "unreviewed_machine_extraction",
  notice: "Unreviewed machine extraction",
  paper_item_id: "paper:10.0000/synthetic.1",
  claim: "Species X is pollinated by bee Y.",
  orchid_name: "Species X",
  evidence_quote: "observed visits by bee Y",
  source_locator: "Results, para 2",
  evidence_type: "observation",
};

beforeEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("literature review client", () => {
  it("sends the reviewer token as Bearer and the honeypot on submissions; omits supersedes", async () => {
    const calls = stubFetch(201, {
      submission_id: "s-1",
      item_id: "card:f-1",
      item_version: 2,
      doi: "10.0000/synthetic.1",
      submitted_at: "2026-11-25T00:00:00Z",
      item_version_was_current: true,
      supersedes_submission_id: null,
    });
    const receipt = await submitCardReview(TOKEN, { item_id: "card:f-1", item_version: 2 }, {
      verdict: "not_sure",
      corrections: ["taxon"],
      explanation: "",
      source_citation: "",
    });
    expect(receipt.submission_id).toBe("s-1");
    expect(calls[0].url).toBe("https://calyx.test/api/literature-review/submissions");
    expect(new Headers(calls[0].init.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.website).toBe("");
    expect(body.verdict).toBe("not_sure");
    expect(body).not.toHaveProperty("supersedes_submission_id");
    expect(calls[0].init.credentials).toBe("omit");
  });

  it("sends the honeypot and separate opt-in on registration", async () => {
    const calls = stubFetch(201, { reviewer_token: TOKEN });
    const token = await registerReviewer({
      name: "Reviewer A",
      email: "reviewer-a@example.org",
      future_invitations_opt_in: false,
      privacy_ack: true,
      website: "",
    });
    expect(token).toBe(TOKEN);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({ website: "", future_invitations_opt_in: false, privacy_ack: true });
    expect(new Headers(calls[0].init.headers).has("Authorization")).toBe(false);
  });

  it("never attaches the reviewer token to curator requests", async () => {
    storeReviewerToken(TOKEN);
    const calls = stubFetch(200, { principal_id: "owner", items: [] });
    await getCurationQueue();
    expect(new Headers(calls[0].init.headers).has("Authorization")).toBe(false);
    expect(calls[0].init.credentials).toBe("include");
  });

  it("stores the token under a namespaced key and never logs it", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    storeReviewerToken(TOKEN);
    expect(localStorage.getItem(REVIEWER_TOKEN_STORAGE_KEY)).toBe(TOKEN);
    expect(readReviewerToken()).toBe(TOKEN);
    stubFetch(401, { detail: { code: "REVIEWER_TOKEN_INVALID", message: "invalid" } });
    await expect(getMe(TOKEN)).rejects.toBeInstanceOf(LiteratureReviewError);
    for (const spy of spies) {
      for (const args of spy.mock.calls) expect(JSON.stringify(args)).not.toContain(TOKEN);
      spy.mockRestore();
    }
  });

  it("encodes DOI slashes in item_id path params", async () => {
    const calls = stubFetch(200, { ...CARD, kind: "paper", item_id: "paper:10.0000/synthetic.1", card_item_ids: ["card:f-1"] });
    await getItem("paper:10.0000/synthetic.1");
    expect(calls[0].url).toBe("https://calyx.test/api/literature-review/items/paper%3A10.0000%2Fsynthetic.1");
  });

  it("drops fields the pages must never show (model name, run id, confidence)", async () => {
    stubFetch(200, { purpose: "p", notice: "n", items: [{ ...CARD, model: "some-model", run_id: "r-9", confidence: 0.9 }] });
    const [item] = await listItems({ kind: "card" });
    expect(item).not.toHaveProperty("model");
    expect(item).not.toHaveProperty("run_id");
    expect(item).not.toHaveProperty("confidence");
    expect(item.kind === "card" && item.paper_item_id).toBe("paper:10.0000/synthetic.1");
  });

  it("fails closed with typed errors and never returns placeholder data", async () => {
    stubFetch(503, { detail: { code: "LITERATURE_REVIEW_STORE_NOT_PROVISIONED", message: "x" } });
    await expect(listItems()).rejects.toMatchObject({ kind: "unavailable", code: "LITERATURE_REVIEW_STORE_NOT_PROVISIONED" });
    stubFetch(200, { contributors: "nope" });
    await expect(listContributors()).rejects.toMatchObject({ kind: "malformed" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    await expect(listItems()).rejects.toMatchObject({ kind: "network" });
  });

  it("explains locality, https and rate-limit refusals clearly", async () => {
    stubFetch(422, { detail: { code: "LOCALITY_IN_PUBLIC_TEXT", message: "x" } });
    const locality = await updateRecognition(TOKEN, { consent: true, display_name: "A", description: "d" }).catch((e) => e);
    expect(describeReviewFailure(locality)).toMatch(/locality/i);
    stubFetch(422, { detail: { code: "LINK_NOT_HTTPS", message: "x" } });
    const link = await updateRecognition(TOKEN, { consent: true, display_name: "A", description: "d" }).catch((e) => e);
    expect(describeReviewFailure(link)).toMatch(/https/);
    stubFetch(429, { detail: { code: "LITERATURE_REVIEW_RATE_LIMITED", message: "slow" } }, { "Retry-After": "120" });
    const limited = await submitCardReview(TOKEN, { item_id: "card:f-1", item_version: 2 }, {
      verdict: "supported",
      corrections: [],
      explanation: "",
      source_citation: "",
    }).catch((e) => e);
    expect(limited).toMatchObject({ kind: "rate_limited", retryAfterSeconds: 120 });
    expect(describeReviewFailure(limited)).toMatch(/120 seconds/);
  });

  it("reads the FastAPI default validation list without crashing", async () => {
    stubFetch(422, { detail: [{ loc: ["body", "email"], msg: "value is not a valid email address", type: "value_error" }] });
    const err = await registerReviewer({ name: "A", email: "bad", future_invitations_opt_in: false, privacy_ack: true, website: "" }).catch((e) => e);
    expect(err).toMatchObject({ kind: "rejected" });
    expect(describeReviewFailure(err)).toMatch(/not a valid email/);
  });

  it("normalises the /me contract", async () => {
    stubFetch(200, {
      profile: {
        reviewer_id: "rv-1",
        name: "Reviewer A",
        email: "reviewer-a@example.org",
        education_training: null,
        future_invitations_opt_in: false,
        future_invitations_updated_at: null,
        created_at: "2026-11-01T00:00:00Z",
      },
      submissions: [],
      progress: {
        paper_reviews: { verified: 1, required: 3, met: false },
        claim_reviews: { verified: 10, required: 10, met: true },
        eligible_bases: ["claim_reviews"],
        submissions_total: 11,
        pending_verification: 0,
        awarded_automatically: false,
      },
      award: null,
      recognition: null,
      resume_wording: null,
      authorship_note: "Authorship is handled separately.",
      privacy_notice: "Private.",
    });
    const me = await getMe(TOKEN);
    expect(me.progress.claim_reviews).toEqual({ verified: 10, required: 10, met: true });
    expect(me.progress.eligible_bases).toEqual(["claim_reviews"]);
    expect(me.award).toBeNull();
    expect(me.resume_wording).toBeNull();
  });

  it("keeps unknown enumerated values verbatim instead of substituting known ones", async () => {
    stubFetch(200, {
      principal_id: "owner",
      items: [
        {
          item: { ...CARD, topic: "ethnobotany" },
          current_item_version: 2,
          submissions: [
            {
              submission_id: "s-1",
              reviewer: { reviewer_id: "rv-1", name: "Reviewer A", email: "reviewer-a@example.org" },
              item_version: 2,
              verdict: "maybe",
              corrections: ["taxon", "geography"],
              verification: { counts_toward_recognition: "yes", note: "" },
            },
            { submission_id: "s-2", reviewer: {}, item_version: 2, verdict: "supported", corrections: [], verification: null },
          ],
          agreement: { versions: [{ item_version: 2, submissions: 2, status: "partial", verdict_counts: { supported: 1, maybe: 1 }, corrections: { geography: 1 } }] },
          decisions: [{ decision: "escalate", note: "", curator_principal: "owner", submission_ids: [], decided_at: "t" }],
          latest_decision: { decision: "escalate", note: "", curator_principal: "owner", submission_ids: [], decided_at: "t" },
        },
      ],
    });
    const [entry] = await getCurationQueue();
    expect(topicLabel(entry.item.topic)).toBe("Unknown value: ethnobotany");
    expect(enumLabel(DECISION_LABELS, entry.latest_decision!.decision)).toBe("Unknown value: escalate");
    expect(entry.decisions[0].decision).toBe("escalate");
    const [a, b] = entry.submissions;
    expect(enumLabel(VERDICT_LABELS, a.verdict)).toBe("Unknown value: maybe");
    expect(a.corrections).toEqual(["taxon", "geography"]);
    expect(a.verification).toMatchObject({ counts_toward_recognition: null, counts_raw: "yes" });
    expect(b.verification).toBeNull();
    expect(entry.agreement[0].status).toBe("partial");
    expect(entry.agreement[0].verdict_counts).toEqual({ supported: 1, maybe: 1 });
    expect(entry.agreement[0].corrections).toEqual({ geography: 1 });
  });

  it("accepts only clean https links, re-serialised", () => {
    expect(safeHttpsUrl("https://example.org/a b")).toBeNull();
    expect(safeHttpsUrl(" https://example.org")).toBeNull();
    expect(safeHttpsUrl('https://example.org/"x')).toBeNull();
    expect(safeHttpsUrl("https://example.org/'x")).toBeNull();
    expect(safeHttpsUrl("https://example.org/<x>")).toBeNull();
    expect(safeHttpsUrl("https://example.org\\x")).toBeNull();
    expect(safeHttpsUrl("http://example.org")).toBeNull();
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpsUrl("HTTPS://Example.ORG")).toBe("https://example.org/");
  });

  it("builds the citable path from the slug only and drops unsafe links", async () => {
    stubFetch(200, {
      slug: "reviewer-a-x1y2",
      display_name: "Reviewer A",
      link: "http://insecure.example.org",
      description: "d",
      citable_path: "/contributors/../curation/literature",
    });
    const entry = await getContributor("reviewer-a-x1y2");
    expect(entry.citable_path).toBe("/contributors/reviewer-a-x1y2");
    expect(entry.link).toBeNull();
    stubFetch(200, { slug: "../curation", display_name: "X", description: "d" });
    expect((await getContributor("x")).citable_path).toBe("/contributors/..%2Fcuration");
  });
});
