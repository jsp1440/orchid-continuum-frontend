import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LiteraturePaperError,
  classifyClaimEvidence,
  countStrippedLocality,
  fetchLiteraturePaper,
  isMachineAuthored,
  isReviewed,
  stripSensitiveAttributes,
} from "./literaturePaper";

/**
 * The paper client, and the three things it must not let through.
 *
 * Protected locality must not reach any component. A binding failure must not
 * read as a permissive binding. And a claim's evidence pointers must not be
 * mistaken for backing.
 */

let originalFetch: typeof globalThis.fetch;

function route(handlers: Record<string, { status: number; body?: unknown }>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = url.includes("/source-binding") ? "binding" : "paper";
    const handler = handlers[key] ?? { status: 404 };
    return new Response(handler.body === undefined ? "" : JSON.stringify(handler.body), {
      status: handler.status,
    });
  }) as typeof globalThis.fetch;
}

const PAPER = { paper_id: "p-1", metadata: { title: "Thermal niche" }, entities: [] };

beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("protected locality never reaches a component", () => {
  it("strips coordinate and locality fields from entity attributes", () => {
    const result = stripSensitiveAttributes({
      decimalLatitude: -3.1,
      decimal_longitude: 37.2,
      verbatimLocality: "2 km N of the ridge",
      habit: "epiphytic",
      elevation_m: 1800,
    });
    expect(result.attributes).toEqual({ habit: "epiphytic" });
    expect(result.removed).toBe(4);
  });

  it("strips them from nested structures too", () => {
    // A coordinate three levels down is disclosed exactly as thoroughly.
    const result = stripSensitiveAttributes({
      collection: { event: { coordinates: [1, 2], date: "2020-01-01" } },
    });
    expect(result.removed).toBe(1);
    expect(result.attributes).toEqual({ collection: { event: { date: "2020-01-01" } } });
  });

  it("matches whole keys only, so unrelated fields survive", () => {
    const result = stripSensitiveAttributes({ localization: "left", siteliness: 1, LATITUDE: 4 });
    expect(result.removed).toBe(1);
    expect(result.attributes).toEqual({ localization: "left", siteliness: 1 });
  });

  it("removes locality before the payload is returned from the client", async () => {
    route({
      paper: {
        status: 200,
        body: {
          ...PAPER,
          entities: [
            {
              entity_id: "e-1",
              entity_type: "location",
              name: "Type locality",
              attributes: { decimalLatitude: -3.1, habitat_note: "montane" },
            },
          ],
        },
      },
      binding: { status: 404 },
    });

    const view = await fetchLiteraturePaper("p-1");
    const serialised = JSON.stringify(view);
    expect(serialised).not.toMatch(/decimalLatitude/i);
    expect(serialised).not.toContain("-3.1");
    expect(view.paper.entities?.[0].attributes).toEqual({ habitat_note: "montane" });
  });

  it("reports the withheld count on the view, where it survives the strip", () => {
    // Counting downstream of the client can only ever return zero: the fields
    // are gone by then. That made the page report "no site data" for records
    // that carried it, which is the misreport this count exists to prevent.
    route({
      paper: {
        status: 200,
        body: {
          ...PAPER,
          entities: [{ entity_id: "e-1", name: "Type locality", attributes: { lat: 1, lon: 2 } }],
        },
      },
      binding: { status: 404 },
    });
    return fetchLiteraturePaper("p-1").then((view) => {
      expect(view.localityFieldsWithheld).toBe(2);
      expect(countStrippedLocality(view.paper.entities)).toBe(0);
    });
  });

  it("counts what was withheld without naming the fields", () => {
    // Naming `decimal_latitude` for a rare taxon already discloses that a
    // precise site exists in the record.
    expect(
      countStrippedLocality([{ attributes: { lat: 1, lon: 2 } }, { attributes: { rank: "sp." } }]),
    ).toBe(2);
    expect(countStrippedLocality(undefined)).toBe(0);
  });
});

