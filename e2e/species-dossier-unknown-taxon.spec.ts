import { expect, test, type Page } from "@playwright/test";

/**
 * R1 journeys 3 and 14: a species dossier for a taxon no identity source
 * holds must say so, instead of an empty dossier titled with the requested
 * (invented) name in scientific-name styling; an outage must say the page
 * could not load, never "no record". Identifiers are the reference backend's
 * clearly synthetic unknown-taxon fixtures, not taxa.
 */

const SCREENSHOT_DIR = process.env.UNKNOWN_TAXON_SCREENSHOT_DIR;

async function expectNoDossierShell(page: Page) {
  const main = page.locator("main");
  for (const block of ["Taxonomy", "Conservation status", "Mycorrhizal partners", "Evidence dossier", "Federated attribution"]) {
    await expect(main.getByText(block, { exact: true })).toHaveCount(0);
  }
  await expect(main.getByTestId("dossier-section")).toHaveCount(0);
  await expect(main.getByRole("link", { name: /View on Atlas|Continue in Research|Ask Calyx|Continue in Matrix/ })).toHaveCount(0);
}

test("an invented taxon name shows 'no taxon record found', not an empty dossier", async ({ page }) => {
  await page.goto("/species/Notagenus%20fakeus");

  const panel = page.getByTestId("taxon-record-not-found");
  await expect(panel).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("No taxon record found for ‘Notagenus fakeus’");
  // The requested text is shown as input: upright, not the italic serif an
  // accepted scientific name is set in, and with no authority line.
  const requested = page.getByTestId("requested-taxon-name");
  await expect(requested).toHaveCSS("font-style", "normal");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("font-style", "normal");
  await expect(page.getByTestId("taxon-record-unavailable")).toHaveCount(0);
  await expectNoDossierShell(page);
  await expect(panel.getByRole("link", { name: "Browse the lexicon" })).toHaveAttribute("href", "/lexicon");

  if (SCREENSHOT_DIR) await page.screenshot({ path: `${SCREENSHOT_DIR}/unknown-taxon-reference-backend.png`, fullPage: true });

  await panel.getByRole("link", { name: "Search species" }).click();
  await expect(page).toHaveURL(/\/species$/);
});

test("a nonexistent numeric taxon id shows 'no taxon record found'", async ({ page }) => {
  await page.goto("/species/987654321");
  await expect(page.getByTestId("taxon-record-not-found")).toBeVisible();
  await expect(page.getByTestId("requested-taxon-name")).toHaveText("‘987654321’");
  await expectNoDossierShell(page);
});

test("an outage says the taxon record could not load and offers a retry, never 'no record'", async ({ page }) => {
  await page.goto("/species/Outagenus%20downus");
  const panel = page.getByTestId("taxon-record-unavailable");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Could not load the taxon record for ‘Outagenus downus’");
  await expect(page.getByText(/No taxon record found/)).toHaveCount(0);
  await expectNoDossierShell(page);

  const dossierRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/platform/species/")) dossierRequests.push(request.url());
  });
  await panel.getByRole("button", { name: /try again/i }).click();
  await expect(page.getByTestId("taxon-record-unavailable")).toBeVisible();
  expect(dossierRequests.length).toBeGreaterThan(0);
});

test("a real taxon still renders its dossier", async ({ page }) => {
  await page.goto(`/species/${encodeURIComponent("taxon:world-plants:phalaenopsis-amabilis")}`);
  await expect(page.getByRole("heading", { level: 1, name: "Phalaenopsis amabilis" })).toBeVisible();
  await expect(page.getByTestId("dossier-identity")).toBeVisible();
  await expect(page.getByTestId("taxon-record-not-found")).toHaveCount(0);
  await expect(page.getByTestId("taxon-record-unavailable")).toHaveCount(0);
});
