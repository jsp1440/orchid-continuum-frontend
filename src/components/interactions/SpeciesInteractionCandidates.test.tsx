// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InteractionDiscoveryView, UNPROVISIONED_EMPTY_HEADLINE } from "./InteractionDiscoveryPanel";
import {
  carriesLocalityLikeKey,
  isLocalityLikeKey,
  nameBindsToExactSpecies,
  parseDiscoveredInteraction,
  parseInteractionDiscoveryBody,
  restrictToExactSpecies,
  speciesInteractionBinding,
} from "@/lib/interactionDiscovery";
import captured from "@/lib/__fixtures__/interactionDiscovery.speciesCategories.realBackend.json";
import earlier from "@/lib/__fixtures__/interactionDiscovery.realBackend.json";

/**
 * The species page's "Candidate interactions (unverified)" section.
 *
 * Fixtures: `interactionDiscovery.speciesCategories.realBackend.json` holds
 * verbatim bodies captured from the backend's app.main via FastAPI TestClient
 * (see its `_capture` field). Its records are the backend's own TEST FIXTURE
 * values run through the real ingest path -- they pin SHAPE, not science.
 * Bodies marked SYNTHETIC below are error shapes the backend has no body for
 * (network failure, a 5xx from a proxy), or real records with locality keys
 * injected to prove they are dropped; they are labelled where they are built.
 *
 * The page identity handed to the page (genus/epithet) is a page subject, not
 * scientific data.
 */

type Captured = { request: Record<string, unknown>; status_code: number; body: Record<string, unknown> };
const fixture = captured as unknown as Record<string, Captured>;
const earlierFixture = earlier as unknown as Record<string, { status_code: number; body: Record<string, unknown> }>;

const speciesMock = vi.hoisted(() => ({ genus: "Orchis", epithet: "mascula" }));

