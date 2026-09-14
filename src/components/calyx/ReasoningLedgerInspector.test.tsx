// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ReasoningLedgerInspector from "./ReasoningLedgerInspector";

/**
 * Reading a ledger is not verifying a claim.
 *
 * This surface is the easiest place in the Workbench to collapse four
 * different facts into one reassuring impression:
 *
 *   recorded     the mission carries an id and a version
 *   inspectable  this retrieval succeeded
 *   reviewed     a human review decision is recorded in the revision
 *   verified     not something any ledger read can establish
 *
 * Before backend #1135 the Workbench could only assert the first, and said so.
 * Now that retrieval exists, the risk inverts: a readable ledger rendered
 * confidently reads as an audit. So all four states are rendered at all times
 * and each is asserted separately here.
 *
 * Failures are tested harder than the happy path, because every one of them
 * has a plausible reading that would be a lie — unauthorised as "no reasoning
 * exists", an outage as "the ledger is empty", a missing revision as a missing
 * ledger.
 */

const LEDGER = "ledger-1";
const VERSION = 5;

function revisionBody(overrides: Record<string, unknown> = {}) {
  return {
    ledger_id: LEDGER,
    requested_version: VERSION,
    inspectable: true,
    reasoning_certified: false,
    revision: {
      ledger_id: LEDGER,
      version: VERSION,
      status: "DRAFT",
      ledger_fingerprint: "f".repeat(64),
      entries: [
        {
          entry_id: "entry-1",
          kind: "CLAIM",
          sequence: 1,
          statement: "Seasonal dormancy tracks cooler thermal niches.",
          provenance: { source_kind: "literature", source_id: "lit-9", content_hash: "a".repeat(64) },
          uncertainty: { confidence: 0.6, rationale: "single study", unresolved_assumptions: ["Sampling was seasonal only"] },
          contradicts: [],
        },
      ],
      review_decisions: [],
      ...(overrides.revision as Record<string, unknown> | undefined),
    },
    ...overrides,
  };
}

function respond(body: unknown, status = 200) {
  globalThis.fetch = vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as typeof globalThis.fetch;
}

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof globalThis.fetch;

async function mount(ledgerId: string | null = LEDGER, version: number | null = VERSION) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ReasoningLedgerInspector ledgerId={ledgerId} version={version} />);
  });
}

