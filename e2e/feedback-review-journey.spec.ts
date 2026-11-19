import { expect, test, type Page } from "@playwright/test";

/**
 * Release 1 journey 12, owner side, in a real browser: the owner reviews
 * submitted feedback in Mission Control -- queue with filters and cursor
 * paging, the full case with the exact record version the submitter saw,
 * then decisions: reject (reason required), route to governed review (note
 * required) and accept a trivial correction (validated JSON), each confirmed.
 *
 * WHAT THIS DOES NOT PROVE: anything about the deployed backend. The server is
 * `e2e/support/reference-backend.mjs`, replaying REAL responses captured from
 * orchid-calyx-backend PR #1663 running locally (see the fixture's `_meta` and
 * the BEGIN/END block in the reference backend). The owner login there is a
 * SYNTHETIC stand-in; every case in the capture has SYNTHETIC inputs.
 * Browser evidence against a fixture, not deployment evidence.
 */

test.describe.configure({ mode: "serial" });

const REFERENCE_BACKEND = process.env.REFERENCE_BACKEND_URL || "http://127.0.0.1:8791";
// SYNTHETIC: the reference backend's local owner stand-in code (not a credential).
const OWNER_CODE = "reference-owner-code-SYNTHETIC";
const STAMP = Date.now();
const ACCOUNT = { email: `feedback-owner-${STAMP}@acceptance.test`, password: "a-throwaway-password-1" };
const SHOTS = process.env.E2E_SHOT_DIR;

// Captured ids/inputs (src/lib/__fixtures__/evidenceFeedbackReview.realBackend.json _meta).
const CASE_A = "efc-f76c0fd03c7406bfd1a9c12a";
const CASE_B = "efc-253506b8e57ae23dcc2f46cf";
const CASE_C = "efc-94af914650613148459a7e65";
const REJECT_REASON = "SYNTHETIC review: the twist is already covered in the expanded definition.";
const GOVERNED_NOTE = "SYNTHETIC review: rank question needs taxonomic review before anything changes.";

let page: Page;
const reviewRequests: Array<{ method: string; path: string; authorization: string }> = [];
const dialogs: string[] = [];

async function shot(name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/feedback-review-${name}.png`, fullPage: true });
}

async function openReview() {
  await page.goto("/mission-control/feedback-review", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("feedback-review-page")).toBeVisible({ timeout: 20_000 });
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === "localhost" ? route.continue() : route.abort("blockedbyclient");
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() !== "OPTIONS" && url.pathname.startsWith("/api/evidence-feedback/review/")) {
      reviewRequests.push({ method: request.method(), path: url.pathname, authorization: request.headers().authorization || "" });
    }
  });
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
  const reset = await page.request.post(`${REFERENCE_BACKEND}/__reference/evidence-feedback-review/reset`);
  expect(reset.status()).toBe(200);
});

test.afterAll(async () => {
  await page?.close();
});

test("an anonymous visitor meets the sign-in gate before the page mounts", async () => {
  await page.goto("/mission-control/feedback-review", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Feedback review · owner")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("feedback-review-page")).toHaveCount(0);
  expect(reviewRequests).toEqual([]);
});

test("a signed-in member without the owner session is told to sign in at Mission Control, and sends no member token", async () => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "Create an account", exact: true }).click();
  await modal.getByPlaceholder("you@orchidcontinuum.org").fill(ACCOUNT.email);
  await modal.getByPlaceholder("••••••••").fill(ACCOUNT.password);
  await modal.getByRole("button", { name: /^create account$/i }).last().click();
  await expect(modal).toBeHidden({ timeout: 20_000 });

  await openReview();
  const gate = page.getByTestId("feedback-review-access-sign_in_required");
  await expect(gate).toBeVisible({ timeout: 20_000 });
  await expect(gate).toContainText("Owner session required");
  await expect(page.getByTestId("feedback-review-sign-in")).toHaveAttribute("href", "/mission-control");
  await expect(page.getByTestId("feedback-review-queue")).toHaveCount(0);
  await shot("member-no-owner-session");
  expect(reviewRequests.length).toBeGreaterThan(0);
  for (const request of reviewRequests) expect(request.authorization, request.path).toBe("");
});

test("the owner reads the queue, filters it and pages it with the backend cursor", async () => {
  const status = await page.evaluate(async ({ backend, code }) => {
    // Through the app's own owner transport (backendConfig), which keeps the bearer for this tab.
    const response = await fetch(`${backend}/api/mission-control/owner/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_code: code }),
    });
    return response.status;
  }, { backend: REFERENCE_BACKEND, code: OWNER_CODE });
  expect(status).toBe(200);
  reviewRequests.length = 0;

  await openReview();
  await expect(page.getByTestId("feedback-review-boundary-notice")).toContainText("never publish to the knowledge graph");
  const rows = page.locator("[data-testid^='feedback-review-item-']");
  await expect(rows).toHaveCount(20, { timeout: 20_000 });
  await expect(page.getByTestId(`feedback-review-item-${CASE_A}`)).toContainText("1 duplicate");
  await expect(page.getByTestId("feedback-review-queue")).not.toContainText("@");
  await shot("queue");

  await page.getByTestId("feedback-review-load-more").click();
  await expect(rows).toHaveCount(23);
  await expect(page.getByTestId("feedback-review-load-more")).toHaveCount(0);

  await page.getByTestId("feedback-review-filter-object-type").selectOption("taxonomy");
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId(`feedback-review-item-${CASE_C}`)).toBeVisible();
  await page.getByTestId("feedback-review-filter-object-type").selectOption("");
  await expect(rows).toHaveCount(20);

  expect(reviewRequests.every((request) => request.authorization.startsWith("Bearer reference-owner."))).toBe(true);
});

