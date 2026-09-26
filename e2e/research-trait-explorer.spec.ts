import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Research Station Trait Explorer, end to end in the production bundle.
 *
 * WHAT THIS PROVES: a signed-in reader passes ProtectedRoute on `/research`,
 * asks the Trait Explorer for a subject, and the page renders the evidence
 * state the backend reported — AVAILABLE values with their provenance, a
 * WITHHELD trait with nothing disclosed, and UNAVAILABLE and ABSENT results
 * as distinct non-findings — without inventing a value, count, zero or source.
 * A backend failure or a body outside the contract leaves no trait data on the
 * page.
 *
 * WHERE THE DATA COMES FROM: every 200 body is a verbatim FastAPI TestClient
 * capture of backend `GET /api/research/traits` (see the provenance note on
 * `researchTraitsRoute` in e2e/support/reference-backend.mjs). The 401 and 500
 * bodies are backend captures too; only the `malformed` body is synthetic.
 *
 * WHAT THIS DOES NOT PROVE: any botanical claim, or anything about a deployed
 * service. The captured rows are the backend test suite's fixture rows, and
 * the backend here is the local reference backend.
 */

const BACKEND = process.env.REFERENCE_BACKEND_URL || "http://127.0.0.1:8791";

const ACCOUNT = {
  email: `trait-explorer-${Date.now()}@acceptance.test`,
  password: "a-throwaway-password-1",
};

type Scenario = {
  genus?: "unavailable_genus" | "absent_genus";
  failure?: null | "unauthenticated" | "server_error" | "malformed";
};

const GENERIC_FAILURE =
  "Trait data is unavailable for this request. Try again when the research service is available; missing data is not a zero or biological absence.";

let page: Page;

async function scenario(next: Scenario) {
  const response = await fetch(`${BACKEND}/__reference/research-traits`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ failure: null, ...next }),
  });
  expect(response.status, "reference backend accepted the trait scenario").toBe(200);
}

async function signIn() {
  await page.goto("/", { waitUntil: "domcontentloaded" });
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

function explorer(): Locator {
  return page.getByRole("region", { name: "Trait Explorer" });
}

async function retrieve(rank: "genus" | "species", name: string) {
  const section = explorer();
  await section.getByLabel("Scope").selectOption(rank);
  await section.getByLabel("Scientific name").fill(name);
  const response = page.waitForResponse((r) => r.url().includes("/api/research/traits?"));
  await section.getByRole("button", { name: "Retrieve traits" }).click();
  await response;
}

/** Nothing on the page may look like a trait record after a non-finding. */
async function expectNoTraitRecords(section: Locator) {
  await expect(section.locator("article")).toHaveCount(0);
  await expect(section.locator("table")).toHaveCount(0);
  await expect(section).not.toContainText("Evidence state:");
  await expect(section).not.toContainText("Recorded count");
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
  await scenario({ genus: "unavailable_genus", failure: null });
});

test.afterAll(async () => {
  await scenario({ genus: "unavailable_genus", failure: null }).catch(() => undefined);
  await page?.close();
});

