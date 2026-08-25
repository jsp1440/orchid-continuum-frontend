import { expect, test, type Page } from "@playwright/test";

import { geotaggedJpeg } from "./support/geotagged-jpeg";

/**
 * The acceptance specimen, walked end to end.
 *
 * AM1 is a real plant in a real collection, labelled
 *
 *   Phragmipedium kovachii 'Daniela' × Phragmipedium kovachii 'Maria'
 *
 * and it is the specimen this vertical slice is measured against. Two things
 * about it are the point.
 *
 * Its recorded identity is a cross, not a binomial. Until the identity
 * resolver landed, the taxon guard required a bare `Genus species` and refused
 * this name outright, so the one feature built for growers could not be used by
 * the plant it was built for. The journey therefore starts by recording AM1
 * under its own name and never a tidied-up version of it.
 *
 * And the species is a lookup, not the subject. Published cultivation evidence
 * is about Phragmipedium kovachii; this plant is two named clones of that
 * species crossed. The journey requires both to be visible and distinguished
 * at every point a person can see.
 *
 * Fixture readings and a synthetic photograph stand in for the grower's own,
 * which is allowed. What is not allowed is a path that only works for AM1: the
 * architecture underneath is the same one any cross or named clone uses.
 */

test.describe.configure({ mode: "serial" });

const AM1_IDENTITY = "Phragmipedium kovachii 'Daniela' × Phragmipedium kovachii 'Maria'";
const AM1_SPECIES = "Phragmipedium kovachii";

const ACCOUNT = {
  email: `am1-${Date.now()}@conservatory.test`,
  password: "a-throwaway-password-1",
};

let page: Page;
let plantUrl = "";
let accession = "";
let qrIdentifier = "";
let benchId = "";
let shelfId = "";

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`[console] ${message.text()}`);
  });
});

test.afterAll(async () => {
  await page?.close();
});

async function visit(path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

async function locationIdByName(name: string): Promise<string> {
  const card = page.getByTestId("location-list").locator(`li:has(strong:text-is("${name}"))`).first();
  await card.waitFor();
  return ((await card.getAttribute("data-testid")) || "").replace("location-card-", "");
}

/* ----------------------------------------------------------------- 1 ----- */

test("1. AM1 is recorded under its own name, not a tidied-up one", async () => {
  await visit("/");
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "Create an account", exact: true }).click();
  await modal.getByPlaceholder("you@orchidcontinuum.org").fill(ACCOUNT.email);
  await modal.getByPlaceholder("\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022").fill(ACCOUNT.password);
  await modal.getByRole("button", { name: /^create account$/i }).last().click();
  await expect(page.getByTestId("account-menu")).toBeVisible({ timeout: 20_000 });

  await visit("/conservatory/plants/new");
  await page.getByLabel("Display name").fill("AM1");
  await page.getByLabel("Accepted scientific name").fill(AM1_IDENTITY);

  const [created] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/conservatory/plants") && r.request().method() === "POST"),
    page.getByRole("button", { name: /save and assign accession/i }).click(),
  ]);
  const record = await created.json();
  qrIdentifier = record.qr_identifier;
  accession = record.accession_number;

  // The whole cross is what was stored. Nothing reduced it to the species.
  expect(record.accepted_scientific_name).toBe(AM1_IDENTITY);
  expect(accession).toMatch(/^OC-\d{4}$/);
  expect(qrIdentifier).toMatch(/^ocq_/);

  await expect(page).toHaveURL(/\/conservatory\/plants\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  plantUrl = new URL(page.url()).pathname;
  await expect(page.getByText(AM1_IDENTITY).first()).toBeVisible();
});

/* ----------------------------------------------------------------- 2 ----- */

test("2. a photograph is attached, and loses where it was taken", async () => {
  await visit(plantUrl);
  await page.getByTestId("photograph-caption").fill("Flower, ruler-backed");
  await page.getByTestId("photograph-file").setInputFiles({
    name: "am1-flower.jpg",
    mimeType: "image/jpeg",
    buffer: geotaggedJpeg(),
  });
  await expect(page.getByTestId("photograph-list")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("photograph-error")).toHaveCount(0);
  await expect(page.getByTestId("photograph-list")).toContainText("Flower, ruler-backed");
});

/* --------------------------------------------------------------- 2b ----- */