async function inspect() {
  const button = [...container.querySelectorAll("button")].find((b) =>
    /inspect reasoning ledger|retrieve again/i.test(b.textContent ?? ""),
  );
  if (!button) throw new Error("inspect button not found");
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const text = () => container.textContent ?? "";
const states = () => container.querySelector('[data-testid="ledger-states"]')?.textContent ?? "";

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

describe("the four states stay apart", () => {
  it("shows inspectable and reviewed as not established before any retrieval", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    await mount();

    // Recording is known from the mission; nothing else is, and no request is
    // fired on render.
    expect(states()).toMatch(/Recorded:\s*yes/i);
    expect(states()).toMatch(/Inspectable:\s*not established/i);
    expect(states()).toMatch(/Reviewed:\s*not established/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never presents a readable ledger as a verified claim", async () => {
    respond(revisionBody());
    await mount();
    await inspect();

    expect(states()).toMatch(/Inspectable:\s*yes/i);
    expect(states()).toMatch(/Claim verified:\s*not established by reading a ledger/i);
    expect(text()).toMatch(/does not certify that the reasoning is sound/i);
  });

  it("distinguishes a retrieved ledger with no review from a reviewed one", async () => {
    respond(revisionBody());
    await mount();
    await inspect();
    expect(states()).toMatch(/Reviewed:\s*no review decision recorded/i);

    act(() => root.unmount());
    container.remove();

    respond(
      revisionBody({
        revision: { review_decisions: [{ decision_id: "d-1", reviewer: "human" }] },
      }),
    );
    await mount();
    await inspect();
    expect(states()).toMatch(/Reviewed:\s*a review decision is recorded/i);
  });
});

describe("failures are rendered as themselves", () => {
  it("renders unauthorised as unauthorised, not as absent reasoning", async () => {
    respond({ detail: { code: "NOT_AUTHORIZED" } }, 403);
    await mount();
    await inspect();

    expect(text()).toMatch(/not authorised to read this ledger/i);
    expect(text()).toMatch(/statement about retrieval, not about whether reasoning was captured/i);
    expect(text()).not.toMatch(/contains no entries/i);
  });

  it("renders an outage as unavailable, not as an empty ledger", async () => {
    respond({ detail: { code: "LEDGER_PERSISTENCE_UNAVAILABLE" } }, 503);
    await mount();
    await inspect();

    expect(text()).toMatch(/reasoning ledger unavailable/i);
    expect(text()).not.toMatch(/contains no entries/i);
    // Retryable, unlike a 403.
    expect([...container.querySelectorAll("button")].some((b) => /^retry$/i.test(b.textContent ?? ""))).toBe(true);
  });

  it("keeps a missing revision distinct from a missing ledger", async () => {
    respond(
      { detail: { code: "LEDGER_REVISION_NOT_FOUND", available_versions: [1, 2, 3] } },
      404,
    );
    await mount();
    await inspect();

    expect(text()).toMatch(/that exact revision is not in the ledger/i);
    // The backend tells us what exists; showing it keeps "this revision is
    // gone" from reading as "this ledger is empty".
    expect(text()).toMatch(/revisions that do exist:\s*1, 2, 3/i);
  });

  it("renders an unknown ledger as an unknown ledger", async () => {
    respond({ detail: { code: "LEDGER_NOT_FOUND" } }, 404);
    await mount();
    await inspect();
    expect(text()).toMatch(/no ledger under that identifier/i);
  });

  it("does not offer a retry for a failure a retry cannot fix", async () => {
    respond({ detail: { code: "NOT_AUTHORIZED" } }, 403);
    await mount();
    await inspect();
    expect([...container.querySelectorAll("button")].some((b) => /^retry$/i.test(b.textContent ?? ""))).toBe(false);
  });

  it("treats a malformed 200 as malformed rather than as an empty revision", async () => {
    respond({ ledger_id: LEDGER, requested_version: VERSION });
    await mount();
    await inspect();
    expect(text()).toMatch(/could not retrieve the reasoning ledger/i);
    expect(text()).not.toMatch(/contains no entries/i);
  });
});

describe("what a retrieved revision shows", () => {
  it("surfaces provenance and content hashes", async () => {
    respond(revisionBody());
    await mount();
    await inspect();

    expect(text()).toContain("literature");
    expect(text()).toContain("a".repeat(64));
  });

  it("surfaces the assumptions the ledger recorded as unresolved", async () => {
    respond(revisionBody());
    await mount();
    await inspect();
    expect(text()).toMatch(/unresolved assumptions the ledger recorded/i);
    expect(text()).toContain("Sampling was seasonal only");
  });

  it("distinguishes an empty revision from a failed retrieval", async () => {
    respond(revisionBody({ revision: { entries: [] } }));
    await mount();
    await inspect();
    expect(text()).toMatch(/contains no entries. That is an empty revision, not a failed retrieval/i);
  });

  it("reads an absent certification flag as not certified", async () => {
    // An older or partial backend may omit the flag entirely. Absent must
    // resolve to the cautious value: inferring certification from silence is
    // exactly the claim this surface exists to withhold.
    const body = revisionBody() as Record<string, unknown>;
    delete body.reasoning_certified;
    delete body.inspectable;
    respond(body);

    await mount();
    await inspect();

    // Retrieval clearly succeeded — the entry rendered.
    expect(text()).toContain("Seasonal dormancy tracks cooler thermal niches.");
    // ...and neither flag was invented from its absence.
    expect(text()).toMatch(/does not certify that the reasoning is sound/i);
    expect(states()).toMatch(/Inspectable:\s*not established/i);
  });

  it("requests the exact revision, with no latest fallback", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: unknown) => {
      calls.push(String(url));
      return new Response(JSON.stringify(revisionBody()), { status: 200 });
    }) as typeof globalThis.fetch;

    await mount();
    await inspect();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/\/api\/reasoning-ledgers\/ledger-1\/revisions\/5$/);
  });
});

describe("a mission with no ledger", () => {
  it("says the record is missing rather than implying a finding", async () => {
    await mount(null, null);
    expect(text()).toMatch(/carries no versioned reasoning ledger/i);
    expect(text()).toMatch(/a gap in the record, not a finding about the claim/i);
  });
});
