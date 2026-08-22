// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GovernedEvidenceSearch from "./GovernedEvidenceSearch";

/**
 * The claim → governed-evidence integration, rendered for real.
 *
 * Only `fetch` is mocked. The component, the client, the error taxonomy and the
 * rendering decisions are all exercised — mocking the client would test nothing
 * but the mock.
 *
 * These assertions are mostly about what the UI must NOT say. A retrieval
 * surface that renders "not authorised" or "index down" the same way it renders
 * "the corpus holds nothing" teaches a false negative to a scientist, and that
 * is a worse failure than crashing.
 */

const CLAIM = "Seasonal leaf persistence tracks thermal niche in Phalaenopsis.";

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    normalized_query: CLAIM.toLowerCase(),
    retrieval_mode: "HYBRID",
    ranking_configuration_version: "085b-rank-1",
    total_eligible_results: 1,
    excluded_counts: {},
    results: [
      {
        rank: 1,
        object_type: "RESULT",
        title: "Thermal niche and leaf persistence",
        authorized_excerpt: "Leaf persistence covaried with thermal niche across sampled taxa.",
        source_content_hash: "a".repeat(64),
        review_state: "APPROVED",
        verification_state: "VERIFIED",
        display_policy: "AUTHORIZED_EXCERPT",
        citation: {
          document_title: "Thermal niche and leaf persistence",
          revision_id: 501,
          source_anchor_ids: [9001],
          locator: { page: 12, section: "Results" },
        },
      },
    ],
    ...overrides,
  };
}

function respond(body: unknown, status = 200) {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(body), { status, statusText: status === 200 ? "OK" : "Error" }),
  ) as typeof globalThis.fetch;
}


let container: HTMLDivElement;
let root: Root;

/** Renders into a real DOM, the way this repo's other component tests do. */
async function mount(claimText: string) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<GovernedEvidenceSearch claimText={claimText} />);
  });
}

function panel(): HTMLElement {
  const node = container.querySelector<HTMLElement>('[data-testid="governed-evidence-search"]');
  if (!node) throw new Error("panel did not render");
  return node;
}

function text(): string {
  return panel().textContent ?? "";
}

function searchButton(): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find((b) =>
    /search evidence|search again/i.test(b.textContent ?? ""),
  );
  if (!button) throw new Error("search button not found");
  return button as HTMLButtonElement;
}

function retryButton(): HTMLButtonElement | null {
  return (
    ([...container.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim().toLowerCase() === "retry",
    ) as HTMLButtonElement | undefined) ?? null
  );
}