test("the Research Center is behind ProtectedRoute until the reader signs in", async () => {
  await page.goto("/research", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Research Center · members only")).toBeVisible({ timeout: 20_000 });
  await expect(explorer()).toHaveCount(0);

  await signIn();
  await page.goto("/research", { waitUntil: "domcontentloaded" });
  await expect(explorer()).toBeVisible({ timeout: 20_000 });
  await expect(explorer()).toContainText("Choose a subject, then retrieve its recorded traits.");
});

test("AVAILABLE: captured values render with provenance; unknown counts stay UNKNOWN", async () => {
  await retrieve("species", "Cattleya purpurata");
  const section = explorer();
  await expect(section.getByRole("status")).toHaveText("Cattleya purpurata · species · AVAILABLE");
  await expect(section).toContainText("Snapshot: 2026-09-25T14:52:36.887551+00:00.");

  const records = section.locator("article");
  await expect(records).toHaveCount(3);

  const width = records.filter({ has: page.getByRole("heading", { name: "flower width" }) });
  await expect(width).toContainText("Evidence state: AVAILABLE · Units: mm");
  await expect(width).toContainText("Sample size: 3 · Confidence: not supplied");
  await expect(width.locator("tbody tr")).toHaveCount(1);
  await expect(width.locator("tbody tr").nth(0).locator("td")).toHaveText(["42", "3"]);
  await width.getByText("Provenance · inspect sources").click();
  await expect(width).toContainText("Source ID: oc_views.trait_resolved_v4");
  await expect(width).toContainText("Record: r-3");
  await expect(width).toContainText("Source: not supplied");
  await expect(width).toContainText("License: not supplied");
  await expect(width).toContainText("Source link not supplied.");
  await expect(width.getByRole("link")).toHaveCount(0);

  const growth = records.filter({ has: page.getByRole("heading", { name: "growth form" }) });
  await expect(growth).toContainText("Evidence state: VERIFIED · Units: not supplied");
  // sample_size is null in the capture: it must not be summed to 4 or shown as 0.
  await expect(growth).toContainText("Sample size: UNKNOWN · Confidence: 0.7");
  const rows = growth.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator("td")).toHaveText(["epiphyte", "4"]);
  await expect(rows.nth(1).locator("td")).toHaveText(["terrestrial", "UNKNOWN"]);
  await growth.getByText("Provenance · inspect sources").click();
  await expect(growth).toContainText("Source: EOL TraitBank");
  await expect(growth).toContainText("Record: r-1");
  await expect(growth).toContainText("Record: r-2");
  await expect(growth).toContainText("Retrieved: 2026-09-01");
  await expect(growth).toContainText("License: CC-BY-4.0");
  // Only r-1 carried a usable URL; the backend dropped r-2's credentialed one.
  const links = growth.getByRole("link", { name: "Open source (new tab)" });
  await expect(links).toHaveCount(1);
  await expect(links).toHaveAttribute("href", "https://example.org/records/r-1");
  await expect(links).toHaveAttribute("rel", "noopener noreferrer");
  await expect(growth).toContainText("Source link not supplied.");

  const scent = records.filter({ has: page.getByRole("heading", { name: "scent class" }) });
  await expect(scent).toContainText("Evidence state: WITHHELD · Units: not supplied");
  await expect(scent).toContainText("Sample size: UNKNOWN · Confidence: not supplied");
  await expect(scent.locator("table")).toHaveCount(0);
  await expect(scent).toContainText("No distribution values supplied. This is not a biological absence claim.");
  await expect(scent).toContainText("Provenance · not supplied");

  // The backend rows behind the WITHHELD group held a value, a restricted
  // source, a private record and coordinates. None may reach the page.
  for (const leaked of ["floral", "restricted", "private-1", "p-1", "-12.5", "-70.1", "secret"]) {
    await expect(section).not.toContainText(leaked);
  }
});

test("UNAVAILABLE: a non-finding with no snapshot, no records and no inferred zero", async () => {
  await scenario({ genus: "unavailable_genus" });
  await retrieve("genus", "Cattleya");
  const section = explorer();
  await expect(section.getByRole("status")).toHaveText("Cattleya · genus · UNAVAILABLE");
  await expect(section).toContainText("Snapshot: not supplied.");
  await expect(section).toContainText(
    "Trait records are unavailable for this response. No biological absence or zero count is inferred.",
  );
  await expect(section).not.toContainText("The service returned no trait records for this subject.");
  await expectNoTraitRecords(section);
});

test("ABSENT: distinct from UNAVAILABLE, and still not a biological absence", async () => {
  await scenario({ genus: "absent_genus" });
  await retrieve("genus", "Cattleya");
  const section = explorer();
  await expect(section.getByRole("status")).toHaveText("Cattleya · genus · ABSENT");
  await expect(section).toContainText("Snapshot: 2026-09-25T14:52:36.901556+00:00.");
  await expect(section).toContainText(
    "The service returned no trait records for this subject. No biological absence or zero count is inferred.",
  );
  await expect(section).not.toContainText("Trait records are unavailable for this response.");
  await expectNoTraitRecords(section);
});

test("a backend error fails closed and clears the records that were on screen", async () => {
  await scenario({ genus: "absent_genus", failure: null });
  await retrieve("species", "Cattleya purpurata");
  await expect(explorer().locator("article")).toHaveCount(3);

  // Same subject, same form: only the backend changes, so any record left
  // behind would be stale data presented as the answer.
  await scenario({ genus: "absent_genus", failure: "server_error" });
  const section = explorer();
  const response = page.waitForResponse((r) => r.url().includes("/api/research/traits?"));
  await section.getByRole("button", { name: "Retrieve traits" }).click();
  expect((await response).status()).toBe(500);
  await expect(section.getByRole("status")).toHaveText(GENERIC_FAILURE);
  await expect(section).not.toContainText("Snapshot:");
  await expect(section).not.toContainText("AVAILABLE");
  await expectNoTraitRecords(section);
});

test("a body outside the contract is refused rather than partially rendered", async () => {
  await scenario({ genus: "absent_genus", failure: "malformed" });
  await retrieve("genus", "Cattleya");
  const section = explorer();
  await expect(section.getByRole("status")).toHaveText(GENERIC_FAILURE);
  await expect(section).not.toContainText("Snapshot:");
  await expect(section).not.toContainText("ABSENT");
  await expectNoTraitRecords(section);
});

test("a 401 from the research service asks for sign-in and loads nothing", async () => {
  await scenario({ genus: "absent_genus", failure: "unauthenticated" });
  await retrieve("genus", "Cattleya");
  const section = explorer();
  await expect(section.getByRole("status")).toHaveText(
    "Sign in to retrieve trait data. No trait records have been loaded.",
  );
  await expectNoTraitRecords(section);
});
