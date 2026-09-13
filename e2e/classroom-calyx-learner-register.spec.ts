import { expect, test } from "@playwright/test";

/**
 * Classroom investigation -> Calyx, through the mounted production bundle and
 * the running reference backend.
 *
 * This proves the frontend/backend contract and learner-register boundary. It
 * is deliberately not evidence about a deployed backend: the reference server
 * is provider-free, process-local, and contains no scientific findings.
 */
test("Calyx answers the learner question without receiving the learner's findings", async ({ page }) => {
  const subject = "Phalaenopsis amabilis";
  const question = "Does night temperature affect flowering time in this taxon?";
  const privateDraftMarkers = {
    observation: "PRIVATE OBSERVATION MUST NOT TRAVEL",
    hypothesis: "PRIVATE HYPOTHESIS MUST NOT TRAVEL",
    conclusion: "PRIVATE CONCLUSION MUST NOT TRAVEL",
  };

  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === "localhost" ? route.continue() : route.abort();
  });

  await page.goto("/classroom/investigation", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Taxon or subject").fill(subject);
  await page.getByLabel("1. Observe").fill(privateDraftMarkers.observation);
  await page.getByLabel("2. Question").fill(question);
  await page.getByLabel("3. Hypothesize").fill(privateDraftMarkers.hypothesis);
  await page.getByLabel("7. Conclude").fill(privateDraftMarkers.conclusion);

  const askCalyx = page.getByRole("link", { name: "Ask Calyx" });
  await expect(askCalyx).toBeVisible();
  const href = await askCalyx.getAttribute("href");
  expect(href).toBeTruthy();

  const carried = new URL(href!, "http://127.0.0.1");
  expect(carried.pathname).toBe("/calyx");
  expect(carried.searchParams.get("taxon")).toBe(subject);
  expect(carried.searchParams.get("question")).toBe(question);
  expect(carried.searchParams.get("context_is_evidence")).toBe("false");
  expect(carried.searchParams.get("context_is_learner_draft")).toBe("true");
  expect(carried.searchParams.get("question_is_evidence")).toBe("false");
  for (const marker of Object.values(privateDraftMarkers)) expect(href).not.toContain(marker);

  await askCalyx.click();

  const disclosure = page.getByLabel("Classroom investigation context");
  await expect(disclosure).toBeVisible();
  await expect(disclosure).toContainText(subject);
  await expect(disclosure).toContainText("learner's working draft");
  await expect(disclosure).toContainText("hypothesis, observations and conclusion did not travel");
  await expect(disclosure).toContainText("Nothing said here enters the Continuum's scientific record");

  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      /\/api\/calyx\/speak\/conversations\/[^/]+\/turns$/.test(new URL(request.url()).pathname),
  );
  await page.getByLabel("Message Calyx").fill(question);
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const request = await requestPromise;
  const turn = request.postDataJSON() as {
    message: string;
    context: { route_context?: Record<string, unknown> };
  };
  expect(turn.message).toBe(question);
  expect(turn.context.route_context).toEqual({
    origin: "classroom-investigation",
    featured_taxon: { rank: "genus", accepted_name: "Phalaenopsis" },
    context_is_evidence: false,
    context_is_learner_draft: true,
    taxon: subject,
    taxon_source: "classroom-investigation",
    taxon_is_evidence: false,
    question,
    question_source: "user",
    question_is_evidence: false,
  });
  expect(JSON.stringify(turn)).not.toContain(privateDraftMarkers.observation);
  expect(JSON.stringify(turn)).not.toContain(privateDraftMarkers.hypothesis);
  expect(JSON.stringify(turn)).not.toContain(privateDraftMarkers.conclusion);

  await expect(page.getByText(question, { exact: true })).toBeVisible();
  await expect(page.getByText(/The corpus holds nothing that addresses this question, so no conclusion is offered/i)).toBeVisible();
  await page.getByText(/Research details · mission/i).click();
  await expect(page.getByText(/No conclusion is offered, because none is supported/i)).toBeVisible();
  await expect(disclosure).toBeVisible();
});