test("the owner reads a case in full and rejects it with a confirmed reason", async () => {
  await page.getByTestId(`feedback-review-item-${CASE_A}`).click();
  const detail = page.getByTestId("feedback-review-detail");
  await expect(detail).toBeVisible();
  await expect(page.getByTestId("feedback-review-statement")).toContainText("<script>alert('x')</script>");
  await expect(page.getByTestId("feedback-review-object-version")).toContainText('"preferred_term": "Resupination (SYNTHETIC)"');
  await expect(page.getByTestId("feedback-review-events")).toContainText("duplicate submission suppressed");
  await expect(detail).toContainText("Duplicate submissions1");
  await expect(page.getByTestId("feedback-review-publication-boundary")).toContainText("never publish to the knowledge graph");
  await expect(page.getByTestId("feedback-decision-accept_trivial")).toHaveCount(0);
  await shot("case-detail");

  await page.getByTestId("feedback-decision-reject").click();
  await expect(page.getByTestId("feedback-decision-review")).toBeDisabled();
  await page.getByTestId("feedback-decision-input").fill(REJECT_REASON);
  await page.getByTestId("feedback-decision-review").click();
  await expect(page.getByTestId("feedback-decision-confirm")).toContainText("never publish to the knowledge graph");
  await shot("reject-confirm");
  await page.getByTestId("feedback-decision-confirm-button").click();
  await expect(page.getByTestId("feedback-review-decision-result")).toHaveText(
    "Decision recorded: reject. The case is now resolved. Nothing was published.",
  );
  await expect(page.getByTestId("feedback-review-events")).toContainText("owner decision rejected");
  await expect(page.getByTestId("feedback-review-no-decisions")).toBeVisible();
  await expect(page.getByTestId(`feedback-review-item-${CASE_A}`)).toContainText("Resolved");
  await shot("rejected");
  expect(dialogs).toEqual([]);
});

test("the owner routes another case to governed review with a confirmed note", async () => {
  await page.getByTestId(`feedback-review-item-${CASE_C}`).click();
  await expect(page.getByTestId("feedback-review-detail")).toContainText(CASE_C);
  await page.getByTestId("feedback-decision-needs_governed_review").click();
  await expect(page.getByTestId("feedback-decision-review")).toBeDisabled();
  await page.getByTestId("feedback-decision-input").fill(GOVERNED_NOTE);
  await page.getByTestId("feedback-decision-review").click();
  await page.getByTestId("feedback-decision-confirm-button").click();
  await expect(page.getByTestId("feedback-review-decision-result")).toContainText("The case is now governed review required");
  await expect(page.getByTestId(`feedback-review-item-${CASE_C}`)).toContainText("Governed review required");
  await expect(page.getByTestId("feedback-decision-needs_governed_review")).toHaveCount(0);
  await shot("governed");
});

test("the owner accepts a trivial lexicon correction only from valid JSON", async () => {
  await page.getByTestId(`feedback-review-item-${CASE_B}`).click();
  await expect(page.getByTestId("feedback-review-detail")).toContainText(CASE_B);
  await page.getByTestId("feedback-decision-accept_trivial").click();
  const editor = page.getByTestId("feedback-decision-input");
  await expect(page.getByTestId("feedback-decision-payload-error")).toContainText("identical");
  await editor.fill("{ not json");
  await expect(page.getByTestId("feedback-decision-payload-error")).toHaveText("The corrected payload is not valid JSON.");
  await expect(page.getByTestId("feedback-decision-review")).toBeDisabled();
  const original = JSON.parse(await page.getByTestId("feedback-review-object-version").innerText()) as Record<string, unknown>;
  await editor.fill(JSON.stringify({ ...original, quick_definition: "SYNTHETIC: the modified median petal of an orchid flower." }, null, 2));
  await expect(page.getByTestId("feedback-decision-payload-error")).toHaveCount(0);
  await page.getByTestId("feedback-decision-review").click();
  await page.getByTestId("feedback-decision-confirm-button").click();
  await expect(page.getByTestId("feedback-review-decision-result")).toContainText("The case is now resolved");
  await expect(page.getByTestId("feedback-review-resulting-version")).toContainText("modified median petal");
  await shot("accepted-trivial");
});

test("the page fits a phone width without horizontal scrolling", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId(`feedback-review-item-${CASE_A}`).click();
  await expect(page.getByTestId("feedback-review-detail")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await shot("phone");
  // Every review call in this session carried the owner bearer or nothing -- never a member token.
  for (const request of reviewRequests) expect(request.authorization.startsWith("Bearer at_"), request.path).toBe(false);
});
