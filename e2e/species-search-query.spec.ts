import { expect, test, type Page } from "@playwright/test";

/**
 * Species search keeps its query in the URL (?q=) so a search is shareable,
 * bookmarkable and can be linked to from other pages.
 *
 * The reference backend has no species-search fixture: `/api/species/search`
 * falls through to its single-record `/api/species/:id` identity fixture, which
 * is not a search answer, so the page must say search is unavailable rather
 * than "no species matched". The empty answer below is a clearly SYNTHETIC
 * `[]` fulfilled in the browser, used only to exercise the no-matches state;
 * no species rows are invented.
 */

// The app fetches with credentials, so a fulfilled answer names the app origin.
const APP_ORIGIN = new URL(process.env.E2E_APP_URL || "http://127.0.0.1:4173").origin;
const CORS = { "access-control-allow-origin": APP_ORIGIN, "access-control-allow-credentials": "true" };
const SCREENSHOT_DIR = process.env.SPECIES_QUERY_SCREENSHOT_DIR;

const searchBox = (page: Page) => page.getByRole("textbox", { name: "Search orchid species" });
const urlQuery = (page: Page) => new URL(page.url()).searchParams.get("q");

async function answerSearchWithSyntheticEmptyList(page: Page) {
  await page.route(/\/api\/species\/search\?/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: "[]" }),
  );
}

test("/species?q=Dracula fills the box, searches once, and shows the reference backend's honest unavailable state", async ({ page }) => {
  const searches: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/species/search") searches.push(url.searchParams.get("q") ?? "");
  });

  await page.goto("/species?q=Dracula");
  await expect(searchBox(page)).toHaveValue("Dracula");
  const unavailable = page.getByTestId("species-search-unavailable");
  await expect(unavailable).toBeVisible();
  await expect(unavailable).toContainText("no results can be shown for “Dracula”");
  await expect(page.getByText(/No species matched/)).toHaveCount(0);
  await page.waitForTimeout(1000);
  expect(searches).toEqual(["Dracula"]);

  if (SCREENSHOT_DIR) await page.screenshot({ path: `${SCREENSHOT_DIR}/species-q-dracula-reference-backend.png`, fullPage: true });
});

test("a genuine empty answer for a prefilled hybrid name keeps the no-matches state", async ({ page }) => {
  await answerSearchWithSyntheticEmptyList(page);
  const name = "Cattleya × guatemalensis";
  await page.goto(`/species?q=${encodeURIComponent(name)}`);
  await expect(searchBox(page)).toHaveValue(name);
  await expect(page.getByText(`No species matched “${name}”`)).toBeVisible();
  await expect(page.getByTestId("species-search-unavailable")).toHaveCount(0);
});

test("an injection payload in ?q= is shown as text and never executes", async ({ page }) => {
  await answerSearchWithSyntheticEmptyList(page);
  const payload = `<img src=x onerror="window.__speciesPwned=1"><script>window.__speciesPwned=2</script>`;
  await page.goto(`/species?q=${encodeURIComponent(payload)}`);
  await expect(searchBox(page)).toHaveValue(payload);
  await expect(page.getByText(`No species matched “${payload}”`)).toBeVisible();
  await expect(page.locator('main img[src="x"]')).toHaveCount(0);
  await expect(page.locator("main script")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __speciesPwned?: number }).__speciesPwned)).toBeUndefined();
});

test("a right-to-left override (U+202E) in a shared ?q= cannot reverse the copy around its echo", async ({ page }) => {
  await answerSearchWithSyntheticEmptyList(page);
  const searches: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/species/search") searches.push(url.searchParams.get("q") ?? "");
  });
  const bidi = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/;

  await page.goto(`/species?q=${encodeURIComponent("\u202EABC")}`);
  await expect(searchBox(page)).toHaveValue("ABC");
  const empty = page.getByText("No species matched “ABC” · try another term");
  await expect(empty).toBeVisible();
  // The address is normalised in place, and the search asked for the visible text only.
  await expect.poll(() => urlQuery(page)).toBe("ABC");
  expect(searches).toEqual(["ABC"]);
  expect(await page.locator("main").innerText()).not.toMatch(bidi);

  // The echoed query is isolated, and the copy around it still runs left to
  // right: the lead-in, then the query, then the trailing hint.
  const order = await empty.evaluate((el) => {
    const isolated = el.querySelector("bdi");
    const first = el.firstChild;
    const last = el.lastChild;
    if (!isolated || !first || !last || first === isolated || last === isolated) return null;
    const box = (node: Node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect();
    };
    return {
      isolated: isolated.textContent,
      lead: first.textContent,
      tail: last.textContent,
      leadRight: box(first).right,
      queryLeft: box(isolated).left,
      queryRight: box(isolated).right,
      tailLeft: box(last).left,
      sameLine: Math.abs(box(first).top - box(last).top) < 2,
    };
  });
  expect(order).not.toBeNull();
  expect(order!.isolated).toBe("ABC");
  expect(order!.lead).toBe("No species matched “");
  expect(order!.tail).toBe("” · try another term");
  expect(order!.sameLine).toBe(true);
  expect(order!.leadRight).toBeLessThanOrEqual(order!.queryLeft + 0.5);
  expect(order!.queryRight).toBeLessThanOrEqual(order!.tailLeft + 0.5);

  if (SCREENSHOT_DIR) await page.screenshot({ path: `${SCREENSHOT_DIR}/species-q-rlo-neutralised.png`, fullPage: true });
});

