import { expect, test, type Page } from "@playwright/test";

/**
 * R1 journeys 3 and 14: a species dossier for a taxon with no record must say
 * so instead of an empty dossier titled with the requested (invented) name in
 * scientific-name styling. "No record" is shown only on positive evidence of
 * absence from the Calyx sources; a bare id, or a source that did not answer,
 * gets "could not confirm" with a retry. Identifiers are the reference
 * backend's clearly synthetic unknown-taxon fixtures, not taxa.
 */

const SCREENSHOT_DIR = process.env.UNKNOWN_TAXON_SCREENSHOT_DIR;
const UNKNOWN = "/species/Notagenus%20fakeus";
const REAL = `/species/${encodeURIComponent("taxon:world-plants:phalaenopsis-amabilis")}`;
const REAL_NAME = "Phalaenopsis amabilis";

async function expectNoDossierShell(page: Page) {
  const main = page.locator("main");
  for (const block of ["Taxonomy", "Conservation status", "Mycorrhizal partners", "Evidence dossier", "Federated attribution"]) {
    await expect(main.getByText(block, { exact: true })).toHaveCount(0);
  }
  await expect(main.getByTestId("dossier-section")).toHaveCount(0);
  await expect(main.getByRole("link", { name: /View on Atlas|Continue in Research|Ask Calyx|Continue in Matrix/ })).toHaveCount(0);
}

test("an invented taxon name shows 'no taxon record found', not an empty dossier", async ({ page }) => {
  await page.goto(UNKNOWN);

  const panel = page.getByTestId("taxon-record-not-found");
  await expect(panel).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("No taxon record found for ‘Notagenus fakeus’");
  // The requested text is shown as input: upright, not the italic serif an
  // accepted scientific name is set in, and with no authority line.
  await expect(page.getByTestId("requested-taxon-name")).toHaveCSS("font-style", "normal");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("font-style", "normal");
  await expect(panel).not.toContainText(/species directory/i);
  await expect(page.getByTestId("taxon-record-unavailable")).toHaveCount(0);
  await expectNoDossierShell(page);
  await expect(panel.getByRole("link", { name: "Browse the lexicon" })).toHaveAttribute("href", "/lexicon");

  if (SCREENSHOT_DIR) await page.screenshot({ path: `${SCREENSHOT_DIR}/unknown-taxon-reference-backend.png`, fullPage: true });

  await panel.getByRole("link", { name: "Search species" }).click();
  await expect(page).toHaveURL(/\/species\?q=Notagenus%20fakeus$/);
});

test("a bare numeric id with no record is 'could not confirm', never 'no record found'", async ({ page }) => {
  await page.goto("/species/987654321");
  const panel = page.getByTestId("taxon-record-unavailable");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Could not confirm a taxon record for ‘987654321’");
  await expect(page.getByText(/No taxon record found/)).toHaveCount(0);
  await expectNoDossierShell(page);
});

test("an outage says it could not confirm the record and retries, never 'no record'", async ({ page }) => {
  await page.goto("/species/Outagenus%20downus");
  const panel = page.getByTestId("taxon-record-unavailable");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Could not confirm a taxon record for ‘Outagenus downus’");
  await expect(page.getByText(/No taxon record found/)).toHaveCount(0);
  await expectNoDossierShell(page);

  // Wait on the retry's own request, not on the panel (the old panel is
  // already visible when the click lands).
  const retried = page.waitForRequest((request) =>
    request.url().includes("/api/platform/species/Outagenus%20downus/dossier"),
  );
  await panel.getByRole("button", { name: /try again/i }).click();
  await retried;
  await expect(page.getByTestId("taxon-record-unavailable")).toBeVisible();
  await expect(page.getByText(/No taxon record found/)).toHaveCount(0);
});

test("with the public directory down, Calyx's no-record answer alone is 'could not confirm', never 'no record'", async ({ page }) => {
  const answers: string[] = [];
  page.on("response", (response) => {
    const url = response.url();
    if (/\/api\/(species|platform\/species)\/Publicdown%20fakeus|resolve-species/.test(url)) {
      answers.push(`${new URL(url).pathname} ${response.status()}`);
    }
  });
  await page.goto("/species/Publicdown%20fakeus");
  const panel = page.getByTestId("taxon-record-unavailable");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Could not confirm a taxon record for \u2018Publicdown fakeus\u2019");
  await expect(page.getByText(/No taxon record found/)).toHaveCount(0);
  await expectNoDossierShell(page);
  // The fixture really did give Calyx's exact no-record answer and the public outage.
  expect(answers).toEqual(
    expect.arrayContaining([
      "/api/species/Publicdown%20fakeus 503",
      "/api/platform/species/Publicdown%20fakeus/dossier 404",
      "/api/platform/federation/resolve-species 200",
    ]),
  );
});

test("a real taxon still renders its dossier", async ({ page }) => {
  await page.goto(REAL);
  await expect(page.getByRole("heading", { level: 1, name: REAL_NAME })).toBeVisible();
  await expect(page.getByTestId("dossier-identity")).toBeVisible();
  await expect(page.getByTestId("taxon-record-not-found")).toHaveCount(0);
  await expect(page.getByTestId("taxon-record-unavailable")).toHaveCount(0);
});

test("history navigation between an unknown and a real taxon never shows one's answer under the other", async ({ page }) => {
  // Record, on every DOM mutation, whether the page body claims "no record"
  // or shows a dossier heading, together with the path at that moment.
  await page.addInitScript(() => {
    const seen: Array<{ path: string; noRecord: boolean; heading: string }> = [];
    (window as unknown as { __taxonStates: typeof seen }).__taxonStates = seen;
    const sample = () => {
      const main = document.querySelector("main");
      if (!main) return;
      seen.push({
        path: location.pathname,
        noRecord: /No taxon record found/.test(main.textContent || ""),
        heading: main.querySelector("h1")?.textContent || "",
      });
    };
    new MutationObserver(sample).observe(document, { subtree: true, childList: true, characterData: true });
  });

  await page.goto(UNKNOWN);
  await expect(page.getByTestId("taxon-record-not-found")).toBeVisible();

  // Client-side navigation to the real taxon (pushState + popstate), then back and forward.
  await page.evaluate((to) => {
    history.pushState({}, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, REAL);
  await expect(page.getByRole("heading", { level: 1, name: REAL_NAME })).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("taxon-record-not-found")).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1, name: REAL_NAME })).toBeVisible();

  const states = await page.evaluate(
    () => (window as unknown as { __taxonStates: Array<{ path: string; noRecord: boolean; heading: string }> }).__taxonStates,
  );
  const realPath = new URL(REAL, "http://x").pathname;
  const unknownPath = new URL(UNKNOWN, "http://x").pathname;
  expect(states.filter((s) => s.path === realPath).length).toBeGreaterThan(0);
  expect(states.filter((s) => s.path === realPath && s.noRecord)).toEqual([]);
  expect(states.filter((s) => s.path === unknownPath && s.heading === REAL_NAME)).toEqual([]);
});

test("a long requested name wraps inside the panel at phone width (390px), with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const longName = `Notagenus${"x".repeat(80)} fakeus`;
  await page.goto(`/species/${encodeURIComponent(longName)}`);
  await expect(page.getByTestId("taxon-record-not-found")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
