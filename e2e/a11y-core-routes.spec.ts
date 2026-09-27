import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Release 1 accessibility (J13): automated WCAG 2.1 A/AA checks with axe-core
 * on the core Release 1 routes, at desktop width and on a 390px phone, plus
 * keyboard operation of the phone navigation drawer.
 *
 * J13 was previously accepted on heuristic checks only (named header controls,
 * no sideways scroll). This runs the axe-core rule engine against the real
 * production bundle, pointed at the reference backend
 * (`e2e/support/reference-backend.mjs`).
 *
 * Known issues. A violation that needs a design decision or a large refactor
 * is recorded in the pull request that introduced this spec ("Known
 * accessibility issues", PR description) and listed in KNOWN_ISSUES below as
 * one rule id + one selector fragment. Only nodes matching both are ignored;
 * the rule still runs everywhere else, and a new node that breaks the same
 * rule still fails. No rule is disabled globally.
 *
 * WHAT THIS DOES NOT PROVE: conformance. axe finds roughly a third to a half
 * of WCAG failures automatically; it cannot judge reading order, meaningful
 * alt text, or whether focus is visible enough. Nor does it say anything about
 * the deployed site or the real backend's data.
 */

const WCAG_21_A_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
/**
 * Structure rules axe files under "best-practice" rather than a WCAG tag, run
 * as a second pass: every page has one main landmark, landmarks are uniquely
 * named, and there is a level-one heading.
 */
const STRUCTURE_RULES = ["landmark-one-main", "landmark-no-duplicate-main", "landmark-main-is-top-level", "landmark-unique", "page-has-heading-one"];

const CORE_ROUTES: { name: string; path: string }[] = [
  { name: "home", path: "/" },
  { name: "species index", path: "/species" },
  { name: "species dossier", path: "/species/Phalaenopsis%20amabilis" },
  { name: "lexicon", path: "/lexicon" },
  { name: "lexicon entry", path: "/lexicon/entry/resupination" },
  { name: "literature (sign-in gate)", path: "/literature" },
  { name: "orchid identification (anonymous)", path: "/orchid-identification" },
  { name: "atlas", path: "/atlas" },
  // The Research Station is mounted at /research behind ProtectedRoute; the
  // bare /research-station path is not a route (it renders the 404 page,
  // scanned below as "not found").
  { name: "research station (anonymous gate)", path: "/research" },
  { name: "calyx", path: "/calyx" },
  { name: "not found", path: "/this-route-does-not-exist" },
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone-390", width: 390, height: 844 },
];

/**
 * Rule + class pairs deferred to a design decision. Each entry names the
 * "Known accessibility issues" item (KI-n) in the description of the pull
 * request that added this spec ("Accessibility: semantic navigation links and
 * axe checks on core journeys"). `className` must be one class token on the
 * offending element itself; `routes` limits the entry to the routes where the
 * issue was observed. Nothing else about the rule is relaxed.
 */
type KnownIssue = { rule: string; className: string; routes: string[]; note: string };
const DARK_SURFACE_ROUTES = ["/species", "/species/Phalaenopsis%20amabilis", "/atlas"];
const LEXICON_ROUTES = ["/lexicon", "/lexicon/entry/resupination"];
const KNOWN_ISSUES: KnownIssue[] = [
  // KI-1: the muted-label palette on the dark Species/Atlas surfaces sits at
  // 4.0–4.4:1 for 9–10px text. It is one token used ~70 times across 22 files;
  // re-tuning it is a design-system decision, not a per-element patch.
  { rule: "color-contrast", className: "text-[#7a7466]", routes: DARK_SURFACE_ROUTES, note: "KI-1" },
  { rule: "color-contrast", className: "text-[#cfc8b8]/55", routes: DARK_SURFACE_ROUTES, note: "KI-1" },
  { rule: "color-contrast", className: "text-[#c9a24a]/70", routes: DARK_SURFACE_ROUTES, note: "KI-1" },
  // KI-2: the Lexicon's green small-caps accent (#4A7C59, 4.35–4.47:1) and
  // stone-500 body notes on its parchment (4.29:1) are the Lexicon palette,
  // used ~34 times across 14 files.
  { rule: "color-contrast", className: "text-[#4A7C59]", routes: LEXICON_ROUTES, note: "KI-2" },
  { rule: "color-contrast", className: "text-stone-500", routes: LEXICON_ROUTES, note: "KI-2" },
];

type AxeNode = { target: unknown[]; html: string; failureSummary?: string };
type AxeViolation = { id: string; impact?: string | null; help: string; nodes: AxeNode[] };

const targetOf = (node: AxeNode) => node.target.map((part) => (Array.isArray(part) ? part.join(" >>> ") : String(part))).join(" ");

/** Class tokens on the offending element's own opening tag. */
const classesOf = (node: AxeNode) => (/^<[^>]*?\sclass="([^"]*)"/.exec(node.html)?.[1] ?? "").split(/\s+/).filter(Boolean);

function isKnown(rule: string, route: string, node: AxeNode) {
  const classes = classesOf(node);
  return KNOWN_ISSUES.some((issue) => issue.rule === rule && issue.routes.includes(route) && classes.includes(issue.className));
}

