import { expect, test, type Page } from "@playwright/test";

/**
 * Atlas Explorer browser journey.
 *
 * The Calyx viewport service is fulfilled with a small synthetic contract
 * fixture (clearly not orchid records) so the journey is deterministic and
 * never depends on a live store. Basemap hosts are blocked so the bundled
 * country-outline fallback is exercised too.
 */

const point = (id: string, lat: number, lng: number, extra: Record<string, unknown> = {}) => ({
  occurrenceID: id,
  taxonID: "fixture-taxon-1",
  scientificName: "Fixtureorchis testii",
  genus: "Fixtureorchis",
  decimalLatitude: lat,
  decimalLongitude: lng,
  coordinateUncertaintyInMeters: null,
  countryCode: "EC",
  year: 2004,
  month: 3,
  eventDate: null,
  basisOfRecord: "PreservedSpecimen",
  datasetName: "Synthetic browser fixture",
  institutionCode: null,
  license: "CC0-1.0",
  rightsHolder: null,
  references: null,
  locality: "Fixture locality",
  iucnCategory: null,
  assessmentResolved: true,
  generalised: false,
  generalisationCellDeg: 0,
  generalisationReason: "none",
  generalisationNotice: null,
  ...extra,
});

const queryResponse = {
  contract_version: "oc-atlas-occurrence-query-v1",
  generated_at: "2026-10-11T00:00:00Z",
  source: { source_id: "fixture", label: "Atlas occurrence store", configured: true, state: "available", detail: null, supports_server_aggregation: false },
  mode: "points",
  bbox: [-180, -90, 180, 90],
  zoom: 2,
  cell_deg: null,
  total_in_view: 2,
  total_is_exact: true,
  points: [
    point("fx-1", -2.15, -78.45),
    point("fx-2", -3.5, -79.5, {
      iucnCategory: "CR",
      locality: null,
      generalised: true,
      generalisationCellDeg: 1,
      generalisationReason: "iucn-threatened",
      generalisationNotice: "Location generalised to about 111 km because this taxon is assessed as threatened (CR); precise sites are withheld to reduce collection risk.",
    }),
  ],
  clusters: [],
  next_cursor: null,
  truncated: false,
  truncation_reason: null,
  locality: { access: "public", rule: "oc-atlas-locality-policy-v1", generalised_count: 1, locality_withheld_count: 1, statement: "" },
  attribution: [{ dataset_name: "Synthetic browser fixture", record_count: 2, licenses: ["CC0-1.0"] }],
  cache: "miss",
};

async function blockBasemaps(page: Page) {
  await page.route(/openfreemap\.org|maps\.eox\.at|elevation-tiles-prod/, (route) => route.abort());
}

const APP_ORIGIN = process.env.E2E_APP_URL || "http://127.0.0.1:4173";
// The app's fetch layer sends credentials, so the origin must be explicit.
const cors = {
  "access-control-allow-origin": APP_ORIGIN,
  "access-control-allow-credentials": "true",
  "content-type": "application/json",
};

test.describe("Atlas Explorer", () => {
  test("draws locality-safe records from the viewport service and opens a record", async ({ page }) => {
    await blockBasemaps(page);
    await page.route("**/atlas/occurrences/query**", (route) => route.fulfill({ status: 200, headers: cors, body: JSON.stringify(queryResponse) }));
    await page.route("**/atlas/capabilities", (route) => route.fulfill({ status: 503, headers: cors, body: "{}" }));

    await page.goto("/atlas/explorer?view=map");
    await expect(page.getByText(/records in view/).first()).toBeVisible();
    await expect(page.getByText("Calyx Atlas service (viewport query)")).toBeVisible();
    await expect(page.getByText(/showing bundled country outlines/)).toBeVisible();

    const list = page.getByTestId("atlas-record-list");
    await expect(list.getByRole("button")).toHaveCount(2);
    await list.getByRole("button").nth(1).click();

    const card = page.getByRole("article", { name: "Fixtureorchis testii" });
    await expect(card.getByText("Generalised: threatened taxon.")).toBeVisible();
    await expect(card.getByText("Withheld").first()).toBeVisible();
    await expect(card).not.toContainText("Fixture locality");
    // Capability registry unreachable: the bundled contract is used and labelled as such.
    await expect(page.getByText(/not been live-checked/)).toBeVisible();
  });

  test("states plainly when no occurrence data can be read", async ({ page }) => {
    await blockBasemaps(page);
    await page.route("**/atlas/occurrences/query**", (route) =>
      route.fulfill({
        status: 200,
        headers: cors,
        body: JSON.stringify({ ...queryResponse, source: { ...queryResponse.source, configured: false, state: "source_not_configured" }, points: [] }),
      }),
    );
    await page.route("**/rest/v1/**", (route) => route.fulfill({ status: 503, headers: cors, body: "{}" }));

    await page.goto("/atlas/explorer?view=map");
    await expect(page.getByText("Occurrence data unavailable")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/not a statement about where orchids occur/)).toBeVisible();
  });

  test("lists planned layers with their blockers instead of drawing them", async ({ page }) => {
    await blockBasemaps(page);
    await page.route("**/atlas/occurrences/query**", (route) => route.fulfill({ status: 200, headers: cors, body: JSON.stringify(queryResponse) }));
    await page.goto("/atlas/explorer?view=map");
    await page.getByRole("tab", { name: "Layers" }).click();
    await expect(page.getByText("Not yet available")).toBeVisible();
    await expect(page.getByText(/WDPA terms restrict redistribution/)).toBeVisible();
    await expect(page.locator("#layer-protected-areas")).toHaveCount(0);
  });
});
