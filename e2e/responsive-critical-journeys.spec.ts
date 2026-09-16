import { expect, test, type Page } from "@playwright/test";

/**
 * Release-1 journey 17: the critical journeys, driven (not just rendered) at a
 * phone width and an iPad portrait width in a real browser.
 *
 * `mounted-layout.spec.ts` already proves that public routes do not scroll
 * sideways. This goes further on the journeys that matter for Release 1: a
 * visitor signs in through the mobile navigation, saves and uploads a Field
 * Journal draft (journey 5), takes it into the Deception Lab hypothesis loop
 * (journey 6), subscribes to the newsletter (journey 12), sends a contact
 * message (journey 13) and submits a community observation (journey 10), and
 * at every step the page still fits its viewport and the control it needed
 * was reachable.
 *
 * WHAT THIS DOES NOT PROVE: anything about the deployed backend; the server is
 * `e2e/support/reference-backend.mjs`. A green run is browser evidence at these
 * widths, not deployment evidence and not a visual-design review.
 */

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "iPad portrait", width: 834, height: 1112 },
];

async function measureOverflow(page: Page): Promise<{ scrollWidth: number; clientWidth: number; widest: string[] }> {
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const doc = document.documentElement;
    const widest: string[] = [];
    if (doc.scrollWidth > doc.clientWidth + 1) {
      for (const element of document.querySelectorAll("body *")) {
        const style = getComputedStyle(element);
        if (style.position === "fixed" || style.pointerEvents === "none") continue;
        const box = element.getBoundingClientRect();
        if (box.width > 0 && box.right > doc.clientWidth + 1) widest.push(String(element.className || element.tagName).slice(0, 70));
      }
    }
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, widest: widest.slice(0, 3) };
  });
}

for (const viewport of VIEWPORTS) {
  test(`the critical journeys are usable and fit the viewport at ${viewport.name} (${viewport.width}px)`, async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    await page.route("**/*", (route) => {
      const host = new URL(route.request().url()).hostname;
      return host === "127.0.0.1" || host === "localhost" ? route.continue() : route.abort("blockedbyclient");
    });
    page.on("pageerror", (error) => console.error(`[pageerror ${viewport.name}] ${error.message}`));

    const offenders: string[] = [];
    const check = async (label: string) => {
      const measurement = await measureOverflow(page);
      if (measurement.scrollWidth > measurement.clientWidth + 1) {
        offenders.push(`${label}: scrollWidth ${measurement.scrollWidth} > ${measurement.clientWidth} — ${measurement.widest.join(" | ")}`);
      }
    };
    const stamp = `${Date.now()}-${viewport.width}`;

    // Sign in. Below the desktop breakpoint the Sign in control lives in the
    // navigation drawer, so a phone user has to reach it through the toggle.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await check("home");
    const desktopSignIn = page.getByRole("button", { name: /^sign in$/i }).first();
    if (!(await desktopSignIn.isVisible())) {
      await page.getByRole("button", { name: "Toggle navigation" }).click();
      await check("home · navigation drawer open");
    }
    await page.getByRole("button", { name: /^sign in$/i }).first().click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await check("sign-in modal");
    await modal.getByRole("button", { name: "Create an account", exact: true }).click();
    await modal.getByPlaceholder("you@orchidcontinuum.org").fill(`responsive-${stamp}@acceptance.test`);
    await modal.getByPlaceholder("••••••••").fill("a-throwaway-password-1");
    await modal.getByRole("button", { name: /^create account$/i }).last().click();
    await expect(modal).toBeHidden({ timeout: 20_000 });

    // Journey 5: Field Journal draft, saved offline then uploaded.
    await page.goto("/field", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Field Journal" })).toBeVisible({ timeout: 20_000 });
    await check("/field");
    await page.getByLabel(/Plant or tag text/).fill("Ophrys apifera");
    await page.getByLabel("Field note").fill(`Solitary bee gripped the labellum (${viewport.name} run).`);
    await page.getByLabel("Locality visibility").selectOption("research_restricted");
    await page.getByRole("button", { name: "Save offline draft" }).click();
    const card = page.locator("article").filter({ hasText: "Ophrys apifera" });
    await expect(card).toHaveCount(1);
    await check("/field · draft saved");
    await card.getByTestId("field-draft-upload").click();
    await expect(card.getByTestId("field-draft-uploaded")).toBeVisible({ timeout: 20_000 });
    await check("/field · draft uploaded");

    // Journey 6: into the Deception Lab loop with the durable id.
    await card.getByTestId("field-draft-hypotheses-link").click();
    await expect(page.getByTestId("hypothesis-loop-panel")).toBeVisible({ timeout: 20_000 });
    await check("/deception-lab · workspace");
    await page.getByTestId("visitor-observed").check();
    await page.getByTestId("visitor-group").selectOption("male_bee");
    await page.getByTestId("behavior-pseudocopulation_like_contact").click();
    await page.getByTestId("generate-hypotheses").click();
    const set = page.getByTestId("hypothesis-set");
    await expect(set).toBeVisible({ timeout: 20_000 });
    expect(await set.locator("[data-testid^='hypothesis-card-']").count()).toBeGreaterThanOrEqual(2);
    await check("/deception-lab · hypotheses rendered");

    // Journey 12: newsletter subscribe.
    await page.goto("/newsletter", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("subscribe-form")).toBeVisible({ timeout: 20_000 });
    await check("/newsletter");
    await page.getByLabel(/Email/i).first().fill(`reader-${stamp}@acceptance.test`);
    await page.getByRole("button", { name: "Field research" }).click();
    await page.getByTestId("subscribe-submit").click();
    await expect(page.getByTestId("subscribe-success")).toBeVisible({ timeout: 20_000 });
    await check("/newsletter · subscribed");

    // Journey 13: contact.
    await page.goto("/contact", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("contact-form")).toBeVisible({ timeout: 20_000 });
    await check("/contact");
    await page.locator("#contact-email").fill(`reader-${stamp}@acceptance.test`);
    await page.locator("#contact-body").fill("The Atlas panel is blank on this device; nothing else on the page is affected.");
    await page.getByTestId("contact-submit").click();
    await expect(page.getByTestId("contact-success")).toBeVisible({ timeout: 20_000 });
    await check("/contact · received");

    // Journey 10: community observation.
    await page.goto("/community", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("community-submit-form")).toBeVisible({ timeout: 20_000 });
    await check("/community");
    await page.getByTestId("community-submit-species").fill(`Fixture species ${stamp}`);
    await page.getByTestId("community-submit-date").fill("2026-06-15");
    await page.getByTestId("community-submit-button").click();
    await expect(page.getByTestId("community-submit-success")).toBeVisible({ timeout: 20_000 });
    await check("/community · submitted");
    await page.getByTestId("tab-browse").click();
    await expect(page.getByTestId("community-browse-list")).toBeVisible({ timeout: 20_000 });
    await check("/community · browse");

    await context.close();
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
}
