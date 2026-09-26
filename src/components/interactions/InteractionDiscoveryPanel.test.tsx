// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InteractionDiscoveryPanel from "./InteractionDiscoveryPanel";
import realBackend from "@/lib/__fixtures__/interactionDiscovery.realBackend.json";

vi.mock("@/lib/relationshipExplorer", () => ({
  TEST_SPECIES: [],
  fetchRelationshipExplorerPayload: async (name: string) => ({
    scientific_name: name,
    source: "fallback",
    cards: {},
  }),
}));
vi.mock("@/lib/ecologicalNeighborhood", () => ({
  fetchSpeciesEcologicalNeighborhood: async () => [],
}));
vi.mock("@/components/orchid/EcologicalNeighborhood", () => ({ default: () => null }));

/**
 * The panel renders exactly what the real backend payload holds: raw
 * direction and interaction type, provider/dataset/study provenance, and the
 * UNVERIFIED evidence state -- and fails closed, visibly, when the backend is
 * unavailable or its body is unreadable. Fixture: see its `_capture` field.
 */

type Captured = { status_code: number; body: unknown };
const fixture = realBackend as unknown as Record<string, Captured>;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function stubFetch(body: unknown, status = 200) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.includes("/api/interactions/discovery")) {
      return new Response("{}", { status: 404 });
    }
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function flush() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function renderPanel(species = "Orchis mascula") {
  await act(async () => {
    root.render(<InteractionDiscoveryPanel species={species} />);
  });
  await flush();
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("InteractionDiscoveryPanel", () => {
  it("renders pollinator and mycorrhizal candidates with provenance and evidence state from the real payload", async () => {
    stubFetch(fixture.ok.body);
    await renderPanel();

    const text = container.textContent ?? "";
    const pollinatorGroup = container.querySelector('[data-testid="interaction-discovery-group-pollinator"]');
    const mycorrhizalGroup = container.querySelector('[data-testid="interaction-discovery-group-mycorrhizal"]');
    expect(pollinatorGroup?.textContent).toContain("Bombus terrestris");
    expect(pollinatorGroup?.textContent).toContain("pollinatedBy");
    expect(mycorrhizalGroup?.textContent).toContain("Rhizoctonia sp.");
    expect(mycorrhizalGroup?.textContent).toContain("hasHost");

    const records = container.querySelectorAll('[data-testid="interaction-discovery-record"]');
    expect(records).toHaveLength(2);
    for (const record of Array.from(records)) {
      expect(record.textContent).toContain("Orchis mascula");
      expect(record.textContent).toContain("Example study 2020");
      expect(record.textContent).toContain("GloBI dataset v1");
      expect(record.textContent).toContain("Global Biotic Interactions");
      expect(record.textContent).toContain("globi-2026-08");
      expect(record.textContent).toContain("VERSIONED_STABLE_DATASET");
      expect(record.querySelector('[data-testid="interaction-discovery-verification"]')?.textContent).toBe(
        "UNVERIFIED candidate",
      );
    }
    expect(text).toContain("Showing 2 of 2 matched candidates.");
    expect(container.querySelector('[data-testid="interaction-discovery-note"]')?.textContent).toMatch(
      /not verified Knowledge Graph edges/,
    );
    expect(text).toMatch(/None of these is a verified\s+Knowledge Graph relationship/);
    // Internal identifiers and locator objects are not rendered.
    expect(text).not.toContain("363807776956648");
    expect(text).not.toMatch(/locator/i);
  });

  it("states truncation instead of implying the list is complete", async () => {
    stubFetch(fixture.ok_truncated.body);
    await renderPanel();
    expect(container.textContent).toContain("Showing 1 of 2 matched candidates.");
    expect(container.textContent).toContain("More candidates exist than this panel requested.");
  });

  it("renders the real empty payload as an ingestion gap, not an ecological finding", async () => {
    stubFetch(fixture.empty.body);
    await renderPanel();
    const empty = container.querySelector('[data-testid="interaction-discovery-empty"]');
    expect(empty?.textContent).toContain("not an ecological finding");
    expect(container.querySelectorAll('[data-testid="interaction-discovery-record"]')).toHaveLength(0);
  });

  it("fails closed and visibly when the backend is unavailable", async () => {
    stubFetch({ detail: "unavailable" }, 503);
    await renderPanel();
    const box = container.querySelector('[data-testid="interaction-discovery-unavailable"]');
    expect(box?.textContent).toContain("This is not evidence that no interactions are known for Orchis mascula.");
    expect(container.querySelector('[data-testid="interaction-discovery-empty"]')).toBeNull();
  });

  it("fails closed when the body is unreadable", async () => {
    stubFetch("not json at all");
    await renderPanel();
    expect(container.querySelector('[data-testid="interaction-discovery-malformed"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="interaction-discovery-record"]')).toHaveLength(0);
  });

  it("never renders locality a record might carry", async () => {
    const body = fixture.ok.body as Record<string, unknown>;
    const [first] = body.interactions as Record<string, unknown>[];
    stubFetch({
      ...body,
      interactions: [{ ...first, decimalLatitude: -12.3456, decimalLongitude: 45.6789, locality: "Hidden valley" }],
    });
    await renderPanel();
    const text = container.textContent ?? "";
    expect(text).toContain("Bombus terrestris");
    expect(text).not.toMatch(/-12\.3456|45\.6789|Hidden valley/);
  });
});

describe("RelationshipExplorer mounts the interaction discovery panel for the page's species", () => {
  it("queries discovery with the routed species and renders the panel", async () => {
    const fetchMock = stubFetch(fixture.ok.body);
    const { default: RelationshipExplorer } = await import("@/pages/RelationshipExplorer");
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/relationship-explorer/Orchis%20mascula"]}>
          <Routes>
            <Route path="/relationship-explorer/:species" element={<RelationshipExplorer />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    await flush();

    const discoveryCalls = fetchMock.mock.calls
      .map((call) => String((call as unknown[])[0]))
      .filter((url) => url.includes("/api/interactions/discovery"));
    expect(discoveryCalls).toHaveLength(1);
    expect(new URL(discoveryCalls[0]).searchParams.get("taxon")).toBe("Orchis mascula");
    expect(container.querySelector('[data-testid="interaction-discovery-panel"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="interaction-discovery-record"]')).toHaveLength(2);
  });
});

void React;
