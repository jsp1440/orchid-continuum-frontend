import { expect, test, type Page } from "@playwright/test";

/**
 * Release-1 journey 10, end to end in a real browser: an anonymous visitor
 * submits a community observation; it does not appear in the public feed;
 * a signed-in moderator opens Intake Review inside Mission Control, sees the
 * full report (the only place its verbatim locality is shown), records a
 * reason and approves it; the public feed then lists it as an observer report
 * with nothing but id, state and timestamp on the wire.
 *
 * WHAT THIS DOES NOT PROVE: anything about the deployed backend. The server
 * is `e2e/support/reference-backend.mjs`; any signed-in fixture account
 * counts as the owner boundary there. Browser evidence, not deployment
 * evidence.
 */

test.describe.configure({ mode: "serial" });

const REFERENCE_BACKEND = process.env.REFERENCE_BACKEND_URL || "http://127.0.0.1:8791";
const STAMP = Date.now();
const SPECIES = `Fixture species ${STAMP}`;
const LOCALITY = `Napo Province test locality ${STAMP}`;
const ACCOUNT = { email: `moderator-${STAMP}@acceptance.test`, password: "a-throwaway-password-1" };
const LOCALITY_KEYS = /"(lat|latitude|lng|lon|longitude|coordinates?|coords?|locality|verbatim_locality|location|site|place|grid|gps|elevation_m)"\s*:/i;

let page: Page;
let observationId = "";
const listBodies: string[] = [];

async function visit(path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === "localhost" ? route.continue() : route.abort("blockedbyclient");
  });
  page.on("response", async (response) => {
    if (response.request().method() === "GET" && /\/api\/community\/observations\?moderation_state=APPROVED/.test(response.url())) {
      listBodies.push(await response.text().catch(() => ""));
    }
  });
  page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
});

test.afterAll(async () => {
  await page?.close();
});

test("an anonymous submission enters moderation and stays out of the public feed", async () => {
  await visit("/community");
  await expect(page.getByTestId("community-submit-form")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("community-submit-species").fill(SPECIES);
  await page.getByTestId("community-submit-notes").fill("One plant in flower beside the trail; no visitor seen.");
  await page.getByTestId("community-submit-date").fill("2026-06-15");
  await page.getByTestId("community-submit-location").fill(LOCALITY);
  const submitted = page.waitForResponse((response) => response.url().endsWith("/api/community/observations") && response.request().method() === "POST");
  await page.getByTestId("community-submit-button").click();
  const body = (await (await submitted).json()) as { id: string; moderation_state: string };
  observationId = body.id;
  expect(body.moderation_state).toBe("SUBMITTED");
  await expect(page.getByTestId("community-submit-success")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("tab-browse").click();
  await expect(page.getByTestId("community-browse-list")).toBeVisible({ timeout: 20_000 });
  const feed = await page.getByTestId("community-browse-list").innerText();
  expect(feed).not.toContain(SPECIES);
  expect(feed).not.toContain(LOCALITY);
  const listed = (JSON.parse(listBodies.at(-1)!) as { items: Array<{ id: string }> }).items.map((item) => item.id);
  expect(listed).not.toContain(observationId);
});

test("the moderation view is refused anonymously", async () => {
  const detail = await page.request.get(`${REFERENCE_BACKEND}/api/community/observations/${observationId}`);
  expect(detail.status()).toBe(401);
  const moderate = await page.request.patch(`${REFERENCE_BACKEND}/api/community/observations/${observationId}/moderate`, { data: { new_state: "APPROVED" } });
  expect(moderate.status()).toBe(401);
});

test("a signed-in moderator reads the full report in Intake Review and approves it with a reason", async () => {
  await visit("/");
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "Create an account", exact: true }).click();
  await modal.getByPlaceholder("you@orchidcontinuum.org").fill(ACCOUNT.email);
  await modal.getByPlaceholder("••••••••").fill(ACCOUNT.password);
  await modal.getByRole("button", { name: /^create account$/i }).last().click();
  await expect(modal).toBeHidden({ timeout: 20_000 });

  await visit("/mission-control?view=intake-review");
  await expect(page.getByTestId("intake-review-page")).toBeVisible({ timeout: 20_000 });
  const item = page.getByTestId(`intake-pending-item-${observationId}`);
  await expect(item).toBeVisible({ timeout: 20_000 });
  await expect(item).toContainText(SPECIES);
  await expect(item).toContainText("self-assessed");
  await expect(page.getByTestId(`intake-pending-locality-${observationId}`)).toContainText("protected · moderation view only");
  await expect(page.getByTestId(`intake-pending-locality-${observationId}`)).toContainText(LOCALITY);
  await expect(page.getByTestId("intake-review-epistemic-notice")).toContainText("does not make it a scientific fact");

  await page.getByTestId(`moderate-reason-${observationId}`).fill("Plausible range and a clear description; releasing as a community report.");
  await page.getByTestId(`moderate-${observationId}-APPROVED`).click();
  await expect(page.getByTestId("intake-review-decision")).toContainText("observer report", { timeout: 20_000 });
  await expect(page.getByTestId("intake-review-decision")).toContainText("not as a scientific finding");
  await expect(page.getByTestId(`intake-pending-item-${observationId}`)).toHaveCount(0);
});

test("the approved record reaches the public feed with only id, state and timestamp on the wire", async () => {
  await visit("/community");
  await page.getByTestId("tab-browse").click();
  await expect(page.getByTestId("community-browse-list")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => listBodies.length).toBeGreaterThan(1);
  const latest = JSON.parse(listBodies.at(-1)!) as { items: Array<Record<string, unknown>> };
  const ids = latest.items.map((item) => item.id);
  expect(ids).toContain(observationId);
  for (const item of latest.items) expect(Object.keys(item).sort()).toEqual(["created_at", "id", "moderation_state"]);
  expect(listBodies.at(-1)!).not.toMatch(LOCALITY_KEYS);
  expect(listBodies.at(-1)!).not.toContain(LOCALITY);
  const feed = await page.getByTestId("community-browse-list").innerText();
  expect(feed).not.toContain(LOCALITY);
  expect(feed).toMatch(/Community report/);
});
