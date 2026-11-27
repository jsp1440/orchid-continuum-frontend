// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InteractionDiscoveryView, UNPROVISIONED_EMPTY_HEADLINE } from "./InteractionDiscoveryPanel";
import { WITHHELD_COORDINATE } from "@/lib/cognitiveIntegration";
import {
  carriesLocalityLikeKey,
  isLocalityLikeKey,
  nameBindsToExactSpecies,
  parseDiscoveredInteraction,
  parseInteractionDiscoveryBody,
  restrictToExactSpecies,
  MAX_SCREENED_TEXT_LENGTH,
  WITHHELD_UNSCREENABLE,
  speciesInteractionBinding,
  studyReferenceUrl,
  textCarriesLocality,
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

    expect(section().querySelector('[data-testid="interaction-discovery-summary"]')?.textContent).toContain(
      "Showing 2 candidates bound to Orchis mascula, from 2 broader name matches returned.",
    );
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
    ).toContain("3 matched candidates carried a different, broader, or possibly synonymous name than Orchis militaris");
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

/** A captured record with some fields replaced. Every caller labels its replacement SYNTHETIC. */
function capturedRecordWith(overrides: Record<string, unknown>): Record<string, unknown> {
  const [first] = fixture.fixture_ingested_pollinator.body.interactions as Record<string, unknown>[];
  return { ...first, ...overrides };
}

function pollinatorBodyWith(interactions: unknown[], extra: Record<string, unknown> = {}) {
  return { ...fixture.fixture_ingested_pollinator.body, interactions, ...extra };
}

describe("repair: infraspecific and hybrid names never bind to the species", () => {
  it.each([
    "Orchis mascula L. subsp. signifera",
    "Orchis mascula (L.) L. subsp. speciosa (Mutel) Hegi",
    "Orchis mascula L. × Orchis pallens L.",
    "Orchis mascula L. x Orchis pallens L.",
    "Orchis mascula L. var. alba",
    "Orchis mascula (L.) L. f. alba",
    "Orchis mascula L. ssp. signifera",
    "Orchis mascula L. nothosubsp. hybrida",
    "Orchis mascula L. cv. Alba",
    "Orchis mascula 'Alba'",
    "Orchis mascula L. signifera",
    "Orchis mascula auct. non L.",
    "Orchis mascula s.l.",
    "Orchis mascula L. hybrid",
    "Orchis ×mascula",
  ])("rejects %s", (name) => {
    expect(nameBindsToExactSpecies(name, "Orchis mascula")).toBe(false);
  });

  it.each(["Orchis mascula", "Orchis mascula L.", "Orchis mascula (L.) L.", "Orchis mascula Rchb. ex Lindl.", "Orchis mascula (L.) L. 1755"])(
    "accepts %s",
    (name) => {
      expect(nameBindsToExactSpecies(name, "Orchis mascula")).toBe(true);
    },
  );

  it("does not render an infraspecific record on the species page", async () => {
    // SYNTHETIC: a captured record with its source name replaced by an infraspecific name.
    const infraspecific = capturedRecordWith({ source_taxon_name: "Orchis mascula L. subsp. signifera" });
    stubFetch(() => json(pollinatorBodyWith([infraspecific])));
    await renderSpeciesPage("Orchis", "mascula");
    expect(section().textContent).not.toContain("signifera");
    expect(records()).toHaveLength(0);
    expect(section().querySelector('[data-testid="interaction-discovery-other-taxon-excluded"]')?.textContent).toContain(
      "1 matched candidate carried a different, broader, or possibly synonymous name than Orchis mascula",
    );
  });
});

