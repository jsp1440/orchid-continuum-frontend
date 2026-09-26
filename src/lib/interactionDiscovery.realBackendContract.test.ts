import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildInteractionDiscoveryUrl,
  fetchInteractionDiscovery,
  parseInteractionDiscoveryBody,
} from "@/lib/interactionDiscovery";
import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";
import realBackend from "./__fixtures__/interactionDiscovery.realBackend.json";

/**
 * Cross-boundary contract test for GET /api/interactions/discovery.
 *
 * `__fixtures__/interactionDiscovery.realBackend.json` holds VERBATIM bodies
 * captured from the backend's app.main via FastAPI TestClient (see its
 * `_capture` field). The ok-shape records come from the backend's own test
 * fixture (tests/test_interaction_discovery_routes.py::_ingest_sample) run
 * through the real GloBI ingest path -- they pin the SHAPE, not science.
 * Without a database the backend serves an empty in-memory index as a normal
 * `status: ok, count: 0` response; it has no "unavailable" body of its own, so
 * unavailable here means a network failure or non-2xx status.
 */

type Captured = { status_code: number; body: unknown };
const fixture = realBackend as unknown as Record<string, Captured>;

function stubFetch(body: unknown, status = 200) {
  const fn = vi.fn(async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("interaction discovery: real backend payload -> frontend contract", () => {
  it("queries the Calyx backend discovery route for the page's taxon", async () => {
    const fetchMock = stubFetch(fixture.ok.body);
    await fetchInteractionDiscovery("Orchis mascula");
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(`${url.origin}${url.pathname}`).toBe(`${CALYX_BACKEND_BASE_URL}/api/interactions/discovery`);
    expect(url.searchParams.get("taxon")).toBe("Orchis mascula");
    expect(url.searchParams.get("category")).toBe("all");
    expect(url.searchParams.get("limit")).toBe("100");
  });

  it("accepts the real ok payload and preserves provenance and evidence state", async () => {
    stubFetch(fixture.ok.body);
    const result = await fetchInteractionDiscovery("Orchis mascula");
    expect(result.state).toBe("ok");
    if (result.state !== "ok") return;
    expect(result.result.records).toHaveLength(2);
    expect(result.result.total_matched).toBe(2);
    expect(result.result.truncated).toBe(false);
    expect(result.result.unreadable_count).toBe(0);
    expect(result.result.note).toMatch(/not verified Knowledge Graph edges/);

    const [pollinator, mycorrhizal] = result.result.records;
    expect(pollinator).toEqual({
      source_taxon_name: "Orchis mascula",
      source_taxon_id: "GBIF:123",
      target_taxon_name: "Bombus terrestris",
      target_taxon_id: "GBIF:456",
      interaction_type: "pollinatedBy",
      categories: ["pollinator"],
      study_citation: "Example study 2020",
      study_source_citation: "GloBI dataset v1",
      study_external_id: null,
      provider: "Global Biotic Interactions",
      provider_stability: "VERSIONED_STABLE_DATASET",
      dataset_version: "globi-2026-08",
      verification_state: "UNVERIFIED",
    });
    expect(mycorrhizal.interaction_type).toBe("hasHost");
    expect(mycorrhizal.categories).toEqual(["mycorrhizal"]);
    expect(mycorrhizal.verification_state).toBe("UNVERIFIED");
  });

  it("drops fields outside the allow-list (locator, revision_id)", async () => {
    stubFetch(fixture.ok.body);
    const result = await fetchInteractionDiscovery("Orchis mascula");
    if (result.state !== "ok") throw new Error("expected ok");
    for (const record of result.result.records) {
      expect(record).not.toHaveProperty("locator");
      expect(record).not.toHaveProperty("revision_id");
    }
  });

  it("reports truncation from the real limited payload", async () => {
    stubFetch(fixture.ok_truncated.body);
    const result = await fetchInteractionDiscovery("Orchis mascula", { limit: 1 });
    if (result.state !== "ok") throw new Error("expected ok");
    expect(result.result.records).toHaveLength(1);
    expect(result.result.total_matched).toBe(2);
    expect(result.result.truncated).toBe(true);
  });

  it("maps the real empty payload, and the real no-database payload, to empty", async () => {
    for (const key of ["empty", "default_runtime_no_database_url"]) {
      stubFetch(fixture[key].body);
      const result = await fetchInteractionDiscovery("Orchis mascula");
      expect(result.state).toBe("empty");
    }
  });

  it("maps the real 422 validation response to unavailable, never to empty", async () => {
    stubFetch(fixture.invalid_category.body, fixture.invalid_category.status_code);
    const result = await fetchInteractionDiscovery("Orchis mascula");
    expect(result).toMatchObject({ state: "unavailable", httpStatus: 422 });
  });

  it("maps network failure and 5xx to unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect((await fetchInteractionDiscovery("Orchis mascula")).state).toBe("unavailable");
    stubFetch({ detail: "boom" }, 503);
    expect(await fetchInteractionDiscovery("Orchis mascula")).toMatchObject({ state: "unavailable", httpStatus: 503 });
  });

  it("refuses an empty taxon locally instead of fetching every species' records", async () => {
    const fetchMock = stubFetch(fixture.ok.body);
    const result = await fetchInteractionDiscovery("   ");
    expect(result.state).toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caps taxon length and limit at the backend's own bounds", () => {
    const url = new URL(buildInteractionDiscoveryUrl("x".repeat(400), { limit: 9999 }));
    expect(url.searchParams.get("taxon")).toHaveLength(200);
    expect(url.searchParams.get("limit")).toBe("500");
  });
});

// Synthetic ERROR-STATE shapes below are derived from the real ok body by
// removing or corrupting fields; they are labelled mutations, not captures.
describe("interaction discovery: fail-closed parsing of mutated bodies", () => {
  const okBody = fixture.ok.body as Record<string, unknown>;

  it("treats non-JSON 2xx as malformed", async () => {
    stubFetch("<html>not json</html>");
    expect((await fetchInteractionDiscovery("Orchis mascula")).state).toBe("malformed");
  });

  it("treats a body without an interactions list as malformed, not empty", () => {
    const { interactions: _omit, ...rest } = okBody;
    void _omit;
    expect(parseInteractionDiscoveryBody(rest).state).toBe("malformed");
    expect(parseInteractionDiscoveryBody(null).state).toBe("malformed");
    expect(parseInteractionDiscoveryBody([]).state).toBe("malformed");
  });

  it("treats a body that drops the review-bound / no-graph-mutation guarantees as malformed", () => {
    expect(parseInteractionDiscoveryBody({ ...okBody, review_bound: false }).state).toBe("malformed");
    expect(parseInteractionDiscoveryBody({ ...okBody, knowledge_graph_mutation: true }).state).toBe("malformed");
    const { review_bound: _rb, ...noReviewBound } = okBody;
    void _rb;
    expect(parseInteractionDiscoveryBody(noReviewBound).state).toBe("malformed");
  });

  it("drops unreadable records, counts them, and never shows a record claiming a graph write", () => {
    const [first, second] = okBody.interactions as Record<string, unknown>[];
    const state = parseInteractionDiscoveryBody({
      ...okBody,
      interactions: [first, { ...second, knowledge_graph_mutation: true }, { ...second, verification_state: null }],
    });
    if (state.state !== "ok") throw new Error("expected ok");
    expect(state.result.records).toHaveLength(1);
    expect(state.result.unreadable_count).toBe(2);
  });

  it("treats a body whose every record is unreadable as malformed, not empty", () => {
    const [first] = okBody.interactions as Record<string, unknown>[];
    expect(
      parseInteractionDiscoveryBody({ ...okBody, interactions: [{ ...first, target_taxon_name: "" }] }).state,
    ).toBe("malformed");
  });

  it("never carries locality fields a record might attach", () => {
    const [first] = okBody.interactions as Record<string, unknown>[];
    const state = parseInteractionDiscoveryBody({
      ...okBody,
      interactions: [{ ...first, decimalLatitude: 1.23, decimalLongitude: 4.56, locality: "Secret ridge" }],
    });
    if (state.state !== "ok") throw new Error("expected ok");
    const serialized = JSON.stringify(state.result);
    expect(serialized).not.toMatch(/Latitude|Longitude|locality|Secret ridge/i);
  });
});
