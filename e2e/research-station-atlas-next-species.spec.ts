import { expect, test, type Page } from "@playwright/test";

/**
 * Research Station -> Atlas Next filters on the species (frontend #788).
 *
 * WHAT THIS PROVES: in the production bundle, a signed-in reader who moves
 * Species Dossier -> Research Center -> "Return to Atlas" lands in Atlas Next
 * with the canonical binomial as the species filter, and Atlas Next names that
 * species rather than a genus. The Research Station workbench, whose reference
 * subject is an opaque taxon id, offers no Atlas link at all.
 *
 * WHAT THIS DOES NOT PROVE: any deployed service or any occurrence data. Every
 * datum comes from the fictional local reference backend, network access is
 * restricted to localhost, and the reference backend serves no Atlas
 * occurrences, so this asserts the filter identity, not narrowed records.
 */

const TAXON_ID = "taxon:world-plants:phalaenopsis-amabilis";
const SPECIES = "Phalaenopsis amabilis";
const ACCOUNT = {
  email: `research-atlas-next-${Date.now()}@acceptance.test`,
  password: "a-throwaway-password-1",
};

let page: Page;

async function signIn() {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "Create an account", exact: true }).click();
  await modal.getByPlaceholder("you@orchidcontinuum.org").fill(ACCOUNT.email);
  await modal.getByPlaceholder("••••••••").fill(ACCOUNT.password);
  await modal.getByRole("button", { name: /^create account$/i }).last().click();
  await expect(modal).toBeHidden({ timeout: 20_000 });
  await expect(page.getByTestId("account-menu")).toBeVisible({ timeout: 20_000 });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === "localhost"
      ? route.continue()
      : route.abort("blockedbyclient");
  });
  page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
});

test.afterAll(async () => {
  await page?.close();
});

test("a dossier species reaches Atlas Next as the species filter via Research Center", async () => {
  await signIn();

  await page.goto(`/species/${encodeURIComponent(TAXON_ID)}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: SPECIES })).toBeVisible();
  await page.getByRole("link", { name: /continue in research/i }).click();

  await expect(page).toHaveURL(/\/research\?/);
  await expect(page.getByText("Continuing from the Species Dossier")).toBeVisible({
    timeout: 20_000,
  });

  const atlasLink = page.getByRole("link", { name: /return to atlas/i });
  const href = await atlasLink.getAttribute("href");
  const destination = new URL(href!, "http://127.0.0.1");
  expect(destination.pathname).toBe("/atlas-next");
  expect(destination.searchParams.get("species")).toBe(SPECIES);
  expect(destination.searchParams.has("genera")).toBe(false);

  await atlasLink.click();
  await expect(page).toHaveURL(/\/atlas-next\?/);
  const subject = page.getByTestId("atlas-next-subject");
  await expect(subject).toBeVisible({ timeout: 20_000 });
  await expect(subject).toHaveAttribute("data-subject-rank", "species");
  await expect(subject).toContainText("Species filter");
  await expect(subject).toContainText(SPECIES);
  await expect(page.getByText("Genus-level fallback")).toHaveCount(0);

  const arrived = new URL(page.url());
  expect(arrived.searchParams.get("species")).toBe(SPECIES);
  for (const key of ["lat", "lng", "latitude", "longitude", "locality", "coordinates"]) {
    expect(arrived.searchParams.has(key)).toBe(false);
  }
});

test("a genus-only arrival is labelled as the genus-level fallback in Atlas Next", async () => {
  await page.goto(
    "/research?genus=Phalaenopsis&origin=homepage-featured-taxon&context_is_evidence=false",
    { waitUntil: "domcontentloaded" },
  );
  await page.getByRole("link", { name: /return to atlas/i }).click();
  await expect(page).toHaveURL(/\/atlas-next\?genera=Phalaenopsis/);
  const subject = page.getByTestId("atlas-next-subject");
  await expect(subject).toHaveAttribute("data-subject-rank", "genus");
  await expect(subject).toContainText("Genus-level fallback");
});

test("the workbench offers no Atlas link for an opaque subject taxon id", async () => {
  await page.goto("/research", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Where to take this investigation")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("research-station-atlas-withheld")).toBeVisible();
  expect(
    await page.locator('a[href^="/atlas"]').count(),
  ).toBe(0);
});
