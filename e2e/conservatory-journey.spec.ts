import { expect, test, type Page } from "@playwright/test";
import { CAPTURE_DAY, geotaggedJpeg } from "./support/geotagged-jpeg";

/**
 * The signed-in My Conservatory journey, in a real browser.
 *
 * Each test is one of the twelve acceptance points in issue #407, named so a
 * failing run says which capability is not there rather than which selector
 * moved. They share one browser context and run in order, because the journey
 * is the thing under test: a plant has to exist before it can be placed, and a
 * bench has to be empty before it can be retired.
 *
 * What this proves: the frontend journey works end to end against a backend
 * that honours the contract in `src/pages/MyConservatory.tsx`, in Chromium,
 * against a production build.
 *
 * What this does not prove: anything about the deployed backend. The server
 * behind these tests is `e2e/support/reference-backend.mjs`, a local reference
 * implementation. A green run here is browser evidence, not deployment
 * evidence, and must not be reported as the latter.
 */

test.describe.configure({ mode: "serial" });

const ACCOUNT = {
  email: `journey-${Date.now()}@conservatory.test`,
  password: "a-throwaway-password-1",
};

const PLANT = {
  displayName: "Journey Phalaenopsis",
  taxon: "Phalaenopsis amabilis",
};

let page: Page;
let plantUrl = "";
let qrIdentifier = "";
let locationName = "North bench";
let benchId = "";
let shelfId = "";

/** The id of the location card whose heading is `name`. */
async function locationIdByName(name: string): Promise<string> {
  const card = page.getByTestId("location-list").locator(`li:has(strong:text-is("${name}"))`).first();
  await card.waitFor();
  const testId = await card.getAttribute("data-testid");
  return (testId || "").replace("location-card-", "");
}

async function createLocation(name: string, kind: string): Promise<string> {
  await page.getByTestId("location-name").fill(name);
  await page.getByTestId("location-kind").selectOption(kind);
  await page.getByTestId("location-submit").click();
  await expect(page.getByTestId("location-list").getByText(name, { exact: true })).toBeVisible();
  return locationIdByName(name);
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  // A thrown React error, a console error, or a blocked request all leave a
  // blank panel that a selector wait reports as a plain timeout, which hides
  // what actually happened. Surface all three.
  page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`[console] ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    console.error(`[requestfailed] ${request.method()} ${request.url()} — ${request.failure()?.errorText}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) console.error(`[http ${response.status()}] ${response.url()}`);
  });
});

test.afterAll(async () => {
  await page?.close();
});

/**
 * Navigate without waiting for `load`.
 *
 * The homepage embeds third-party scripts and webfonts, and its `load` event
 * does not fire until those settle. Waiting for it costs about fifty seconds
 * per navigation whenever they are slow or unreachable, which is a real
 * property of the page worth knowing but not one this journey is testing.
 */
async function visit(path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

async function signIn(create: boolean) {
  await visit("/");
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  if (create) {
    await modal.getByRole("button", { name: "Create an account", exact: true }).click();
  }
  await modal.getByPlaceholder("you@orchidcontinuum.org").fill(ACCOUNT.email);
  await modal.getByPlaceholder("••••••••").fill(ACCOUNT.password);
  await modal.getByRole("button", { name: create ? /^create account$/i : /^sign in$/i }).last().click();
  await expect(modal).toBeHidden({ timeout: 20_000 });
  // The account menu only exists for a signed-in visitor, so its presence is
  // what says the session took — not the absence of a button.
  await expect(page.getByTestId("account-menu")).toBeVisible({ timeout: 20_000 });
}

/* ----------------------------------------------------------------- 1 ----- */

test("1. My Conservatory opens from normal navigation", async () => {
  await signIn(true);
  await visit("/");
  await page.getByRole("button", { name: "Conservatory", exact: true }).first().click();
  await expect(page).toHaveURL(/\/conservatory$/);
  await expect(page.getByRole("heading", { name: "My Conservatory" })).toBeVisible();
  // Reaching it must not have required a sign-in wall to be dismissed again.
  await expect(page.getByText("RESTRICTED · CONTINUUM MEMBERS")).toHaveCount(0);
});

/* ----------------------------------------------------------------- 2 ----- */

test("2. a plant can be created and its accession is assigned by the server", async () => {
  await page.getByRole("link", { name: "Add Plant" }).click();
  await expect(page).toHaveURL(/\/conservatory\/plants\/new$/);
  await page.getByLabel("Display name").fill(PLANT.displayName);
  await page.getByLabel("Accepted scientific name").fill(PLANT.taxon);
  // The tag identity the server assigns is read off the creation response,
  // because it is a durable identity the UI never prints as text.
  const [created] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith("/api/conservatory/plants") && response.request().method() === "POST"),
    page.getByRole("button", { name: /save and assign accession/i }).click(),
  ]);
  qrIdentifier = (await created.json()).qr_identifier;
  expect(qrIdentifier).toMatch(/^ocq_/);

  await expect(page).toHaveURL(/\/conservatory\/plants\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  plantUrl = new URL(page.url()).pathname;
  await expect(page.getByText(PLANT.displayName).first()).toBeVisible();
  await expect(page.getByText(/OC-\d{4}/).first()).toBeVisible();
});