describe("repair: an incomplete result is never shown as none", () => {
  const militaris = async (body: unknown) => {
    stubFetch(() => json(body));
    await renderSpeciesPage("Orchis", "militaris");
    expect(records()).toHaveLength(0);
    expect(section().querySelector('[data-testid="interaction-discovery-empty"]')).toBeNull();
    expect(section().textContent).not.toMatch(/holds no candidate interactions/);
    const box = section().querySelector('[data-testid="interaction-discovery-incomplete"]');
    expect(box?.textContent).toContain("This is not evidence that no interactions are known for Orchis militaris.");
    return box!;
  };
  const captured = fixture.fixture_ingested_genus_substring.body;

  it("mismatched records plus an unparseable one (SYNTHETIC unparseable item)", async () => {
    const box = await militaris({ ...captured, interactions: [...(captured.interactions as unknown[]), {}] });
    expect(box.querySelector('[data-testid="interaction-discovery-incomplete-unreadable"]')?.textContent).toContain(
      "1 record could not be read; exact-species candidates may be among it.",
    );
  });

  it("mismatched records plus a backend unreadable_count (SYNTHETIC count)", async () => {
    const box = await militaris({ ...captured, unreadable_count: 2 });
    expect(box.querySelector('[data-testid="interaction-discovery-incomplete-unreadable"]')?.textContent).toContain(
      "2 records could not be read",
    );
  });

  it("a truncated result that is all mismatched (SYNTHETIC totals)", async () => {
    const box = await militaris({ ...captured, total_matched: 900, truncated: true });
    expect(box.querySelector('[data-testid="interaction-discovery-incomplete-truncated"]')?.textContent).toContain(
      "Only the first 3 of 900 broader matches were checked; exact-species candidates may exist.",
    );
  });

  it("a truncated result with exact matches says more may exist (SYNTHETIC totals)", async () => {
    stubFetch(() => json({ ...fixture.fixture_ingested_pollinator.body, total_matched: 900, truncated: true }));
    await renderSpeciesPage("Orchis", "mascula");
    expect(records()).toHaveLength(2);
    expect(section().querySelector('[data-testid="interaction-discovery-summary"]')?.textContent).toContain(
      "Only the first 2 of 900 broader matches were checked; more exact-species candidates may exist.",
    );
  });

  it("shows the none copy only for a complete, durable result with no exact match (real test-double body)", async () => {
    stubFetch(() => json(earlierFixture.ok_durable_test_double.body));
    await renderSpeciesPage("Orchis", "militaris");
    expect(section().querySelector('[data-testid="interaction-discovery-incomplete"]')).toBeNull();
    expect(section().querySelector('[data-testid="interaction-discovery-empty"]')?.textContent).toContain(
      "not an ecological finding",
    );
  });
});

describe("repair: locality in allow-listed text fields is withheld", () => {
  it("withholds coordinates, WKT, lat/lon URLs, geo: URIs and split pairs (SYNTHETIC values on a real record)", async () => {
    // SYNTHETIC: locality-bearing text placed in allow-listed fields of captured records.
    const leaky = capturedRecordWith({
      study_citation: "Smith 2020, collected at 51.7523, -1.2578",
      study_source_citation: "POINT(45.6789 -12.3456)",
      study_external_id: "https://www.gbif.org/occurrence/search?lat=51.75&lon=-1.25",
      dataset_version: "geo:51,-1",
    });
    const split = capturedRecordWith({
      target_taxon_name: "Bombus pascuorum",
      study_citation: "Jones site near 51.75231",
      dataset_version: "-1.25784",
    });
    stubFetch(() => json(pollinatorBodyWith([leaky, split])));
    await renderSpeciesPage("Orchis", "mascula");

    const text = section().textContent ?? "";
    expect(records()).toHaveLength(2);
    expect(text).not.toMatch(/51\.75|1\.25|45\.6789|12\.3456|POINT|geo:|lat=|lon=/);
    expect(text).toContain(WITHHELD_COORDINATE);
    for (const anchor of Array.from(section().querySelectorAll("a"))) {
      expect(anchor.getAttribute("href") ?? "").not.toMatch(/lat|lon|geo/i);
    }
    expect(section().querySelector('[data-testid="interaction-discovery-locality-withheld"]')?.textContent).toContain(
      "Fields in 2 records were withheld",
    );
  });

  it("withholds a text value too long to screen, and leaves captured values untouched", () => {
    // SYNTHETIC: an over-long citation.
    const parsed = parseDiscoveredInteraction(capturedRecordWith({ study_citation: "a ".repeat(MAX_SCREENED_TEXT_LENGTH) }));
    expect(parsed?.study_citation).toBe(WITHHELD_UNSCREENABLE);
    for (const raw of fixture.fixture_ingested_all.body.interactions as Record<string, unknown>[]) {
      const clean = parseDiscoveredInteraction(raw)!;
      expect(clean.study_citation).toBe(raw.study_citation);
      expect(clean.study_external_id).toBe(raw.study_external_id);
      expect(clean.source_taxon_name).toBe(raw.source_taxon_name);
    }
  });
});

