// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import captured from "@/lib/__fixtures__/evidenceFeedbackMember.realBackend.json";
import {
  formatSafeJson,
  neutraliseFormatCharacters,
  parseReviewCaseDetail,
  parseReviewQueuePage,
  submittedByText,
  type EvidenceFeedbackReviewClient,
} from "@/lib/evidenceFeedbackReview";
import FeedbackReview from "@/pages/FeedbackReview";

/**
 * Owner review of MEMBER submissions (Release 1 "Members submit, owner
 * reviews"), driven by REAL responses captured from the Calyx backend running
 * LOCALLY (`__fixtures__/evidenceFeedbackMember.realBackend.json`, SYNTHETIC
 * inputs; see its `_meta`). The format-character variants below are the same
 * real bodies with SYNTHETIC characters inserted, labelled as such: the
 * backend refuses them in member input, so the review's neutralisation is
 * defence in depth for anything already stored.
 *
 * Format characters are written as escapes in this file (see
 * src/sourceFormatCharacters.test.ts).
 */

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Captured = { status: number; body: Record<string, unknown> };
const R = (captured as unknown as { responses: Record<string, Captured> }).responses;
const RLO = "\u202e";
const ZWSP = "\u200b";
const ANY_FORMAT_CHARACTER = /\p{Cf}/u;

const queue = parseReviewQueuePage(R.owner_review_queue.body);
const memberCaseId = queue.items[0].case_id;

function detailWithFormatCharacters(): Record<string, unknown> {
  // SYNTHETIC mutation of the real detail body.
  const body = structuredClone(R.owner_review_detail_registered_by.body) as {
    case: Record<string, unknown>;
    object_version: { payload: Record<string, unknown> };
  };
  body.case.statement = `SYNTHETIC approve${RLO}reject`;
  body.case.page_context = `/lexicon/x${ZWSP}`;
  body.object_version.payload = { quick_definition: `SYNTHETIC${RLO}text`, [`key${ZWSP}`]: 1 };
  return body;
}

let container: HTMLDivElement;
let root: Root;
const flush = async () => {
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
};

async function renderAndOpen(detailBody: unknown) {
  const client = {
    listCases: vi.fn(async () => queue),
    getCase: vi.fn(async (id: string) => parseReviewCaseDetail(detailBody, id)),
    decide: vi.fn(),
  } as unknown as EvidenceFeedbackReviewClient;
  await act(async () => {
    root.render(createElement(MemoryRouter, null, createElement(FeedbackReview, { client })));
  });
  await flush();
  const item = container.querySelector<HTMLElement>(`[data-testid="feedback-review-item-${memberCaseId}"]`);
  expect(item).not.toBeNull();
  await act(async () => { item!.click(); });
  await flush();
}
const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("owner review labels member submissions", () => {
  it("the real queue and detail carry the member role and the provisional snapshot", () => {
    expect(queue.items[0]).toMatchObject({ submitter_role: "member", object_type_source: "member_claimed" });
    const detail = parseReviewCaseDetail(R.owner_review_detail_registered_by.body, memberCaseId);
    expect(detail.case.submitter_role).toBe("member");
    expect(detail.object_version_provisional).toBe(true);
    expect(detail.object_version?.registered_by_role).toBe("member");
    expect(detail.allowed_decisions).not.toContain("accept_trivial");
  });

  it("labels the case, the queue entry and the provisional snapshot on the page", async () => {
    await renderAndOpen(R.owner_review_detail_registered_by.body);
    expect(byTestId("feedback-review-member-badge")?.textContent).toContain("member submission");
    expect(byTestId("feedback-review-submitted-by")?.textContent).toBe("A member");
    expect(container.textContent).toContain("record type is the member's claim");
    expect(byTestId("feedback-review-registered-by")?.textContent).toMatch(/member session/);
    expect(container.textContent).toContain("provisional member snapshot");
  });

  it("plain-language submitter roles", () => {
    expect(submittedByText("member")).toBe("A member");
    expect(submittedByText("owner_session")).toBe("The owner session");
    expect(submittedByText("api_key")).toBe("The backend API key");
    expect(submittedByText(null)).toBe("Not recorded");
  });
});

describe("format characters never render raw in the owner review", () => {
  it("neutralises strings to visible markers", () => {
    expect(neutraliseFormatCharacters(`a${RLO}b${ZWSP}c`)).toBe("a[U+202E]b[U+200B]c");
    expect(neutraliseFormatCharacters("plain")).toBe("plain");
  });

  it("escapes JSON so it is visible and round-trips exactly", () => {
    const payload = { quick_definition: `x${RLO}y`, [`k${ZWSP}`]: [`z${ZWSP}`] };
    const text = formatSafeJson(payload);
    expect(ANY_FORMAT_CHARACTER.test(text)).toBe(false);
    expect(text).toContain("\\u202e");
    expect(JSON.parse(text)).toEqual(payload);
  });

  it("renders a stored statement, page context and payload with no raw format character", async () => {
    await renderAndOpen(detailWithFormatCharacters());
    expect(ANY_FORMAT_CHARACTER.test(container.textContent ?? "")).toBe(false);
    expect(byTestId("feedback-review-statement")?.textContent).toBe("SYNTHETIC approve[U+202E]reject");
    expect(container.textContent).toContain("/lexicon/x[U+200B]");
    const payload = byTestId("feedback-review-object-version")?.textContent ?? "";
    expect(payload).toContain("SYNTHETIC\\u202etext");
    expect(payload).toContain("key\\u200b");
  });
});
