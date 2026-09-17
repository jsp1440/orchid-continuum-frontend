import { expect, test, type Page, type Request } from "@playwright/test";

/**
 * Release-1 public intake surfaces in a real browser, without an account:
 * journey 12 (newsletter subscribe / preferences / unsubscribe), journey 13
 * (contact intake) and journey 10 (community observation submit / browse).
 *
 * WHAT THIS PROVES: the production frontend bundle drives the
 * `/api/constituent/*` and `/api/community/*` contracts end to end against a
 * backend that honours them, in Chromium; that the public pages send only the
 * structured fields their contracts declare; that an anonymous browse never
 * receives verbatim locality or submitter identity; that the preference centre
 * refuses email-only access and the page says so honestly; and that no success
 * copy overstates what happened (a held welcome email, moderation before any
 * feed appearance, human review of contact messages).
 *
 * WHAT THIS DOES NOT PROVE: anything about the deployed backend. The server is
 * `e2e/support/reference-backend.mjs`, a local fixture. A green run is browser
 * evidence, not deployment evidence.
 */

test.describe.configure({ mode: "serial" });

const STAMP = Date.now();
const READER = `reader-${STAMP}@acceptance.test`;
const LOCALITY_KEYS = /"(lat|latitude|lng|lon|longitude|coordinates?|coords?|locality|verbatim_locality|location|site|place|grid|gps|elevation_m)"\s*:/i;

let page: Page;
const writes: Array<{ url: string; body: string }> = [];
const reads: Array<{ url: string; body: string }> = [];

async function visit(path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === "localhost" ? route.continue() : route.abort("blockedbyclient");
  });
  page.on("request", (request: Request) => {
    if (request.method() === "POST" && /\/api\/(constituent|community)\//.test(request.url())) {
      writes.push({ url: request.url(), body: request.postData() ?? "" });
    }
  });
  page.on("response", async (response) => {
    if (response.request().method() === "GET" && /\/api\/community\/observations/.test(response.url())) {
      reads.push({ url: response.url(), body: await response.text().catch(() => "") });
    }
  });
  page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
});

test.afterAll(async () => {
  await page?.close();
});

test("newsletter subscribe sends only structured fields and reports a held welcome email", async () => {
  await visit("/newsletter");
  await expect(page.getByTestId("subscribe-form")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel(/Email/i).first().fill(READER);
  await page.getByRole("button", { name: "Field research" }).click();
  await page.getByRole("button", { name: "Conservation science" }).click();
  await page.locator("#subscribe-frequency").selectOption("quarterly");
  await page.getByTestId("subscribe-submit").click();

  await expect(page.getByTestId("subscribe-success")).toBeVisible({ timeout: 20_000 });
  const subscribe = writes.find((write) => write.url.endsWith("/api/constituent/subscribe"));
  expect(subscribe).toBeTruthy();
  const body = JSON.parse(subscribe!.body) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(["email", "format", "frequency", "topics"]);
  expect(body.email).toBe(READER);
  expect(body.frequency).toBe("quarterly");
  expect(body.topics).toEqual(expect.arrayContaining(["field_research", "conservation"]));
  const successText = await page.getByTestId("subscribe-success").innerText();
  expect(successText).not.toMatch(/welcome email (has been|was) sent|check your inbox/i);
});

test("the preference centre opens with the token this browser received at subscription, and saves", async () => {
  await expect(page.getByTestId("subscribe-manageable")).toBeVisible();
  await page.getByRole("tab", { name: "Preferences" }).click();
  await expect(page.getByTestId("preferences-lookup-form")).toBeVisible();
  await page.locator("#prefs-email").fill(READER);
  const load = page.waitForResponse((response) => /\/api\/constituent\/preferences\?/.test(response.url()) && response.request().method() === "GET");
  await page.getByTestId("preferences-lookup-form").getByRole("button").last().click();
  const loadResponse = await load;
  expect(loadResponse.status()).toBe(200);
  expect(new URL(loadResponse.url()).searchParams.get("token")).toBeTruthy();
  await expect(page.getByTestId("preferences-edit-form")).toBeVisible({ timeout: 20_000 });
  await page.locator("#prefs-frequency").selectOption("monthly");
  await page.getByTestId("preferences-edit-form").getByRole("button", { name: /save preferences/i }).click();
  await expect(page.getByTestId("preferences-success")).toBeVisible({ timeout: 20_000 });
});

test("a browser without the token cannot open the preference centre on an email alone, and the page says so honestly", async ({ browser }) => {
  const context = await browser.newContext();
  const fresh = await context.newPage();
  await fresh.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === "localhost" ? route.continue() : route.abort("blockedbyclient");
  });
  await fresh.goto("/newsletter", { waitUntil: "domcontentloaded" });
  await fresh.getByRole("tab", { name: "Preferences" }).click();
  await fresh.locator("#prefs-email").fill(READER);
  const load = fresh.waitForResponse((response) => /\/api\/constituent\/preferences\?/.test(response.url()));
  await fresh.getByTestId("preferences-lookup-form").getByRole("button").last().click();
  expect((await load).status()).toBe(401);
  await expect(fresh.getByTestId("preferences-needs-token")).toBeVisible({ timeout: 20_000 });
  await expect(fresh.getByTestId("preferences-needs-token")).toContainText(/never open on an email address alone/i);
  await expect(fresh.getByTestId("preferences-edit-form")).toHaveCount(0);
  await expect(fresh.getByTestId("preferences-unavailable")).toHaveCount(0);
  await context.close();
});

