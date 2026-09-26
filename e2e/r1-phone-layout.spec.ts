import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Release 1 journeys 1, 13 and 14 in a real browser, against the reference
 * backend (`e2e/support/reference-backend.mjs`).
 *
 * J13 — phone layout. The Lexicon header pushed its navigation toggle off a
 * 390px screen (the page scrolled sideways 19px at 390, 49px at 360, 89px at
 * 320). `mounted-layout.spec.ts` never visited /lexicon, which is how it
 * shipped. This measures `scrollWidth` against the viewport on the Release 1
 * pages at 390, on the Lexicon at every common phone width plus an iPad
 * portrait width, and checks that each Lexicon header control is inside the
 * viewport and has an accessible name. Contexts are `isMobile`, so the layout
 * viewport widens to fit overflowing content exactly as a phone browser does.
 *
 * J1 — discoverability. The home page links /lexicon, /orchid-identification
 * and /literature with real anchors.
 *
 * J14 — outage. With every Calyx request refused, /speak-with-calyx says the
 * Calyx backend is unreachable and shows no browser exception text.
 *
 * WHAT THIS DOES NOT PROVE: anything about the deployed site or the real
 * backend's data; layout does not depend on data, so an unavailable state is a
 * fair layout test.
 */

const REFERENCE_BACKEND = process.env.REFERENCE_BACKEND_URL || "http://127.0.0.1:8791";

const R1_PAGES = [
  "/",
  "/species",
  "/species/Phalaenopsis%20amabilis",
  "/atlas",
  "/atlas-next",
  "/literature",
  "/orchid-identification",
  "/research-station",
  "/lexicon",
  "/lexicon/entry/resupination",
  "/speak-with-calyx",
];
const LEXICON_PAGES = ["/lexicon", "/lexicon/entry/resupination"];
const PHONE_WIDTHS = [320, 360, 390, 414];

async function openContext(browser: Browser, width: number, height = 844) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 800, hasTouch: true });
  // Webfonts, CDN images and embedded third-party scripts are unreachable from
  // a sandboxed runner; none of them decides whether a page fits.
  await context.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === "localhost" ? route.continue() : route.abort("blockedbyclient");
  });
  return context;
}

/**
 * Measured against the width the context was opened at, not
 * `window.innerWidth`: in an `isMobile` context an overflowing page widens the
 * layout viewport, so `innerWidth` grows with the overflow and a comparison
 * against it can never fail.
 */
async function overflowOf(page: Page, width: number) {
  return page.evaluate((viewport) => {
    const doc = document.documentElement;
    const offenders: string[] = [];
    if (doc.scrollWidth > viewport) {
      for (const element of document.querySelectorAll("body *")) {
        const box = element.getBoundingClientRect();
        if (box.width > 0 && box.right > viewport + 1) offenders.push(String(element.className || element.tagName).slice(0, 70));
      }
    }
    return { scrollWidth: doc.scrollWidth, viewport, offenders: offenders.slice(0, 3) };
  }, width);
}

async function visit(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
}

test.describe("Release 1 phone layout (J13)", () => {
  test("no Release 1 page scrolls sideways at 390px", async ({ browser }) => {
    test.setTimeout(180_000);
    const context = await openContext(browser, 390);
    const page = await context.newPage();
    const offenders: string[] = [];
    for (const route of R1_PAGES) {
      await visit(page, route);
      const m = await overflowOf(page, 390);
      if (m.scrollWidth > m.viewport) offenders.push(`${route}: scrollWidth ${m.scrollWidth} > ${m.viewport} — ${m.offenders.join(" | ")}`);
    }
    await context.close();
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  for (const width of [...PHONE_WIDTHS, 820]) {
    test(`Lexicon header fits and every control is reachable and named at ${width}px`, async ({ browser }) => {
      const context = await openContext(browser, width, width < 800 ? 844 : 1180);
      const page = await context.newPage();
      for (const route of LEXICON_PAGES) {
        await visit(page, route);
        const m = await overflowOf(page, width);
        expect(m.scrollWidth, `${route} at ${width}px: ${m.offenders.join(" | ")}`).toBeLessThanOrEqual(width);

        const controls = await page.locator("header button").evaluateAll((buttons) => buttons
          .map((button) => {
            const box = button.getBoundingClientRect();
            const clone = button.cloneNode(true) as HTMLElement;
            clone.querySelectorAll("[aria-hidden]").forEach((node) => node.remove());
            const name = (button.getAttribute("aria-label") || clone.textContent || "").replace(/\s+/g, " ").trim();
            return { name, left: box.left, right: box.right, width: box.width };
          })
          .filter((control) => control.width > 0));
        expect(controls.length, `${route} header controls at ${width}px`).toBeGreaterThanOrEqual(4);
        for (const control of controls) {
          expect(control.name, `${route} at ${width}px: unnamed header control`).not.toBe("");
          expect(control.left, `${route} at ${width}px: "${control.name}" starts off-screen`).toBeGreaterThanOrEqual(0);
          expect(control.right, `${route} at ${width}px: "${control.name}" ends off-screen`).toBeLessThanOrEqual(width);
        }
      }

      // The navigation toggle actually opens the Lexicon's own menu.
      await visit(page, "/lexicon");
      const toggle = page.getByRole("button", { name: "Toggle navigation" });
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(page.locator("#lexicon-mobile-nav").getByRole("button", { name: "A–Z Lexicon" })).toBeVisible();
      await context.close();
    });
  }
});

test("home page links the Release 1 surfaces (J1)", async ({ browser }) => {
  const context = await openContext(browser, 1440, 900);
  const page = await context.newPage();
  await visit(page, "/");
  for (const route of ["/lexicon", "/orchid-identification", "/literature"]) {
    await expect(page.locator(`a[href="${route}"]`).first(), `${route} linked from home`).toBeAttached();
  }
  await page.locator('footer a[href="/literature"]').click();
  await expect(page).toHaveURL(/\/literature$/);
  // Still the protected route: the visitor is shown the sign-in gate.
  await expect(page.getByText(/signed-in access/i).first()).toBeVisible();
  await context.close();
});

test("an unreachable Calyx backend is named honestly on /speak-with-calyx (J14)", async ({ browser }) => {
  const context = await openContext(browser, 390);
  const origin = new URL(REFERENCE_BACKEND).origin;
  await context.route((url) => url.origin === origin, (route) => route.abort("connectionrefused"));
  const page = await context.newPage();
  await visit(page, "/speak-with-calyx");
  const degraded = page.locator("section", { hasText: "Degraded connections" });
  await expect(degraded).toContainText("Calyx backend is unreachable", { timeout: 15_000 });
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  expect(body).not.toMatch(/TypeError|Failed to fetch|NetworkError/);
  const m = await overflowOf(page, 390);
  expect(m.scrollWidth).toBeLessThanOrEqual(390);
  await context.close();
});