test("2b. AM1's ruler-backed flower measurement is recorded with its provenance", async () => {
  // The specimen's own reading: a 12 in rule held beside the flower and
  // photographed, giving a natural horizontal spread of about 5.6 in.
  await visit(plantUrl);
  const section = page.getByTestId("plant-measurements");
  await expect(section).toBeVisible();
  await expect(page.getByTestId("measurements-provenance")).toContainText(/not a description of the species/i);
  await expect(page.getByTestId("no-measurements")).toBeVisible();

  const form = page.getByTestId("record-measurement");
  await form.getByTestId("measurement-trait").selectOption("natural_spread_horizontal");
  await form.getByTestId("measurement-value").fill("5.6");
  await form.getByTestId("measurement-unit").selectOption("in");
  await form.getByTestId("measurement-method").selectOption("ruler_photograph");
  await form.getByTestId("measurement-day").fill(new Date().toISOString().slice(0, 10));
  await form.getByTestId("measurement-instrument").fill("12 in rule");

  // The method claims a photograph, so the form asks which one. Naming it is
  // the whole reason this method is trusted above an estimate: somebody can
  // open that photograph and check the reading against the rule in it.
  const chooser = form.getByTestId("measurement-photograph");
  await expect(chooser).toBeVisible();
  const offered = chooser.locator("option", { hasText: "Flower, ruler-backed" });
  await expect(offered).toHaveCount(1);
  await chooser.selectOption((await offered.getAttribute("value")) ?? "");
  await form.getByTestId("measurement-submit").click();

  const list = page.getByTestId("measurement-list");
  await expect(list).toBeVisible();
  await expect(list).toContainText(/from photograph: Flower, ruler-backed/i);

  // The reading is kept in the unit it was read in, and the conversion claims
  // no more precision than a ruler had: 14.2 cm, never 14.224.
  await expect(list).toContainText("5.6 in");
  await expect(list).toContainText("14.2 cm converted");
  expect(await list.textContent()).not.toContain("14.224");

  // How it was obtained is most of what the number is worth.
  await expect(list).toContainText(/by ruler photograph/i);
  await expect(list).toContainText("Natural spread, horizontal");
});

/* --------------------------------------------------------------- 2c ----- */

test("2c. a photograph-read measurement that names no photograph says so", async () => {
  // Growers measure before they upload, so this is recorded rather than
  // refused. What must not happen is it sitting in the list looking exactly
  // as checkable as the reading above, when nothing can be checked.
  await visit(plantUrl);
  const form = page.getByTestId("record-measurement");
  await form.getByTestId("measurement-trait").selectOption("petal_width");
  await form.getByTestId("measurement-value").fill("4.1");
  await form.getByTestId("measurement-unit").selectOption("in");
  await form.getByTestId("measurement-method").selectOption("ruler_photograph");
  await form.getByTestId("measurement-day").fill(new Date().toISOString().slice(0, 10));
  await form.getByTestId("measurement-photograph").selectOption("");
  await form.getByTestId("measurement-submit").click();

  const list = page.getByTestId("measurement-list");
  await expect(list).toContainText("4.1 in");
  await expect(list).toContainText(/is not named here, so it cannot be checked against one/i);

  // And the reading that did name one still reads as named — the warning is
  // per reading, not a banner over the section.
  await expect(list).toContainText(/from photograph: Flower, ruler-backed/i);
});

/* ----------------------------------------------------------------- 3 ----- */

test("3. two growing locations exist, each with its own measured conditions", async () => {
  await visit("/conservatory/locations");
  await page.getByTestId("location-name").fill("Cool bench");
  await page.getByTestId("location-kind").selectOption("greenhouse_bench");
  await page.getByTestId("location-submit").click();
  await expect(page.getByTestId("location-list").getByText("Cool bench", { exact: true })).toBeVisible();
  benchId = await locationIdByName("Cool bench");

  await page.getByTestId("location-name").fill("Warm shelf");
  await page.getByTestId("location-kind").selectOption("shelf");
  await page.getByTestId("location-submit").click();
  await expect(page.getByTestId("location-list").getByText("Warm shelf", { exact: true })).toBeVisible();
  shelfId = await locationIdByName("Warm shelf");

  // The bench runs above what the species tolerates; the shelf is inside it.
  // The recommendation later has to be able to tell them apart.
  for (const [id, value] of [[benchId, "28"], [shelfId, "21"]] as const) {
    const readings = page.getByTestId(`readings-${id}`);
    const form = readings.getByTestId("record-reading");
    await form.getByTestId("reading-variable").selectOption("temperature_c");
    await form.getByTestId("reading-value").fill(value);
    await form.getByTestId("reading-day").fill(new Date().toISOString().slice(0, 10));
    await form.getByTestId("reading-origin").selectOption("measured");
    await form.getByTestId("reading-instrument").fill("Bench datalogger");
    await form.getByTestId("reading-submit").click();
    await expect(readings.getByTestId(`reading-list-${id}`)).toContainText(value);
  }

  // A third place, deliberately never measured. It must not be ranked against
  // the other two on nothing, and it must not vanish either — the grower is
  // shown a letter for it and has to be told why no answer mentions it.
  await page.getByTestId("location-name").fill("Unmeasured corner");
  await page.getByTestId("location-kind").selectOption("shade_house");
  await page.getByTestId("location-submit").click();
  await expect(page.getByTestId("location-list").getByText("Unmeasured corner", { exact: true })).toBeVisible();
});