test("unsubscribe succeeds for the reader and would answer the same for an unknown address", async () => {
  await page.getByRole("tab", { name: "Unsubscribe" }).click();
  await expect(page.getByTestId("unsubscribe-form")).toBeVisible();
  await page.locator("#unsub-email").fill(READER);
  await page.getByTestId("unsubscribe-submit").click();
  await expect(page.getByTestId("unsubscribe-success")).toBeVisible({ timeout: 20_000 });

  const known = await page.request.post("http://127.0.0.1:8791/api/constituent/unsubscribe", { data: { email: READER } });
  const unknown = await page.request.post("http://127.0.0.1:8791/api/constituent/unsubscribe", { data: { email: `nobody-${STAMP}@acceptance.test` } });
  expect(known.status()).toBe(200);
  expect(unknown.status()).toBe(200);
  const strip = (payload: Record<string, unknown>) => ({ ...payload, normalized_email: undefined });
  expect(strip(await known.json())).toEqual(strip(await unknown.json()));
});

test("contact intake is received for human review and never presented as delivered to an agent", async () => {
  await visit("/contact");
  await expect(page.getByTestId("contact-form")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("category-bug").click();
  await page.locator("#contact-name").fill("A. Grower");
  await page.locator("#contact-email").fill(READER);
  await page.locator("#contact-subject").fill("Atlas map does not load on iPad");
  await page.locator("#contact-body").fill("Opening the Atlas on an iPad shows a blank panel where the map should be. Safari 19.");
  await page.getByTestId("contact-submit").click();

  await expect(page.getByTestId("contact-success")).toBeVisible({ timeout: 20_000 });
  const contact = writes.find((write) => write.url.endsWith("/api/constituent/contact"));
  expect(contact).toBeTruthy();
  const body = JSON.parse(contact!.body) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(["body", "category", "email", "name", "source", "subject"]);
  expect(body.category).toBe("bug");
  expect(String(body.body).length).toBeLessThanOrEqual(4000);
  const successText = await page.getByTestId("contact-success").innerText();
  expect(successText).not.toMatch(/agent|automatically resolved|Calyx will reply/i);
});

test("a community observation is accepted into moderation and an anonymous browse never sees locality or identity", async () => {
  await visit("/community");
  await expect(page.getByTestId("community-submit-form")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("community-submit-species").fill(`Fixture species ${STAMP}`);
  await page.getByTestId("community-submit-notes").fill("Two plants in flower on a roadside bank; one visited by a small fly.");
  await page.getByTestId("community-submit-date").fill("2026-06-15");
  await page.getByTestId("community-submit-location").fill("Ecuador, Napo Province");
  await page.getByTestId("community-submit-button").click();

  await expect(page.getByTestId("community-submit-success")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("community-submit-success")).toContainText(/reviewed by a moderator/i);
  const submit = writes.find((write) => write.url.endsWith("/api/community/observations"));
  expect(submit).toBeTruthy();
  const body = JSON.parse(submit!.body) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(["epistemic_label", "evidence_media_ids", "location_verbatim", "notes", "observation_date", "taxon_name_verbatim"]);
  expect(submit!.body).not.toMatch(/"(lat|latitude|lng|longitude|coordinates)"/);

  await page.getByTestId("tab-browse").click();
  await expect(page.getByTestId("community-browse-list")).toBeVisible({ timeout: 20_000 });
  const items = page.getByTestId("community-observation-item");
  expect(await items.count()).toBeGreaterThanOrEqual(1);
  const listText = await page.getByTestId("community-browse-list").innerText();
  expect(listText).not.toContain(`Fixture species ${STAMP}`); // unmoderated submission is not in the feed
  expect(listText).not.toContain("Napo");
  expect(listText).not.toContain("FIXTURE-LOCALITY-MUST-NOT-LEAK");

  const listing = reads.find((read) => /moderation_state=APPROVED/.test(read.url));
  expect(listing).toBeTruthy();
  const payload = JSON.parse(listing!.body) as { items: Array<Record<string, unknown>> };
  expect(payload.items.length).toBeGreaterThanOrEqual(1);
  for (const item of payload.items) expect(Object.keys(item).sort()).toEqual(["created_at", "id", "moderation_state"]);
  expect(listing!.body).not.toMatch(LOCALITY_KEYS);
  expect(listing!.body).not.toContain("submitter_auth_subject");

  // The full record (with verbatim locality) is a moderation view: anonymous read is refused.
  const newId = (JSON.parse(await (await page.request.get(`http://127.0.0.1:8791/api/community/observations?limit=1`)).text()) as { items: Array<{ id: string }> }).items[0]?.id;
  expect(newId).toBeTruthy();
  const detail = await page.request.get(`http://127.0.0.1:8791/api/community/observations/${newId}`);
  expect(detail.status()).toBe(401);
});