/* ----------------------------------------------------------------- 3 ----- */

test("3. a growing location can be created, renamed, retired and unretired", async () => {
  await page.getByRole("link", { name: "Locations" }).click();
  await expect(page.getByTestId("create-location")).toBeVisible();

  benchId = await createLocation(locationName, "greenhouse_bench");

  // Rename. The list shows the new name, and the location's own history says
  // it was renamed — not that anything moved.
  await page.getByTestId(`rename-${benchId}`).click();
  locationName = "North bench (upper)";
  await page.getByTestId(`rename-input-${benchId}`).fill(locationName);
  await page.getByTestId(`rename-save-${benchId}`).click();
  await expect(page.getByTestId(`location-card-${benchId}`)).toContainText(locationName);
  await page.getByTestId(`history-toggle-${benchId}`).click();
  const history = page.getByTestId(`history-${benchId}`);
  await expect(history.getByTestId("history-entry-renamed")).toBeVisible();
  await expect(history.getByTestId("history-entry-created")).toBeVisible();
  await page.getByTestId(`history-toggle-${benchId}`).click();

  // Retire an empty bench, then bring it back.
  await page.getByTestId(`retire-${benchId}`).click();
  await expect(page.getByTestId(`retired-${benchId}`)).toBeVisible();
  await expect(page.getByTestId(`retired-${benchId}`)).toContainText(/no longer in use/i);

  await page.getByTestId(`unretire-${benchId}`).click();
  await expect(page.getByTestId(`location-card-${benchId}`)).toBeVisible();
  await expect(page.getByTestId(`location-card-${benchId}`)).toContainText(locationName);
});

/* ----------------------------------------------------------------- 4 ----- */

test("4. a plant can be placed, moved and corrected with the history kept", async () => {
  // A second bench, so there is somewhere to move to.
  shelfId = await createLocation("South bench", "shelf");

  await visit(plantUrl);
  await expect(page.getByTestId("record-placement")).toBeVisible();

  await page.getByTestId("placement-location").selectOption({ label: locationName });
  await page.getByTestId("placement-reason-select").selectOption("initial");
  await page.getByTestId("placement-submit").click();
  await expect(page.getByTestId("current-location")).toContainText(locationName);

  // Move it.
  await page.getByTestId("placement-location").selectOption({ label: "South bench" });
  await page.getByTestId("placement-reason-select").selectOption("move");
  await page.getByTestId("placement-submit").click();
  await expect(page.getByTestId("current-location")).toContainText("South bench");

  // Correct the move: the corrected entry must still be in the history.
  const moved = await page.getByTestId("placement-history").locator("li").first().getAttribute("data-testid");
  await page.getByTestId(`correct-placement-${(moved || "").replace("placement-entry-", "")}`).click();
  await expect(page.getByTestId("correcting-placement")).toBeVisible();
  await page.getByTestId("placement-location").selectOption({ label: locationName });
  await page.getByTestId("placement-submit").click();

  await expect(page.getByTestId("current-location")).toContainText(locationName);
  const history = page.getByTestId("placement-history");
  await expect(history.getByText("South bench")).toBeVisible();
  await expect(history.locator("li")).toHaveCount(3);
});

/* ----------------------------------------------------------------- 5 ----- */

