import { expect, test, type Page, type Request, type Route } from "@playwright/test";

/**
 * Guided Matrix identification, end to end in a real browser.
 *
 * Route `/orchid-identification` (OrchidIdentificationContinuum ->
 * OrchidIdentificationNext) against the production bundle and the local
 * reference backend. This is REFERENCE-BACKEND evidence only: it says the
 * frontend drives and renders a governed Matrix session correctly. It is not
 * live or production evidence, and it asserts nothing about any orchid.
 *
 * What comes from where:
 *
 * - `GET /api/matrix-identification/registry` is answered by
 *   e2e/support/reference-backend.mjs itself (`reference-orchid-matrix`
 *   · `fixture-v1`). The spec checks that it really came from there.
 * - The reference backend has no session handlers yet (create, observations,
 *   evaluate, explain, registry detail). Those responses are replayed below
 *   from payloads CAPTURED from the real orchid-calyx-backend routers
 *   (origin/main: app/routers/matrix_identification_session.py,
 *   matrix_identification_explanation.py, matrix_identification_registry.py)
 *   through FastAPI TestClient. Only the owner-auth dependency was overridden
 *   for the capture; every body is exactly what the routers emitted.
 * - The registry used for the capture is SYNTHETIC: three "Fixture taxon"
 *   candidates whose states and provenance are invented test shapes, bound to
 *   the same registry id/version the reference backend lists. Nothing in it is
 *   a claim about Phalaenopsis. One candidate carries a synthetic
 *   `locality` provenance token so the spec can prove locality never renders.
 * - The fail-closed case replays the backend's real 503 for a session store
 *   that was asked to be durable without a database
 *   (`MATRIX_SESSION_PERSISTENCE_UNAVAILABLE`).
 *
 * - Two further cases send SYNTHETIC malformed 2xx evaluate bodies (labelled
 *   where they are defined) to prove the page fails closed on them too.
 *
 * Capture sequence (one session): create -> evaluate -> observe
 * petal_length_mm = 25 (certain) -> evaluate -> observe flower_color = "white"
 * (unknown) -> evaluate -> explain {audience: beginner, focus: summary}.
 */

const REFERENCE_BACKEND = "http://127.0.0.1:8791";
const SESSION_PATH = /\/api\/matrix-identification\/sessions(?:\/([^/]+)(?:\/(observations|evaluate|explain))?)?$/;
const REGISTRY_DETAIL_PATH = /\/api\/matrix-identification\/registry\/([^/]+)\/([^/]+)$/;
const LOCALITY_TOKEN = "SYNTHETIC-LOCALITY-MUST-NOT-RENDER";

type Captured = { status: number; body: unknown };
type Sent = { method: string; path: string; body: Record<string, unknown> | null };

function isLocal(request: Request): boolean {
  const host = new URL(request.url()).hostname;
  return host === "127.0.0.1" || host === "localhost";
}

function fulfill(route: Route, captured: Captured) {
  return route.fulfill({
    status: captured.status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "http://127.0.0.1:4173", "access-control-allow-credentials": "true" },
    body: JSON.stringify(captured.body),
  });
}

/** Keep every request on this machine; nothing may reach a hosted service. */
async function localOnly(page: Page) {
  await page.route("**/*", (route) => (isLocal(route.request()) ? route.continue() : route.abort("blockedbyclient")));
}

/**
 * Replays the captured session in order. Each observation advances the
 * replay; evaluate always answers for the observations recorded so far, so a
 * frontend that skipped or duplicated a request would render the wrong state.
 */
async function replayCapturedSession(page: Page, sent: Sent[]) {
  let observed = 0;
  const evaluations = [CAPTURED.evaluate0, CAPTURED.evaluate1, CAPTURED.evaluate2];
  const observations = [CAPTURED.observe1, CAPTURED.observe2];

  await page.route(REGISTRY_DETAIL_PATH, (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    return fulfill(route, CAPTURED.registryDetail);
  });
  await page.route(SESSION_PATH, (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fallback();
    const path = new URL(request.url()).pathname;
    const match = SESSION_PATH.exec(path);
    const sessionSegment = match?.[1];
    // persistence-status / persistence-preflight belong to the reference backend.
    if (sessionSegment && !match?.[2]) return route.fallback();
    sent.push({ method: request.method(), path, body: request.postDataJSON() as Record<string, unknown> | null });
    const action = match?.[2];
    if (!sessionSegment) return fulfill(route, CAPTURED.create);
    if (decodeURIComponent(sessionSegment) !== CAPTURED_SESSION_ID) {
      return fulfill(route, { status: 404, body: { detail: "session not found" } });
    }
    if (action === "observations") {
      const next = observations[observed];
      if (!next) return fulfill(route, { status: 409, body: { detail: "replay exhausted" } });
      observed += 1;
      return fulfill(route, next);
    }
    if (action === "evaluate") return fulfill(route, evaluations[observed]);
    return fulfill(route, CAPTURED.explain2);
  });
}

async function openMatrix(page: Page) {
  const registry = page.waitForResponse((response) =>
    response.url() === `${REFERENCE_BACKEND}/api/matrix-identification/registry` && response.request().method() === "GET",
  );
  await page.goto("/orchid-identification", { waitUntil: "domcontentloaded" });
  const response = await registry;
  // The registry listing is the reference backend's own handler, not a replay.
  expect(response.status()).toBe(200);
  expect((await response.json()).versions[0]).toMatchObject({
    registry_id: "reference-orchid-matrix",
    version: "fixture-v1",
  });
  await expect(page.getByText("Choose a governed matrix and begin.")).toBeVisible();
}

function candidate(page: Page, name: string) {
  return page.getByTestId("matrix-candidate").filter({ has: page.getByRole("heading", { name, exact: true }) });
}

