// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import CalyxEvidencePanel from "@/components/calyx/CalyxEvidencePanel";
import { evidenceOf } from "@/lib/__fixtures__/calyxScientificEvidence";
import { readScientificEvidence } from "@/lib/calyxScientificEvidence";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function show(raw: unknown) {
  act(() => root.render(<CalyxEvidencePanel evidence={readScientificEvidence(raw)} />));
}
const text = () => container.textContent ?? "";
const all = (id: string) => Array.from(container.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
const button = (label: RegExp) => {
  const found = Array.from(container.querySelectorAll("button")).find((b) => label.test(b.textContent ?? ""));
  if (!found) throw new Error(`no button ${label}`);
  return found;
};
const click = (el: HTMLElement) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

describe("nothing to show", () => {
  it.each(["not-applicable-general"])("%s renders nothing", (name) => {
    show(evidenceOf(name));
    expect(container.innerHTML).toBe("");
  });
  it("research_mode never (not_requested) renders nothing", () => {
    show(evidenceOf("research-mode-never"));
    expect(container.innerHTML).toBe("");
  });
});

describe("single taxon, pollination", () => {
  it("shows the taxon (no internal node id), the sentences once and the records behind a button", () => {
    show(evidenceOf("pollination-species"));
    const raw = evidenceOf("pollination-species") as { reading: string[] };
    expect(all("calyx-evidence-sentences")[0].querySelectorAll("li")).toHaveLength(raw.reading.length);
    expect(all("calyx-subject")).toHaveLength(1);
    expect(all("calyx-subject")[0].textContent).not.toContain("graph node");
    // The sentences are the same as the turn's own, so the subject does not print them again.
    expect(all("calyx-subject-sentences")).toHaveLength(0);
    expect(text().split(raw.reading[0]).length - 1).toBe(1);
    expect(text()).toContain("Topics read: pollination");
    const toggle = button(/Cited interaction records/);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('[data-kind="relationships"] [data-testid="calyx-record-text"]')).toBeNull();
    click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(text()).toContain("Cited: Saul-Gershenz");
    expect(text()).toContain("observed \u00b7 A source asserts this; the Continuum has not reviewed it");
    expect(text()).toContain("Unreviewed. These are records, not a reviewed conclusion.");
  });

  it("links a DOI that has the DOI shape and nothing else", () => {
    show(evidenceOf("pollination-species"));
    click(button(/Cited interaction records/));
    const links = Array.from(container.querySelectorAll("a"));
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) expect(a.getAttribute("href")).toMatch(/^https:\/\/doi\.org\/10\.\d{4,9}\/\S+$/);
    expect(container.innerHTML).not.toMatch(/href="(?!https:\/\/doi\.org\/)/);
  });

  it("does not link a malformed DOI and does not link URLs inside source text", () => {
    const raw = structuredClone(evidenceOf("pollination-species")) as Record<string, any>;
    raw.subjects[0].evidence.relationships[0].doi = "javascript:alert(1)";
    raw.subjects[0].evidence.relationships[0].citation_text = "See https://evil.example/x";
    show(raw);
    click(button(/Cited interaction records/));
    expect(container.querySelectorAll("a")).toHaveLength(Array.from(container.querySelectorAll("a")).filter((a) => a.getAttribute("href")?.startsWith("https://doi.org/10.")).length);
    expect(text()).toContain("See https://evil.example/x");
    expect(text()).toContain("DOI javascript:alert(1)");
  });

  it("shows not-retrieved as the backend's sentences, never as 'no pollinator'", () => {
    show(evidenceOf("pollination-not-ingested"));
    const section = container.querySelector('[data-kind="not_retrieved"]');
    expect(section?.textContent).toMatch(/Not retrieved/);
    expect(section?.textContent).toContain("Not yet ingested");
    expect(container.querySelector('[data-kind="relationships"]')).toBeNull();
    expect(text()).not.toMatch(/no pollinators?\b|no known pollinator|none recorded|absent/i);
  });

  it("shows a held-back count and the returned reason, and nothing identifying", () => {
    const raw = structuredClone(evidenceOf("pollination-quarantined")) as Record<string, any>;
    raw.subjects[0].evidence.held_back[0].partner = "SECRET PARTNER";
    raw.subjects[0].evidence.held_back[0].edge_ids = [424242];
    show(raw);
    const section = container.querySelector('[data-kind="held_back"]');
    expect(section?.textContent).toContain("2 held back");
    expect(section?.textContent).toMatch(/held back pending review/);
    expect(text()).not.toContain("SECRET PARTNER");
    expect(text()).not.toContain("424242");
  });
});