test("5. an environmental reading records its provenance and can be corrected", async () => {
  await page.getByRole("link", { name: "Locations" }).click();
  const readings = page.getByTestId(`readings-${benchId}`);
  await expect(readings).toBeVisible();

  const form = readings.getByTestId("record-reading");
  await form.getByTestId("reading-variable").selectOption("temperature_c");
  await form.getByTestId("reading-value").fill("31");
  await form.getByTestId("reading-day").fill(new Date().toISOString().slice(0, 10));

  // An instrument may only be named once "measured" is chosen, and choosing
  // "measured" requires one. Both halves matter.
  await expect(form.getByTestId("reading-instrument")).toHaveCount(0);
  await form.getByTestId("reading-origin").selectOption("measured");
  await expect(form.getByTestId("reading-instrument")).toBeVisible();
  await form.getByTestId("reading-instrument").fill("Bench datalogger 2");
  await form.getByTestId("reading-submit").click();

  const list = readings.getByTestId(`reading-list-${benchId}`);
  await expect(list).toContainText("31");
  await expect(list).toContainText(/measured by an instrument/i);
  await expect(list).toContainText("Bench datalogger 2");

  // Correct it to a value inside the taxon's range. The original stays,
  // struck through under "Corrected", and stops being used.
  const readingId = ((await list.locator("li").first().getAttribute("data-testid")) || "")
    .replace("reading-", "");
  await readings.getByTestId(`correct-reading-${readingId}`).click();
  await expect(readings.getByTestId("correcting-reading")).toBeVisible();
  await form.getByTestId("reading-value").fill("21");
  await form.getByTestId("reading-day").fill(new Date().toISOString().slice(0, 10));
  await form.getByTestId("reading-origin").selectOption("measured");
  await form.getByTestId("reading-instrument").fill("Bench datalogger 2");
  await form.getByTestId("reading-submit").click();

  await expect(readings.getByTestId(`reading-list-${benchId}`)).toContainText("21");
  await expect(readings.getByTestId(`corrected-readings-${benchId}`)).toContainText("31");
});

/* ----------------------------------------------------------------- 6 ----- */

test("6. observations are appended and a correction supersedes without deleting", async () => {
  await visit(plantUrl);
  const ledger = page.getByTestId("plant-ledger");
  await expect(ledger).toBeVisible();

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await page.getByTestId("event-kind").selectOption("spike_observed");
  await page.getByTestId("event-day").fill(yesterday);
  await page.getByTestId("event-note").fill("One spike on the left growth.");
  await page.getByTestId("event-submit").click();
  await expect(page.getByTestId("event-list").getByText(/spike seen/i)).toBeVisible();

  await page.getByTestId("event-list").locator('[data-testid^="correct-"]').first().click();
  await expect(page.getByTestId("correcting-banner")).toBeVisible();
  await page.getByTestId("event-day").fill(new Date().toISOString().slice(0, 10));
  await page.getByTestId("event-note").fill("Miscounted: the spike is on the right growth.");
  await page.getByTestId("event-submit").click();

  // Both the correction and what it corrected are present.
  await expect(page.getByTestId("corrected-events")).toBeVisible();
  await expect(page.getByTestId("corrected-events")).toContainText(/spike/i);
});

/* ----------------------------------------------------------------- 7 ----- */