/* ----------------------------------------------------------------- 4 ----- */

test("4. AM1 is placed on the warm bench, and the dossier says so", async () => {
  await visit(plantUrl);
  await page.getByTestId("placement-location").selectOption({ label: "Cool bench" });
  await page.getByTestId("placement-reason-select").selectOption("initial");
  await page.getByTestId("placement-submit").click();
  await expect(page.getByTestId("current-location")).toContainText("Cool bench");
  await expect(page.getByTestId("cultivation-context")).toBeVisible();
});

/* ----------------------------------------------------------------- 5 ----- */

test("5. its QR tag resolves back to this exact plant", async () => {
  await visit(`/conservatory/scan/${encodeURIComponent(qrIdentifier)}`);
  await expect(page.getByTestId("scan-arrival")).toBeVisible();
  await expect(page.getByText(AM1_IDENTITY).first()).toBeVisible();
  await expect(page.getByText(accession).first()).toBeVisible();
});

/* ----------------------------------------------------------------- 6 ----- */

test("6. the dossier offers the evaluation, naming both identities", async () => {
  await visit(plantUrl);
  const action = page.getByTestId("cultivation-calyx-action");
  await expect(action).toBeVisible();

  const disclosure = page.getByTestId("cultivation-calyx-disclosure");
  // The plant being asked about, and the species being looked up, stated
  // separately before anything is sent.
  await expect(disclosure).toContainText(AM1_IDENTITY);
  await expect(disclosure).toContainText(AM1_SPECIES);
  await expect(disclosure).toContainText(/both parents belong to/i);
  await expect(disclosure).toContainText(/do not travel/i);

  // The other bench is offered as a letter, its name kept in the collection.
  await expect(page.getByTestId("cultivation-calyx-legend-B")).toContainText("Warm shelf");

  // The unmeasured shade house gets a letter too, and the panel says plainly
  // that a place with no readings is not sent — otherwise the grower reads
  // the legend as a promise that all three were weighed.
  await expect(page.getByTestId("cultivation-calyx-legend-C")).toContainText("Unmeasured corner");
  await expect(page.getByTestId("cultivation-calyx-legend"))
    .toContainText(/A place with no readings of its own is not sent at all/i);
});

/* --------------------------------------------------------------- 6b ----- */

test("6b. the same plant recorded in label shorthand resolves the same way", async () => {
  // A grower writes the genus once and lets the line inherit it. This is the
  // same cross as AM1, written the way a label actually carries it, and it has
  // to reach the same species — otherwise the feature works only for records
  // typed out in full.
  await visit("/conservatory/plants/new");
  await page.getByLabel("Display name").fill("AM1 sib, shorthand label");
  await page.getByLabel("Accepted scientific name").fill("Phrag. kovachii 'Daniela' x 'Maria'");
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/conservatory/plants") && r.request().method() === "POST"),
    page.getByRole("button", { name: /save and assign accession/i }).click(),
  ]);
  await expect(page).toHaveURL(/\/conservatory\/plants\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const shorthandUrl = new URL(page.url()).pathname;

  // It needs a place and a reading before the action can appear at all.
  await page.getByTestId("placement-location").selectOption({ label: "Cool bench" });
  await page.getByTestId("placement-reason-select").selectOption("initial");
  await page.getByTestId("placement-submit").click();
  await expect(page.getByTestId("current-location")).toContainText("Cool bench");

  await visit(shorthandUrl);
  const disclosure = page.getByTestId("cultivation-calyx-disclosure");
  await expect(disclosure).toBeVisible();
  await expect(disclosure).toContainText("Phrag. kovachii 'Daniela' x 'Maria'");
  await expect(disclosure).toContainText(AM1_SPECIES);
  await expect(disclosure).toContainText(/both parents belong to/i);
});