describe("species and variety", () => {
  it("draws the variety's records and the species' records as two separate blocks, the second labelled with the returned note", () => {
    show(evidenceOf("pollination-variety-context"));
    const [direct, context] = all("calyx-subject");
    expect(direct.dataset.scope).toBe("direct_subtaxon");
    expect(context.dataset.scope).toBe("contextual_parent_species");
    expect(direct.textContent).toContain("Ophrys sphegodes var. provincialis");
    expect(direct.textContent).not.toContain("Cited interaction records");
    expect(context.textContent).toContain("Context only, records of the species");
    const raw = evidenceOf("pollination-variety-context") as { contextual_note: string; notices: string[] };
    expect(context.querySelector('[data-testid="calyx-subject-context-note"]')?.textContent).toBe(raw.contextual_note);
    expect(context.textContent).toContain("Cited interaction records");
    expect(all("calyx-notices")[0].textContent).toContain(raw.notices[0]);
    // The species' own sentences are printed in the species block, and only there.
    expect(direct.querySelectorAll('[data-testid="calyx-subject-sentences"] li').length).toBe(0);
    expect(context.querySelectorAll('[data-testid="calyx-subject-sentences"] li').length).toBeGreaterThan(5);
  });
});

describe("several taxa and comparison", () => {
  it("shows both taxa and the comparison lines, and does not claim the turn returned no sentences", () => {
    show(evidenceOf("distribution-two-species"));
    expect(all("calyx-subject")).toHaveLength(2);
    expect(text()).toContain("Chloraea bletioides");
    expect(all("calyx-subject-sentences")).toHaveLength(2);
    const raw = evidenceOf("distribution-two-species") as { comparison: { lines: string[] } };
    expect(all("calyx-comparison")[0].textContent).toContain(raw.comparison.lines[0]);
    expect(all("calyx-evidence-empty")).toHaveLength(0);
    expect(all("calyx-evidence-species")[0].textContent).toBe("Ophrys sphegodes; Chloraea bletioides");
    // A distribution question carries no pollination flag, so no pollination line is printed.
    expect(all("calyx-evidence-pollination")).toHaveLength(0);
  });
});

describe("distribution, conservation, synonymy: source text verbatim", () => {
  it("shows area markers as written and no legend or colour meaning", () => {
    show(evidenceOf("distribution-species"));
    click(button(/Checklist areas/));
    expect(text()).toContain("?Portugal");
    expect(text()).toContain("18 of 18 shown");
    expect(text()).toContain("documented \u00b7 UNREVIEWED");
    expect(text()).not.toMatch(/legend|doubtful|introduced|uncertain presence/i);
    expect(container.innerHTML).not.toMatch(/title=|<svg|<img/);
  });

  it("shows a conservation note exactly as written, without a Red List badge", () => {
    show(evidenceOf("conservation-note"));
    click(button(/Checklist conservation note/));
    expect(all("calyx-record-text").map((n) => n.textContent)).toContain("IUCN Ex/E");
    expect(text()).not.toMatch(/Extinct|Endangered|Red List|badge/i);
  });

  it("with no note, says only what the backend said and states no conservation status", () => {
    show(evidenceOf("conservation-no-note"));
    click(button(/Checklist conservation note/));
    expect(text()).toContain("Nothing retrieved in this store");
    expect(text()).toContain("evidence state not reported \u00b7 review state not reported");
    // The page adds no wording of its own about the taxon's status: the record block holds the
    // state line and the backend's statement, nothing else.
    const block = container.querySelector('[data-kind="conservation"]');
    expect(block?.querySelectorAll("li")).toHaveLength(1);
    expect(block?.querySelector('[data-testid="calyx-record-state"]')?.textContent).toBe("evidence state not reported \u00b7 review state not reported");
  });

  it("shows N of M for a truncated synonym list, and what follows each name as given", () => {
    show(evidenceOf("synonymy-list-truncated"));
    const toggle = button(/Checklist synonym entries/);
    expect(toggle.textContent).toContain("25 of 31 shown");
    click(toggle);
    expect(text()).toContain("Arachnites aranifera (Huds.) Bubani [Fl. Pyren. [Bubani] 4: 48 (1901)]");
    // No styling that assigns a name a status (strike-through, colour, badge).
    const block = container.querySelector('[data-kind="synonymy"]');
    expect(block?.innerHTML).not.toMatch(/line-through|text-red|text-green|bg-red|bg-green|<del|<s>|<mark|<svg|title=/);
  });
});