test("7. the dossier shows location, history, conditions and the taxon comparison", async () => {
  await visit(plantUrl);
  await expect(page.getByTestId("current-location")).toContainText(locationName);
  await expect(page.getByTestId("placement-history")).toBeVisible();
  await expect(page.getByTestId("plant-ledger")).toBeVisible();
  await expect(page.getByTestId("cultivation-context")).toBeVisible();

  const assessment = page.getByTestId("placement-assessment");
  await expect(assessment).toBeVisible();
  await expect(assessment.getByTestId("assessment-list")).toBeVisible();
  // 21 °C sits inside 16–24, so the comparison must reach a real verdict
  // rather than the "nothing could be compared" branch.
  await expect(assessment.getByTestId("nothing-assessed")).toHaveCount(0);
  // A comparison is never advice, and the page has to keep saying so.
  await expect(assessment.getByTestId("assessment-not-advice")).toBeVisible();
  // The age of the number behind the verdict is stated, not implied.
  await expect(assessment.getByTestId("assessment-oldest-reading")).toBeVisible();

  // The plant record offers a governed continuation into the public scientific
  // record for its species, carrying only the accepted species identity — never
  // the grower's private plant data.
  const continuum = page.getByTestId("plant-species-continuum");
  await expect(continuum).toBeVisible();
  await expect(continuum.getByTestId("plant-continuum-atlas")).toHaveAttribute(
    "href",
    "/atlas?species=Phalaenopsis+amabilis",
  );
  const calyxHref = await continuum.getByTestId("plant-continuum-calyx").getAttribute("href");
  expect(calyxHref).toContain("genus=Phalaenopsis");
  expect(calyxHref).toContain("context_is_evidence=false");
  // No private plant data (accession, location) may appear in any continuation.
  for (const href of await continuum.getByRole("link").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href") || ""),
  )) {
    expect(href).not.toContain("OC-");
    expect(href).not.toContain(locationName);
    expect(href).not.toContain("ocq_");
  }
});

/* ----------------------------------------------------------------- 8 ----- */

test("8. a photograph uploads, loses its location data, and keeps its two clocks apart", async () => {
  await visit(plantUrl);
  const photographs = page.getByTestId("photographs");
  await expect(photographs).toBeVisible();
  await expect(page.getByTestId("photographs-privacy")).toContainText(/location data is removed/i);

  const original = geotaggedJpeg();
  await page.getByTestId("photograph-caption").fill("In spike, north bench");
  await page.getByTestId("photograph-file").setInputFiles({
    name: "plant.jpg",
    mimeType: "image/jpeg",
    buffer: original,
  });

  await expect(page.getByTestId("photograph-list")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("photograph-error")).toHaveCount(0);
  const entry = page.getByTestId("photograph-list").locator("li").first();
  await expect(entry).toContainText("In spike, north bench");

  // The photograph itself must render: a stripper that corrupted the file
  // would leave a broken-image icon that no other assertion here would catch.
  const image = entry.locator("img");
  await expect
    .poll(async () => image.evaluate((node: HTMLImageElement) => (node.complete ? node.naturalWidth : 0)))
    .toBeGreaterThan(0);

  // The camera's date and the date it reached the Continuum are different
  // claims. This file was taken in 2019 and uploaded today, so both are shown.
  const captureDate = new Date(`${CAPTURE_DAY}T10:30:00Z`).toLocaleDateString("en-US");
  await expect(entry).toContainText(captureDate);
  await expect(entry).toContainText(/added/i);

  // Where the grower lives must not have survived the upload. Read the stored
  // bytes back and look for the GPS rationals that were in the file sent.
  //
  // The status and the JPEG marker are asserted first on purpose: an error
  // body contains no GPS either, so a "no GPS found" check that ran on a 401
  // would pass while proving nothing.
  const stored = await page.evaluate(async () => {
    const api = location.origin.replace(/:\d+$/, ":8791");
    const token = JSON.parse(
      Object.entries(localStorage).find(([key]) => key.startsWith("sb-"))?.[1] as string,
    ).access_token as string;
    const auth = { credentials: "include" as const, headers: { Authorization: `Bearer ${token}` } };
    const list = await (await fetch(
      `${api}/api/conservatory/plants/${location.pathname.split("/").pop()}/photographs`, auth,
    )).json();
    const response = await fetch(`${api}/api/conservatory/photographs/${list.photographs[0].id}`, auth);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      size: bytes.length,
      hex: Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    };
  });
  expect(stored.status).toBe(200);
  expect(stored.contentType).toContain("image/jpeg");
  expect(stored.hex.startsWith("ffd8ff")).toBe(true);        // still a JPEG
  expect(stored.size).toBeLessThan(original.length);         // metadata removed
  expect(stored.hex).not.toContain("2f00000001000000");      // GPS latitude 47/1
  expect(stored.hex).not.toContain("7a00000001000000");      // GPS longitude 122/1
  expect(stored.hex).not.toContain(Buffer.from("Exif\0\0", "ascii").toString("hex"));
});

/* ----------------------------------------------------------------- 9 ----- */