async function click(button: HTMLElement) {
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  // Let the awaited fetch chain settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  // React only honours act() when the environment declares itself as a test
  // environment; without this every state update logs a warning.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

describe("governed evidence search", () => {
  it("does not search until the scientist asks", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    await mount(CLAIM);
    // A verification surface must not fire owner-scoped queries on render.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders retrieved material with its provenance", async () => {
    respond(envelope());
    await mount(CLAIM);
    await click(searchButton());

    expect(text()).toMatch(/Leaf persistence covaried/);
    const rendered = text();
    expect(rendered).toContain("501"); // revision
    expect(rendered).toContain("9001"); // anchor
    expect(rendered).toContain("APPROVED"); // review state
    expect(rendered).toContain("a".repeat(64)); // content hash
  });

  it("sends the claim as the query, and calls the governed route", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body) });
      return new Response(JSON.stringify(envelope()), { status: 200 });
    }) as typeof globalThis.fetch;

    await mount(CLAIM);
    await click(searchButton());

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/api/evidence-retrieval/hybrid");
    expect(JSON.parse(calls[0].body).query).toBe(CLAIM);
  });

  it("never presents retrieved material as verification of the claim", async () => {
    respond(envelope());
    await mount(CLAIM);
    await click(searchButton());
    expect(text()).toMatch(/Leaf persistence covaried/);

    const rendered = text();
    // The backend returns relevance, not entailment. Labelling a hit as
    // supporting or contradicting the claim would invent a judgement no service
    // made.
    expect(rendered).not.toMatch(/supports this claim/i);
    expect(rendered).not.toMatch(/contradicts this claim/i);
    expect(rendered).not.toMatch(/claim (is )?(verified|confirmed|proven)/i);
    expect(rendered).toMatch(/not verification of the claim/i);
  });

  it("renders an unauthorised session as unauthorised, not as an empty corpus", async () => {
    respond({ detail: "unauthorized" }, 401);
    await mount(CLAIM);
    await click(searchButton());

    expect(text()).toMatch(/Not authorised/i);
    const rendered = text();
    expect(rendered).not.toMatch(/returned no eligible results/i);
    expect(rendered).toMatch(/not a statement about the evidence/i);
    // Nothing to retry: a 401 will keep being a 401.
    expect(retryButton()).toBeNull();
  });

  it("offers a retry for an unavailable index, and succeeds on the retry", async () => {
    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call += 1;
      return call === 1
        ? new Response(JSON.stringify({ detail: { code: "SEMANTIC_INDEX_DATABASE_UNAVAILABLE" } }), {
            status: 503,
          })
        : new Response(JSON.stringify(envelope()), { status: 200 });
    }) as typeof globalThis.fetch;

    await mount(CLAIM);
    await click(searchButton());

    expect(text()).toMatch(/Evidence index unavailable/i);
    expect(text()).toContain(
      "SEMANTIC_INDEX_DATABASE_UNAVAILABLE",
    );

    await click(retryButton()!);
    expect(text()).toMatch(/Leaf persistence covaried/);
  });

  it("distinguishes a genuine empty result from a failure, and says why records were excluded", async () => {
    respond(envelope({ results: [], total_eligible_results: 0, excluded_counts: { STATUS: 4 } }));
    await mount(CLAIM);
    await click(searchButton());

    expect(text()).toMatch(/returned no eligible results/i);
    const rendered = text();
    expect(rendered).toMatch(/status: 4/i);
    // Governance filters removed records; that is not a finding about the corpus.
    expect(rendered).toMatch(/not evidence of absence/i);
  });

  it("marks a withheld excerpt as withheld rather than showing an empty source", async () => {
    respond(
      envelope({
        results: [
          {
            object_type: "PROTOCOL",
            title: "Restricted protocol",
            authorized_excerpt: null,
            display_policy: "INTERNAL_RESEARCH_ONLY",
            citation: { revision_id: 77, source_anchor_ids: [1] },
          },
        ],
      }),
    );
    await mount(CLAIM);
    await click(searchButton());

    expect(text()).toMatch(/Excerpt withheld/i);
    expect(text()).toContain(
      "INTERNAL_RESEARCH_ONLY",
    );
  });

  it("warns when a result cannot be traced to a source location", async () => {
    respond(
      envelope({
        results: [
          {
            object_type: "CLAIM",
            title: "Untraceable assertion",
            authorized_excerpt: "An assertion with no anchor.",
            citation: { document_title: "Somewhere" },
          },
        ],
      }),
    );
    await mount(CLAIM);
    await click(searchButton());

    expect(text()).toMatch(/cannot be traced/i);
    expect(text()).toMatch(
      /not as citable evidence/i,
    );
  });

  it("refuses to search a claim with no searchable text", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    await mount("   ");
    expect(searchButton().disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * Trust signals the corpus supplied, and the silences it did not fill.
 *
 * reliability_signals, temporal_status, active and excerpt_content_hash were
 * all in the retrieval contract and none of them reached the screen. The
 * omissions are not equally harmless: ai_generated is the one a scientist
 * reading a retrieved "source" needs most, and a result with no temporal
 * status had been rendering exactly like one confirmed current.
 *
 * The rule throughout: unstated is a third state, never a quiet "no".
 */
describe("governed evidence search — trust signals", () => {
  const withResult = (overrides: Record<string, unknown>) =>
    envelope({
      results: [
        {
          object_type: "RESULT",
          title: "Thermal niche and leaf persistence",
          authorized_excerpt: "Leaf persistence covaried with thermal niche across sampled taxa.",
          citation: { revision_id: 501, source_anchor_ids: [9001] },
          ...overrides,
        },
      ],
    });

  it("says plainly when a record was generated by a model", async () => {
    respond(withResult({ reliability_signals: { ai_generated: true } }));
    await mount(CLAIM);
    await click(searchButton());

    expect(text()).toMatch(/AI-generated: yes/i);
    expect(text()).toMatch(/citing it cites the model rather than a source/i);
  });

  it("does not imply human authorship when the corpus is silent", async () => {
    respond(withResult({ reliability_signals: {} }));
    await mount(CLAIM);
    await click(searchButton());

    // "not stated" is the honest third state. Rendering "no" here would assert
    // human authorship the backend never established.
    expect(text()).toMatch(/AI-generated: not stated/i);
    expect(text()).not.toMatch(/AI-generated: no\b/i);
  });

  it("distinguishes an unreviewed source from an unstated one", async () => {
    respond(withResult({ reliability_signals: { peer_reviewed: false } }));
    await mount(CLAIM);
    await click(searchButton());
    expect(text()).toMatch(/Peer reviewed: no/i);

    // And separately, silence.
    expect(text()).toMatch(/Citations verified: not stated/i);
  });

  it("shows the temporal status the corpus supplied", async () => {
    respond(withResult({ temporal_status: "SUPERSEDED" }));
    await mount(CLAIM);
    await click(searchButton());
    expect(text()).toContain("SUPERSEDED");
  });

  it("never presents an unchecked record as current", async () => {
    respond(withResult({}));
    await mount(CLAIM);
    await click(searchButton());

    expect(text()).toMatch(/no temporal status supplied/i);
    expect(text()).toMatch(/not the same as being current/i);
  });

  it("flags a record the corpus marked inactive", async () => {
    respond(withResult({ active: false, temporal_status: "CURRENT" }));
    await mount(CLAIM);
    await click(searchButton());
    expect(text()).toMatch(/marked inactive in the corpus/i);
  });

  it("treats an unstated active flag as unstated, not inactive", async () => {
    respond(withResult({ temporal_status: "CURRENT" }));
    await mount(CLAIM);
    await click(searchButton());

    expect(text()).not.toMatch(/marked inactive/i);
    expect(text()).toContain("CURRENT");
  });

  it("surfaces the excerpt hash, not only the document hash", async () => {
    respond(
      withResult({
        source_content_hash: "a".repeat(64),
        excerpt_content_hash: "b".repeat(64),
      }),
    );
    await mount(CLAIM);
    await click(searchButton());

    // The document hash verifies the source; the excerpt hash verifies the
    // quoted text a reader is actually reading.
    expect(text()).toContain("b".repeat(64));
  });
});