vi.mock("@/lib/species", () => ({
  fetchSpeciesById: async (id: string) => ({
    data: {
      id,
      slug: id,
      taxonomy_id: id,
      genus: speciesMock.genus,
      epithet: speciesMock.epithet,
      common_name: null,
      authority: null,
      family: "Orchidaceae",
      subfamily: null,
      tribe: null,
      habitat: "Unknown",
      growth_form: null,
      region: "",
      countries: [],
      conservation_status: "Not assessed",
      iucn_code: null,
      description: null,
      ecology: null,
      image_url: null,
      occurrences: [],
      pollinators: [],
      traits: {},
      references_list: [],
    },
    error: null,
    unconfigured: false,
  }),
}));
vi.mock("@/components/interactions/EcologicalInteractionPanel", () => ({
  default: ({ taxonomyId }: { taxonomyId: string }) => (
    <div data-testid="public-api-interaction-panel">public API panel for {taxonomyId}</div>
  ),
}));
vi.mock("@/components/orchid/Navbar", () => ({ default: () => null }));
vi.mock("@/components/orchid/Footer", () => ({ default: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

type Responder = (url: URL) => Response | Promise<Response>;

function json(body: unknown, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Route discovery requests by `category=` to the captured body for that category. */
function byCategory(prefix: string): Responder {
  return (url) => {
    const entry = fixture[`${prefix}_${url.searchParams.get("category")}`];
    return entry ? json(entry.body, entry.status_code) : json({}, 404);
  };
}

function stubFetch(responder: Responder) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (!url.pathname.endsWith("/api/interactions/discovery")) return json({}, 404);
    return responder(url);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function discoveryCalls(fn: ReturnType<typeof stubFetch>) {
  return fn.mock.calls
    .map((call) => new URL(String((call as unknown[])[0])))
    .filter((url) => url.pathname.endsWith("/api/interactions/discovery"));
}

async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function renderSpeciesPage(genus: string, epithet: string) {
  speciesMock.genus = genus;
  speciesMock.epithet = epithet;
  const { default: SpeciesDetail } = await import("@/pages/SpeciesDetail");
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/species/tax-1"]}>
        <Routes>
          <Route path="/species/:slug" element={<SpeciesDetail />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await flush();
}

function section() {
  const el = container.querySelector('[data-testid="species-interaction-candidates"]');
  if (!el) throw new Error("candidate section not rendered");
  return el as HTMLElement;
}

function records() {
  return Array.from(section().querySelectorAll('[data-testid="interaction-discovery-record"]'));
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

describe("species page: candidate interactions (unverified)", () => {
  it("requests candidates for an exact species, pollinator tab first, beside the unchanged public-API panel", async () => {
    const fetchMock = stubFetch(byCategory("fixture_ingested"));
    await renderSpeciesPage("Orchis", "mascula");

    const calls = discoveryCalls(fetchMock);
    expect(calls).toHaveLength(1);
    expect(calls[0].searchParams.get("taxon")).toBe("Orchis mascula");
    expect(calls[0].searchParams.get("category")).toBe("pollinator");

    expect(section().querySelector("h2")?.textContent).toBe("Candidate interactions (unverified)");
    // The public-API panel is still mounted, and is not inside the candidate section.
    const publicPanel = container.querySelector('[data-testid="public-api-interaction-panel"]');
    expect(publicPanel?.textContent).toContain("tax-1");
    expect(section().contains(publicPanel)).toBe(false);
    expect(publicPanel?.contains(section())).toBe(false);
    expect(records()).toHaveLength(2);
  });

  it.each([
    ["Orchis", "", "genus_level", /bound to the genus Orchis/],
    ["Orchis", "sp.", "ambiguous", /open-nomenclature or hybrid/],
    ["Orchis", "mascula subsp. speciosa", "ambiguous", /infraspecific or compound/],
    ["×Brassolaeliocattleya", "hybrid", "ambiguous", /not a plain genus name/],
  ])("sends NO request for %s %s (%s) and says why", async (genus, epithet, kind, reason) => {
    expect(speciesInteractionBinding(genus, epithet).kind).toBe(kind);
    const fetchMock = stubFetch(byCategory("fixture_ingested"));
    await renderSpeciesPage(genus, epithet);

    expect(discoveryCalls(fetchMock)).toHaveLength(0);
    const box = section().querySelector('[data-testid="species-interaction-candidates-not-requested"]');
    expect(box?.textContent).toMatch(reason);
    expect(box?.textContent).toContain("This is not evidence that no interactions are known.");
    expect(section().querySelector('[role="tablist"]')).toBeNull();
    expect(records()).toHaveLength(0);
  });

  it("switches category tabs and sends category= for each", async () => {
    const fetchMock = stubFetch(byCategory("fixture_ingested"));
    await renderSpeciesPage("Orchis", "mascula");

    const pollinatorTab = section().querySelector('[data-testid="species-interaction-tab-pollinator"]')!;
    const mycorrhizalTab = section().querySelector('[data-testid="species-interaction-tab-mycorrhizal"]')!;
    expect(pollinatorTab.getAttribute("aria-selected")).toBe("true");
    expect(records().map((r) => r.textContent)).toEqual([
      expect.stringContaining("Bombus terrestris"),
      expect.stringContaining("Bombus terrestris"),
    ]);

    await act(async () => {
      (mycorrhizalTab as HTMLButtonElement).click();
    });
    await flush();

    const calls = discoveryCalls(fetchMock);
    expect(calls.map((u) => u.searchParams.get("category"))).toEqual(["pollinator", "mycorrhizal"]);
    expect(calls.every((u) => u.searchParams.get("taxon") === "Orchis mascula")).toBe(true);
    expect(mycorrhizalTab.getAttribute("aria-selected")).toBe("true");
    expect(pollinatorTab.getAttribute("aria-selected")).toBe("false");
    expect(records()).toHaveLength(1);
    expect(records()[0].textContent).toContain("Rhizoctonia sp.");
    expect(records()[0].textContent).toContain("hasHost");
  });

  it("labels every record UNVERIFIED, review-bound and not evidence", async () => {
    stubFetch(byCategory("fixture_ingested"));
    await renderSpeciesPage("Orchis", "mascula");
    const rows = records();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.querySelector('[data-testid="interaction-discovery-verification"]')?.textContent).toBe(
        "UNVERIFIED candidate",
      );
      expect(row.querySelector('[data-testid="interaction-discovery-review-label"]')?.textContent).toBe(
        "Review-bound · not evidence",
      );
    }
    expect(section().textContent).toMatch(/not evidence, have not been\s+scientifically reviewed/);
    expect(section().querySelector('[data-testid="interaction-discovery-note"]')?.textContent).toBe(
      fixture.fixture_ingested_pollinator.body.note,
    );
  });

  it("shows each record's provenance, and keeps separate studies of the same pair separate", async () => {
    stubFetch(byCategory("fixture_ingested"));
    await renderSpeciesPage("Orchis", "mascula");
    const [first, second] = records();

    // Record 1: canonical-dataset ingest.
    expect(first.textContent).toContain("Example study 2020");
    expect(first.textContent).toContain("GloBI dataset v1");
    expect(first.textContent).toContain("Global Biotic Interactions");
    expect(first.textContent).toContain("globi-2026-08");
    expect(first.textContent).toContain("VERSIONED_STABLE_DATASET");

    // Record 2: same taxon pair, different study, carries a DOI.
    expect(second.textContent).toContain("Example study");
    expect(second.textContent).not.toContain("Example study 2020");
    expect(second.textContent).toContain("LIVE_EXPLORATORY_API");
    const doi = second.querySelector("a");
    expect(doi?.textContent).toBe("doi:10.1234/example");
    expect(doi?.getAttribute("href")).toBe("https://doi.org/10.1234/example");
    expect(doi?.getAttribute("rel")).toBe("noopener noreferrer");

    expect(section().textContent).toContain("Showing 2 of 2 matched candidates.");
  });

  it("renders a network outage as unavailable, never as no interactions known (SYNTHETIC failure)", async () => {
    // SYNTHETIC: the backend has no outage body; a rejected fetch is the outage.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await renderSpeciesPage("Orchis", "mascula");
    const box = section().querySelector('[data-testid="interaction-discovery-unavailable"]');
    expect(box?.textContent).toContain("Interaction discovery is unavailable right now.");
    expect(box?.textContent).toContain("This is not evidence that no interactions are known for Orchis mascula.");
    expect(section().querySelector('[data-testid="interaction-discovery-empty"]')).toBeNull();
  });

  it("renders a 5xx as unavailable (SYNTHETIC status, no backend body)", async () => {
    // SYNTHETIC: a proxy/host 503 with an arbitrary body.
    stubFetch(() => json({ detail: "synthetic 503" }, 503));
    await renderSpeciesPage("Orchis", "mascula");
    expect(section().querySelector('[data-testid="interaction-discovery-unavailable"]')?.textContent).toContain(
      "This is not evidence that no interactions are known",
    );
  });

  it("renders the real no-database response as unprovisioned in both tabs, never as no interactions known", async () => {
    const fetchMock = stubFetch(byCategory("default_runtime"));
    await renderSpeciesPage("Orchis", "mascula");
    for (const tab of ["pollinator", "mycorrhizal"]) {
      if (tab === "mycorrhizal") {
        await act(async () => {
          (section().querySelector('[data-testid="species-interaction-tab-mycorrhizal"]') as HTMLButtonElement).click();
        });
        await flush();
      }
      const box = section().querySelector('[data-testid="interaction-discovery-unprovisioned"]');
      expect(box?.textContent).toContain(UNPROVISIONED_EMPTY_HEADLINE);
      expect(box?.querySelector('[data-testid="interaction-discovery-index-note"]')?.textContent).toBe(
        fixture[`default_runtime_${tab}`].body.index_note,
      );
      expect(section().querySelector('[data-testid="interaction-discovery-empty"]')).toBeNull();
    }
    expect(discoveryCalls(fetchMock)).toHaveLength(2);
  });

  it("renders a real durable-shape empty body (backend test double) as an ingestion gap, not an ecological finding", async () => {
    stubFetch(() => json(earlierFixture.empty_durable_test_double.body));
    await renderSpeciesPage("Orchis", "mascula");
    const empty = section().querySelector('[data-testid="interaction-discovery-empty"]');
    expect(empty?.textContent).toContain("not an ecological finding");
    expect(empty?.textContent).toContain("Orchis mascula");
    const withoutDisclaimer = section().textContent!.replace(/not evidence that no interactions are known/g, "");
    expect(withoutDisclaimer).not.toMatch(/no (known )?interactions/i);
  });

  it("drops locality keys before rendering and says they were withheld (SYNTHETIC keys on a real record)", async () => {
    const body = fixture.fixture_ingested_pollinator.body;
    const [first] = body.interactions as Record<string, unknown>[];
    // SYNTHETIC: locality keys injected into a captured record; no captured body carries any.
    const withLocality = {
      ...first,
      decimalLatitude: -12.3456,
      decimalLongitude: 45.6789,
      locality: "Hidden valley",
      stateProvince: "Secret province",
      footprintWKT: "POINT (45.6789 -12.3456)",
      locator: { ...(first.locator as Record<string, unknown>), verbatimLocality: "Behind the waterfall" },
    };
    stubFetch(() => json({ ...body, interactions: [withLocality] }));
    await renderSpeciesPage("Orchis", "mascula");

    const text = section().textContent ?? "";
    expect(text).toContain("Bombus terrestris");
    expect(text).not.toMatch(/12\.3456|45\.6789|Hidden valley|Secret province|POINT|waterfall/);
    expect(section().querySelector('[data-testid="interaction-discovery-locality-withheld"]')?.textContent).toContain(
      "this page never shows locality",
    );

    const parsed = parseDiscoveredInteraction(withLocality)!;
    expect(Object.keys(parsed).filter(isLocalityLikeKey)).toEqual([]);
  });
});

describe("candidate binding and locality helpers", () => {
  it("binds record names to the exact species only", () => {
    expect(nameBindsToExactSpecies("Orchis mascula", "Orchis mascula")).toBe(true);
    expect(nameBindsToExactSpecies("orchis  mascula", "Orchis mascula")).toBe(true);
    expect(nameBindsToExactSpecies("Orchis mascula (L.) L.", "Orchis mascula")).toBe(true);
    expect(nameBindsToExactSpecies("Orchis mascula subsp. speciosa", "Orchis mascula")).toBe(false);
    expect(nameBindsToExactSpecies("Orchis mascula var. alba", "Orchis mascula")).toBe(false);
    expect(nameBindsToExactSpecies("Orchis masculata", "Orchis mascula")).toBe(false);
    expect(nameBindsToExactSpecies("Orchis", "Orchis mascula")).toBe(false);
  });

  it("counts, rather than silently drops, captured records that do not bind to the page's species", () => {
    const parsed = parseInteractionDiscoveryBody(fixture.fixture_ingested_genus_substring.body);
    expect(parsed.state).toBe("ok");
    const kept = restrictToExactSpecies(parsed, "Orchis mascula");
    expect(kept.state).toBe("ok");
    if (kept.state === "ok") expect(kept.result.other_taxon_excluded_count).toBe(0);

    const other = restrictToExactSpecies(parsed, "Orchis militaris");
    // The capture was served by a non-durable index, so an emptied result stays unprovisioned.
    expect(other.state).toBe("unprovisioned");
    if (other.state !== "unprovisioned") return;
    expect(other.result.records).toHaveLength(0);
    expect(other.result.other_taxon_excluded_count).toBe(3);

    act(() => {
      root.render(<InteractionDiscoveryView species="Orchis militaris" discovery={other} />);
    });
    expect(
      container.querySelector('[data-testid="interaction-discovery-other-taxon-excluded"]')?.textContent,
    ).toContain("3 matched candidates named a different or broader taxon than Orchis militaris");
    expect(container.querySelector('[data-testid="interaction-discovery-unprovisioned"]')).not.toBeNull();
  });

  it("recognises locality-like keys and nothing the captured payload renders", () => {
    for (const key of ["decimalLatitude", "decimal_longitude", "locality", "verbatimLocality", "stateProvince",
      "country_code", "footprintWKT", "coordinates", "geo_point", "elevation"]) {
      expect(isLocalityLikeKey(key), key).toBe(true);
    }
    for (const key of ["verification_state", "index_state", "locator", "source_taxon_name", "study_citation",
      "study_external_id", "provider", "dataset_version", "categories", "interaction_type"]) {
      expect(isLocalityLikeKey(key), key).toBe(false);
    }
    for (const [name, entry] of Object.entries(fixture)) {
      if (name.startsWith("_")) continue;
      expect(carriesLocalityLikeKey(entry.body), name).toBe(false);
    }
  });
});

void React;