/* --------------------------------------------------------------- 6c ----- */

test("6c. a record with no genus is refused, and says which word to add", async () => {
  // An epithet on its own is not a species name. Supplying the genus would be
  // fabricating taxonomy to make a lookup succeed, so the plant is refused —
  // but the refusal has to tell the grower what to do about it.
  await visit("/conservatory/plants/new");
  await page.getByLabel("Display name").fill("Unlabelled sib cross");
  await page.getByLabel("Accepted scientific name").fill("kovachii 'Daniela' x kovachii 'Maria'");
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/conservatory/plants") && r.request().method() === "POST"),
    page.getByRole("button", { name: /save and assign accession/i }).click(),
  ]);
  await expect(page).toHaveURL(/\/conservatory\/plants\/[0-9a-f-]{36}$/, { timeout: 20_000 });

  await page.getByTestId("placement-location").selectOption({ label: "Cool bench" });
  await page.getByTestId("placement-reason-select").selectOption("initial");
  await page.getByTestId("placement-submit").click();
  await expect(page.getByTestId("current-location")).toContainText("Cool bench");

  const refusal = page.getByTestId("cultivation-calyx-unavailable");
  await expect(refusal).toBeVisible();
  await expect(refusal).toContainText(/No genus is written/i);
  await expect(refusal).toContainText("kovachii");
  await expect(refusal).toContainText(/Add the genus in front of it/i);
  // Not the misleading claim it used to make.
  await expect(refusal).not.toContainText(/is not a species/i);
  await expect(page.getByTestId("cultivation-calyx-submit")).toHaveCount(0);
});

/* ----------------------------------------------------------------- 7 ----- */