describe("repair: the locality key scan is unbounded, cycle-safe and fails closed", () => {
  function nested(depth: number, leaf: Record<string, unknown>) {
    let node: Record<string, unknown> = leaf;
    for (let i = 0; i < depth; i += 1) node = { child: node };
    return node;
  }

  it("finds a locality key far below the old depth limit", () => {
    expect(carriesLocalityLikeKey(nested(40, { decimalLatitude: 1 }))).toBe(true);
    expect(carriesLocalityLikeKey([[[[[[{ locality: "x" }]]]]]])).toBe(true);
  });

  it("treats a value too deep to scan as carrying locality", () => {
    expect(carriesLocalityLikeKey(nested(5000, { harmless: 1 }))).toBe(true);
  });

  it("terminates on a cycle", () => {
    const a: Record<string, unknown> = { name: "a" };
    const b: Record<string, unknown> = { name: "b", a };
    a.b = b;
    expect(carriesLocalityLikeKey(a)).toBe(false);
    b.stateProvince = "x";
    expect(carriesLocalityLikeKey(a)).toBe(true);
  });
});

describe("repair: only a DOI or an allow-listed provider host becomes a link", () => {
  it.each([
    ["doi:10.1234/example", "https://doi.org/10.1234/example"],
    ["10.1234/example", "https://doi.org/10.1234/example"],
    ["https://doi.org/10.1234/example", "https://doi.org/10.1234/example"],
    ["https://www.gbif.org/dataset/abc", "https://www.gbif.org/dataset/abc"],
    ["https://doi.org.evil.com/10.1234/example", null],
    ["https://evil.example/10.1234/example", null],
    ["https://evil.example/?u=https://www.gbif.org/", null],
    ["https://www.gbif.org.evil.com/dataset/abc", null],
    ["http://www.gbif.org/dataset/abc", null],
    ["https://user:pw@www.gbif.org/dataset/abc", null],
    ["https://www.gbif.org/occurrence/search?lat=51.7&lon=-1.2", null],
    ["https://doi.org/10.1234/example?lat=51.7", null],
    ["javascript:alert(1)", null],
  ])("%s -> %s", (value, expected) => {
    expect(studyReferenceUrl(value)).toBe(expected);
  });

  it("renders a look-alike DOI host as plain text (SYNTHETIC reference on a real record)", async () => {
    // SYNTHETIC: a hostile study reference.
    const record = capturedRecordWith({ study_external_id: "https://doi.org.evil.com/10.1234/example" });
    stubFetch(() => json(pollinatorBodyWith([record])));
    await renderSpeciesPage("Orchis", "mascula");
    expect(section().textContent).toContain("https://doi.org.evil.com/10.1234/example");
    expect(section().querySelectorAll("a")).toHaveLength(0);
  });
});

describe("repair: heading outline", () => {
  it("nests the panel heading under the section heading on the species page", async () => {
    stubFetch(byCategory("fixture_ingested"));
    await renderSpeciesPage("Orchis", "mascula");
    expect(Array.from(section().querySelectorAll("h2")).map((h) => h.textContent)).toEqual([
      "Candidate interactions (unverified)",
    ]);
    expect(section().querySelector("h3")?.textContent).toBe("Interaction discovery");
  });

  it("keeps h2 as the panel's default heading elsewhere", () => {
    act(() => {
      root.render(<InteractionDiscoveryView species="Orchis mascula" discovery={null} />);
    });
    expect(container.querySelector("h2")?.textContent).toBe("Interaction discovery");
  });
});

