import { readFileSync } from "node:fs";

import { expect, test, type Browser, type Page } from "@playwright/test";

const member = JSON.parse(
  readFileSync(new URL("../src/lib/__fixtures__/matrixIdentification.memberBackend.json", import.meta.url), "utf8"),
);

/**
 * R1 J4: a signed-in member identifies an orchid with their own Matrix session.
 *
 * Production bundle against the local REFERENCE BACKEND (fixture) — not live
 * or production evidence. With a member bearer, e2e/support/reference-backend.mjs
 * replays REAL member-shaped responses captured from orchid-calyx-backend
 * running locally (fixture `_meta.backend_sha`), for a SYNTHETIC registry
 * ("Fixture taxon A/B/C": invented states and provenance, not claims about any
 * orchid). It keeps sessions private to the account that created them and
 * answers every owner-only Matrix route with the captured 403.
 *
 * The anonymous refusal is the real backend's 401 body from the capture,
 * fulfilled by the spec (the reference backend keeps answering anonymous
 * requests owner-shaped so the owner journeys in matrix-guided-session.spec.ts
 * are unchanged).
 */

const APP_ORIGIN = process.env.E2E_APP_URL || "http://127.0.0.1:4173";
const CORS = { "access-control-allow-origin": APP_ORIGIN, "access-control-allow-credentials": "true" };
const MATRIX = "/api/matrix-identification";

type Seen = { method: string; path: string; authorization: string | null; body: unknown };

async function localOnly(page: Page) {
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === "localhost" ? route.continue() : route.abort("blockedbyclient");
  });
}

/** Record every Calyx request the page makes (method, path, Authorization, body). */
function watch(page: Page): Seen[] {
  const seen: Seen[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return;
    if (request.method() === "OPTIONS") return;
    seen.push({
      method: request.method(),
      path: url.pathname,
      authorization: request.headers().authorization ?? null,
      body: request.postDataJSON?.() ?? null,
    });
  });
  return seen;
}

async function signUpInModal(page: Page, email: string) {
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "Create an account", exact: true }).click();
  await modal.getByPlaceholder("you@orchidcontinuum.org").fill(email);
  await modal.getByPlaceholder("••••••••").fill("a-throwaway-password-1");
  await modal.getByRole("button", { name: /^create account$/i }).last().click();
  await expect(modal).toBeHidden({ timeout: 20_000 });
}

async function memberPage(browser: Browser, label: string) {
  const page = await browser.newPage();
  await localOnly(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  await signUpInModal(page, `matrix-member-${label}-${Date.now()}@acceptance.test`);
  await expect(page.getByTestId("account-menu")).toBeVisible({ timeout: 20_000 });
  return page;
}

function candidate(page: Page, name: string) {
  return page.getByTestId("matrix-candidate").filter({ has: page.getByRole("heading", { name, exact: true }) });
}

test("anonymous visitor is asked to sign in, signs in from the Matrix page, and the member registry loads", async ({ page }) => {
  await localOnly(page);
  const seen = watch(page);
  // The real backend's anonymous 401 (CAPTURED) for any request without a bearer.
  await page.route(new RegExp(`${MATRIX}/registry$`), (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS" || request.headers().authorization) return route.fallback();
    return route.fulfill({ status: member.anon_registry_list.status, contentType: "application/json", headers: CORS, body: JSON.stringify(member.anon_registry_list.body) });
  });
  await page.goto("/orchid-identification", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("matrix-status-message")).toHaveText(
    "Sign in to use Matrix identification. It is available to signed-in members.",
  );
  await expect(page.getByText("sign in", { exact: true })).toBeVisible();
  await expect(page.getByText(/owner access/i)).toHaveCount(0);
  await expect(page.getByText(/Matrix API \d{3}/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /begin guided identification/i })).toBeDisabled();

  await page.getByTestId("matrix-sign-in").click();
  await signUpInModal(page, `matrix-anon-to-member-${Date.now()}@acceptance.test`);

  await expect(page.getByTestId("matrix-status-message")).toHaveText("Choose a governed matrix and begin.");
  await expect(page.locator("#matrix-registry")).toContainText("SYNTHETIC R1 member Matrix fixture (not a scientific claim) · 1");
  const registryReads = seen.filter((item) => item.path === `${MATRIX}/registry`);
  expect(registryReads[0].authorization).toBeNull();
  expect(registryReads.at(-1)?.authorization).toMatch(/^Bearer at_/);
});