test("7. the evaluation carries the species outward and the cross inward", async () => {
  // Back to AM1: the two steps before this one recorded other plants.
  await visit(plantUrl);
  await expect(page.getByTestId("cultivation-calyx-disclosure")).toContainText(AM1_IDENTITY);
  await page.getByTestId("cultivation-calyx-submit").click();
  await expect(page).toHaveURL(/\/calyx\?/);
  const arrived = new URL(page.url());

  // Outward, the address is the species. The cultivar names are the grower's
  // record and stay out of a string that reaches history and Referer.
  expect(arrived.searchParams.get("taxon")).toBe(AM1_SPECIES);
  expect(arrived.searchParams.get("genus")).toBe("Phragmipedium");
  expect(arrived.searchParams.get("context_is_evidence")).toBe("false");
  // Checked as parameter values, not as substrings of the whole query string:
  // the handoff token is random hex and will sooner or later contain any short
  // digit sequence, which would fail a substring check for a reading.
  expect([...arrived.searchParams.keys()].sort()).toEqual([
    "context_is_evidence", "cultivation", "genus", "origin", "taxon",
  ]);
  const carried = [...arrived.searchParams.entries()]
    .filter(([key]) => key !== "cultivation")
    .map(([, value]) => value)
    .join(" ");
  for (const secret of [
    "Daniela", "Maria", "Cool bench", "Warm shelf", "Unmeasured corner",
    accession, qrIdentifier, "28", "21",
  ]) {
    expect(carried, `"${secret}" reached the address`).not.toContain(secret);
  }

  // Inward, the subject is the plant the grower has.
  const banner = page.getByTestId("cultivation-handoff-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(AM1_IDENTITY);

  // And the difference between the two is stated, not left to be inferred.
  const basis = page.getByTestId("cultivation-handoff-taxon-basis");
  await expect(basis).toContainText(AM1_SPECIES);
  await expect(basis).toContainText(/both parents of this cross belong to/i);
  await expect(basis).toContainText(/not evidence about this exact plant/i);

  await expect(banner).toContainText(/not scientific evidence and not occurrence records/i);
  await expect(banner).toContainText(/temperature c 28/i);
  await expect(page.getByTestId("cultivation-handoff-alternatives")).toContainText(/\bB\b.*shelf.*21/i);
  expect(await banner.textContent()).not.toContain("Warm shelf");

  // The unmeasured place is not here at all — not as a letter, not as a kind,
  // not as an empty row. Sending it with no observations would invite a
  // comparison against conditions nobody recorded.
  // Matched against how an entry actually renders — "B (a shelf: …)" — rather
  // than against a bare letter: this panel also prints "temperature C", and a
  // \bC\b check passes or fails on the Celsius unit instead of on a place.
  const alternatives = (await page.getByTestId("cultivation-handoff-alternatives").textContent()) ?? "";
  expect(alternatives).not.toContain("Unmeasured corner");
  expect(alternatives).toContain("B (a ");
  expect(alternatives).not.toContain("C (a ");
  expect(alternatives.split(" \u00b7 ")).toHaveLength(1);
});

/* --------------------------------------------------------------- 7b ----- */

test("7b. the evaluation is kept in AM1's own history", async () => {
  // A recommendation a grower half-remembers has nothing behind it. The record
  // that the question was asked, about which species, with which readings
  // standing at the time, is what lets a later reader tell whether an answer
  // still applies.
  await visit(plantUrl);
  const history = page.getByTestId("evaluation-history");
  await expect(history).toBeVisible();

  const entries = page.getByTestId("evaluation-history-list").locator("li");
  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toContainText(AM1_IDENTITY);
  await expect(entries.first()).toContainText(AM1_SPECIES);
  await expect(entries.first()).toContainText(/greenhouse bench/i);
  await expect(entries.first()).toContainText(/temperature c 28/i);
  await expect(entries.first()).toContainText(/1 other place considered/i);

  // The shade house had a letter and no readings. The history says it went
  // uncompared rather than omitting it, because a bench that simply never
  // appears in the answer reads as one that lost the comparison.
  await expect(entries.first()).toContainText(/1 that could not be compared for lack of readings/i);
  // And it is still not ranked: only the measured alternative travelled.
  await expect(entries.first()).not.toContainText(/2 other places considered/i);

  // A log of asking, not of findings.
  await expect(page.getByTestId("evaluation-history-basis")).toContainText(/nothing here is evidence/i);
  await expect(page.getByTestId("evaluation-history-basis")).toContainText(/does not correct an earlier one/i);
});

/* ----------------------------------------------------------------- 8 ----- */

test("8. the Conservatory compares AM1 against species evidence and says which is which", async () => {
  await visit(plantUrl);
  const assessment = page.getByTestId("placement-assessment");
  await expect(assessment).toBeVisible();

  // 28 C is above the species bound the fixture backend holds, so a real
  // verdict is reached rather than the "nothing could be compared" branch.
  await expect(assessment.getByTestId("nothing-assessed")).toHaveCount(0);
  await expect(assessment).toContainText(/temperature/i);
  // A comparison is never advice, and the page keeps saying so.
  await expect(assessment.getByTestId("assessment-not-advice")).toBeVisible();
});

/* ----------------------------------------------------------------- 9 ----- */

test("9. everything about AM1 survives sign-out and sign-in", async () => {
  await visit("/");
  await page.getByTestId("account-menu").click();
  await page.getByTestId("account-sign-out").click();
  await expect(page.getByRole("button", { name: /^sign in$/i }).first()).toBeVisible({ timeout: 20_000 });

  await visit("/conservatory");
  await expect(page.getByText("RESTRICTED \u00b7 CONTINUUM MEMBERS")).toBeVisible();

  await visit("/");
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  const modal = page.getByRole("dialog");
  await modal.getByPlaceholder("you@orchidcontinuum.org").fill(ACCOUNT.email);
  await modal.getByPlaceholder("\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022").fill(ACCOUNT.password);
  await modal.getByRole("button", { name: /^sign in$/i }).last().click();
  await expect(page.getByTestId("account-menu")).toBeVisible({ timeout: 20_000 });

  await visit(plantUrl);
  await expect(page.getByText(AM1_IDENTITY).first()).toBeVisible();
  await expect(page.getByText(accession).first()).toBeVisible();
  await expect(page.getByTestId("current-location")).toContainText("Cool bench");
  await expect(page.getByTestId("photograph-list")).toBeVisible();
  await expect(page.getByTestId("measurement-list")).toContainText("5.6 in");
  // The evaluation history is part of the plant's record, not the session's.
  await expect(page.getByTestId("evaluation-history-list").locator("li")).toHaveCount(1);
});
