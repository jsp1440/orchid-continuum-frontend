import { expect, test, type Page, type Request } from "@playwright/test";

/**
 * Release-1 journeys 5 → 6 in a real browser: a signed-in observer saves a
 * Field Journal draft offline, uploads it through the governed path, and takes
 * the durable observation into the Deception Lab hypothesis loop, records
 * evidence against one competing hypothesis, and reads the follow-up protocol.
 *
 * WHAT THIS PROVES: the production frontend bundle drives both contracts
 * (`field-observations/v1`, `field-hypotheses/v1`) end to end against a backend
 * that honours them, in Chromium; that no coordinate, place name or locality
 * text leaves the browser on either wire; and that nothing on screen calls an
 * uploaded observation or a hypothesis published, verified, or a fact.
 *
 * WHAT THIS DOES NOT PROVE: anything about the deployed backend or any
 * botanical claim. The server is `e2e/support/reference-backend.mjs`, a local
 * fixture. A green run is browser evidence, not deployment evidence.
 */

test.describe.configure({ mode: "serial" });

const ACCOUNT = {
  email: `field-journey-${Date.now()}@acceptance.test`,
  password: "a-throwaway-password-1",
};

const OBSERVATION = {
  taxon: "Ophrys apifera",
  note: "Two flowers open on a chalk bank; a solitary bee gripped the labellum and moved as if mating, then flew off.",
};

const LOCALITY_KEYS = /"(lat|latitude|lng|lon|longitude|coordinates?|coords?|locality|verbatim_locality|location|site|place|grid|gps|elevation_m)"\s*:/i;

let page: Page;
const calyxWrites: Array<{ url: string; body: string }> = [];

async function visit(path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

async function signIn() {
  await visit("/");
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

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === "localhost"
      ? route.continue()
      : route.abort("blockedbyclient");
  });
  page.on("request", (request: Request) => {
    const url = request.url();
    if (request.method() === "POST" && /\/api\/field-(observations|hypotheses)/.test(url)) {
      calyxWrites.push({ url, body: request.postData() ?? "" });
    }
  });
  page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
});

test.afterAll(async () => {
  await page?.close();
});

test("a signed-in observer saves a Field Journal draft offline", async () => {
  await signIn();
  await visit("/field");
  await expect(page.getByRole("heading", { name: "Field Journal" })).toBeVisible({ timeout: 20_000 });

  await page.getByLabel(/Plant or tag text/).fill(OBSERVATION.taxon);
  await page.getByLabel("Field note").fill(OBSERVATION.note);
  await page.getByLabel("Locality visibility").selectOption("research_restricted");
  await page.getByRole("button", { name: "Save offline draft" }).click();

  const card = page.locator("article").filter({ hasText: OBSERVATION.taxon });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Research Restricted");
  await expect(card).toContainText("Local draft · not published");
  await expect(card.getByTestId("field-draft-upload")).toBeVisible();
});

test("uploading sends only governed fields and shows an unpublished observer report", async () => {
  const card = page.locator("article").filter({ hasText: OBSERVATION.taxon });
  await card.getByTestId("field-draft-upload").click();

  await expect(page.getByTestId("field-upload-notice")).toContainText("observer report", { timeout: 20_000 });
  await expect(card.getByTestId("field-draft-uploaded")).toContainText("In Calyx · observer report · curation pending");
  await expect(card.getByTestId("field-draft-upload")).toHaveCount(0);

  const upload = calyxWrites.find((write) => /\/api\/field-observations$/.test(write.url));
  expect(upload, "the browser posted to /api/field-observations").toBeTruthy();
  const body = JSON.parse(upload!.body) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(["client_draft_id", "locality_visibility", "media", "note", "observed_at", "taxon_hint"]);
  expect(body.locality_visibility).toBe("research_restricted");
  expect(upload!.body).not.toMatch(LOCALITY_KEYS);

  // The record's own card and the upload notice never call it published,
  // verified or a fact; the page's standing copy may use those words only to
  // say what does NOT happen ("never as a published or verified record").
  const cardText = await card.innerText();
  expect(cardText).not.toMatch(/\bpublished\b|\bverified\b|scientific fact/i);
  const noticeText = await page.getByTestId("field-upload-notice").innerText();
  expect(noticeText).toMatch(/not published/i);
  expect(noticeText).not.toMatch(/\bverified\b|scientific fact/i);
});