describe("repair 2: a locality-bearing citation never hides an exact candidate", () => {
  it("keeps the record, withholds only the citation, and counts nothing as another taxon (SYNTHETIC citation)", async () => {
    // SYNTHETIC: a coordinate placed in the citation of a captured exact-species record.
    const record = capturedRecordWith({ study_citation: "Smith 2020, collected at 51.7523, -1.2578" });
    stubFetch(() => json(pollinatorBodyWith([record])));
    await renderSpeciesPage("Orchis", "mascula");
    expect(records()).toHaveLength(1);
    const row = records()[0];
    expect(row.textContent).toContain("Orchis mascula");
    expect(row.textContent).toContain("pollinatedBy");
    expect(row.textContent).toContain("Bombus terrestris");
    expect(row.textContent).toContain(WITHHELD_COORDINATE);
    expect(section().textContent).not.toMatch(/51\.75|1\.25/);
    expect(section().querySelector('[data-testid="interaction-discovery-other-taxon-excluded"]')).toBeNull();
    expect(section().querySelector('[data-testid="interaction-discovery-empty"]')).toBeNull();
  });

  it("withholds a record whose identity carries locality, counts it as such, and never says none (SYNTHETIC name)", async () => {
    // SYNTHETIC: a coordinate inside a captured record's taxon name.
    const record = capturedRecordWith({ source_taxon_name: "Orchis mascula 51.7523 -1.2578" });
    stubFetch(() => json(pollinatorBodyWith([record])));
    await renderSpeciesPage("Orchis", "mascula");
    expect(records()).toHaveLength(0);
    expect(section().textContent).not.toMatch(/51\.75|1\.25/);
    expect(section().querySelector('[data-testid="interaction-discovery-empty"]')).toBeNull();
    expect(section().querySelector('[data-testid="interaction-discovery-other-taxon-excluded"]')).toBeNull();
    expect(section().querySelector('[data-testid="interaction-discovery-incomplete-locality"]')?.textContent).toContain(
      "1 record was withheld for locality protection",
    );
  });

  it("withholds the record when one half of a split pair is an identity field (SYNTHETIC values)", () => {
    const body = pollinatorBodyWith([capturedRecordWith({ target_taxon_id: "51.75231", study_citation: "near -1.25784" })]);
    const parsed = parseInteractionDiscoveryBody(body);
    expect(parsed.state).toBe("incomplete");
    if (parsed.state !== "incomplete") return;
    expect(parsed.result.withheld_for_protection_count).toBe(1);
    expect(JSON.stringify(parsed.result)).not.toMatch(/51\.75|1\.25/);
  });

  it("keeps an exact record whose other fields are clean when a sibling record is withheld", () => {
    const withheld = capturedRecordWith({ interaction_type: "pollinatedBy at 51.7523, -1.2578" });
    const clean = (fixture.fixture_ingested_pollinator.body.interactions as unknown[])[1];
    const kept = restrictToExactSpecies(parseInteractionDiscoveryBody(pollinatorBodyWith([withheld, clean])), "Orchis mascula");
    expect(kept.state).toBe("ok");
    if (kept.state !== "ok") return;
    expect(kept.result.records).toHaveLength(1);
    expect(kept.result.other_taxon_excluded_count).toBe(0);
    expect(kept.result.withheld_for_protection_count).toBe(1);
  });
});

