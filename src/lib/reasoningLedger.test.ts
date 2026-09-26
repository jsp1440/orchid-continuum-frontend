/**
 * The reasoning-ledger client, checked against payloads the backend really
 * produces.
 *
 * This client was written from a contract note and had no producer until
 * `GET /api/reasoning-ledgers/{ledger_id}/revisions/{version}` landed, so it
 * had never met a real response. Meeting one found two defects it had been
 * carrying: entries are `text`, not `statement`, and a contradiction is a
 * CONFLICT entry's state, not a `contradicts` array. The fixtures below are
 * captured verbatim from that endpoint rather than invented, so this file
 * cannot drift back into agreeing with a shape nobody serves.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ReasoningLedgerError,
  contradictingEntries,
  fetchLedgerRevision,
  hasRecordedReview,
  unresolvedAssumptions,
  type LedgerEntry,
} from "./reasoningLedger";

const LEDGER_ID = "86164583-34f8-5d82-95f9-00994946c13b";
const PROJECT_ID = "ecad7918-1fbd-421a-98d6-8397259f74ff";

/** One entry exactly as `entry_to_dict` serializes it. */
function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    entry_id: "d2204332-8e64-4b0c-a969-3c4d133fbd15",
    kind: "support",
    version: 1,
    sequence: 0,
    text: "first",
    author: "owner-a",
    tenant_id: "owner-a",
    project_id: PROJECT_ID,
    provenance: null,
    uncertainty: { confidence: 0.7, rationale: "", unresolved_assumptions: [] },
    conflict_state: "unresolved",
    references_entry_ids: [],
    tags: [],
    attributes: {},
    created_at: "2026-09-21T04:26:14.181352+00:00",
    fingerprint: "e0ba551cda26459bd5f7305148803b642c3218a6691b6d7570ced1bac9d473dc",
    ...overrides,
  };
}

/** A 200 body captured from the endpoint. */
const REAL_OK_BODY = {
  ledger_id: LEDGER_ID,
  requested_version: 3,
  revision: {
    ledger_id: LEDGER_ID,
    tenant_id: "owner-a",
    project_id: PROJECT_ID,
    title: "Question",
    description: "",
    status: "draft",
    version: 3,
    entries: [
      entry(),
      entry({
        entry_id: "abdcfc90-ba23-436a-9afe-7bc7a7c26cc1",
        sequence: 1,
        text: "second",
      }),
    ],
    review_decisions: [],
    conflict_dispositions: [],
    resolved_conflict_ids: [],
    created_by: "owner-a",
    created_at: "2026-09-21T04:26:14.175975+00:00",
    updated_at: "2026-09-21T04:26:14.187918+00:00",
    ledger_fingerprint:
      "f5eac9c1491d06fa96419a3b38167b512bda19a256bc6e61062994cf1beb9504",
    review_content_hash:
      "7188fa3ca800fce7a8a6b9d7172f81b1cc25a15c36274cdaee33650cd466f994",
  },
  inspectable: true,
  reasoning_certified: false,
};

/** A 404 body captured for a version that does not exist. */
const REAL_MISSING_REVISION_BODY = {
  detail: {
    code: "LEDGER_REVISION_NOT_FOUND",
    available_versions: [1, 2, 3],
    available_versions_complete: true,
    current_version: 3,
  },
};

/** A 404 body captured for an unknown ledger id. */
const REAL_UNKNOWN_LEDGER_BODY = { detail: { code: "LEDGER_NOT_FOUND" } };

