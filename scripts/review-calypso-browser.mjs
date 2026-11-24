// Local-only smoke test against the repository's in-memory identity backend.
import { chromium, expect } from "@playwright/test";
const origin = "http://127.0.0.1:4173";
const identity = "http://127.0.0.1:8791";
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH });
try {
  const page = await browser.newPage();
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    return [origin, identity].includes(url.origin) ? route.continue() : route.abort();
  });
  await page.goto(origin + "/paperbotanica?lab=calypso");
  await expect(page.getByRole("button", { name: "Sign in to continue" })).toBeVisible();
  const response = await fetch(identity + "/auth/v1/signup", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:`review-${Date.now()}@example.invalid`,password:"local-fixture"})});
  if (!response.ok) throw Error("Local reference signup failed");
  await page.evaluate(session => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)), await response.json());
  await page.reload();
  await expect(page.locator("canvas")).toBeVisible({ timeout:15000 });
  await page.getByLabel("Organ", {exact:true}).selectOption("LAB");
  await page.getByRole("slider", {name:/Educational length/}).fill("1.2");
  await expect(page.getByText(/Educational length experiment · 21.6 mm/)).toBeVisible();
  await expect(page.getByText(/Projected lip to dorsal reach/)).toHaveCount(0);
  await page.getByRole("button",{name:"Reveal historical illustration"}).click();
  await expect(page.getByText(/figure 1 1.13/)).toBeVisible();
  console.log("Passed restricted route, local identity, GLB parse, organ selection, experiment and reference reveal.");
} finally {
  await browser.close();
}