test("pasting text with a right-to-left override keeps the caret after the pasted text", async ({ page }) => {
  await answerSearchWithSyntheticEmptyList(page);
  await page.goto("/species");
  await searchBox(page).fill("Dracula");
  await searchBox(page).evaluate((el: HTMLInputElement) => el.setSelectionRange(3, 3));
  await page.keyboard.insertText("xy\u202Ez");
  await expect(searchBox(page)).toHaveValue("Draxyzcula");
  const caret = await searchBox(page).evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]);
  expect(caret).toEqual([6, 6]);
  await expect.poll(() => urlQuery(page)).toBe("Draxyzcula");
});

test("a genus carrying an invisible format character is dropped from the address bar", async ({ page }) => {
  await page.goto(`/species?genus=${encodeURIComponent("Dracula\u200B")}`);
  await expect.poll(() => new URL(page.url()).search).toBe("");
  await expect(searchBox(page)).toHaveValue("");
  await expect(page.getByText("Filtering by")).toHaveCount(0);
});

test("typing replaces the address, Enter commits it, and Back returns to the committed search", async ({ page }) => {
  await answerSearchWithSyntheticEmptyList(page);
  await page.goto("/species");
  const before = await page.evaluate(() => history.length);

  await searchBox(page).fill("Épidendrum ñandú");
  await expect.poll(() => urlQuery(page)).toBe("Épidendrum ñandú");
  expect(await page.evaluate(() => history.length)).toBe(before);
  expect(page.url()).not.toMatch(/[ Éñ]/);

  await searchBox(page).press("Enter");
  await searchBox(page).fill("Vanilla");
  await expect.poll(() => urlQuery(page)).toBe("Vanilla");
  await searchBox(page).fill("Vanilla planifolia");
  await expect.poll(() => urlQuery(page)).toBe("Vanilla planifolia");
  expect(await page.evaluate(() => history.length)).toBe(before + 1);

  await page.goBack();
  await expect.poll(() => urlQuery(page)).toBe("Épidendrum ñandú");
  await expect(searchBox(page)).toHaveValue("Épidendrum ñandú");
  await expect(page.getByText("No species matched “Épidendrum ñandú”")).toBeVisible();

  // The URL is the whole search: reloading it restores the same query.
  await page.reload();
  await expect(searchBox(page)).toHaveValue("Épidendrum ñandú");
});

test("a long prefilled query stays inside the phone layout (390px) with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/species?q=${encodeURIComponent(`Notagenus${"x".repeat(400)}`)}`);
  await expect(page.getByTestId("species-search-unavailable")).toBeVisible();
  expect(Array.from(urlQuery(page) ?? "")).toHaveLength(200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the unknown-taxon dossier's Search species link lands on a search filled with the requested name", async ({ page }) => {
  await page.goto("/species/Notagenus%20fakeus");
  const panel = page.getByTestId("taxon-record-not-found");
  await expect(panel).toBeVisible();
  await panel.getByRole("link", { name: "Search species" }).click();
  await expect(page).toHaveURL(/\/species\?q=Notagenus%20fakeus$/);
  await expect(searchBox(page)).toHaveValue("Notagenus fakeus");
  await expect(page.getByTestId("species-search-unavailable")).toBeVisible();

  // Back returns to the dossier it came from.
  await page.goBack();
  await expect(page.getByTestId("taxon-record-not-found")).toBeVisible();
});