describe("repair 2: encoded, prefixed and place parameters are never links and never shown", () => {
  const hostile = [
    "https://www.gbif.org/occurrence/search?lat%3D51.75%26lon%3D-1.25",
    "https://www.gbif.org/occurrence/search?%6Cat=51.75&%6Con=-1.25",
    "https://www.gbif.org/occurrence/search#%6Cat=51.75",
    "https://www.gbif.org/occurrence/search?%256Cat=51.75",
    "https://www.globalbioticinteractions.org/?nw_lat=51&se_lng=-1",
    "https://www.gbif.org/occurrence/search?country=AT",
    "https://www.gbif.org/occurrence/search?state_province=Wien",
    "https://www.gbif.org/occurrence/search?locality=Hidden%20valley",
    "https://www.gbif.org/occurrence/search?county=Kent",
    "https://www.gbif.org/occurrence/search?municipality=Graz",
    "https://www.gbif.org/occurrence/search?geometry=POLYGON",
    "https://www.gbif.org/x?%25%36%43at=51",
  ];

  it.each(hostile)("%s is not linkable and is withheld as text", (value) => {
    expect(studyReferenceUrl(value)).toBeNull();
    expect(textCarriesLocality(value)).toBe(true);
    const parsed = parseDiscoveredInteraction(capturedRecordWith({ study_external_id: value }))!;
    expect(parsed.study_external_id).toBe(WITHHELD_COORDINATE);
  });

  it("renders none of them on the page (SYNTHETIC references on real records)", async () => {
    stubFetch(() => json(pollinatorBodyWith(hostile.map((value) => capturedRecordWith({ study_external_id: value })))));
    await renderSpeciesPage("Orchis", "mascula");
    expect(records()).toHaveLength(hostile.length);
    expect(section().querySelectorAll("a")).toHaveLength(0);
    expect(section().textContent).not.toMatch(/gbif\.org\/occurrence|nw_lat|Wien|Hidden|Kent|Graz/);
  });

  it("rejects non-default ports and keeps clean allow-listed links", () => {
    expect(studyReferenceUrl("https://www.gbif.org:8443/dataset/abc")).toBeNull();
    expect(studyReferenceUrl("https://www.gbif.org:443/dataset/abc")).toBe("https://www.gbif.org/dataset/abc");
    expect(studyReferenceUrl("https://www.globalbioticinteractions.org/study/abc?taxon=Orchis")).toBe(
      "https://www.globalbioticinteractions.org/study/abc?taxon=Orchis",
    );
  });
});

describe("repair 2: more coordinate shapes, without over-withholding citations", () => {
  it.each([
    "48 12 30 N 16 22 23 E",
    "collected at 48 12 30 N",
    "N48 12.500 E016 22.383",
    "E016 22.383",
    "48 12.500 N",
    "N 48°12'",
    "forty-eight degrees twelve minutes north",
    "Forty eight degrees, twelve minutes North",
    "sixteen degrees twenty-two minutes east",
    "48 degrees twelve minutes",
  ])("withholds %s", (value) => {
    expect(textCarriesLocality(value)).toBe(true);
  });

  it.each([
    "vol 48, pp 12-30",
    "Smith J. 2020. J. Ecol. 48: 12-30.",
    "Table S1 12 species",
    "three degrees warmer than ambient",
    "N = 48 plants at 12 sites",
    "Example study 2020",
    "GloBI dataset v1",
    "doi:10.1234/example",
    "Kullenberg, B. (1961) Studies in Ophrys pollination. Zool. Bidr. Upps. 34: 1-340.",
    "globi-2026-08",
    "VERSIONED_STABLE_DATASET",
  ])("keeps %s", (value) => {
    expect(textCarriesLocality(value)).toBe(false);
  });

  it("stays fast on long adversarial input", () => {
    const inputs = [
      "1 ".repeat(999),
      "forty ".repeat(330),
      "N4 ".repeat(660),
      "=".repeat(1999),
      "%25".repeat(600),
      "a=".repeat(999),
    ];
    const started = performance.now();
    for (const input of inputs) textCarriesLocality(input);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});

describe("repair 2: rank markers without a following space", () => {
  it.each([
    "Orchis mascula L. subsp.signifera",
    "Orchis mascula L. var.alba",
    "Orchis mascula L. f.alba",
    "Orchis mascula (L.) L. ssp.speciosa (Mutel) Hegi",
    "Orchis mascula L. Alba",
    "Orchis mascula L. MASCULA",
    "Orchis mascula L. Mascula",
  ])("rejects %s", (name) => {
    expect(nameBindsToExactSpecies(name, "Orchis mascula")).toBe(false);
  });

  it.each(["Orchis mascula Rchb.f.", "Orchis mascula L.f.", "Orchis mascula (Mutel) Hegi", "Orchis mascula Hook.f. ex Lindl."])(
    "accepts %s",
    (name) => {
      expect(nameBindsToExactSpecies(name, "Orchis mascula")).toBe(true);
    },
  );
});

void React;