test("guided Matrix session ranks candidates with basis, coverage and provenance, and keeps unknown separate", async ({ page }) => {
  const sent: Sent[] = [];
  await localOnly(page);
  await replayCapturedSession(page, sent);
  await openMatrix(page);

  await page.getByRole("button", { name: /begin guided identification/i }).click();

  // Revision 0: the Matrix asks for the most discriminating character and has
  // compared nothing yet. A score of 0 here is missing evidence, not a mismatch.
  await expect(page.getByRole("heading", { name: "Petal length", level: 2 })).toBeVisible();
  await expect(page.getByText("Revision 0", { exact: true })).toBeVisible();
  await expect(page.getByTestId("matrix-ranking-basis")).toHaveText("0 observations recorded · 0 used for ranking");
  await expect(page.getByTestId("matrix-candidate")).toHaveCount(3);
  for (const score of await page.getByTestId("matrix-candidate-score").allTextContents()) {
    expect(score).toBe("Not yet compared");
  }
  await expect(page.getByTestId("matrix-candidate-basis").first()).toContainText("missing evidence, not a mismatch");

  // Observation 1: a certain measurement.
  await page.getByLabel("Your observation").fill("25");
  await page.getByLabel("How certain are you?").selectOption("certain");
  await page.getByRole("button", { name: "Record observation" }).click();

  await expect(page.getByRole("heading", { name: "Flower color", level: 2 })).toBeVisible();
  await expect(page.getByText("Revision 1", { exact: true })).toBeVisible();
  await expect(page.getByTestId("matrix-ranking-basis")).toHaveText("1 observation recorded · 1 used for ranking");

  // Observation 2: explicitly unknown. It is recorded but must not count
  // for or against any candidate.
  await page.getByLabel("Your observation").fill("white");
  await page.getByLabel("How certain are you?").selectOption("unknown");
  await page.getByRole("button", { name: "Record observation" }).click();

  await expect(page.getByRole("heading", { name: "Lip callus shape", level: 2 })).toBeVisible();
  await expect(page.getByText("Revision 2", { exact: true })).toBeVisible();
  await expect(page.getByTestId("matrix-ranking-basis")).toHaveText(
    "2 observations recorded · 1 used for ranking (observations marked unknown are ignored, not counted against any candidate)",
  );

  // Ranked candidates, in the Matrix's order, each with its own basis.
  await expect(page.getByTestId("matrix-candidate").getByRole("heading")).toHaveText([
    "Fixture taxon A",
    "Fixture taxon C",
    "Fixture taxon B",
  ]);
  const leader = candidate(page, "Fixture taxon A");
  await expect(leader.getByTestId("matrix-candidate-score")).toHaveText("100%");
  await expect(leader.getByTestId("matrix-candidate-coverage")).toHaveText("100%");
  await expect(leader.getByTestId("matrix-candidate-basis")).toHaveText(
    "Why this rank: weighted agreement 3 of 3 compared weight; 3 of 3 observed weight could be compared. The score is ranking evidence, not a probability.",
  );
  await expect(leader.getByTestId("matrix-candidate-provenance")).toHaveText(
    "Registry evidence source: assertion id: fixture-assertion-a · source: synthetic browser-test registry; not a scientific assertion · fixture:taxon-a",
  );

  await leader.getByText("Character evidence").click();
  const ignored = leader.getByRole("heading", { name: "Ignored — you marked these unknown" }).locator("..");
  await expect(ignored.getByTestId("matrix-character-flower_color")).toContainText("ignored (observation marked unknown)");
  await expect(ignored.getByTestId("matrix-character-flower_color")).toContainText("white · unknown");
  const supporting = leader.getByRole("heading", { name: "Supporting", exact: true }).locator("..");
  await expect(supporting.getByTestId("matrix-character-petal_length_mm")).toContainText("3 of weight 3 (similarity 1)");

  // The conflicting candidate keeps full coverage but a 0% score: evidence
  // against it, not absent evidence. Its synthetic locality never renders.
  const conflicting = candidate(page, "Fixture taxon B");
  await expect(conflicting.getByTestId("matrix-candidate-score")).toHaveText("0%");
  await expect(conflicting.getByTestId("matrix-candidate-coverage")).toHaveText("100%");
  await conflicting.getByText("Character evidence").click();
  await expect(conflicting.getByTestId("matrix-character-petal_length_mm")).toContainText("conflicts");
  await expect(conflicting.getByTestId("matrix-candidate-provenance")).toContainText("assertion id: fixture-assertion-b");
  await expect(conflicting.getByTestId("matrix-candidate-provenance")).not.toContainText(/locality/i);

  await expect(page.getByText(
    "Scores are candidate-ranking evidence, not a taxonomic determination. Missing data are not treated as biological absence.",
  )).toBeVisible();

  // Calyx explains; its provenance says it is explanation, not evidence.
  await page.getByRole("button", { name: "Explain the identification so far" }).click();
  await expect(page.getByText("The current leading candidate is Fixture taxon A based on the supplied Matrix evidence.", { exact: false })).toBeVisible();
  const calyx = page.getByTestId("calyx-explanation-provenance");
  await expect(calyx).toContainText("Produced by matrix-deterministic-governed (calyx-matrix-explanation-v1) · explanation not evidence");
  await expect(calyx.getByRole("listitem")).toHaveText([
    "Fixture taxon A: supported by petal_length_mm",
    "Fixture taxon C: supported by petal_length_mm",
    "Fixture taxon B: supported by none; conflicts petal_length_mm",
  ]);
  await expect(page.getByText("Calyx explanation loaded. The Matrix ranking itself is unchanged.")).toBeVisible();

  // Expert provenance trail: registry binding and per-observation certainty.
  await page.getByText("Expert provenance trail").click();
  await expect(page.getByTestId("matrix-registry-publication-state")).toHaveText("Publication state: review required");
  await expect(page.getByText("petal length mm · certain · user observation · observed", { exact: true })).toBeVisible();
  await expect(page.getByText("flower color · unknown · user observation · observed", { exact: true })).toBeVisible();

  await expect(page.locator("body")).not.toContainText(LOCALITY_TOKEN);

  // What the browser actually sent: the value coerced to a number for a
  // numeric character, and the unknown certainty passed through unchanged.
  const writes = sent.filter((item) => item.method === "POST");
  expect(writes.map((item) => item.path.replace(CAPTURED_SESSION_ID, ":id"))).toEqual([
    "/api/matrix-identification/sessions",
    "/api/matrix-identification/sessions/:id/evaluate",
    "/api/matrix-identification/sessions/:id/observations",
    "/api/matrix-identification/sessions/:id/evaluate",
    "/api/matrix-identification/sessions/:id/observations",
    "/api/matrix-identification/sessions/:id/evaluate",
    "/api/matrix-identification/sessions/:id/explain",
  ]);
  expect(writes[0].body).toMatchObject({ registry_id: "reference-orchid-matrix", version: "fixture-v1" });
  expect(writes[2].body).toMatchObject({ character: "petal_length_mm", value: 25, certainty: "certain" });
  expect(writes[4].body).toMatchObject({ character: "flower_color", value: "white", certainty: "unknown" });
  expect(writes[6].body).toEqual({ audience: "beginner", focus: "summary" });
});