test("a signed-in member runs their own session to a ranking and an explanation; owner-only panels say so", async ({ browser }) => {
  const page = await memberPage(browser, "a");
  const seen = watch(page);
  await page.goto("/orchid-identification", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("matrix-status-message")).toHaveText("Choose a governed matrix and begin.");
  await page.getByRole("button", { name: /begin guided identification/i }).click();

  await expect(page.getByRole("heading", { name: "Spur length", level: 2 })).toBeVisible();
  await expect(page.getByTestId("matrix-session-private")).toHaveText("Your session · private to your account");
  await page.getByLabel("Your observation").fill("25");
  await page.getByLabel("How certain are you?").selectOption("certain");
  await page.getByRole("button", { name: "Record observation" }).click();

  // The Matrix's next character is withheld from the member view (real
  // backend privacy screen): it cannot be answered; another one can.
  await expect(page.getByTestId("matrix-next-withheld")).toContainText("withheld from the member view");
  await expect(page.getByLabel("Your observation")).toHaveCount(0);
  await page.getByLabel("Answer another character instead").selectOption("flower_color");
  await expect(page.getByRole("heading", { name: "Flower color", level: 2 })).toBeVisible();
  await page.getByLabel("Your observation").fill("white");
  await page.getByLabel("How certain are you?").selectOption("probable");
  await page.getByRole("button", { name: "Record observation" }).click();

  await expect(page.getByTestId("matrix-ranking-basis")).toHaveText("2 observations recorded · 2 used for ranking");
  await expect(page.getByTestId("matrix-candidate").getByRole("heading")).toHaveText([
    "Fixture taxon A",
    "Fixture taxon C",
    "Fixture taxon B",
  ]);
  await expect(candidate(page, "Fixture taxon A").getByTestId("matrix-candidate-score")).toHaveText("100%");
  await expect(candidate(page, "Fixture taxon C").getByTestId("matrix-candidate-score")).toHaveText("80%");
  await expect(candidate(page, "Fixture taxon A").getByTestId("matrix-candidate-provenance"))
    .toContainText("source: SYNTHETIC R1 fixture · citation: synthetic-fixture-a");
  const taxonB = candidate(page, "Fixture taxon B");
  await taxonB.getByText("Character evidence").click();
  await expect(taxonB.getByTestId("matrix-character-flower_color")).toContainText("withheld (not shown in the member view)");

  await expect(page.getByTestId("matrix-vision-owner-only")).toContainText("This view is limited to owner access.");
  await expect(page.getByTestId("matrix-feedback-owner-only")).toContainText("This view is limited to owner access.");
  await expect(page.getByRole("button", { name: /freeze evidence report/i })).toHaveCount(0);

  await page.getByRole("button", { name: "Explain the identification so far" }).click();
  await expect(page.getByText("The current leading candidate is Fixture taxon A based on the supplied Matrix evidence.", { exact: false })).toBeVisible();
  await expect(page.getByTestId("calyx-explanation-provenance"))
    .toContainText("Produced by matrix-deterministic-governed (calyx-matrix-explanation-v1) · explanation not evidence");
  await expect(page.locator("body")).not.toContainText(/SYNTHETIC-(LOCALITY|SITE)/);

  const matrix = seen.filter((item) => item.path.startsWith(`${MATRIX}/`));
  for (const item of matrix) expect(item.authorization, `${item.method} ${item.path}`).toMatch(/^Bearer at_/);
  expect(matrix.some((item) => /vision|reports|persistence/.test(item.path))).toBe(false);
  expect(seen.some((item) => item.path.startsWith("/api/evidence-feedback"))).toBe(false);
  expect(matrix.filter((item) => item.path.endsWith("/observations")).map((item) => item.body)).toEqual([
    member.observe1.request.body,
    member.observe2.request.body,
  ]);
  expect(JSON.stringify(matrix.map((item) => item.body))).not.toContain("withheld");

  // Member B cannot open member A's session: private to its creator (404).
  const sessionPath = matrix.find((item) => /\/sessions\/[0-9a-f-]{36}\/evaluate$/.test(item.path))!.path.replace(/\/evaluate$/, "");
  const other = await memberPage(browser, "b");
  const result = await other.evaluate(async ({ path, base }) => {
    const key = Object.keys(localStorage).find((item) => /^sb-.*-auth-token$/.test(item));
    const token = key ? JSON.parse(localStorage.getItem(key) ?? "{}").access_token : null;
    const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json(), hadToken: Boolean(token) };
  }, { path: sessionPath, base: process.env.REFERENCE_BACKEND_URL || "http://127.0.0.1:8791" });
  expect(result.hadToken).toBe(true);
  expect(result.status).toBe(404);
  expect(JSON.stringify(result.body)).toContain("identification session not found");
  await other.close();
  await page.close();
});

test("member verification unavailable (CAPTURED 503) is a retryable state, not an owner or sign-in message", async ({ browser }) => {
  const page = await memberPage(browser, "c");
  let refused = 0;
  await page.route(new RegExp(`${MATRIX}/registry$`), (route) => {
    if (route.request().method() === "OPTIONS" || refused > 0) return route.fallback();
    refused += 1;
    return route.fulfill({ status: member.identity_down_registry_list.status, contentType: "application/json", headers: CORS, body: JSON.stringify(member.identity_down_registry_list.body) });
  });
  await page.goto("/orchid-identification", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("matrix-status-message")).toHaveText("Member verification is temporarily unavailable — try again.");
  await expect(page.getByText(/owner access|MEMBER_AUTH/)).toHaveCount(0);
  await page.getByRole("button", { name: /try again/i }).click();
  await expect(page.getByTestId("matrix-status-message")).toHaveText("Choose a governed matrix and begin.");
  expect(refused).toBe(1);
  await page.close();
});
