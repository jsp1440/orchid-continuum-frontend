import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

/**
 * Mounted Brain #103 / frontend #551 acceptance path.
 *
 * WHAT THIS PROVES: a signed-in reader can traverse the production frontend
 * bundle from a persisted Research Station project through governed planning,
 * multi-class evidence readiness, comparison, Scientific Synthesis,
 * Verification Workbench, immutable run manifest, cited review export, and the
 * proposal-only Candidate Knowledge handoff.
 *
 * WHAT THIS DOES NOT PROVE: any botanical claim or any deployed service. Every
 * datum comes from the explicitly fictional local reference backend. Network
 * access is restricted to localhost and the run invokes no model provider.
 */

const ACCOUNT = {
  email: `research-station-${Date.now()}@acceptance.test`,
  password: "a-throwaway-password-1",
};

let page: Page;

async function visit(path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

async function signIn() {
  await visit("/");
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "Create an account", exact: true }).click();
  await modal.getByPlaceholder("you@orchidcontinuum.org").fill(ACCOUNT.email);
  await modal.getByPlaceholder("••••••••").fill(ACCOUNT.password);
  await modal.getByRole("button", { name: /^create account$/i }).last().click();
  await expect(modal).toBeHidden({ timeout: 20_000 });
  await expect(page.getByTestId("account-menu")).toBeVisible({ timeout: 20_000 });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === "localhost"
      ? route.continue()
      : route.abort("blockedbyclient");
  });
  page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
});

test.afterAll(async () => {
  await page?.close();
});

test("the complete evidence-to-review path is executable without publication or mutation", async () => {
  await signIn();
  await visit("/research");

  await expect(page.getByText("Phalaenopsis evidence decision — browser fixture")).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByText(
      "Which recorded evidence distinguishes cool-growing from warm-growing Phalaenopsis?",
    ).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Synthesize this investigation" }).click();

  const synthesis = page.getByTestId("scientific-synthesis");
  await expect(synthesis).toBeVisible({ timeout: 30_000 });
  const body = page.locator("body");
  await expect(body).toContainText("Governed research plan");
  await expect(body).toContainText("Source budget 6");
  await expect(body).toContainText("Ready for review");
  await expect(body).toContainText("2/2");
  await expect(body).toContainText("trait observation");
  await expect(body).toContainText("measurement aggregate");

  const comparison = page.getByTestId("evidence-comparison");
  await expect(comparison).toContainText("2 supporting · 0 contradicting");
  await expect(comparison).toContainText("1 supporting · 1 contradicting");
  await expect(comparison).toContainText("literature, measurement_aggregate");
  await expect(body).toContainText("live evidence remains unavailable");

  const verification = page.getByTestId("calyx-verification-workbench");
  await expect(verification).toBeVisible();
  await verification.getByRole("button", { name: "Check Calyx" }).click();
  await expect(verification).toContainText(/Contested evidence|Provisional — review required/);
  await expect(verification).toContainText("Automatic publication is disabled");

  await page.getByRole("button", { name: "Build run manifest" }).click();
  await expect(body).toContainText("Run manifest", { timeout: 20_000 });
  await expect(body).toContainText("Human review required");
  await expect(body).toContainText("Immutable");
  await expect(body).toContainText("Contradictions preserved");
  await expect(body).toContainText("Ready for human review");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export cited review packet" }).click();
  const download = await downloadPromise;
  const reviewPacket = await readFile(await download.path(), "utf8");
  expect(reviewPacket).toContain("# Orchid Continuum scientific review packet");
  expect(reviewPacket).toContain("HUMAN REVIEW REQUIRED");
  expect(reviewPacket).toContain("Verification state: ready_for_review");
  expect(reviewPacket).toMatch(/Immutable run fingerprint: [0-9a-f]{64}/);
  expect(reviewPacket).toContain("Taxonomy snapshot: world-plants:2.1.2026");
  expect(reviewPacket).toContain("Coverage: contested");
  expect(reviewPacket).toContain("Live literature retrieval is unavailable");
  expect(reviewPacket).toContain("DOI: 10.0000/orchid.fixture.1");
  expect(reviewPacket).toContain("Automatic scientific publication allowed: no");
  expect(reviewPacket).toContain("Canonical knowledge mutation allowed: no");
  expect(reviewPacket).toContain("Knowledge Graph handoff remains proposal-only");

  await page.getByRole("button", { name: "Prepare candidate proposal" }).click();
  const proposal = page.getByTestId("candidate-proposal-ready");
  await expect(proposal).toBeVisible({ timeout: 20_000 });
  await expect(proposal).toContainText("owner submission required");
  await expect(proposal).toContainText("No candidate persisted");
  await expect(proposal).toContainText("No automatic approval");
  await expect(proposal).toContainText("No scientific publication");
  await expect(proposal).toContainText("No canonical or Knowledge Graph mutation");
});