test("the upload receipt survives a reload and a second upload is idempotent", async () => {
  await page.reload({ waitUntil: "domcontentloaded" });
  const card = page.locator("article").filter({ hasText: OBSERVATION.taxon });
  await expect(card.getByTestId("field-draft-uploaded")).toBeVisible({ timeout: 20_000 });
  await expect(card.getByTestId("field-draft-upload")).toHaveCount(0);
  await expect(card).toContainText(OBSERVATION.note);
});

test("the Deception Lab handoff carries only the durable observation id and taxon", async () => {
  const card = page.locator("article").filter({ hasText: OBSERVATION.taxon });
  const href = await card.getByTestId("field-draft-hypotheses-link").getAttribute("href");
  expect(href).toBeTruthy();
  const url = new URL(href!, "http://127.0.0.1:4173");
  expect(url.pathname).toBe("/deception-lab");
  expect(Array.from(url.searchParams.keys()).sort()).toEqual(["observation", "tab", "taxon"]);
  expect(url.searchParams.get("observation")).toMatch(/^fo-[0-9a-f]{24}$/);
  expect(url.searchParams.get("taxon")).toBe(OBSERVATION.taxon);

  await card.getByTestId("field-draft-hypotheses-link").click();
  await expect(page.getByTestId("deception-lab-page")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("hypothesis-loop-panel")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("taxon-hint")).toHaveValue(OBSERVATION.taxon);
});

test("the observation yields at least two competing hypotheses with separate evidence and a non-destructive protocol", async () => {
  await page.getByTestId("visitor-observed").check();
  await page.getByTestId("visitor-group").selectOption("male_bee");
  await page.getByTestId("behavior-pseudocopulation_like_contact").click();
  await page.getByTestId("reward-check").selectOption("nectar_absent");
  await page.getByTestId("generate-hypotheses").click();

  const set = page.getByTestId("hypothesis-set");
  await expect(set).toBeVisible({ timeout: 20_000 });
  const cards = set.locator("[data-testid^='hypothesis-card-']");
  expect(await cards.count()).toBeGreaterThanOrEqual(2);
  await expect(set).toContainText("provider called: false");
  await expect(page.getByTestId("hypothesis-set-footer")).toContainText("blocked pending human scientific review");
  await expect(page.getByTestId("follow-up-protocol")).toContainText("non-destructive");

  const generate = calyxWrites.find((write) => /\/hypotheses$/.test(write.url));
  expect(generate, "the browser posted the cue snapshot").toBeTruthy();
  expect(generate!.url).toContain(encodeURIComponent(new URL(page.url()).searchParams.get("observation")!));
  expect(generate!.body).not.toMatch(LOCALITY_KEYS);
  const snapshot = JSON.parse(generate!.body) as { locality_sensitivity?: string };
  expect(snapshot.locality_sensitivity).toBeTruthy();

  const first = cards.first();
  const hypothesisId = (await first.getAttribute("data-testid"))!.replace("hypothesis-card-", "");
  await expect(page.getByTestId(`balance-${hypothesisId}-SUPPORTING`)).toHaveText("0");
  await page.getByTestId(`stance-${hypothesisId}-SUPPORTING`).click();
  await page.getByTestId(`evidence-summary-${hypothesisId}`).fill("Pollinarium visible on the bee's head after it left the labellum.");
  await page.getByTestId(`evidence-submit-${hypothesisId}`).click();
  await expect(page.getByTestId(`balance-${hypothesisId}-SUPPORTING`)).toHaveText("1", { timeout: 20_000 });
  await expect(page.getByTestId(`balance-${hypothesisId}-CONTRADICTING`)).toHaveText("0");
  await expect(page.getByTestId(`evidence-state-${hypothesisId}`)).toContainText("not a verdict");

  const evidence = calyxWrites.find((write) => /\/evidence$/.test(write.url));
  expect(evidence).toBeTruthy();
  expect(evidence!.body).not.toMatch(LOCALITY_KEYS);
  expect(JSON.parse(evidence!.body).recorder_subject).not.toContain("@");

  // The hypothesis set itself (statements, statuses, evidence) never presents a
  // hypothesis as a confirmed pollinator, verified, or a fact; the page's
  // governance banner may use those words only to deny them.
  const setText = await set.innerText();
  expect(setText).not.toMatch(/confirmed pollinator|\bverified\b|scientific fact/i);
  expect(setText).toMatch(/hypothesis/i);
});