describe("a binding failure is never a permissive binding", () => {
  it("reports an absent binding as absent, and still returns the paper", async () => {
    route({ paper: { status: 200, body: PAPER }, binding: { status: 404 } });
    const view = await fetchLiteraturePaper("p-1");
    expect(view.bindingStatus).toBe("absent");
    expect(view.binding).toBeNull();
    expect(view.paper.paper_id).toBe("p-1");
  });

  it("reports an unreachable binding as unreadable, never as absent", async () => {
    // Both withhold text, but only one of them means nobody has bound it.
    route({ paper: { status: 200, body: PAPER }, binding: { status: 503 } });
    const view = await fetchLiteraturePaper("p-1");
    expect(view.bindingStatus).toBe("unreadable");
    expect(view.binding).toBeNull();
  });

  it("reports an unparseable 200 binding as unreadable", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/source-binding")
        ? new Response("{not json", { status: 200 })
        : new Response(JSON.stringify(PAPER), { status: 200 }),
    ) as typeof globalThis.fetch;
    const view = await fetchLiteraturePaper("p-1");
    expect(view.bindingStatus).toBe("unreadable");
    expect(view.binding).toBeNull();
  });

  it("carries the binding through when it is present", async () => {
    route({
      paper: { status: 200, body: PAPER },
      binding: { status: 200, body: { display_policy: "FULL_TEXT_ALLOWED", internal_use_permission: false } },
    });
    const view = await fetchLiteraturePaper("p-1");
    expect(view.bindingStatus).toBe("present");
    expect(view.binding?.display_policy).toBe("FULL_TEXT_ALLOWED");
  });
});

describe("paper failures are distinguished", () => {
  it("renders 404 as not_found and does not offer a retry", async () => {
    route({ paper: { status: 404 } });
    const error = await fetchLiteraturePaper("p-1").catch((e) => e);
    expect(error).toBeInstanceOf(LiteraturePaperError);
    expect(error.kind).toBe("not_found");
    expect(error.retryable).toBe(false);
  });

  it("renders 403 as unauthorized, which is not an empty paper", async () => {
    route({ paper: { status: 403 } });
    const error = await fetchLiteraturePaper("p-1").catch((e) => e);
    expect(error.kind).toBe("unauthorized");
  });

  it("rejects a 200 without a paper_id as malformed", async () => {
    route({ paper: { status: 200, body: { metadata: { title: "x" } } } });
    const error = await fetchLiteraturePaper("p-1").catch((e) => e);
    expect(error.kind).toBe("malformed");
  });
});

describe("association is not support", () => {
  const evidence = [
    { evidence_id: "ev-1", supports_ids: ["c-1"] },
    { evidence_id: "ev-2", contradicts_ids: ["c-1"] },
    { evidence_id: "ev-3" },
  ];

  it("keeps linked-but-unclassified evidence out of the supporting bucket", () => {
    const relation = classifyClaimEvidence(
      { claim_id: "c-1", statement: "s", evidence_ids: ["ev-1", "ev-2", "ev-3"] },
      evidence,
    );
    expect(relation.supporting.map((e) => e.evidence_id)).toEqual(["ev-1"]);
    expect(relation.contradicting.map((e) => e.evidence_id)).toEqual(["ev-2"]);
    expect(relation.associatedOnly.map((e) => e.evidence_id)).toEqual(["ev-3"]);
  });

  it("does not count evidence the claim never linked", () => {
    const relation = classifyClaimEvidence(
      { claim_id: "c-1", statement: "s", evidence_ids: [] },
      evidence,
    );
    // ev-3 is unlinked, so it is not "associated" with this claim at all.
    expect(relation.associatedOnly).toHaveLength(0);
    // But an explicit supports_ids claim stands on its own without the pointer.
    expect(relation.supporting).toHaveLength(1);
  });
});

describe("origin and review are read cautiously", () => {
  it("treats model_extracted and inferred as machine-authored", () => {
    expect(isMachineAuthored({ claim_id: "c", statement: "s", provenance: { method: "model_extracted" } })).toBe(true);
    expect(isMachineAuthored({ claim_id: "c", statement: "s", provenance: { method: "inferred" } })).toBe(true);
    expect(isMachineAuthored({ claim_id: "c", statement: "s", provenance: { method: "human_annotated" } })).toBe(false);
  });

  it("reads an absent review status as unreviewed", () => {
    expect(isReviewed({ claim_id: "c", statement: "s" })).toBe(false);
    expect(isReviewed({ claim_id: "c", statement: "s", provenance: {} })).toBe(false);
    expect(isReviewed({ claim_id: "c", statement: "s", provenance: { review_status: "unreviewed" } })).toBe(false);
    expect(isReviewed({ claim_id: "c", statement: "s", provenance: { review_status: "rejected" } })).toBe(false);
    expect(isReviewed({ claim_id: "c", statement: "s", provenance: { review_status: "accepted" } })).toBe(true);
  });
});
