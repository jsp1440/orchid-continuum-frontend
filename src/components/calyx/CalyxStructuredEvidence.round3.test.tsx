// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import CalyxEvidencePanel from "@/components/calyx/CalyxEvidencePanel";
import { evidenceOf, fixtures } from "@/lib/__fixtures__/calyxScientificEvidence";
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
  // a fresh tree each time, so a section opened for an earlier response is not toggled shut again
  act(() => root.unmount());
  root = createRoot(container);
  act(() => root.render(<CalyxEvidencePanel evidence={readScientificEvidence(raw)} />));
}
const openAll = () => {
  for (const b of Array.from(container.querySelectorAll("button"))) act(() => { b.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};
const clone = (name: string) => structuredClone(evidenceOf(name)) as Record<string, any>;
const section = (kind: string) => container.querySelector(`[data-kind="${kind}"]`);
const itemTexts = (kind: string) => Array.from(section(kind)?.querySelectorAll('[data-testid="calyx-record-text"]') ?? []).map((n) => n.textContent);
const notes = (kind: string) => Array.from(section(kind)?.querySelectorAll("li span.block") ?? []).map((n) => n.textContent).join(" | ");
const heading = (kind: string) => section(kind)?.querySelector("button, h5")?.textContent ?? "";

const NEW = Object.keys(fixtures).filter((name) => /^(remark-|hybrid-|parent-|older-)/.test(name));

describe("round 3: every captured response of the new topics", () => {
  it.each(NEW)("%s reads, shows no part as undisplayable and no internal id in the page's own wording", (name) => {
    show(evidenceOf(name));
    openAll();
    expect(container.textContent).not.toMatch(/could not be displayed|undefined|\[object|NaN/);
    // the page's own lines: items, notes, headings, summaries (the backend's sentences are shown as returned and are checked apart)
    const own = Array.from(container.querySelectorAll('[data-testid="calyx-record-text"], li span.block, h3, h4, h5, button, [data-testid="calyx-record-note"]')).map((n) => n.textContent).join(" | ");
    expect(own).not.toMatch(/taxon:|kg_node|graph node|edge_id|implied:|checklist_remark:/);
    expect(own).not.toMatch(/Hybrids of/);
    expect(own).not.toMatch(/seed parent|pollen parent|mother|father|maternal|paternal/i);
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });
});

describe("checklist_remark", () => {
  it("quotes the remark whole, as written, with no restatement", () => {
    show(evidenceOf("remark-shown"));
    openAll();
    expect(itemTexts("remark_text")).toEqual(["possibly only a form of C. robertsonii"]);
    expect(heading("remark_text")).toContain("1 shown");
    expect(section("remark_text")?.textContent).toContain("not a finding of the Continuum");
  });
  it("a shared text says it is shared and says nothing about relatedness", () => {
    show(evidenceOf("remark-shared-by-several-taxa"));
    openAll();
    expect(notes("remark_text")).toContain("3 taxa of the graph carried exactly this text; sharing a text says nothing about those taxa being related.");
  });
  it("a withheld remark shows that it was held back and nothing else of it", () => {
    show(evidenceOf("remark-withheld-by-privacy-gate"));
    openAll();
    expect(itemTexts("remark_text")).toEqual(["The checklist has a remark here. Its text is held back by the privacy gate and is not shown."]);
    expect(heading("remark_text")).toContain("0 shown \u00b7 1 held back by the privacy gate");
    expect(notes("remark_text")).toBe("");
    const raw = clone("remark-withheld-by-privacy-gate");
    raw.subjects[0].evidence.checklist_remark.remarks[0].remark_as_written_by_source = "LEAKED TEXT";
    raw.subjects[0].evidence.checklist_remark.remarks[0].characters = 77;
    show(raw);
    openAll();
    expect(container.textContent).not.toContain("LEAKED TEXT");
    expect(container.textContent).not.toContain("77");
  });
  it("no remark is nothing retrieved, never undisputed", () => {
    show(evidenceOf("remark-none"));
    expect(heading("remark_text")).toContain("nothing retrieved");
    openAll();
    expect(section("remark_text")?.textContent).toContain("A taxon without a remark here is not thereby undisputed.");
    expect(container.textContent).not.toMatch(/has no remark|no doubts|is undisputed\./);
  });
  it("(synthetic) a cut text says so; a malformed remark makes only that part unreadable", () => {
    const raw = clone("remark-shown");
    raw.subjects[0].evidence.checklist_remark.remarks[0].remark_text_cut = true;
    show(raw);
    openAll();
    expect(notes("remark_text")).toContain("The text is cut.");
    raw.subjects[0].evidence.checklist_remark.remarks[0] = 5;
    show(raw);
    expect(container.querySelector('[data-testid="calyx-record-unreadable"]')?.textContent).toContain("could not be displayed");
  });
});

describe("hybrid_formula", () => {
  it("both parents matched: names with how they were read, a match by name and never an identity", () => {
    show(evidenceOf("hybrid-formula-both-parents-matched"));
    openAll();
    expect(itemTexts("hybrid_formula")).toEqual(["Ophrys sicula x speculum"]);
    const n = notes("hybrid_formula");
    expect(n).toContain("Parent 1: written \u201cOphrys sicula\u201d \u00b7 matched by name to a taxon of the graph (a match by name, not a verified identity)");
    expect(n).toContain("Parent 2: written \u201cspeculum\u201d \u00b7 read as \u201cOphrys speculum\u201d");
    expect(section("hybrid_formula")?.textContent).toContain("does not say which parent bore the seed or the pollen");
  });
  it("a parent matched to a species-level name the checklist lists only below the species (switch on), and the same parent not matched (switch off)", () => {
    show(evidenceOf("hybrid-formula-parent-matched-to-implied-name-switch-on"));
    openAll();
    expect(notes("hybrid_formula")).toContain("Parent 1: written \u201cOphrys implicata\u201d \u00b7 matched by name to a species-level name that the checklist lists only through rows below the species (a match by name, not a verified identity)");
    show(evidenceOf("hybrid-formula-parent-not-matched-switch-off"));
    openAll();
    expect(notes("hybrid_formula")).toContain("Parent 1: written \u201cOphrys implicata\u201d \u00b7 not matched: only a species-level name that the checklist lists through rows below the species carries that name");
    expect(notes("hybrid_formula")).not.toContain("Parent 1: written \u201cOphrys implicata\u201d \u00b7 matched");
  });
  it("a hedged formula shows both qualifiers as written and no parent as matched", () => {
    show(evidenceOf("hybrid-formula-hedged"));
    openAll();
    const n = notes("hybrid_formula");
    expect(n).toContain("the source writes before the formula: probably");
    expect(n).toContain("the source writes after the formula: fide Liu & Lin 2025");
    expect(n.match(/not matched: the source hedges the formula/g)).toHaveLength(2);
    expect(n).not.toContain("matched by name");
  });
  it("a qualified parent, an unmatched parent, several taxa with the name, a question mark", () => {
    show(evidenceOf("hybrid-formula-qualified-parent")); openAll();
    expect(notes("hybrid_formula")).toContain("the source qualifies this parent; the qualifier is part of the name as written \u00b7 not matched: the source qualifies this parent");
    show(evidenceOf("hybrid-formula-unmatched-parent-no-taxon")); openAll();
    expect(notes("hybrid_formula")).toContain("not matched: no taxon of the graph carries that name");
    show(evidenceOf("hybrid-formula-several-taxa-carry-the-name")); openAll();
    expect(notes("hybrid_formula")).toContain("not matched: several taxa carry that name, none is chosen");
    show(evidenceOf("hybrid-formula-parent-is-a-question-mark")); openAll();
    expect(notes("hybrid_formula")).toContain("Parent 2: written \u201c?\u201d \u00b7 the source names no parent here");
  });
  it("(synthetic) a reason code the page does not know is shown as returned", () => {
    const raw = clone("hybrid-formula-hedged");
    raw.subjects[0].evidence.hybrid_formula.formulas[0].parents[0].not_matched_reason = "something_new";
    show(raw); openAll();
    expect(notes("hybrid_formula")).toContain("not matched (reason code as returned: something_new)");
  });
  it("parents unknown is the source's own statement, as written", () => {
    show(evidenceOf("hybrid-formula-parents-unknown"));
    openAll();
    expect(itemTexts("hybrid_formula")).toEqual(["parents unknown"]);
    expect(notes("hybrid_formula")).toContain("The source states that the parents are unknown (its own words, as written).");
  });
  it.each(["hybrid-formula-no-formula-nothotaxon", "hybrid-formula-species-without-formula"])("%s is nothing retrieved, not 'no parents' and not 'parents unknown'", (name) => {
    show(evidenceOf(name));
    expect(heading("hybrid_formula")).toContain("nothing retrieved");
    openAll();
    expect(itemTexts("hybrid_formula")).toEqual([]);
    expect(container.textContent).not.toMatch(/parents unknown|has no parents|is not a hybrid/);
  });
});

describe("parent_nothotaxa", () => {
  it("several nothotaxa: each by its own label beside the formula as written; the heading is not 'Hybrids of'", () => {
    show(evidenceOf("parent-nothotaxa-several"));
    openAll();
    expect(itemTexts("parent_nothotaxa")).toEqual(["Ophrys x implicatella", "Ophrys x scontusiana"]);
    const n = notes("parent_nothotaxa");
    expect(n).toContain("formula as the source writes it: \u201cOphrys implicata x sicula\u201d");
    expect(n).toContain("the asked name is written there as \u201csicula\u201d (parent 2 of the formula)");
    expect(heading("parent_nothotaxa")).toContain("Nothotaxa whose checklist formulas name this taxon as a parent");
    expect(section("parent_nothotaxa")?.textContent).toContain("This is not the list of the hybrids of the taxon.");
  });
  it("a list longer than a page says N of M shown and where the next page starts", () => {
    show(evidenceOf("parent-nothotaxa-long-first-page"));
    expect(heading("parent_nothotaxa")).toContain("25 of 31 shown");
    openAll();
    expect(section("parent_nothotaxa")?.textContent).toContain("The list continues: the next page starts at row 26.");
  });
  it("nothing retrieved is nothing retrieved, with the backend's sentence", () => {
    show(evidenceOf("parent-nothotaxa-nothing-retrieved"));
    expect(heading("parent_nothotaxa")).toContain("nothing retrieved");
    openAll();
    expect(section("parent_nothotaxa")?.textContent).toContain("Nothing retrieved in this store: no formula that the Continuum read");
    expect(container.textContent).not.toMatch(/has no hybrids|forms no hybrids|0 shown/);
  });
  it.each([
    ["parent-nothotaxa-names-read-like-not-matched", "Ophrys araneola [argentaria]", "not matched: the source qualifies this parent"],
    ["parent-nothotaxa-implied-name-switch-off", "Ophrys implicata", "not matched: only a species-level name that the checklist lists through rows below the species carries that name"],
  ])("%s: names that read like the asked name sit apart, with their reason, not in the list", (name, label, reason) => {
    show(evidenceOf(name));
    openAll();
    expect(itemTexts("parent_nothotaxa")).toEqual([]);
    expect(itemTexts("parent_entries_not_matched")).toEqual([`${label} \u00b7 1 formula`]);
    expect(notes("parent_entries_not_matched")).toContain(reason);
  });
  it("with the switch on the same asked name is listed", () => {
    show(evidenceOf("parent-nothotaxa-implied-name-switch-on"));
    openAll();
    expect(itemTexts("parent_nothotaxa")).toEqual(["Ophrys x implicatella"]);
    expect(section("parent_entries_not_matched")).toBeNull();
  });
  it("a nothotaxon as the subject: a limit, not a list and not 'no hybrids'", () => {
    show(evidenceOf("parent-nothotaxa-subject-is-a-nothotaxon"));
    openAll();
    expect(heading("parent_nothotaxa")).toContain("no list built: the asked name is a nothotaxon");
    expect(section("parent_nothotaxa")?.textContent).toContain("That is a limit of the list, not a finding.");
    expect(itemTexts("parent_nothotaxa")).toEqual([]);
    expect(container.textContent).not.toMatch(/nothing retrieved|has no hybrids/);
  });
  it("an ambiguous taxon: no evidence is shown, the returned explanation is", () => {
    show(evidenceOf("parent-nothotaxa-ambiguous-taxon"));
    expect(container.querySelector("section")?.getAttribute("data-evidence-kind")).toBe("not_resolved");
    expect(container.textContent).toContain("not a single resolved species");
    expect(container.querySelector('[data-kind="parent_nothotaxa"]')).toBeNull();
  });
  it("a name that is not in the graph reads as not applicable with its explanation or nothing", () => {
    for (const name of ["parent-nothotaxa-taxon-not-in-graph", "hybrid-name-graph-does-not-use"]) {
      show(evidenceOf(name));
      expect(container.textContent).not.toMatch(/no hybrids|does not exist|is not a hybrid/);
    }
  });
});

describe("older topics for a nothotaxon", () => {
  it("distribution of a nothotaxon is the ordinary distribution section and names no internal id", () => {
    show(evidenceOf("older-topic-distribution-for-a-nothotaxon"));
    openAll();
    expect(itemTexts("distribution")).toEqual(["Lesser Sunda Isl."]);
    expect(container.querySelector("h4")?.textContent).not.toMatch(/node/);
  });
});