async function openContext(browser: Browser, width: number, height: number) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 800, hasTouch: width < 800 });
  // Webfonts, CDN images and third-party embeds are unreachable from a
  // sandboxed runner. None of them changes the structure axe examines.
  await context.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === "localhost" ? route.continue() : route.abort("blockedbyclient");
  });
  return context;
}

async function settle(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.locator("#root > *").first().waitFor({ state: "attached" });
  // Let data requests resolve and entry animations finish so axe sees the
  // page a visitor sees, not a half-painted skeleton.
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
}

async function scan(page: Page, route: string) {
  const wcag = await new AxeBuilder({ page }).withTags(WCAG_21_A_AA).analyze();
  const structure = await new AxeBuilder({ page }).withRules(STRUCTURE_RULES).analyze();
  const violations = ([...wcag.violations, ...structure.violations] as AxeViolation[])
    .map((violation) => ({ ...violation, nodes: violation.nodes.filter((node) => !isKnown(violation.id, route, node)) }))
    .filter((violation) => violation.nodes.length > 0);
  return violations;
}

function describeViolations(violations: AxeViolation[]) {
  return violations
    .map((v) => `${v.id} [${v.impact}] ${v.help}\n` + v.nodes.slice(0, 12).map((n) => `    ${targetOf(n)}  ${n.html.slice(0, 140)}\n      ${(n.failureSummary ?? "").split("\n").slice(1, 2).join(" ").trim()}`).join("\n"))
    .join("\n");
}

for (const viewport of VIEWPORTS) {
  test.describe(`axe WCAG 2.1 A/AA on core Release 1 routes (${viewport.name})`, () => {
    for (const route of CORE_ROUTES) {
      test(`${route.name} — ${route.path}`, async ({ browser }, testInfo) => {
        const context = await openContext(browser, viewport.width, viewport.height);
        const page = await context.newPage();
        await settle(page, route.path);
        const violations = await scan(page, route.path);
        await testInfo.attach(`axe-${viewport.name}-${route.name}.json`, {
          body: JSON.stringify(violations, null, 2),
          contentType: "application/json",
        });
        await context.close();
        expect(violations, `${route.path} at ${viewport.name}:\n${describeViolations(violations)}`).toEqual([]);
      });
    }
  });
}

test.describe("axe WCAG 2.1 A/AA on the open site menus", () => {
  // Menus render only when opened, so the route scans above never see them.
  test("phone navigation drawer, open", async ({ browser }) => {
    const context = await openContext(browser, 390, 844);
    const page = await context.newPage();
    await settle(page, "/species");
    await page.getByRole("button", { name: "Toggle navigation" }).click();
    await expect(page.locator("#site-mobile-nav")).toBeVisible();
    const violations = await scan(page, "/species");
    await context.close();
    expect(violations, `drawer open:\n${describeViolations(violations)}`).toEqual([]);
  });

  test("desktop More menu, open", async ({ browser }) => {
    const context = await openContext(browser, 1440, 900);
    const page = await context.newPage();
    await settle(page, "/");
    await page.getByRole("navigation", { name: "Primary", exact: true }).getByRole("button", { name: "More" }).click();
    await expect(page.locator("#site-more-menu")).toBeVisible();
    const violations = await scan(page, "/");
    await context.close();
    expect(violations, `More menu open:\n${describeViolations(violations)}`).toEqual([]);
  });
});

test.describe("phone navigation drawer is keyboard operable", () => {
  test("Enter and Space open it, Escape closes it and returns focus, links are reachable by Tab", async ({ browser }) => {
    const context = await openContext(browser, 390, 844);
    const page = await context.newPage();
    await settle(page, "/species");

    const toggle = page.getByRole("button", { name: "Toggle navigation" });
    const drawer = page.locator("#site-mobile-nav");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(drawer).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    // The drawer's destinations are links, announced as links, and the
    // current page is marked.
    await expect(drawer.getByRole("link", { name: "Species", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(drawer.getByRole("link", { name: "Atlas", exact: true })).toHaveAttribute("href", "/atlas");

    // Tab moves from the toggle into the drawer.
    await page.keyboard.press("Tab");
    const focusedInDrawer = await page.evaluate(() => !!document.activeElement?.closest("#site-mobile-nav"));
    expect(focusedInDrawer, "Tab from the toggle lands inside the drawer").toBe(true);

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await page.keyboard.press(" ");
    await expect(drawer).toBeVisible();

    // Following a drawer link by keyboard navigates and closes the drawer.
    await drawer.getByRole("link", { name: "Atlas", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/atlas$/);
    await expect(drawer).toBeHidden();
    await context.close();
  });

  test("desktop primary navigation items are links with the current page marked", async ({ browser }) => {
    const context = await openContext(browser, 1440, 900);
    const page = await context.newPage();
    await settle(page, "/atlas");
    const nav = page.getByRole("navigation", { name: "Primary", exact: true });
    for (const [label, href] of [["Home", "/"], ["Atlas", "/atlas"], ["Species", "/species"], ["CALYX", "/calyx"]]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href);
    }
    await expect(nav.getByRole("link", { name: "Atlas", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);

    // The More menu opens from the keyboard and Escape hands focus back.
    const more = nav.getByRole("button", { name: "More" });
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#site-more-menu")).toBeVisible();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("#site-more-menu")), "Tab from More lands in the menu").toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.locator("#site-more-menu")).toBeHidden();
    await expect(more).toBeFocused();
    await context.close();
  });
});