/** A 422 body captured for version 0. FastAPI's own validation shape. */
const REAL_REJECTED_BODY = {
  detail: [
    {
      type: "greater_than_equal",
      loc: ["path", "version"],
      msg: "Input should be greater than or equal to 1",
      input: "0",
      ctx: { ge: 1 },
    },
  ],
};

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stub(body: unknown, status = 200) {
  // Typed with fetch's parameters so `mock.mock.calls[0]?.[0]` is the request
  // URL, not an index into an empty tuple (TS2493 under `npm run typecheck`).
  const mock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => respond(body, status));
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchLedgerRevision against real backend payloads", () => {
  it("parses a real 200 without losing a field it renders", async () => {
    stub(REAL_OK_BODY);
    const result = await fetchLedgerRevision(LEDGER_ID, 3);
    expect(result.ledger_id).toBe(LEDGER_ID);
    expect(result.requested_version).toBe(3);
    expect(result.revision.version).toBe(3);
    expect(result.revision.entries).toHaveLength(2);
    expect(result.inspectable).toBe(true);
  });

  it("carries the backend's refusal to certify the reasoning", async () => {
    stub(REAL_OK_BODY);
    const result = await fetchLedgerRevision(LEDGER_ID, 3);
    // A readable revision is not a verified one, and the client must not
    // upgrade it into one on the way through.
    expect(result.reasoning_certified).toBe(false);
  });

  it("requests the exact version asked for and nothing else", async () => {
    const mock = stub(REAL_OK_BODY);
    await fetchLedgerRevision(LEDGER_ID, 2);
    const url = String(mock.mock.calls[0]?.[0]);
    expect(url.endsWith(`/api/reasoning-ledgers/${LEDGER_ID}/revisions/2`)).toBe(true);
    expect(url.startsWith("http")).toBe(true);
  });

  it("tells a missing revision apart from an unknown ledger", async () => {
    stub(REAL_MISSING_REVISION_BODY, 404);
    await expect(fetchLedgerRevision(LEDGER_ID, 9)).rejects.toMatchObject({
      kind: "revision_not_found",
      availableVersions: [1, 2, 3],
    });

    stub(REAL_UNKNOWN_LEDGER_BODY, 404);
    await expect(fetchLedgerRevision("nope", 1)).rejects.toMatchObject({
      kind: "ledger_not_found",
    });
  });

  it("never falls back to another version when one is missing", async () => {
    // Offering "the nearest revision" here would defeat the backend's refusal
    // to do so, which is the whole guarantee this surface rests on.
    stub(REAL_MISSING_REVISION_BODY, 404);
    await expect(fetchLedgerRevision(LEDGER_ID, 9)).rejects.toBeInstanceOf(
      ReasoningLedgerError,
    );
  });

  it("reads FastAPI's own 422 shape as rejected, not as unavailable", async () => {
    stub(REAL_REJECTED_BODY, 422);
    await expect(fetchLedgerRevision(LEDGER_ID, 1)).rejects.toMatchObject({
      kind: "rejected",
      retryable: false,
    });
  });

  it("reads a 500 as unavailable rather than as an empty ledger", async () => {
    stub({ detail: { code: "LEDGER_REVISION_UNREADABLE", version: 2 } }, 500);
    await expect(fetchLedgerRevision(LEDGER_ID, 2)).rejects.toMatchObject({
      kind: "unavailable",
      code: "LEDGER_REVISION_UNREADABLE",
    });
  });

  it("rejects a non-positive version before reaching the network", async () => {
    const mock = stub(REAL_OK_BODY);
    await expect(fetchLedgerRevision(LEDGER_ID, 0)).rejects.toMatchObject({
      kind: "rejected",
    });
    expect(mock).not.toHaveBeenCalled();
  });
});

describe("reading a real revision", () => {
  const revision = REAL_OK_BODY.revision;

  it("finds the recorded reasoning where the backend puts it", () => {
    // The defect this test exists for: `statement` is never emitted, so the
    // inspector showed "No statement recorded" over every entry.
    expect(revision.entries.map((e) => e.text)).toEqual(["first", "second"]);
    expect(revision.entries.every((e) => e.statement === undefined)).toBe(true);
  });

  it("reports no review when the backend recorded none", () => {
    expect(hasRecordedReview(revision)).toBe(false);
  });

  it("does not mistake ordinary entries for contradictions", () => {
    // Every entry carries conflict_state "unresolved" by default. Reading it
    // without checking the kind would mark all of them as contradictions.
    expect(revision.entries.every((e) => e.conflict_state === "unresolved")).toBe(true);
    expect(contradictingEntries(revision)).toEqual([]);
  });

  it("surfaces an open conflict entry", () => {
    const conflicted = {
      ...revision,
      entries: [
        ...revision.entries,
        entry({ entry_id: "conflict-1", kind: "conflict", text: "counterevidence" }),
      ],
    };
    expect(contradictingEntries(conflicted).map((e) => e.entry_id)).toEqual([
      "conflict-1",
    ]);
  });

  it("counts a deferred conflict as still open", () => {
    const deferred = {
      ...revision,
      entries: [
        entry({ entry_id: "conflict-1", kind: "conflict", conflict_state: "deferred" }),
      ],
    };
    expect(contradictingEntries(deferred)).toHaveLength(1);
  });

  it("treats a resolved conflict as closed", () => {
    const resolved = {
      ...revision,
      entries: [
        entry({ entry_id: "conflict-1", kind: "conflict", conflict_state: "resolved" }),
      ],
    };
    expect(contradictingEntries(resolved)).toEqual([]);
  });

  it("treats a superseded conflict as closed however its own state reads", () => {
    const superseded = {
      ...revision,
      entries: [
        entry({ entry_id: "conflict-1", kind: "conflict", conflict_state: "unresolved" }),
      ],
      resolved_conflict_ids: ["conflict-1"],
    };
    expect(contradictingEntries(superseded)).toEqual([]);
  });

  it("surfaces recorded unresolved assumptions", () => {
    const withAssumptions = {
      ...revision,
      entries: [
        entry({
          uncertainty: {
            confidence: 0.4,
            rationale: "single observer",
            unresolved_assumptions: ["locality unverified"],
          },
        }),
      ],
    };
    expect(unresolvedAssumptions(withAssumptions)).toEqual(["locality unverified"]);
  });
});
