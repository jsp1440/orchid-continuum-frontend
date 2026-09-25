import { expect, test, type Page } from "@playwright/test";

/**
 * The judging practice sheet (issue #791 / completion-graph node
 * `cap-judging-practice`), driven in a real browser against a production
 * build.
 *
 * This capability has no backend contract — the rubric is static data and
 * scoring is pure client-side arithmetic — so unlike the other journeys in
 * this directory it needs no reference backend. What earlier passes could
 * only confirm by reading `src/pages/JudgingPractice.tsx` and its jsdom-level
 * tests, this proves in a rendered page: the rubric-provenance disclosure is
 * on screen, not just in source; scoring updates as a person types, the way a
 * judge would use it; and a band is never shown for an incomplete sheet.
 *
 * WHAT THIS DOES NOT PROVE: anything about the deployed/hosted site. A green
 * run here is browser evidence against a local production build, not
 * deployment evidence.
 */

test.describe.configure({ mode: "serial" });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`[console] ${message.text()}`);
  });
});

test.afterAll(async () => {
  await page?.close();
});

function criterionInput(name: string) {
  return page.getByRole("spinbutton", { name: new RegExp(`^${name} points out of \\d+$`, "i") });
}

test("discloses the rubric's provenance as an unverified historical snapshot, on the page", async () => {
  await page.goto("/education/judging-practice", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Not a real award")).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText(/transcribed from a retired application.*never checked against any organisation.s current published standards/i),
  ).toBeVisible();
  await expect(page.getByText(/recovered from Orchid_Continuum_Online/i)).toBeVisible();
});

test("renders the default AOS flower rubric with all six criteria", async () => {
  const criteria = page.getByTestId("criteria").locator("li");
  await expect(criteria).toHaveCount(6);
  await expect(page.getByText("Form", { exact: true })).toBeVisible();
  await expect(page.getByText("Floriferousness", { exact: true })).toBeVisible();
});

test("withholds a band while the sheet is incomplete, even past a threshold", async () => {
  const result = page.getByTestId("practice-result");
  for (const [name, value] of [
    ["Form", "30"],
    ["Color", "15"],
    ["Substance/Texture", "15"],
    ["Size", "10"],
    ["Floriferousness", "15"],
  ] as const) {
    await criterionInput(name).fill(value);
  }
  await expect(result).toContainText("85 of 100 points");
  await expect(result).toContainText(/1 criterion not yet scored/i);
  await expect(result).not.toContainText(/reaches the/i);
});

test("scores a complete sheet deterministically and states it is not an award", async () => {
  await criterionInput("Stem and Presentation").fill("15");
  const result = page.getByTestId("practice-result");
  await expect(result).toContainText("100 of 100 points");
  await expect(result).toContainText(/reaches the First Class Certificate band/i);
  await expect(result).toContainText(/not an award, not a prediction of one/i);
  await expect(result).toContainText(/nothing here is saved or submitted/i);
  await expect(result).toContainText("CBR");
  await expect(result).toContainText(/not decided by a point total/i);
});

test("switching rubric organisation resets entries and shows that organisation's own criteria", async () => {
  await page.getByLabel("Organisation").selectOption("EU");
  await expect(page.getByText("Form and Shape", { exact: true })).toBeVisible();
  await expect(page.getByTestId("criteria").locator("li")).toHaveCount(6);
  await expect(page.getByTestId("practice-result")).toContainText("0 of 100 points");
  // The disclosure persists across a rubric switch, not just on first paint.
  await expect(page.getByText("Not a real award")).toBeVisible();
});