test("9. a QR label prints and scanning its identifier resolves to the same plant", async () => {
  await page.getByRole("link", { name: "Print Labels" }).click();
  const label = page.locator(".plant-label").first();
  await expect(label).toBeVisible();
  const qr = label.locator("img");
  await expect(qr).toBeVisible();
  // A broken image renders at zero width; the label would print empty.
  await expect
    .poll(async () => qr.evaluate((node: HTMLImageElement) => (node.complete ? node.naturalWidth : 0)))
    .toBeGreaterThan(0);

  await visit(`/conservatory/scan/${encodeURIComponent(qrIdentifier)}`);
  await expect(page.getByTestId("scan-arrival")).toBeVisible();
  await expect(page.getByText(PLANT.displayName).first()).toBeVisible();

  // A tag this collection does not know is not the same as a broken service.
  await visit("/conservatory/scan/ocq_not_a_real_tag");
  await expect(page.getByTestId("scan-unresolved")).toBeVisible();
});

/* ---------------------------------------------------------------- 10 ----- */

test("10. collection Review groups the whole collection without a skimmable pass", async () => {
  await visit("/conservatory");
  await page.getByRole("link", { name: "Review" }).click();
  const review = page.getByTestId("collection-review");
  await expect(review).toBeVisible();
  await expect(page.getByTestId("review-unavailable")).toHaveCount(0);
  await expect(review).toContainText(/inside the known range/i);
  // "Nothing could be compared" is a heading of its own, not a grey block.
  await expect(review).toContainText(/nothing could be compared/i);
  await expect(page.getByTestId("review-not-advice")).toBeVisible();
});

/* ---------------------------------------------------------------- 11 ----- */

test("11. Could I grow this? answers against the locations actually recorded", async () => {
  await page.getByRole("link", { name: "Could I grow this?" }).click();
  await expect(page.getByTestId("taxon-search-form")).toBeVisible();

  await page.getByTestId("taxon-search-input").fill(PLANT.taxon);
  await page.getByTestId("taxon-search-submit").click();

  const result = page.getByTestId("taxon-search-result");
  await expect(result).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("taxon-search-error")).toHaveCount(0);
  // It answers about this grower's own benches, by name.
  await expect(result.getByTestId("taxon-location-list")).toContainText(locationName);
  await expect(result.getByTestId("taxon-location-list")).toContainText("South bench");
  await expect(page.getByTestId("taxon-not-advice")).toBeVisible();

  // A taxon with no bounds must say nothing could be compared, not "fine".
  await page.getByTestId("taxon-search-input").fill("Dracula vampira");
  await page.getByTestId("taxon-search-submit").click();
  await expect(page.getByTestId("taxon-nothing-assessed")).toBeVisible();
});

/* ---------------------------------------------------------------- 12 ----- */

test("12. everything survives a reload and a sign-out / sign-in cycle", async () => {
  await visit(plantUrl);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("current-location")).toContainText(locationName);
  await expect(page.getByTestId("photograph-list")).toBeVisible();

  await visit("/");
  await page.getByTestId("account-menu").click();
  await page.getByTestId("account-sign-out").click();
  await expect(page.getByRole("button", { name: /^sign in$/i }).first()).toBeVisible({ timeout: 20_000 });

  // Signed out, the collection is not readable.
  await visit("/conservatory");
  await expect(page.getByText("RESTRICTED · CONTINUUM MEMBERS")).toBeVisible();

  await signIn(false);
  await visit(plantUrl);
  await expect(page.getByText(PLANT.displayName).first()).toBeVisible();
  await expect(page.getByTestId("current-location")).toContainText(locationName);
  await expect(page.getByTestId("event-list")).toBeVisible();
  await expect(page.getByTestId("photograph-list")).toBeVisible();
});

/* ---------------------------------------------------------------- 13 ----- */

