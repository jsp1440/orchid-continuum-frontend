import { expect, test, type Page } from "@playwright/test";

/**
 * Every governed arrival at Calyx tells the reader what it carried.
 *
 * A trust boundary has two halves. One is machine-readable — the declarations
 * in the turn envelope, covered thoroughly by unit tests. The other is what a
 * person actually sees on the page, and the two are separate mechanisms that
 * can drift apart without any per-hop test noticing.
 *
 * They did drift. `atlas-next` was added to the boundary when its producer
 * landed, so the envelope was correct, while the banner still tested for two
 * named origins — and a reader arriving from a map of occurrence records was
 * shown nothing at all. Every unit test was green, because every hop was
 * right in isolation. What was missing was between them.
 *
 * So this sweep asserts one property across every producer: an arrival is
 * never silent. It either discloses its context or it is refused. There is no
 * third outcome where a subject is carried into the workspace and the reader
 * is told nothing about it.
 *
 * The addresses are the ones the real producers build. They are pinned against
 * those producers in src/lib/calyxArrivalDisclosureAddresses.test.ts, so a
 * producer that changes its shape fails there rather than quietly making this
 * sweep test a URL nobody emits any more.
 */

test.describe.configure({ mode: "serial" });

let page: Page;

/** Every banner the Calyx route can raise for an arrival it accepted. */
const DISCLOSURE_LABELS = [
  "Conservatory cultivation context",
  "Species Dossier handoff context",
  "Classroom investigation context",
  "Genus handoff context",
  "Atlas handoff context",
  "Research Station handoff context",
];

type GovernedArrival = {
  producer: string;
  href: string;
  expectedDisclosure: string;
};

const GOVERNED_ARRIVALS: ReadonlyArray<GovernedArrival> = [
  {
    producer: "homepage featured taxon",
    href: "/calyx?genus=Phalaenopsis&origin=homepage-featured-taxon&context_is_evidence=false",
    expectedDisclosure: "Genus handoff context",
  },
  {
    producer: "Atlas workspace",
    href: "/calyx?genus=Phalaenopsis&origin=atlas-workspace&context_is_evidence=false",
    expectedDisclosure: "Atlas handoff context",
  },
  {
    producer: "Genus Profile",
    href: "/calyx?genus=Phalaenopsis&origin=genus-profile&context_is_evidence=false",
    expectedDisclosure: "Genus handoff context",
  },
  {
    producer: "Atlas Next genus",
    href: "/calyx?genus=Phalaenopsis&origin=atlas-next&context_is_evidence=false",
    expectedDisclosure: "Genus handoff context",
  },
  {
    producer: "Research Station",
    href: "/calyx?genus=Phalaenopsis&taxon=Phalaenopsis+amabilis&origin=research-station",
    expectedDisclosure: "Research Station handoff context",
  },
  {
    producer: "Species Dossier",
    href: "/calyx?genus=Phalaenopsis&taxon=Phalaenopsis+amabilis&origin=species-dossier-calyx&context_is_evidence=false",
    expectedDisclosure: "Species Dossier handoff context",
  },
  {
    producer: "Classroom investigation",
    // Kept on one line on purpose: src/lib/calyxArrivalDisclosureAddresses.test.ts
    // matches this literal against what the producer builds, and a split string
    // would make that pin pass on nothing.
    href: "/calyx?genus=Phalaenopsis&taxon=Phalaenopsis+amabilis&origin=classroom-investigation&context_is_evidence=false&context_is_learner_draft=true&question=Why+here%3F&question_source=user&question_is_evidence=false",
    expectedDisclosure: "Classroom investigation context",
  },
  {
    producer: "Atlas Next occurrence evidence",
    href: "/calyx?genus=Phalaenopsis&origin=atlas-next-occurrence-evidence&question=Where+does+it+live%3F&question_source=user&question_is_evidence=false",
    expectedDisclosure: "Atlas handoff context",
  },
];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  // Webfonts and an embedded third-party script are unreachable here and the
  // load event waits on them. Nothing off this host affects disclosure.
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === "localhost" ? route.continue() : route.abort();
  });
});

test.afterAll(async () => {
  await page?.close();
});

async function disclosuresOn(href: string): Promise<string[]> {
  await page.goto(href, { waitUntil: "domcontentloaded" });
  // A refused arrival never mounts the workspace, so waiting on its heading
  // would time out on exactly the case this sweep most needs to observe.
  // Settle on whichever of the two outcomes the route reached.
  await expect
    .poll(
      async () =>
        (await page.getByRole("heading", { name: /Speak with Calyx/i }).count()) +
        (await page.getByLabel("Rejected Calyx navigation context").count()),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  const shown: string[] = [];
  for (const label of DISCLOSURE_LABELS) {
    if (await page.getByLabel(label).isVisible()) shown.push(label);
  }
  if (await page.getByLabel("Rejected Calyx navigation context").isVisible()) {
    shown.push("Rejected Calyx navigation context");
  }
  return shown;
}

for (const { producer, href, expectedDisclosure } of GOVERNED_ARRIVALS) {
  test(`${producer} discloses its own arrival context`, async () => {
    const shown = await disclosuresOn(href);
    expect(
      shown,
      `${producer} did not show its producer-specific disclosure (${expectedDisclosure})`,
    ).toContain(expectedDisclosure);
  });
}

test("a subject carried with no governed origin at all is not disclosed as though it were", async () => {
  // The other side of the property. An unknown origin is not a governed
  // arrival, so there is nothing to disclose about where it came from — and
  // the route must not borrow another origin's banner to describe it.
  const shown = await disclosuresOn("/calyx?genus=Phalaenopsis&origin=some-other-surface");
  expect(shown).toEqual([]);
});

test("a governed origin that dropped its declaration is refused, on every genus producer", async () => {
  for (const origin of ["homepage-featured-taxon", "genus-profile", "atlas-next", "atlas-workspace"]) {
    const shown = await disclosuresOn(`/calyx?genus=Phalaenopsis&origin=${origin}`);
    expect(shown, `${origin} was not refused after losing its declaration`).toEqual([
      "Rejected Calyx navigation context",
    ]);
  }
});