test("an unavailable Matrix session fails closed: no candidates, no next observation", async ({ page }) => {
  await localOnly(page);
  const attempts: string[] = [];
  await page.route(SESSION_PATH, (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    attempts.push(route.request().method());
    return fulfill(route, CAPTURED.failCreate);
  });
  await openMatrix(page);

  await page.getByRole("button", { name: /begin guided identification/i }).click();

  await expect(page.getByText("error", { exact: true })).toBeVisible();
  await expect(page.getByText(
    'Matrix API 503: {"code":"MATRIX_SESSION_PERSISTENCE_UNAVAILABLE","message":"MATRIX_SESSION_DATABASE_URL_REQUIRED"}',
  )).toBeVisible();
  await expect(page.getByTestId("matrix-candidate")).toHaveCount(0);
  await expect(page.getByTestId("matrix-ranking-basis")).toHaveCount(0);
  await expect(page.getByText("2 · Next observation")).toHaveCount(0);
  await expect(page.getByText(/Session ready/)).toHaveCount(0);
  // The visitor can retry; nothing pretends a session exists.
  await expect(page.getByRole("button", { name: /begin guided identification/i })).toBeEnabled();
  expect(attempts).toEqual(["POST"]);
});

test("an unreachable Matrix service fails closed rather than inventing a session", async ({ page }) => {
  await localOnly(page);
  await page.route(SESSION_PATH, (route) => (
    route.request().method() === "OPTIONS" ? route.fallback() : route.abort("connectionrefused")
  ));
  await openMatrix(page);

  await page.getByRole("button", { name: /begin guided identification/i }).click();

  await expect(page.getByText("error", { exact: true })).toBeVisible();
  await expect(page.getByTestId("matrix-candidate")).toHaveCount(0);
  await expect(page.getByText("2 · Next observation")).toHaveCount(0);
  await expect(page.getByText(/Session ready/)).toHaveCount(0);
});

/*
 * Malformed 2xx evaluations. These bodies are SYNTHETIC error shapes (no
 * backend emits them); they stand in for a proxy page or a truncated or
 * contract-drifted response. Before the client validated evaluations, the
 * first reported "Session ready" with no session behind it and the second
 * crashed the whole route into the global error screen.
 */
const MALFORMED_EVALUATIONS: Array<[string, () => string]> = [
  ["a non-JSON body", () => "<html><body>upstream proxy error</body></html>"],
  ["an evaluation without a report", () => JSON.stringify({
    session: (CAPTURED.evaluate0.body as { session: unknown }).session,
    next_observation: null,
  })],
];

for (const [label, body] of MALFORMED_EVALUATIONS) {
  test(`a 2xx evaluate response with ${label} fails closed`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    await localOnly(page);
    await page.route(SESSION_PATH, (route) => {
      const request = route.request();
      if (request.method() === "OPTIONS") return route.fallback();
      if (new URL(request.url()).pathname.endsWith("/evaluate")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "http://127.0.0.1:4173", "access-control-allow-credentials": "true" },
          body: body(),
        });
      }
      return fulfill(route, CAPTURED.create);
    });
    await openMatrix(page);

    await page.getByRole("button", { name: /begin guided identification/i }).click();

    await expect(page.getByText("error", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Matrix API (200: response was not JSON|returned a malformed evaluation)/)).toBeVisible();
    await expect(page.getByText(/Session ready/)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);
    await expect(page.getByTestId("matrix-candidate")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /begin guided identification/i })).toBeEnabled();
    expect(pageErrors).toEqual([]);
  });
}

/* ------------------------------------------------------------------------
 * Captured orchid-calyx-backend payloads (see header). Not hand-edited.
 * ---------------------------------------------------------------------- */

const CAPTURED_SESSION_ID = "ac6ca184-dd18-42b1-a4ab-71fd925d495b";

const CAPTURED: Record<
  "create" | "evaluate0" | "observe1" | "evaluate1" | "observe2" | "evaluate2" | "explain2" | "registryDetail" | "failCreate",
  Captured
