import { expect, test, type Page } from "@playwright/test";

/**
 * The Calyx Verification Workbench (`checkCalyxMissionClaim`), audited in a
 * real browser.
 *
 * `src/lib/calyxVerification.ts` and `CalyxVerificationWorkbench.tsx` had
 * Vitest/RTL coverage but no browser evidence: nothing had driven a real
 * mission through the real network stack, clicked "Check Calyx" in an actual
 * DOM, and confirmed the audit that renders is the one the mission's own
 * evidence, provenance and objections actually justify — as opposed to a
 * shallow render of the component with hand-built props.
 *
 * WHAT THIS PROVES: that the Workbench, driven end to end in a browser
 * against a running backend process, computes and renders a genuine audit —
 * a failing exact-source-anchors check because the fixture source carries no
 * locator, a withheld/absent excerpt distinction, retained counterevidence,
 * and the mission's stated publication objection — rather than a canned or
 * always-green result.
 *
 * WHAT THIS DOES NOT PROVE: anything about the deployed `orchid-calyx-backend`
 * or about real scientific evidence. The reference backend's mission is
 * invented fixture material (see `e2e/support/reference-backend.mjs`), and
 * this run never leaves localhost. A passing run here is evidence that the
 * Workbench's browser wiring and audit logic are sound; it is not
 * `deployedOperational` evidence and must not be cited as such.
 */

test.describe.configure({ mode: "serial" });

let page: Page;

const DEMONSTRATION_QUESTION =
  "Which traits distinguish cool-growing Phalaenopsis from warm-growing Phalaenopsis?";

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

test("auditing a real mission's own claim surfaces the checks its actual evidence earns", async () => {
  await page.goto("/speak-with-calyx", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });

  const input = page.locator("#calyx-message");
  await expect(input).toBeVisible({ timeout: 20_000 });
  await input.fill(DEMONSTRATION_QUESTION);
  await page.getByRole("button", { name: /^send$/i }).click();

  const disclosure = page.getByRole("group").filter({ hasText: /Research details · mission/ }).last();
  await expect(disclosure).toBeAttached({ timeout: 30_000 });
  await disclosure.getByText(/Research details · mission/).click();
  await expect(page.getByTestId("scientific-synthesis")).toBeVisible({ timeout: 15_000 });

  const workbench = page.getByTestId("calyx-verification-workbench");
  await expect(workbench).toBeVisible();

  // Collapsed by default: the audit must not be sprung on the reader.
  await expect(workbench.getByText("Check Calyx")).toBeVisible();
  await expect(workbench.getByText("Verification result")).not.toBeVisible();

  await workbench.getByRole("button", { name: "Check Calyx" }).click();
  await expect(workbench.getByText("Verification result")).toBeVisible();

  const auditText = await workbench.innerText();

  // The verdict and tally are computed from the mission this run actually
  // received over the network, not asserted against a stubbed result.
  expect(auditText).toContain("Verification failed");
  expect(auditText).toContain("5 pass · 4 review · 1 fail");

  // The fixture source carries a revision id but no exact locator, so the
  // anchor check must genuinely fail rather than pass on partial provenance.
  expect(auditText).toContain("Exact source anchors");
  expect(auditText).toMatch(/cannot yet be opened at an exact source location/);

  // Both the supporting and the contradicting evidence linked to this claim
  // render, each attributed to the source revision the mission cited for it.
  expect(auditText).toContain("associated_night_temperature_minimum_c");
  expect(auditText).toContain("no consistent difference observed");
  expect(auditText).toContain("Fixture: cultivation notes, Phalaenopsis section Phalaenopsis");
  expect(auditText).toContain("Fixture: growth trial summary");

  // The counterevidence source supplied no excerpt and no canonical record
  // exists for it, so the absence must read as a traceability gap, never as
  // a policy withholding it never received.
  expect(auditText).toContain("No canonical evidence record resolved to this citation");
  expect(auditText).not.toContain("Excerpt withheld by display policy");

  // The mission itself objected to publication; the Workbench must surface
  // that reason rather than only report the eligibility verdict.
  expect(auditText).toContain("Not eligible for publication");
  expect(auditText).toContain("human_review_required");

  // Provenance renders the mission's own reported confidence and source
  // revisions verbatim, not rescaled or summarized.
  expect(auditText).toContain("0.42");
  expect(auditText).toMatch(/self-assessment/);
  expect(auditText).toMatch(/Publication eligible:\s*no/);
  expect(auditText).toMatch(/Source revisions:\s*11,\s*12/);

  // A versioned reasoning ledger was attached, so the check passes and the
  // inspector for it is reachable from this same audited panel.
  expect(auditText).toContain("Reasoning audit trail");
  await expect(workbench.getByRole("button", { name: /inspect/i })).toBeVisible();

  // Closing the panel removes the audit from the accessible tree rather than
  // merely hiding it, matching the toggle's own aria-expanded contract.
  await workbench.getByRole("button", { name: "Close verification" }).click();
  await expect(workbench.getByText("Verification result")).not.toBeVisible();
});
