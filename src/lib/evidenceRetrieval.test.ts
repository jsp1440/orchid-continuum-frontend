import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EvidenceRetrievalError,
  isExcerptWithheld,
  isSearchableQuery,
  isTraceable,
  normalizeQuery,
  retrieveEvidence,
} from "./evidenceRetrieval";

/**
 * The governed evidence-retrieval client.
 *
 * The contract was read from app/evidence_retrieval/{routes,models,engine}.py.
 * These tests hold the client to that contract and, more importantly, to the
 * error taxonomy: the whole router sits behind verify_owner_or_api_key, so
 * "not authorised" and "index unavailable" are ordinary outcomes that must
 * never be reported as "no evidence found".
 */

const OK_ENVELOPE = {
  normalized_query: "velamen water uptake",
  retrieval_mode: "HYBRID",
  total_candidates: 3,
  total_eligible_results: 1,
  excluded_counts: { STATUS: 2 },
  results: [
    {
      rank: 1,
      object_type: "RESULT",
      title: "Velamen conductance measurements",
      authorized_excerpt: "Conductance rose sharply on rewetting.",
      source_content_hash: "a".repeat(64),
      citation: { revision_id: 501, source_anchor_ids: [9001], locator: { page: 12 } },
      review_state: "APPROVED",
      display_policy: "AUTHORIZED_EXCERPT",
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
  });
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("evidence retrieval client", () => {
  it("posts the backend's field names to the route it was given", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse(OK_ENVELOPE);
    }) as typeof globalThis.fetch;

    await retrieveEvidence("claims", {
      query: "  velamen   water uptake ",
      limit: 5,
      objectTypes: ["RESULT"],
      perSourceLimit: 3,
    });

    expect(calls[0].url).toContain("/api/evidence-retrieval/claims");
    expect(calls[0].init.method).toBe("POST");
    // Owner-gated surface: the session cookie has to travel.
    expect(calls[0].init.credentials).toBe("include");

    const body = JSON.parse(String(calls[0].init.body));
    // snake_case, matching SearchIn — not the client's camelCase.
    expect(body).toEqual({
      query: "velamen water uptake",
      object_types: ["RESULT"],
      limit: 5,
      per_source_limit: 3,
    });
  });

  it("returns the envelope unchanged", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(OK_ENVELOPE)) as typeof globalThis.fetch;
    const response = await retrieveEvidence("hybrid", { query: "velamen" });
    expect(response.results).toHaveLength(1);
    expect(response.excluded_counts).toEqual({ STATUS: 2 });
    expect(response.total_eligible_results).toBe(1);
  });

  it("reports an unauthorised session as unauthorised, never as no evidence", async () => {
    // The single most important distinction on this surface. Rendering 401 as an
    // empty result set would tell a scientist the corpus is silent when in fact
    // they were never allowed to ask.
    for (const status of [401, 403]) {
      globalThis.fetch = vi.fn(async () => jsonResponse({ detail: "unauthorized" }, status)) as typeof globalThis.fetch;
      const error = await retrieveEvidence("claims", { query: "velamen" }).catch((e) => e);
      expect(error).toBeInstanceOf(EvidenceRetrievalError);
      expect(error.kind).toBe("unauthorized");
      expect(error.status).toBe(status);
      expect(error.retryable).toBe(false);
    }
  });

  it("surfaces the index-unavailable code as a retryable outage", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ detail: { code: "SEMANTIC_INDEX_DATABASE_UNAVAILABLE" } }, 503),
    ) as typeof globalThis.fetch;

    const error = await retrieveEvidence("hybrid", { query: "velamen" }).catch((e) => e);
    expect(error.kind).toBe("unavailable");
    expect(error.code).toBe("SEMANTIC_INDEX_DATABASE_UNAVAILABLE");
    expect(error.retryable).toBe(true);
  });

  it("treats a rejected query as rejected rather than empty", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ detail: "INVALID_QUERY_LENGTH" }, 422),
    ) as typeof globalThis.fetch;
    const error = await retrieveEvidence("hybrid", { query: "velamen" }).catch((e) => e);
    expect(error.kind).toBe("rejected");
    expect(error.retryable).toBe(false);
  });

  it("refuses a 200 that is not a result envelope", async () => {
    // A broken response is malformed, not empty. Coercing it to zero results
    // would report "no evidence" for a service fault.
    globalThis.fetch = vi.fn(async () => jsonResponse({ ok: true })) as typeof globalThis.fetch;
    const error = await retrieveEvidence("hybrid", { query: "velamen" }).catch((e) => e);
    expect(error.kind).toBe("malformed");
  });

  it("classifies an unreachable service as network, not as an empty corpus", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Load failed");
    }) as typeof globalThis.fetch;
    const error = await retrieveEvidence("hybrid", { query: "velamen" }).catch((e) => e);
    expect(error.kind).toBe("network");
    expect(error.retryable).toBe(true);
  });

  it("propagates an abort rather than reporting it as a failure", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    }) as typeof globalThis.fetch;
    const error = await retrieveEvidence("hybrid", { query: "velamen" }).catch((e) => e);
    expect(error).toBeInstanceOf(DOMException);
    expect(error.name).toBe("AbortError");
  });

  it("truncates to the backend's 500-character bound instead of guaranteeing a 422", async () => {
    let sent = "";
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body)).query;
      return jsonResponse(OK_ENVELOPE);
    }) as typeof globalThis.fetch;

    await retrieveEvidence("claims", { query: "velamen ".repeat(200) });
    expect(sent.length).toBeLessThanOrEqual(500);
  });

  it("rejects an empty query without contacting the service", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    await expect(retrieveEvidence("claims", { query: "   " })).rejects.toBeInstanceOf(
      EvidenceRetrievalError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("evidence result helpers", () => {
  it("normalizes whitespace the way the backend does", () => {
    expect(normalizeQuery("  velamen   water \n uptake ")).toBe("velamen water uptake");
  });

  it("recognises what the backend will accept", () => {
    expect(isSearchableQuery("velamen")).toBe(true);
    expect(isSearchableQuery("   ")).toBe(false);
    expect(isSearchableQuery("x".repeat(501))).toBe(false);
  });

  it("treats a withheld excerpt as withheld, not as an empty source", () => {
    expect(isExcerptWithheld({ authorized_excerpt: null })).toBe(true);
    expect(isExcerptWithheld({})).toBe(true);
    expect(isExcerptWithheld({ authorized_excerpt: "" })).toBe(false);
    expect(isExcerptWithheld({ authorized_excerpt: "text" })).toBe(false);
  });

  it("only calls a result traceable when it can actually be traced", () => {
    expect(isTraceable(OK_ENVELOPE.results[0])).toBe(true);
    // A document with no anchor and no locator cannot be pointed at.
    expect(isTraceable({ citation: { revision_id: 1 } })).toBe(false);
    // An anchor with no document is equally untraceable.
    expect(isTraceable({ citation: { source_anchor_ids: [1] } })).toBe(false);
    expect(isTraceable({})).toBe(false);
  });
});
