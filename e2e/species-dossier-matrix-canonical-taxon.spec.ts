import { expect, test } from "@playwright/test";

const CANONICAL_TAXON_ID = "taxon:world-plants:phalaenopsis-amabilis";
const CANONICAL_NAME = "Phalaenopsis amabilis";

test("Species Dossier carries the exact canonical taxon into Matrix as non-evidence", async ({ page }) => {
  const offHostDataRequests: string[] = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      return route.continue();
    }
    if (["fetch", "xhr"].includes(route.request().resourceType())) {
      offHostDataRequests.push(route.request().url());
    }
    return route.abort();
  });

  await page.goto(`/species/${encodeURIComponent(CANONICAL_TAXON_ID)}`, {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByRole("heading", { name: CANONICAL_NAME })).toBeVisible();
  const matrixLink = page.getByRole("link", { name: "Continue in Matrix" });
  await expect(matrixLink).toBeVisible();

  const href = await matrixLink.getAttribute("href");
  expect(href).not.toBeNull();
  const destination = new URL(href!, "http://127.0.0.1:4173");
  expect(destination.pathname).toBe("/orchid-identification");
  expect(Object.fromEntries(destination.searchParams)).toEqual({
    origin: "species-dossier",
    taxon_id: CANONICAL_TAXON_ID,
    taxon_label: CANONICAL_NAME,
    context_is_observation: "false",
    context_is_evidence: "false",
  });
  expect(destination.hash).toBe("");

  await matrixLink.click();
  await expect(page).toHaveURL(/\/orchid-identification\?/);
  await expect(page.getByTestId("matrix-arrival-taxon-id")).toHaveText(CANONICAL_TAXON_ID);
  await expect(page.getByText(`${CANONICAL_NAME} remains bounded navigation context`)).toBeVisible();
  await expect(page.getByText(/not a Matrix observation, not evidence, and not a verified identification/i)).toBeVisible();

  const arrived = new URL(page.url());
  expect(arrived.searchParams.get("taxon_id")).toBe(CANONICAL_TAXON_ID);
  expect(arrived.searchParams.has("latitude")).toBe(false);
  expect(arrived.searchParams.has("longitude")).toBe(false);
  expect(offHostDataRequests).toEqual([]);
});