describe("synonym lookups and unresolved names", () => {
  it("states 'asked as' and 'also asked as' next to the taxon whose records are shown", () => {
    show(evidenceOf("synonym-two-names-one-species"));
    expect(all("calyx-subject-asked-as")[0].textContent).toBe("Asked as Asarca bletioides; the records are those of Chloraea bletioides.");
    expect(all("calyx-subject-also-asked-as")[0].textContent).toBe("Also asked as Asarca affinis; the records are those of Chloraea bletioides.");
    expect(container.querySelectorAll('[data-kind="synonym_resolution"]')).toHaveLength(2);
  });

  it.each(["synonym-ambiguous", "synonym-accepted-taxon-is-a-variety", "synonym-with-infraspecific-word", "name-not-held"])(
    "%s: shows the returned explanation and no taxon records",
    (name) => {
      const raw = evidenceOf(name) as { explanation: string };
      show(raw);
      expect(container.querySelector("section")?.getAttribute("data-evidence-kind")).toBe("not_resolved");
      expect(text()).toContain(raw.explanation);
      expect(container.querySelector('[data-kind="distribution"]')).toBeNull();
      expect(container.querySelector('[data-kind="relationships"]')).toBeNull();
      expect(all("calyx-evidence-sentences")).toHaveLength(0);
    },
  );

  it("lists every candidate of an ambiguous name, as the checklist wrote it", () => {
    show(evidenceOf("synonym-ambiguous"));
    click(button(/Name lookup in the checklist/));
    expect(all("calyx-record-text")).toHaveLength(2);
    expect(text()).toContain("listed under Orchis olbiensis");
  });
});

describe("unreadable parts are named, and the sentences stay", () => {
  it("shows 'could not be displayed' for a broken part and keeps the sentences and the other parts", () => {
    const raw = structuredClone(evidenceOf("pollination-species")) as Record<string, any>;
    raw.subjects[0].evidence.relationships = 7;
    show(raw);
    expect(all("calyx-record-unreadable")[0].textContent).toBe("Cited interaction records: could not be displayed.");
    expect(all("calyx-evidence-sentences")[0].querySelectorAll("li").length).toBe(raw.reading.length);
    expect(container.querySelector('[data-kind="not_retrieved"]')).not.toBeNull();
  });

  it("shows 'could not be displayed' for a broken taxon entry", () => {
    const raw = structuredClone(evidenceOf("distribution-two-species")) as Record<string, any>;
    raw.subjects[0] = null;
    show(raw);
    expect(all("calyx-subject-unreadable")).toHaveLength(1);
    expect(all("calyx-subject")).toHaveLength(1);
  });

  it("an unknown status shows no records", () => {
    show({ ...(evidenceOf("pollination-species") as object), status: "partially_available" });
    expect(container.querySelector("section")?.getAttribute("data-evidence-kind")).toBe("unrecognised");
    expect(all("calyx-subject")).toHaveLength(0);
  });
});

describe("accessibility", () => {
  it("is a labelled region and every collapsible control is a button with aria-expanded", () => {
    show(evidenceOf("pollination-species"));
    const region = container.querySelector("section");
    expect(region?.getAttribute("aria-labelledby")).toBe(region?.querySelector("h3")?.id);
    const toggles = Array.from(container.querySelectorAll("[data-testid='calyx-record-section'] button"));
    expect(toggles.length).toBeGreaterThan(0);
    for (const t of toggles) {
      expect(t.getAttribute("aria-expanded")).toMatch(/^(true|false)$/);
      expect(t.getAttribute("aria-controls")).toBeTruthy();
    }
  });
});

describe("pre-#2420 block shape", () => {
  it("renders as before: sentences, pollination line, no structured blocks", () => {
    show({ status: "available", reading: ["One."], species: "A b", pollination_verified: false, read_only: true, is_reviewed_conclusion: false });
    expect(all("calyx-evidence-sentences")[0].textContent).toBe("One.");
    expect(all("calyx-evidence-pollination")[0].dataset.pollination).toBe("not-established");
    expect(all("calyx-subject")).toHaveLength(0);
    expect(all("calyx-evidence-empty")).toHaveLength(0);
  });
  it("still says no sentences were returned when nothing at all was", () => {
    show({ status: "available", reading: [], species: "A b" });
    expect(all("calyx-evidence-empty")).toHaveLength(1);
  });
});