test("13. the signed-in Conservatory pages fit an iPad in portrait", async () => {
  // The mounted-layout suite cannot reach any of these: they sit behind
  // authentication, so its route list stops at the public site. That left the
  // one module the owner uses most as the only part of the product never
  // checked at a tablet width, which is the width a grower stands at a bench
  // holding.
  //
  // This runs last on purpose. By now the collection has plants, two benches,
  // readings, events, a photograph and a placement history, so the pages are
  // measured full rather than empty — an empty table fits anything.
  const context = await page.context().browser()!.newContext({
    viewport: { width: 834, height: 1112 },
    storageState: await page.context().storageState(),
  });
  const tablet = await context.newPage();
  await tablet.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === "localhost" ? route.continue() : route.abort();
  });

  const routes = [
    "/conservatory",
    "/conservatory/plants",
    "/conservatory/locations",
    "/conservatory/review",
    "/conservatory/could-i-grow-this",
    "/conservatory/labels",
    "/conservatory/readiness",
    "/conservatory/plants/new",
    plantUrl,
  ];

  const offenders: string[] = [];
  for (const route of routes) {
    await tablet.goto(route, { waitUntil: "domcontentloaded" });
    await tablet.waitForTimeout(900);
    // A page that failed to render fits any viewport, so a fitting check on
    // its own would pass on nine blank screens. Require the module's own
    // chrome, and require that this is not the signed-out wall.
    await expect(tablet.getByRole("heading", { name: "My Conservatory" })).toBeVisible();
    await expect(tablet.getByText("RESTRICTED · CONTINUUM MEMBERS")).toHaveCount(0);
    const measurement = await tablet.evaluate(() => {
      const doc = document.documentElement;
      const widest: string[] = [];
      if (doc.scrollWidth > doc.clientWidth + 1) {
        for (const element of document.querySelectorAll("body *")) {
          const style = getComputedStyle(element);
          if (style.position === "fixed" || style.pointerEvents === "none") continue;
          const box = element.getBoundingClientRect();
          if (box.width > 0 && box.right > doc.clientWidth + 1) {
            widest.push(String(element.className || element.tagName).slice(0, 70));
          }
        }
      }
      return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, widest: widest.slice(0, 3) };
    });
    if (measurement.scrollWidth > measurement.clientWidth + 1) {
      offenders.push(
        `${route}: scrollWidth ${measurement.scrollWidth} > ${measurement.clientWidth} — ${measurement.widest.join(" | ")}`,
      );
    }
  }

  await context.close();
  expect(offenders, offenders.join("\n")).toEqual([]);
});

/* ---------------------------------------------------------------- 14 ----- */

test("14. a plant can be taken to Calyx for a cultivation evaluation", async () => {
  // The capability this journey exists to prove next: a grower asking whether
  // where they are keeping a plant suits it. The neighbouring "Ask Calyx"
  // deliberately sends nothing private and so cannot answer that; this action
  // sends the readings on purpose, and has to say so before it is clicked.
  await visit(plantUrl);

  const action = page.getByTestId("cultivation-calyx-action");
  await expect(action).toBeVisible();

  // The disclosure is part of the capability, not decoration. A grower must be
  // able to read what travels before choosing to send it.
  const disclosure = page.getByTestId("cultivation-calyx-disclosure");
  await expect(disclosure).toContainText(PLANT.taxon);
  await expect(disclosure).toContainText(/do not travel/i);
  await expect(disclosure).toContainText(/not.*scientific evidence|cultivation observations/i);

  await page.getByTestId("cultivation-calyx-submit").click();

  await expect(page).toHaveURL(/\/calyx\?/);
  const arrived = new URL(page.url());

  // Nothing private in the address: it is written to history and leaks through
  // Referer. Only the public taxon, the markers, and an opaque token.
  expect([...arrived.searchParams.keys()].sort()).toEqual([
    "context_is_evidence", "cultivation", "genus", "origin", "taxon",
  ]);
  expect(arrived.searchParams.get("context_is_evidence")).toBe("false");
  expect(arrived.searchParams.get("origin")).toBe("conservatory-cultivation");
  expect(arrived.search).not.toMatch(/temperature|humidity|OC-\d|ocq_/i);

  // The distinction has to be on screen, not only in the payload.
  const banner = page.getByTestId("cultivation-handoff-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(PLANT.taxon);
  await expect(banner).toContainText(/greenhouse bench/i);
  await expect(banner).toContainText(/temperature c 21°C \(measured/i);
  await expect(banner).toContainText(/not scientific evidence and not occurrence records/i);
  await expect(banner).toContainText(/notes, photographs .* did not travel/i);

  // Reloading must not resurrect the observations: the handoff is single-use,
  // and a reloaded page is a pasted link as far as this boundary is concerned.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("cultivation-handoff-banner")).toHaveCount(0);
});
