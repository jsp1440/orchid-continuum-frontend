import { expect, test } from "@playwright/test";

/**
 * A page that scrolls sideways, checked in a real browser on every route a
 * visitor can reach from the navigation.
 *
 * jsdom has no layout engine, so this is invisible to the unit suite: it was
 * found by opening the site at an iPad's width and seeing the homepage drag
 * left. `scrollWidth` against `clientWidth` is a measured fact rather than a
 * judgement, which is why this is the whole-site check that is worth failing a
 * build over.
 *
 * A heading painted the colour of what is behind it is the other fault worth
 * catching, and it is deliberately *not* here. Deciding what is behind a
 * heading from the DOM cannot be done soundly — the dark sections on this site
 * are painted by positioned layers that are not the heading's ancestors — and
 * a check that reports dozens of correct pages as broken is worse than none.
 * `src/index.css` is asserted directly instead, in
 * `src/lib/headingColourInheritance.test.ts`.
 *
 * These run against whatever the reference backend answers. Layout does not
 * depend on the data, so a route rendering its unavailable state is still a
 * fair test of it.
 */

/** Routes reachable from the primary and secondary navigation. */
const PUBLIC_ROUTES = [
  "/",
  "/atlas",
  "/species",
  "/calyx",
  "/education",
  "/oacs",
  "/about",
  "/ecosystems",
  "/conservation",
  "/societies",
  "/classroom",
  "/research",
  "/partners",
  "/get-involved",
  "/university",
];

/** Widths that matter: a desktop, both iPad orientations, and a phone. */
const WIDTHS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "iPad landscape", width: 1180, height: 820 },
  { name: "iPad portrait", width: 834, height: 1112 },
  { name: "phone", width: 390, height: 844 },
];

const RELATIVE_LUMINANCE_CHANNEL = (value: number) => {
  const channel = value / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
};

test.describe("mounted layout", () => {
  for (const viewport of WIDTHS) {
    test(`no page drags sideways at ${viewport.name} (${viewport.width}px)`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      // Webfonts and an embedded third-party script are unreachable from a
      // sandboxed runner, and every route then spends its whole navigation
      // budget waiting for them to time out. Nothing served off this host
      // affects whether a page fits its viewport, so none of it is fetched.
      await page.route("**/*", (route) => {
        const host = new URL(route.request().url()).hostname;
        return host === "127.0.0.1" || host === "localhost" ? route.continue() : route.abort();
      });
      const offenders: string[] = [];

      for (const route of PUBLIC_ROUTES) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(600);
        const measurement = await page.evaluate(() => {
          const doc = document.documentElement;
          const widest: string[] = [];
          if (doc.scrollWidth > doc.clientWidth + 1) {
            for (const element of document.querySelectorAll("body *")) {
              const style = getComputedStyle(element);
              // Decorative washes are deliberately hung off the edge and are
              // not what makes a page scroll.
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
  }

});
