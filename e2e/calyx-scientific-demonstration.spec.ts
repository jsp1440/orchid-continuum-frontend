import { expect, test, type Page } from "@playwright/test";

/**
 * The scientific demonstration, in a real browser.
 *
 * The question is the one the product is meant to be able to take seriously:
 *
 *   "Which traits distinguish cool-growing Phalaenopsis from warm-growing
 *    Phalaenopsis?"
 *
 * Every surface this exercises was already built and mounted — synthesis,
 * supporting and contradicting evidence, gaps, governance. None of it had
 * browser evidence, because the reference backend modelled no Calyx endpoint,
 * so the whole path could only ever be reasoned about from source.
 *
 * WHAT THIS PROVES: that a governed mission renders as a governed mission —
 * conclusions kept apart from evidence, evidence against the conclusion shown
 * beside evidence for it, gaps stated, and publication never automatic.
 *
 * WHAT THIS DOES NOT PROVE: anything whatsoever about Phalaenopsis. The
 * reference backend's corpus is invented fixture material, labelled as such at
 * its definition. A passing run here is evidence about the frontend, never
 * about the Continuum's science, and never about the deployed Brain.
 *
 * The second question matters as much as the first. A demonstration that only
 * shows the answering case cannot show that the product declines to answer,
 * and declining is the behaviour most easily lost.
 */

test.describe.configure({ mode: "serial" });

let page: Page;

const DEMONSTRATION_QUESTION =
  "Which traits distinguish cool-growing Phalaenopsis from warm-growing Phalaenopsis?";
const UNANSWERABLE_QUESTION = "What colour is the moon made of?";

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === "localhost" ? route.continue() : route.abort();
  });
  page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
});

test.afterAll(async () => {
  await page?.close();
});

async function ask(question: string, options: { freshThread?: boolean } = {}) {
  await page.goto("/speak-with-calyx", { waitUntil: "domcontentloaded" });
  if (options.freshThread) {
    // The workspace resumes its last thread from storage. For the abstention
    // case that would leave the previous mission on the page, and the
    // assertions that nothing leaked between them would be meaningless.
    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  const input = page.locator("#calyx-message");
  await expect(input).toBeVisible({ timeout: 20_000 });
  await input.fill(question);
  await page.getByRole("button", { name: /^send$/i }).click();
  // The mission renders inside a collapsed <details> labelled "Research
  // details", so the synthesis exists in the DOM but is not visible until the
  // reader opens it. Open it, the way a reader would.
  const disclosure = page.getByRole("group").filter({ hasText: /Research details · mission/ }).last();
  await expect(disclosure).toBeAttached({ timeout: 30_000 });
  await disclosure.getByText(/Research details · mission/).click();
  await expect(page.getByTestId("scientific-synthesis")).toBeVisible({ timeout: 15_000 });
}

/* ----------------------------------------------------------------- 1 ----- */

test("1. the demonstration question returns a bounded conclusion, not an assertion", async () => {
  await ask(DEMONSTRATION_QUESTION);

  // The conclusion is the Brain's interpretation, and is rendered as its own
  // kind of claim rather than as another evidence record.
  // The conclusion is the Brain's interpretation, and is rendered as its own
  // kind of claim rather than as another evidence record.
  await expect(page.getByTestId("scientific-synthesis")).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).toContain("cool-growing accessions are associated with lower recorded night temperatures");

  // Confidence is shown as reported, not rescaled or invented.
  expect(body).toContain("0.42");
});

/* ----------------------------------------------------------------- 2 ----- */

test("2. evidence against the conclusion is shown beside evidence for it", async () => {
  // The property that separates a synthesis from a summary. A product that
  // renders only supporting evidence is not showing its work; it is agreeing
  // with itself.
  const supporting = page.getByRole("heading", { name: "Supporting evidence" });
  const contradicting = page.getByRole("heading", { name: "Contradicting evidence" });
  await expect(supporting).toBeVisible();
  await expect(contradicting).toBeVisible();

  const body = await page.locator("body").innerText();
  expect(body).toContain("no consistent difference observed");

  // And the conclusion itself says which trait the corpus does not separate,
  // rather than quietly reporting only the trait that worked.
  expect(body).toMatch(/Leaf texture is NOT separated/i);
});

/* ----------------------------------------------------------------- 3 ----- */

test("3. the gaps in the evidence are stated, not left implicit", async () => {
  const body = await page.locator("body").innerText();
  expect(body).toContain("No fixture source measures both groups under one protocol");
  expect(body).toContain("No fixture source reports provenance elevation");
});

/* ----------------------------------------------------------------- 4 ----- */

test("4. nothing is published automatically, whatever the answer was", async () => {
  const body = await page.locator("body").innerText();
  expect(body).toContain("Automatic publication: never");
  expect(body).toMatch(/Publication eligible:\s*no/i);
  expect(body).toMatch(/Review:\s*awaiting review/i);
});

/* ----------------------------------------------------------------- 5 ----- */

test("5. a question the corpus cannot answer produces no conclusion at all", async () => {
  // The case that is easiest to lose and worst to lose. Abstention has to be
  // visible as abstention — not a hedged sentence, and not an empty panel that
  // reads as though nothing was asked.
  await ask(UNANSWERABLE_QUESTION, { freshThread: true });

  const body = await page.locator("body").innerText();
  expect(body).toContain("The fixture corpus holds no record addressing this question");
  expect(body).toContain("No conclusion is offered, because none is supported");

  // No conclusion text leaked from the previous mission into this one, and no
  // confidence was manufactured for an answer that was not given.
  expect(body).not.toContain("cool-growing accessions are associated");
  expect(body).not.toContain("0.42");

  // Governance still holds on a mission that concluded nothing.
  expect(body).toContain("Automatic publication: never");
});
