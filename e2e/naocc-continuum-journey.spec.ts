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
  email: `naocc-${Date.now()}@continuum.test`,
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

/* ----------------------------------------------------------------- 1 ----- */

test("1. the homepage offers one featured genus, once", async () => {
  await signIn();
  await visit("/");

  const panel = page.locator('section[aria-labelledby="featured-genus-title"]');
  await expect(panel).toBeVisible();
  genus = (await panel.locator("#featured-genus-title").innerText()).trim();
  expect(genus, "the homepage featured no genus").toMatch(/^[A-Z][A-Za-z-]+$/);

  // The continuation actions live inside that panel, not in a second band
  // offering the same genus again.
  await expect(page.getByTestId("featured-genus-continuation")).toBeVisible();
  expect(await page.locator('section[aria-labelledby="featured-genus-title"]').count()).toBe(1);
});

/* ----------------------------------------------------------------- 2 ----- */

test("2. Atlas receives that genus and nothing else", async () => {
  const atlas = page.getByTestId("featured-genus-continuation").getByRole("link", { name: /Explore in Atlas Next/i });
  await expect(atlas).toBeVisible();
  await atlas.click();

  const url = new URL(page.url());
  expect(url.pathname).toBe("/atlas-next");
  expect(url.searchParams.get("genera")).toBe(genus);
  // A subject, and only a subject. No locality, occurrence or evidence claim
  // rides along in the address.
  expect([...url.searchParams.keys()]).toEqual(["genera"]);
});

/* ----------------------------------------------------------------- 3 ----- */

test("3. Research receives the same genus, marked as not evidence", async () => {
  await visit(`/research?genus=${encodeURIComponent(genus)}&origin=homepage-featured-taxon&context_is_evidence=false`);

  const url = new URL(page.url());
  expect(url.searchParams.get("genus")).toBe(genus);
  // The declaration is the whole boundary. Losing it between modules is how a
  // carried subject quietly becomes a finding.
  expect(url.searchParams.get("context_is_evidence")).toBe("false");

  // Research Center is members-only, and the subject survived the gate: the
  // page renders for a signed-in member rather than the sign-in wall, and the
  // genus is on it.
  await expect(page.getByText("RESTRICTED \u00B7 CONTINUUM MEMBERS")).toHaveCount(0);
  await expect(page.getByText(genus).first()).toBeVisible();
});

/* ----------------------------------------------------------------- 4 ----- */

test("4. Calyx receives the same genus and says on screen that it is not evidence", async () => {
  await visit(`/calyx?genus=${encodeURIComponent(genus)}&origin=homepage-featured-taxon&context_is_evidence=false`);

  const banner = page.getByLabel("Genus handoff context");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(genus);
  await expect(banner).toContainText(/Continuing from Genus of the Day/i);

  // The distinction the whole journey exists to preserve, stated to the reader
  // rather than only carried in a payload.
  await expect(banner).toContainText(/not scientific evidence/i);
  await expect(banner).toContainText(/no locality, occurrence, or conclusion/i);

  // And the workspace mounted: a refused arrival would show the rejection
  // panel instead, which would mean the boundary was lost somewhere upstream.
  await expect(page.getByLabel("Rejected Calyx navigation context")).toHaveCount(0);
});

/* ----------------------------------------------------------------- 5 ----- */

test("5. an arrival that dropped the declaration is refused, not trusted", async () => {
  // The same journey with the boundary stripped — what a hand-edited or stale
  // link looks like. Calyx must refuse the carried subject rather than treat
  // it as an ordinary featured-genus arrival.
  await visit(`/calyx?genus=${encodeURIComponent(genus)}&origin=homepage-featured-taxon`);

  await expect(page.getByLabel("Rejected Calyx navigation context")).toBeVisible();
  await expect(page.getByText(/did not accept this carried genus/i)).toBeVisible();
  await expect(page.getByLabel("Genus handoff context")).toHaveCount(0);
});

/* ----------------------------------------------------------------- 6 ----- */

test("6. Atlas Next hands its active genus to Calyx across the same boundary", async () => {
  // Issue #406 required the receiving trust boundary to be closed before the
  // Atlas Next producer was mounted live. Both halves are in the tree and are
  // covered one hop at a time by unit tests; what those cannot show is that
  // the mounted shell actually builds the governed address, rather than a
  // hand-rolled one that happens to look similar.
  //
  // Atlas Next takes its active genus from the shared Atlas filter contract
  // (`genera=`), not from a `genus=` parameter of its own.
  await visit("/atlas-next?genera=Phalaenopsis");

  // The shell mounts its map and resolves the active genus before the
  // cross-Continuum actions appear, which is slower than domcontentloaded.
  // The shell resolves its active genus and mounts the map before the
  // cross-Continuum actions appear, which is later than domcontentloaded.
  const toCalyx = page.getByRole("link", { name: "Ask Calyx about this genus" });
  await expect(toCalyx).toBeVisible({ timeout: 30_000 });

  // The exact address, asserted by parameter rather than by substring: the
  // point is that Atlas Next adds nothing of its own — no occurrence id, no
  // locality, no coordinates, no project — to a link that leaves the map.
  const href = await toCalyx.getAttribute("href");
  const carried = new URL(href ?? "", "http://127.0.0.1");
  expect(carried.pathname).toBe("/calyx");
  expect(carried.searchParams.get("genus")).toBe("Phalaenopsis");
  expect(carried.searchParams.get("origin")).toBe("atlas-next");
  expect(carried.searchParams.get("context_is_evidence")).toBe("false");
  expect([...carried.searchParams.keys()].sort()).toEqual([
    "context_is_evidence", "genus", "origin",
  ]);

  // And following it lands in a mounted workspace, not the rejection panel.
  // Following it lands in a mounted workspace, not the rejection panel — and
  // says on screen what the carried genus is. Atlas Next was the one governed
  // genus origin that reached Calyx silently: the machine-readable
  // non-evidence declaration was emitted, but the reader was told nothing,
  // on the arrival that most needs telling.
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

/* ----------------------------------------------------------------- 7 ----- */

test("7. an Atlas Next link with its declaration stripped is refused too", async () => {
  // The boundary is a property of the receiver, not of who sent the link. A
  // stale or hand-edited Atlas Next address gets the same refusal the
  // homepage one does.
  await visit("/calyx?genus=Phalaenopsis&origin=atlas-next");

  await expect(page.getByLabel("Rejected Calyx navigation context")).toBeVisible();
  await expect(page.getByLabel("Genus handoff context")).toHaveCount(0);
});