> = {
  create: {"body":{"actor":"reference-owner","created_at":"2026-09-26T07:09:08.084753+00:00","latest_evaluation":null,"metadata":{"client":"orchid-continuum-frontend","input_mode":"guided"},"next_observation":null,"observations":[],"persistence_version":1,"registry":{"checksum_sha256":"a430e9b287c89869b8d4bd8ac4dd9bb784080580714dcce29e7f2d67b8036fb0","publication_state":"review_required","registry_id":"reference-orchid-matrix","scope":{"genus":"Phalaenopsis"},"version":"fixture-v1"},"revision":0,"schema_version":"matrix-identification-session/v1","session_id":"ac6ca184-dd18-42b1-a4ab-71fd925d495b","status":"active","updated_at":"2026-09-26T07:09:08.084753+00:00"},"status":200},
  evaluate0: {"body":{"next_observation":{"candidate_count":3,"candidate_coverage":1.0,"character":"petal_length_mm","concept_id":null,"description":"Synthetic test character.","distinct_state_count":3,"explanation_boundary":"Calyx may explain this recommendation but may not alter the selected character without returning a separately labeled inference.","label":"Petal length","matrix_weight":3.0,"reason_code":"highest_deterministic_discrimination","selection_score":3.0,"value_type":"numeric_range"},"report":{"candidates":[{"compared_weight":0.0,"coverage":0.0,"explanations":[],"possible_weight":0,"provenance":{"assertion_id":"fixture-assertion-a","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon A","score":0.0,"taxon_id":"fixture:taxon-a"},{"compared_weight":0.0,"coverage":0.0,"explanations":[],"possible_weight":0,"provenance":{"assertion_id":"fixture-assertion-b","locality":"SYNTHETIC-LOCALITY-MUST-NOT-RENDER","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon B","score":0.0,"taxon_id":"fixture:taxon-b"},{"compared_weight":0.0,"coverage":0.0,"explanations":[],"possible_weight":0,"provenance":{"assertion_id":"fixture-assertion-c","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon C","score":0.0,"taxon_id":"fixture:taxon-c"}],"compared_character_count":0,"disclaimer":"Scores are candidate-ranking evidence, not a taxonomic determination. Missing data are not treated as biological absence.","observation_count":0,"registry":{"checksum_sha256":"a430e9b287c89869b8d4bd8ac4dd9bb784080580714dcce29e7f2d67b8036fb0","publication_state":"review_required","registry_id":"reference-orchid-matrix","scope":{"genus":"Phalaenopsis"},"version":"fixture-v1"},"revision":0,"session_id":"ac6ca184-dd18-42b1-a4ab-71fd925d495b"},"session":{"actor":"reference-owner","created_at":"2026-09-26T07:09:08.084753+00:00","latest_evaluation":{"candidates":[{"compared_weight":0.0,"coverage":0.0,"explanations":[],"possible_weight":0,"provenance":{"assertion_id":"fixture-assertion-a","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon A","score":0.0,"taxon_id":"fixture:taxon-a"},{"compared_weight":0.0,"coverage":0.0,"explanations":[],"possible_weight":0,"provenance":{"assertion_id":"fixture-assertion-b","locality":"SYNTHETIC-LOCALITY-MUST-NOT-RENDER","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon B","score":0.0,"taxon_id":"fixture:taxon-b"},{"compared_weight":0.0,"coverage":0.0,"explanations":[],"possible_weight":0,"provenance":{"assertion_id":"fixture-assertion-c","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon C","score":0.0,"taxon_id":"fixture:taxon-c"}],"compared_character_count":0,"disclaimer":"Scores are candidate-ranking evidence, not a taxonomic determination. Missing data are not treated as biological absence.","observation_count":0,"registry":{"checksum_sha256":"a430e9b287c89869b8d4bd8ac4dd9bb784080580714dcce29e7f2d67b8036fb0","publication_state":"review_required","registry_id":"reference-orchid-matrix","scope":{"genus":"Phalaenopsis"},"version":"fixture-v1"},"revision":0,"session_id":"ac6ca184-dd18-42b1-a4ab-71fd925d495b"},"metadata":{"client":"orchid-continuum-frontend","input_mode":"guided"},"next_observation":{"candidate_count":3,"candidate_coverage":1.0,"character":"petal_length_mm","concept_id":null,"description":"Synthetic test character.","distinct_state_count":3,"explanation_boundary":"Calyx may explain this recommendation but may not alter the selected character without returning a separately labeled inference.","label":"Petal length","matrix_weight":3.0,"reason_code":"highest_deterministic_discrimination","selection_score":3.0,"value_type":"numeric_range"},"observations":[],"persistence_version":2,"registry":{"checksum_sha256":"a430e9b287c89869b8d4bd8ac4dd9bb784080580714dcce29e7f2d67b8036fb0","publication_state":"review_required","registry_id":"reference-orchid-matrix","scope":{"genus":"Phalaenopsis"},"version":"fixture-v1"},"revision":0,"schema_version":"matrix-identification-session/v1","session_id":"ac6ca184-dd18-42b1-a4ab-71fd925d495b","status":"active","updated_at":"2026-09-26T07:09:08.089701+00:00"}},"status":200},
  observe1: {"body":{"actor":"reference-owner","created_at":"2026-09-26T07:09:08.084753+00:00","latest_evaluation":{"candidates":[{"compared_weight":0.0,"coverage":0.0,"explanations":[],"possible_weight":0,"provenance":{"assertion_id":"fixture-assertion-a","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon A","score":0.0,"taxon_id":"fixture:taxon-a"},{"compared_weight":0.0,"coverage":0.0,"explanations":[],"possible_weight":0,"provenance":{"assertion_id":"fixture-assertion-b","locality":"SYNTHETIC-LOCALITY-MUST-NOT-RENDER","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon B","score":0.0,"taxon_id":"fixture:taxon-b"},{"compared_weight":0.0,"coverage":0.0,"explanations":[],"possible_weight":0,"provenance":{"assertion_id":"fixture-assertion-c","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon C","score":0.0,"taxon_id":"fixture:taxon-c"}],"compared_character_count":0,"disclaimer":"Scores are candidate-ranking evidence, not a taxonomic determination. Missing data are not treated as biological absence.","observation_count":0,"registry":{"checksum_sha256":"a430e9b287c89869b8d4bd8ac4dd9bb784080580714dcce29e7f2d67b8036fb0","publication_state":"review_required","registry_id":"reference-orchid-matrix","scope":{"genus":"Phalaenopsis"},"version":"fixture-v1"},"revision":0,"session_id":"ac6ca184-dd18-42b1-a4ab-71fd925d495b"},"metadata":{"client":"orchid-continuum-frontend","input_mode":"guided"},"next_observation":{"candidate_count":3,"candidate_coverage":1.0,"character":"petal_length_mm","concept_id":null,"description":"Synthetic test character.","distinct_state_count":3,"explanation_boundary":"Calyx may explain this recommendation but may not alter the selected character without returning a separately labeled inference.","label":"Petal length","matrix_weight":3.0,"reason_code":"highest_deterministic_discrimination","selection_score":3.0,"value_type":"numeric_range"},"observations":[{"certainty":"certain","character":"petal_length_mm","created_at":"2026-09-26T07:09:08.095243+00:00","observation_id":"4771b661-7326-4e38-b458-fd905f488ff6","recorded_by":"reference-owner","review_state":"observed","revision":1,"source":{"interface":"guided-identification","kind":"user_observation"},"value":25,"weight":null}],"persistence_version":3,"registry":{"checksum_sha256":"a430e9b287c89869b8d4bd8ac4dd9bb784080580714dcce29e7f2d67b8036fb0","publication_state":"review_required","registry_id":"reference-orchid-matrix","scope":{"genus":"Phalaenopsis"},"version":"fixture-v1"},"revision":1,"schema_version":"matrix-identification-session/v1","session_id":"ac6ca184-dd18-42b1-a4ab-71fd925d495b","status":"active","updated_at":"2026-09-26T07:09:08.095257+00:00"},"status":200},
  evaluate1: {"body":{"next_observation":{"candidate_count":3,"candidate_coverage":1.0,"character":"flower_color","concept_id":null,"description":"Synthetic test character.","distinct_state_count":2,"explanation_boundary":"Calyx may explain this recommendation but may not alter the selected character without returning a separately labeled inference.","label":"Flower color","matrix_weight":2.0,"reason_code":"highest_deterministic_discrimination","selection_score":1.0,"value_type":"categorical"},"report":{"candidates":[{"compared_weight":3.0,"coverage":1.0,"explanations":[{"candidate_state":{"max":30,"min":20},"certainty":"certain","character":"petal_length_mm","contribution":3.0,"effective_weight":3.0,"observation":25,"similarity":1.0,"status":"matched"}],"possible_weight":3.0,"provenance":{"assertion_id":"fixture-assertion-a","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon A","score":1.0,"taxon_id":"fixture:taxon-a"},{"compared_weight":3.0,"coverage":1.0,"explanations":[{"candidate_state":{"max":28,"min":22},"certainty":"certain","character":"petal_length_mm","contribution":3.0,"effective_weight":3.0,"observation":25,"similarity":1.0,"status":"matched"}],"possible_weight":3.0,"provenance":{"assertion_id":"fixture-assertion-c","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon C","score":1.0,"taxon_id":"fixture:taxon-c"},{"compared_weight":3.0,"coverage":1.0,"explanations":[{"candidate_state":{"max":55,"min":40},"certainty":"certain","character":"petal_length_mm","contribution":0.0,"effective_weight":3.0,"observation":25,"similarity":0.0,"status":"conflict"}],"possible_weight":3.0,"provenance":{"assertion_id":"fixture-assertion-b","locality":"SYNTHETIC-LOCALITY-MUST-NOT-RENDER","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon B","score":0.0,"taxon_id":"fixture:taxon-b"}],"compared_character_count":1,"disclaimer":"Scores are candidate-ranking evidence, not a taxonomic determination. Missing data are not treated as biological absence.","observation_count":1,"registry":{"checksum_sha256":"a430e9b287c89869b8d4bd8ac4dd9bb784080580714dcce29e7f2d67b8036fb0","publication_state":"review_required","registry_id":"reference-orchid-matrix","scope":{"genus":"Phalaenopsis"},"version":"fixture-v1"},"revision":1,"session_id":"ac6ca184-dd18-42b1-a4ab-71fd925d495b"},"session":{"actor":"reference-owner","created_at":"2026-09-26T07:09:08.084753+00:00","latest_evaluation":{"candidates":[{"compared_weight":3.0,"coverage":1.0,"explanations":[{"candidate_state":{"max":30,"min":20},"certainty":"certain","character":"petal_length_mm","contribution":3.0,"effective_weight":3.0,"observation":25,"similarity":1.0,"status":"matched"}],"possible_weight":3.0,"provenance":{"assertion_id":"fixture-assertion-a","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon A","score":1.0,"taxon_id":"fixture:taxon-a"},{"compared_weight":3.0,"coverage":1.0,"explanations":[{"candidate_state":{"max":28,"min":22},"certainty":"certain","character":"petal_length_mm","contribution":3.0,"effective_weight":3.0,"observation":25,"similarity":1.0,"status":"matched"}],"possible_weight":3.0,"provenance":{"assertion_id":"fixture-assertion-c","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon C","score":1.0,"taxon_id":"fixture:taxon-c"},{"compared_weight":3.0,"coverage":1.0,"explanations":[{"candidate_state":{"max":55,"min":40},"certainty":"certain","character":"petal_length_mm","contribution":0.0,"effective_weight":3.0,"observation":25,"similarity":0.0,"status":"conflict"}],"possible_weight":3.0,"provenance":{"assertion_id":"fixture-assertion-b","locality":"SYNTHETIC-LOCALITY-MUST-NOT-RENDER","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon B","score":0.0,"taxon_id":"fixture:taxon-b"}],"compared_character_count":1,"disclaimer":"Scores are candidate-ranking evidence, not a taxonomic determination. Missing data are not treated as biological absence.","observation_count":1,"registry":{"checksum_sha256":"a430e9b287c89869b8d4bd8ac4dd9bb784080580714dcce29e7f2d67b8036fb0","publication_state":"review_required","registry_id":"reference-orchid-matrix","scope":{"genus":"Phalaenopsis"},"version":"fixture-v1"},"revision":1,"session_id":"ac6ca184-dd18-42b1-a4ab-71fd925d495b"},"metadata":{"client":"orchid-continuum-frontend","input_mode":"guided"},"next_observation":{"candidate_count":3,"candidate_coverage":1.0,"character":"flower_color","concept_id":null,"description":"Synthetic test character.","distinct_state_count":2,"explanation_boundary":"Calyx may explain this recommendation but may not alter the selected character without returning a separately labeled inference.","label":"Flower color","matrix_weight":2.0,"reason_code":"highest_deterministic_discrimination","selection_score":1.0,"value_type":"categorical"},"observations":[{"certainty":"certain","character":"petal_length_mm","created_at":"2026-09-26T07:09:08.095243+00:00","observation_id":"4771b661-7326-4e38-b458-fd905f488ff6","recorded_by":"reference-owner","review_state":"observed","revision":1,"source":{"interface":"guided-identification","kind":"user_observation"},"value":25,"weight":null}],"persistence_version":4,"registry":{"checksum_sha256":"a430e9b287c89869b8d4bd8ac4dd9bb784080580714dcce29e7f2d67b8036fb0","publication_state":"review_required","registry_id":"reference-orchid-matrix","scope":{"genus":"Phalaenopsis"},"version":"fixture-v1"},"revision":1,"schema_version":"matrix-identification-session/v1","session_id":"ac6ca184-dd18-42b1-a4ab-71fd925d495b","status":"active","updated_at":"2026-09-26T07:09:08.100176+00:00"}},"status":200},
  observe2: {"body":{"actor":"reference-owner","created_at":"2026-09-26T07:09:08.084753+00:00","latest_evaluation":{"candidates":[{"compared_weight":3.0,"coverage":1.0,"explanations":[{"candidate_state":{"max":30,"min":20},"certainty":"certain","character":"petal_length_mm","contribution":3.0,"effective_weight":3.0,"observation":25,"similarity":1.0,"status":"matched"}],"possible_weight":3.0,"provenance":{"assertion_id":"fixture-assertion-a","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon A","score":1.0,"taxon_id":"fixture:taxon-a"},{"compared_weight":3.0,"coverage":1.0,"explanations":[{"candidate_state":{"max":28,"min":22},"certainty":"certain","character":"petal_length_mm","contribution":3.0,"effective_weight":3.0,"observation":25,"similarity":1.0,"status":"matched"}],"possible_weight":3.0,"provenance":{"assertion_id":"fixture-assertion-c","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon C","score":1.0,"taxon_id":"fixture:taxon-c"},{"compared_weight":3.0,"coverage":1.0,"explanations":[{"candidate_state":{"max":55,"min":40},"certainty":"certain","character":"petal_length_mm","contribution":0.0,"effective_weight":3.0,"observation":25,"similarity":0.0,"status":"conflict"}],"possible_weight":3.0,"provenance":{"assertion_id":"fixture-assertion-b","locality":"SYNTHETIC-LOCALITY-MUST-NOT-RENDER","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon B","score":0.0,"taxon_id":"fixture:taxon-b"}],"compared_character_count":1,"disclaimer":"Scores are candidate-ranking evidence, not a taxonomic determination. Missing data are not treated as biological absence.","observation_count":1,"registry":{"checksum_sha256":"a430e9b287c89869b8d4bd8ac4dd9bb784080580714dcce29e7f2d67b8036fb0","publication_state":"review_required","registry_id":"reference-orchid-matrix","scope":{"genus":"Phalaenopsis"},"version":"fixture-v1"},"revision":1,"session_id":"ac6ca184-dd18-42b1-a4ab-71fd925d495b"},"metadata":{"client":"orchid-continuum-frontend","input_mode":"guided"},"next_observation":{"candidate_count":3,"candidate_coverage":1.0,"character":"flower_color","concept_id":null,"description":"Synthetic test character.","distinct_state_count":2,"explanation_boundary":"Calyx may explain this recommendation but may not alter the selected character without returning a separately labeled inference.","label":"Flower color","matrix_weight":2.0,"reason_code":"highest_deterministic_discrimination","selection_score":1.0,"value_type":"categorical"},"observations":[{"certainty":"certain","character":"petal_length_mm","created_at":"2026-09-26T07:09:08.095243+00:00","observation_id":"4771b661-7326-4e38-b458-fd905f488ff6","recorded_by":"reference-owner","review_state":"observed","revision":1,"source":{"interface":"guided-identification","kind":"user_observation"},"value":25,"weight":null},{"certainty":"unknown","character":"flower_color","created_at":"2026-09-26T07:09:08.105053+00:00","observation_id":"0822c2fb-5e4b-4ddb-acaf-87d42081718a","recorded_by":"reference-owner","review_state":"observed","revision":2,"source":{"interface":"guided-identification","kind":"user_observation"},"value":"white","weight":null}],"persistence_version":5,"registry":{"checksum_sha256":"a430e9b287c89869b8d4bd8ac4dd9bb784080580714dcce29e7f2d67b8036fb0","publication_state":"review_required","registry_id":"reference-orchid-matrix","scope":{"genus":"Phalaenopsis"},"version":"fixture-v1"},"revision":2,"schema_version":"matrix-identification-session/v1","session_id":"ac6ca184-dd18-42b1-a4ab-71fd925d495b","status":"active","updated_at":"2026-09-26T07:09:08.105065+00:00"},"status":200},
  evaluate2: {"body":{"next_observation":{"candidate_count":3,"candidate_coverage":0.666667,"character":"lip_callus_shape","concept_id":null,"description":"Synthetic test character.","distinct_state_count":2,"explanation_boundary":"Calyx may explain this recommendation but may not alter the selected character without returning a separately labeled inference.","label":"Lip callus shape","matrix_weight":1.0,"reason_code":"highest_deterministic_discrimination","selection_score":0.666667,"value_type":"categorical"},"report":{"candidates":[{"compared_weight":3.0,"coverage":1.0,"explanations":[{"candidate_state":{"max":30,"min":20},"certainty":"certain","character":"petal_length_mm","contribution":3.0,"effective_weight":3.0,"observation":25,"similarity":1.0,"status":"matched"},{"candidate_state":"white","certainty":"unknown","character":"flower_color","contribution":0.0,"effective_weight":0.0,"observation":"white","similarity":null,"status":"ignored_unknown_observation"}],"possible_weight":3.0,"provenance":{"assertion_id":"fixture-assertion-a","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon A","score":1.0,"taxon_id":"fixture:taxon-a"},{"compared_weight":3.0,"coverage":1.0,"explanations":[{"candidate_state":{"max":28,"min":22},"certainty":"certain","character":"petal_length_mm","contribution":3.0,"effective_weight":3.0,"observation":25,"similarity":1.0,"status":"matched"},{"candidate_state":"yellow","certainty":"unknown","character":"flower_color","contribution":0.0,"effective_weight":0.0,"observation":"white","similarity":null,"status":"ignored_unknown_observation"}],"possible_weight":3.0,"provenance":{"assertion_id":"fixture-assertion-c","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon C","score":1.0,"taxon_id":"fixture:taxon-c"},{"compared_weight":3.0,"coverage":1.0,"explanations":[{"candidate_state":{"max":55,"min":40},"certainty":"certain","character":"petal_length_mm","contribution":0.0,"effective_weight":3.0,"observation":25,"similarity":0.0,"status":"conflict"},{"candidate_state":"white","certainty":"unknown","character":"flower_color","contribution":0.0,"effective_weight":0.0,"observation":"white","similarity":null,"status":"ignored_unknown_observation"}],"possible_weight":3.0,"provenance":{"assertion_id":"fixture-assertion-b","locality":"SYNTHETIC-LOCALITY-MUST-NOT-RENDER","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon B","score":0.0,"taxon_id":"fixture:taxon-b"}],"compared_character_count":1,"disclaimer":"Scores are candidate-ranking evidence, not a taxonomic determination. Missing data are not treated as biological absence.","observation_count":2,"registry":{"checksum_sha256":"a430e9b287c89869b8d4bd8ac4dd9bb784080580714dcce29e7f2d67b8036fb0","publication_state":"review_required","registry_id":"reference-orchid-matrix","scope":{"genus":"Phalaenopsis"},"version":"fixture-v1"},"revision":2,"session_id":"ac6ca184-dd18-42b1-a4ab-71fd925d495b"},"session":{"actor":"reference-owner","created_at":"2026-09-26T07:09:08.084753+00:00","latest_evaluation":{"candidates":[{"compared_weight":3.0,"coverage":1.0,"explanations":[{"candidate_state":{"max":30,"min":20},"certainty":"certain","character":"petal_length_mm","contribution":3.0,"effective_weight":3.0,"observation":25,"similarity":1.0,"status":"matched"},{"candidate_state":"white","certainty":"unknown","character":"flower_color","contribution":0.0,"effective_weight":0.0,"observation":"white","similarity":null,"status":"ignored_unknown_observation"}],"possible_weight":3.0,"provenance":{"assertion_id":"fixture-assertion-a","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon A","score":1.0,"taxon_id":"fixture:taxon-a"},{"compared_weight":3.0,"coverage":1.0,"explanations":[{"candidate_state":{"max":28,"min":22},"certainty":"certain","character":"petal_length_mm","contribution":3.0,"effective_weight":3.0,"observation":25,"similarity":1.0,"status":"matched"},{"candidate_state":"yellow","certainty":"unknown","character":"flower_color","contribution":0.0,"effective_weight":0.0,"observation":"white","similarity":null,"status":"ignored_unknown_observation"}],"possible_weight":3.0,"provenance":{"assertion_id":"fixture-assertion-c","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon C","score":1.0,"taxon_id":"fixture:taxon-c"},{"compared_weight":3.0,"coverage":1.0,"explanations":[{"candidate_state":{"max":55,"min":40},"certainty":"certain","character":"petal_length_mm","contribution":0.0,"effective_weight":3.0,"observation":25,"similarity":0.0,"status":"conflict"},{"candidate_state":"white","certainty":"unknown","character":"flower_color","contribution":0.0,"effective_weight":0.0,"observation":"white","similarity":null,"status":"ignored_unknown_observation"}],"possible_weight":3.0,"provenance":{"assertion_id":"fixture-assertion-b","locality":"SYNTHETIC-LOCALITY-MUST-NOT-RENDER","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon B","score":0.0,"taxon_id":"fixture:taxon-b"}],"compared_character_count":1,"disclaimer":"Scores are candidate-ranking evidence, not a taxonomic determination. Missing data are not treated as biological absence.","observation_count":2,"registry":{"checksum_sha256":"a430e9b287c89869b8d4bd8ac4dd9bb784080580714dcce29e7f2d67b8036fb0","publication_state":"review_required","registry_id":"reference-orchid-matrix","scope":{"genus":"Phalaenopsis"},"version":"fixture-v1"},"revision":2,"session_id":"ac6ca184-dd18-42b1-a4ab-71fd925d495b"},"metadata":{"client":"orchid-continuum-frontend","input_mode":"guided"},"next_observation":{"candidate_count":3,"candidate_coverage":0.666667,"character":"lip_callus_shape","concept_id":null,"description":"Synthetic test character.","distinct_state_count":2,"explanation_boundary":"Calyx may explain this recommendation but may not alter the selected character without returning a separately labeled inference.","label":"Lip callus shape","matrix_weight":1.0,"reason_code":"highest_deterministic_discrimination","selection_score":0.666667,"value_type":"categorical"},"observations":[{"certainty":"certain","character":"petal_length_mm","created_at":"2026-09-26T07:09:08.095243+00:00","observation_id":"4771b661-7326-4e38-b458-fd905f488ff6","recorded_by":"reference-owner","review_state":"observed","revision":1,"source":{"interface":"guided-identification","kind":"user_observation"},"value":25,"weight":null},{"certainty":"unknown","character":"flower_color","created_at":"2026-09-26T07:09:08.105053+00:00","observation_id":"0822c2fb-5e4b-4ddb-acaf-87d42081718a","recorded_by":"reference-owner","review_state":"observed","revision":2,"source":{"interface":"guided-identification","kind":"user_observation"},"value":"white","weight":null}],"persistence_version":6,"registry":{"checksum_sha256":"a430e9b287c89869b8d4bd8ac4dd9bb784080580714dcce29e7f2d67b8036fb0","publication_state":"review_required","registry_id":"reference-orchid-matrix","scope":{"genus":"Phalaenopsis"},"version":"fixture-v1"},"revision":2,"schema_version":"matrix-identification-session/v1","session_id":"ac6ca184-dd18-42b1-a4ab-71fd925d495b","status":"active","updated_at":"2026-09-26T07:09:08.109861+00:00"}},"status":200},
  explain2: {"body":{"evidence":{"audience":"beginner","authority":{"automatic_identification_publication":false,"calyx_may_change_candidate_order":false,"calyx_may_change_next_observation":false,"calyx_may_change_scores_or_coverage":false,"calyx_text_is_scientific_evidence":false,"canonical_taxonomy_mutation":false,"matrix_scores_are_authoritative_for_this_packet":true},"candidate_order":["fixture:taxon-a","fixture:taxon-c","fixture:taxon-b"],"candidates":[{"conflicting_characters":[],"coverage":1.0,"missing_characters":[],"partial_characters":[],"provenance":{"assertion_id":"fixture-assertion-a","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon A","score":1.0,"supporting_characters":["petal_length_mm"],"taxon_id":"fixture:taxon-a"},{"conflicting_characters":[],"coverage":1.0,"missing_characters":[],"partial_characters":[],"provenance":{"assertion_id":"fixture-assertion-c","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon C","score":1.0,"supporting_characters":["petal_length_mm"],"taxon_id":"fixture:taxon-c"},{"conflicting_characters":["petal_length_mm"],"coverage":1.0,"missing_characters":[],"partial_characters":[],"provenance":{"assertion_id":"fixture-assertion-b","locality":"SYNTHETIC-LOCALITY-MUST-NOT-RENDER","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon B","score":0.0,"supporting_characters":[],"taxon_id":"fixture:taxon-b"}],"disclaimer":"Scores are candidate-ranking evidence, not a taxonomic determination. Missing data are not treated as biological absence.","evidence_digest_sha256":"a833350db1e0cabcfb7db8594973637114664255fedef4d82bbf9be898b75f8a","focus":"summary","next_observation":{"candidate_count":3,"candidate_coverage":0.666667,"character":"lip_callus_shape","concept_id":null,"description":"Synthetic test character.","distinct_state_count":2,"explanation_boundary":"Calyx may explain this recommendation but may not alter the selected character without returning a separately labeled inference.","label":"Lip callus shape","matrix_weight":1.0,"reason_code":"highest_deterministic_discrimination","selection_score":0.666667,"value_type":"categorical"},"observations":[{"certainty":"certain","character":"petal_length_mm","review_state":"observed","source":{"interface":"guided-identification","kind":"user_observation"},"value":25},{"certainty":"unknown","character":"flower_color","review_state":"observed","source":{"interface":"guided-identification","kind":"user_observation"},"value":"white"}],"registry":{"checksum_sha256":"a430e9b287c89869b8d4bd8ac4dd9bb784080580714dcce29e7f2d67b8036fb0","publication_state":"review_required","registry_id":"reference-orchid-matrix","scope":{"genus":"Phalaenopsis"},"version":"fixture-v1"},"schema_version":"matrix-identification-explanation/v1","session_id":"ac6ca184-dd18-42b1-a4ab-71fd925d495b","session_revision":2},"invariants":{"candidate_order_digest":"ac29c9e466f76324c82e9259126c3ca4fc213a4c515c0a8b8d653641858de246","next_observation_digest":"59e471b5a93b59d896728a988c2f2e8a43eb63da18508610718a5a680dd84124","provider_output_mutates_matrix_state":false},"narrative":{"epistemic_state":"explanation_not_evidence","fallback_error":null,"model":"calyx-matrix-explanation-v1","provider":"matrix-deterministic-governed","provider_response_id":null,"request_hash":"b59157125f012ecbad8c45dc242002c1bbe2dee64ebc7bb651da2305135dfadf","text":"The current leading candidate is Fixture taxon A based on the supplied Matrix evidence. Its match score is 1.0 with coverage 1.0.\n\nThe strongest alternative is Fixture taxon C with score 1.0 and coverage 1.0.\n\nThe Matrix recommends observing Lip callus shape next because it has the strongest deterministic discrimination signal among the remaining unobserved characters.\n\nSynthetic test character.\n\nThis is an explanation of candidate-ranking evidence, not a verified taxonomic identification."},"schema_version":"matrix-identification-explanation/v1","session_id":"ac6ca184-dd18-42b1-a4ab-71fd925d495b"},"status":200},
  registryDetail: {"body":{"candidates":[{"provenance":{"assertion_id":"fixture-assertion-a","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon A","states":{"flower_color":"white","lip_callus_shape":"forked","petal_length_mm":{"max":30,"min":20}},"taxon_id":"fixture:taxon-a"},{"provenance":{"assertion_id":"fixture-assertion-b","locality":"SYNTHETIC-LOCALITY-MUST-NOT-RENDER","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon B","states":{"flower_color":"white","petal_length_mm":{"max":55,"min":40}},"taxon_id":"fixture:taxon-b"},{"provenance":{"assertion_id":"fixture-assertion-c","source":"synthetic browser-test registry; not a scientific assertion"},"scientific_name":"Fixture taxon C","states":{"flower_color":"yellow","lip_callus_shape":"entire","petal_length_mm":{"max":28,"min":22}},"taxon_id":"fixture:taxon-c"}],"characters":[{"character":"petal_length_mm","concept_id":null,"description":"Synthetic test character.","label":"Petal length","provenance":null,"value_type":"numeric_range","weight":3},{"character":"flower_color","concept_id":null,"description":"Synthetic test character.","label":"Flower color","provenance":null,"value_type":"categorical","weight":2},{"character":"lip_callus_shape","concept_id":null,"description":"Synthetic test character.","label":"Lip callus shape","provenance":null,"value_type":"categorical","weight":1}],"checksum_sha256":"a430e9b287c89869b8d4bd8ac4dd9bb784080580714dcce29e7f2d67b8036fb0","created_at":"2026-09-26T07:09:08.050399+00:00","created_by":"reference-owner","provenance":{"source":"synthetic browser-test registry; not a scientific assertion"},"publication_state":"review_required","registry_id":"reference-orchid-matrix","schema_version":"matrix-identification-registry/v1","scope":{"genus":"Phalaenopsis"},"title":"Provider-free reference matrix","version":"fixture-v1"},"status":200},
  failCreate: {"body":{"detail":{"code":"MATRIX_SESSION_PERSISTENCE_UNAVAILABLE","message":"MATRIX_SESSION_DATABASE_URL_REQUIRED"}},"status":503},
};
