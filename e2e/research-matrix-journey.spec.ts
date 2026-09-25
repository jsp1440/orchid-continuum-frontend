import { expect, test, type Page } from "@playwright/test";

/**
 * Provider-free browser acceptance for completion-graph leaf
 * gate-journey-research-matrix / issue #660.
 *
 * This runs the production bundle against the local reference backend. It
 * proves route/context continuity only; it does not assert deployed service
 * readiness and it does not create scientific evidence.
 */

const PROJECT = "project-phal-browser";
const ACCOUNT = {
  email: `research-matrix-${Date.now()}@acceptance.test`,
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
});

test.afterAll(async () => {
  await page?.close();
});

test("persisted Research Station project continues into Matrix and returns to the same project", async () => {
  await signIn();
  await visit(`/research?project=${PROJECT}`);

  await expect(
    page.getByText("Phalaenopsis evidence decision — browser fixture"),
  ).toBeVisible({ timeout: 20_000 });

  const matrix = page.getByRole("link", { name: "Matrix" }).first();
  await expect(matrix).toBeVisible();

  const href = await matrix.getAttribute("href");
  expect(href).toBeTruthy();
  const handoff = new URL(href!, "http://127.0.0.1");
  expect(handoff.pathname).toBe("/orchid-identification");
  expect(handoff.searchParams.get("project")).toBe(PROJECT);
  expect(handoff.searchParams.get("origin")).toBe("research-station");

  const subject = handoff.searchParams.get("taxon");
  expect(subject).toBeTruthy();

  await matrix.click();
  await expect(page).toHaveURL(/\/orchid-identification\?/);
  await expect(page.getByText("Continuing from the Research Station")).toBeVisible();
  await expect(page.getByText(subject!, { exact: true })).toBeVisible();

  const back = page.getByRole("link", { name: "Return to the Research Station" });
  await expect(back).toHaveAttribute("href", `/research?project=${PROJECT}`);

  const banner = page.locator("section").filter({ hasText: "Continuing from the Research Station" }).first();
  await expect(banner).toContainText(/bounded navigation context/i);
  await expect(banner).toContainText(/not observed, identified or verified/i);

  await back.click();
  await expect(page).toHaveURL(new RegExp(`/research\\?project=${PROJECT}$`));
  await expect(
    page.getByText("Phalaenopsis evidence decision — browser fixture"),
  ).toBeVisible({ timeout: 20_000 });
});

test("malformed project identity degrades without discarding a valid bounded subject", async () => {
  const subject = "Phalaenopsis";
  await visit(
    `/orchid-identification?taxon=${encodeURIComponent(subject)}&project=%3Cbad%3E&origin=research-station`,
  );

  await expect(page.getByText("Continuing from the Research Station")).toBeVisible();
  await expect(page.getByText(subject, { exact: true })).toBeVisible();

  const back = page.getByRole("link", { name: "Return to the Research Station" });
  await expect(back).toHaveAttribute("href", "/research");
  await expect(page.locator("section").filter({ hasText: "Continuing from the Research Station" }).first())
    .toContainText(/bounded navigation context/i);
});
