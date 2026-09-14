import { expect, test, type Page } from "@playwright/test";

/**
 * The canonical Continuum journey, in a real browser.
 *
 * Homepage → Atlas → Research → Calyx is covered in depth by unit tests, one
 * hop at a time: each producer builds the right address and each receiver
 * parses it. What none of them can show is that a person walking the whole
 * path arrives with the same subject they started with, and that every page
 * along the way says the subject is navigation context rather than evidence.
 *
 * That claim is the point of the journey, so it is asserted end to end here.
 *
 * The featured genus is whatever the Continuum is featuring, not a fixture.
 * Pinning one would test the seed rather than the continuity, and the property
 * worth protecting is that the genus the homepage offers is the genus that
 * reaches Calyx — whichever it is.
 */

test.describe.configure({ mode: "serial" });

let page: Page;
let genus = "";

const ACCOUNT = {
  email: `continuum-journey-${Date.now()}@continuum.test`,
  password: "a-throwaway-password-1",
};

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  // Webfonts and an embedded third-party script are unreachable here, and the
  // homepage's load event waits on them. Nothing off this host affects which
  // subject is carried between modules.
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === "localhost" ? route.continue() : route.abort();
  });
  page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
});

test.afterAll(async () => {
  await page?.close();
});

async function visit(path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

/**
 * Sign in before walking the journey.
 *
 * Research Center is members-only, so the canonical path crosses an
 * authentication gate partway along. Walking it signed out would stop at that
 * wall and prove nothing about whether the carried subject survives it — which
 * is exactly the hop most likely to drop context, since arriving, signing in
 * and returning is where a query string usually goes missing.
 */
async function signIn() {
  await visit("/");
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "Create an account", exact: true }).click();
  await modal.getByPlaceholder("you@orchidcontinuum.org").fill(ACCOUNT.email);
  await modal.getByPlaceholder("\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022").fill(ACCOUNT.password);
  await modal.getByRole("button", { name: /^create account$/i }).last().click();
  await expect(page.getByTestId("account-menu")).toBeVisible({ timeout: 20_000 });
}

test("1. the homepage offers one featured genus, once", async () => {
  await signIn();
  await visit("/");

  const panel = page.locator('section[aria-labelledby="featured-genus-title"]');
  await expect(panel).toBeVisible();
  genus = (await panel.locator("#featured-genus-title").innerText()).trim();
  expect(genus, "the homepage featured no genus").toMatch(/^[A-Z][A-Za-z-]+$/);

  await expect(page.getByTestId("featured-genus-continuation")).toBeVisible();
  expect(await page.locator('section[aria-labelledby="featured-genus-title"]').count()).toBe(1);
});

test("2. Atlas receives that genus and nothing else", async () => {
  const atlas = page.getByTestId("featured-genus-continuation").getByRole("link", { name: /Explore in Atlas Next/i });
  await expect(atlas).toBeVisible();
  await atlas.click();

  const url = new URL(page.url());
  expect(url.pathname).toBe("/atlas-next");
  expect(url.searchParams.get("genera")).toBe(genus);
  expect([...url.searchParams.keys()]).toEqual(["genera"]);
});

test("3. Research receives the same genus, marked as not evidence", async () => {
  await visit(`/research?genus=${encodeURIComponent(genus)}&origin=homepage-featured-taxon&context_is_evidence=false`);

  const url = new URL(page.url());
  expect(url.searchParams.get("genus")).toBe(genus);
  expect(url.searchParams.get("context_is_evidence")).toBe("false");

  await expect(page.getByText("RESTRICTED \u00B7 CONTINUUM MEMBERS")).toHaveCount(0);
  await expect(page.getByText(genus).first()).toBeVisible();
});

test("4. Calyx receives the same genus and says on screen that it is not evidence", async () => {
  await visit(`/calyx?genus=${encodeURIComponent(genus)}&origin=homepage-featured-taxon&context_is_evidence=false`);

  const banner = page.getByLabel("Genus handoff context");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(genus);
  await expect(banner).toContainText(/Continuing from Genus of the Day/i);
  await expect(banner).toContainText(/not scientific evidence/i);
  await expect(banner).toContainText(/no locality, occurrence, or conclusion/i);
  await expect(page.getByLabel("Rejected Calyx navigation context")).toHaveCount(0);
});

test("5. an arrival that dropped the declaration is refused, not trusted", async () => {
  await visit(`/calyx?genus=${encodeURIComponent(genus)}&origin=homepage-featured-taxon`);

  await expect(page.getByLabel("Rejected Calyx navigation context")).toBeVisible();
  await expect(page.getByText(/did not accept this carried genus/i)).toBeVisible();
  await expect(page.getByLabel("Genus handoff context")).toHaveCount(0);
});

test("6. Atlas Next hands its active genus to Calyx across the same boundary", async () => {
  await visit("/atlas-next?genera=Phalaenopsis");

  const toCalyx = page.getByRole("link", { name: "Ask Calyx about this genus" });
  await expect(toCalyx).toBeVisible({ timeout: 30_000 });

  const href = await toCalyx.getAttribute("href");
  const carried = new URL(href ?? "", "http://127.0.0.1");
  expect(carried.pathname).toBe("/calyx");
  expect(carried.searchParams.get("genus")).toBe("Phalaenopsis");
  expect(carried.searchParams.get("origin")).toBe("atlas-next");
  expect(carried.searchParams.get("context_is_evidence")).toBe("false");
  expect([...carried.searchParams.keys()].sort()).toEqual([
    "context_is_evidence", "genus", "origin",
  ]);

  await toCalyx.click();
  await expect(page).toHaveURL(/\/calyx\?/);
  await expect(page.getByLabel("Rejected Calyx navigation context")).toHaveCount(0);

  const banner = page.getByLabel("Genus handoff context");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Phalaenopsis");
  await expect(banner).toContainText(/Continuing from the Atlas Next map/i);
  await expect(banner).toContainText(/not scientific evidence/i);
  await expect(banner).toContainText(/no locality, occurrence, or conclusion/i);
});

test("7. an Atlas Next link with its declaration stripped is refused too", async () => {
  await visit("/calyx?genus=Phalaenopsis&origin=atlas-next");

  await expect(page.getByLabel("Rejected Calyx navigation context")).toBeVisible();
  await expect(page.getByLabel("Genus handoff context")).toHaveCount(0);
});
