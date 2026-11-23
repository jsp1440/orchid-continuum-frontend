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
// These tests deliberately corrupt cloned payloads. Check each container while
// retaining its identity so later edits still affect the payload passed to show.
function fixtureValueAt(value: unknown, ...path: Array<string | number>): unknown {
  for (const key of path) {
    if (value === null || typeof value !== "object") throw new Error(`Expected fixture container at ${key}`);
    value = Reflect.get(value, key);
  }
  return value;
}
function fixtureRecordAt(value: unknown, ...path: Array<string | number>): Record<string, unknown> {
  const record = fixtureValueAt(value, ...path);
  if (record === null || typeof record !== "object" || Array.isArray(record)) throw new Error("Expected fixture record");
  return record as Record<string, unknown>;
}
function fixtureArrayAt(value: unknown, ...path: Array<string | number>): unknown[] {
  const items = fixtureValueAt(value, ...path);
  if (!Array.isArray(items)) throw new Error("Expected fixture array");
  return items;
}

const clone = (name: string) => structuredClone(evidenceOf(name));
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
    fixtureRecordAt(raw, "subjects", 0, "evidence", "checklist_remark", "remarks", 0).remark_as_written_by_source = "LEAKED TEXT";
    fixtureRecordAt(raw, "subjects", 0, "evidence", "checklist_remark", "remarks", 0).characters = 77;
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
    fixtureRecordAt(raw, "subjects", 0, "evidence", "checklist_remark", "remarks", 0).remark_text_cut = true;
    show(raw);
    openAll();
    expect(notes("remark_text")).toContain("The text is cut.");
    fixtureArrayAt(raw, "subjects", 0, "evidence", "checklist_remark", "remarks")[0] = 5;
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
    expect(n).toContain("Parent 1: written \u201cOphrys sicula\u201d \u00b7 matched by name to the taxon of the graph labelled \u201cOphrys sicula\u201d (a match by name, not a verified identity)");
    expect(n).toContain("Parent 2: written \u201cspeculum\u201d \u00b7 read as \u201cOphrys speculum\u201d");
    expect(n).toContain("matched by name to the taxon of the graph labelled \u201cOphrys speculum\u201d");
    expect(section("hybrid_formula")?.textContent).toContain("does not say which parent bore the seed or the pollen");
  });
  it("a parent matched to a species-level name the checklist lists only below the species (switch on), and the same parent not matched (switch off)", () => {
    show(evidenceOf("hybrid-formula-parent-matched-to-implied-name-switch-on"));
    openAll();
    expect(notes("hybrid_formula")).toContain("Parent 1: written \u201cOphrys implicata\u201d \u00b7 matched by name to \u201cOphrys implicata\u201d, which the graph holds as an implied species concept (a species-level name derived from rows below the species, not a taxon of the checklist; a match by name, not a verified identity)");
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
    fixtureRecordAt(raw, "subjects", 0, "evidence", "hybrid_formula", "formulas", 0, "parents", 0).not_matched_reason = "something_new";
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
    // the asked name is itself an implied species concept (taxon.is_implied_species_concept): the section says what that is
    expect(section("parent_nothotaxa")?.textContent).toContain("The asked name is held by the graph as an implied species concept, not as a taxon of the checklist.");
  });
  it("an ordinary asked taxon does not get the implied-concept note", () => {
    show(evidenceOf("parent-nothotaxa-several"));
    openAll();
    expect(section("parent_nothotaxa")?.textContent).not.toContain("implied species concept");
  });
  it("a nothotaxon as the subject: a limit, not a list and not 'no hybrids'", () => {
    show(evidenceOf("parent-nothotaxa-subject-is-a-nothotaxon"));
    openAll();
    // the backend says in `resolution` that no list was built and in its own statement which kind of name it was: the page words only the first
    expect(heading("parent_nothotaxa")).toContain("no list built for this name");
    expect(section("parent_nothotaxa")?.textContent).toContain("That is a limit of the list, not a finding.");
    expect(section("parent_nothotaxa")?.textContent).toContain("is only built for a taxon that is not itself a nothotaxon");
    const own = Array.from(section("parent_nothotaxa")?.querySelectorAll("button, [data-testid=\"calyx-record-note\"]") ?? []).map((n) => n.textContent).join(" | ");
    expect(own).not.toMatch(/nothotaxon\b(?!a)/);
    expect(itemTexts("parent_nothotaxa")).toEqual([]);
    expect(container.textContent).not.toMatch(/nothing retrieved|has no hybrids/);
  });
  it("an ambiguous taxon: no evidence is shown, the returned explanation is", () => {
    show(evidenceOf("parent-nothotaxa-ambiguous-taxon"));
    expect(container.querySelector("section")?.getAttribute("data-evidence-kind")).toBe("not_resolved");
    expect(container.textContent).toContain("not a single resolved species");
    expect(container.querySelector('[data-kind="parent_nothotaxa"]')).toBeNull();
  });
  it("a name that is not in the graph: the returned sentence for the two hybrid topics, nothing for another topic", () => {
    show(evidenceOf("parent-nothotaxa-taxon-not-in-graph"));
    expect(container.querySelector("section")?.getAttribute("data-evidence-kind")).toBe("not_applicable");
    expect(container.textContent).toContain('The graph holds no taxon named exactly "Nullus parentus", so no formula or list of hybrids was read for it.');
    expect(container.textContent).toContain("That is not evidence");
    show(evidenceOf("hybrid-formula-name-not-in-graph"));
    expect(container.textContent).toContain('The graph holds no taxon named exactly "Ophrys x nonexistens"');
    // the same cause for another topic: the backend sends no sentence, so the page shows none (and invents none)
    show(evidenceOf("hybrid-name-graph-does-not-use"));
    expect(container.textContent).not.toMatch(/no hybrids|does not exist|is not a hybrid|graph holds no taxon/);
    for (const name of ["parent-nothotaxa-taxon-not-in-graph", "hybrid-formula-name-not-in-graph", "parent-nothotaxa-text-cut-at-a-percent-sign"]) {
      show(evidenceOf(name));
      expect(container.textContent).not.toMatch(/no hybrids|is not a hybrid/);
    }
  });
  it("a text the backend cut at a percent sign is quoted as the backend quotes it (the page does not complete it)", () => {
    show(evidenceOf("parent-nothotaxa-text-cut-at-a-percent-sign"));
    expect(container.textContent).toContain('The graph holds no taxon named exactly "Ophrys sic"');
  });
  it("(synthetic) an older backend: the 'no list built' code in `state`, no statements, still reads as a limit", () => {
    const raw = clone("parent-nothotaxa-subject-is-a-nothotaxon");
    const rec = fixtureRecordAt(raw, "subjects", 0, "evidence", "parent_nothotaxa");
    delete rec.resolution; delete rec.statements; rec.state = "LIST_NOT_BUILT_FOR_A_NOTHOTAXON";
    show(raw); openAll();
    expect(heading("parent_nothotaxa")).toContain("no list built for this name");
  });
  it("(synthetic) `all_listed_statements_shown: false` with nothing else to explain it is said; with a cut it is not said twice", () => {
    const raw = clone("parent-nothotaxa-several");
    fixtureRecordAt(raw, "subjects", 0, "evidence", "parent_nothotaxa").all_listed_statements_shown = false;
    show(raw); openAll();
    expect(section("parent_nothotaxa")?.textContent).toContain("Not every listed statement is shown here.");
    show(evidenceOf("parent-nothotaxa-long-first-page")); openAll();
    expect(section("parent_nothotaxa")?.textContent).not.toContain("Not every listed statement is shown here.");
    expect(fixtureRecordAt(evidenceOf("parent-nothotaxa-several"), "subjects", 0, "evidence", "parent_nothotaxa").all_listed_statements_shown).toBe(true);
  });
});

describe("the fields of backend #2425 head 165716c3 (real captures)", () => {
  it("a withheld remark: the page counts 0 shown and 1 held back from the backend's own numbers", () => {
    for (const name of ["remark-withheld-by-privacy-gate", "remark-withheld-by-privacy-gate-2"]) {
      const rec = fixtureRecordAt(evidenceOf(name), "subjects", 0, "evidence", "checklist_remark");
      expect(rec.remarks_shown).toBe(0);
      expect(fixtureRecordAt(evidenceOf(name), "subjects", 0).counts).toMatchObject({ checklist_remarks_shown: 0, checklist_remarks_withheld_text: 1 });
      show(evidenceOf(name));
      expect(heading("remark_text")).toContain("0 shown \u00b7 1 held back by the privacy gate");
    }
  });
  it("(synthetic) an older backend counted the withheld remark as shown: the per-remark flag decides", () => {
    const raw = clone("remark-withheld-by-privacy-gate");
    fixtureRecordAt(raw, "subjects", 0, "evidence", "checklist_remark").remarks_shown = 1;
    show(raw);
    expect(heading("remark_text")).toContain("0 shown \u00b7 1 held back by the privacy gate");
  });
  it("matched_taxon_label and is_implied_species_concept are on every parent, the label only where a match was made", () => {
    for (const name of ["hybrid-formula-both-parents-matched", "hybrid-formula-hedged", "hybrid-formula-parent-matched-to-implied-name-switch-on", "hybrid-formula-parent-not-matched-switch-off", "hybrid-formula-qualified-parent", "hybrid-formula-unmatched-parent-no-taxon"]) {
      for (const f of fixtureArrayAt(evidenceOf(name), "subjects", 0, "evidence", "hybrid_formula", "formulas")) {
        for (const parent of fixtureArrayAt(f, "parents")) {
          const p = fixtureRecordAt(parent);
          expect(typeof p.is_implied_species_concept).toBe("boolean");
          expect(p.matched_taxon_label === null).toBe(p.matched_by_name_to === null && p.matched_to_implied_species_concept === null);
          expect(p.is_implied_species_concept).toBe(p.matched_to_implied_species_concept !== null);
        }
      }
    }
  });
  it("(synthetic) the boolean alone says implied; a missing label is not invented; an older backend sends neither field", () => {
    const raw = clone("hybrid-formula-both-parents-matched");
    const parents = fixtureArrayAt(raw, "subjects", 0, "evidence", "hybrid_formula", "formulas", 0, "parents");
    fixtureRecordAt(parents, 0).is_implied_species_concept = true; fixtureRecordAt(parents, 0).matched_by_name_to = null; fixtureRecordAt(parents, 0).matched_taxon_label = null;
    delete fixtureRecordAt(parents, 1).matched_taxon_label; delete fixtureRecordAt(parents, 1).is_implied_species_concept;
    show(raw); openAll();
    const n = notes("hybrid_formula");
    expect(n).toContain("matched by name to a species-level name, which the graph holds as an implied species concept");
    expect(n).toContain("Parent 2: written \u201cspeculum\u201d \u00b7 read as \u201cOphrys speculum\u201d (rule, code as returned: omitted_genus_same_as_first_parent_in_a_nothospecies) \u00b7 matched by name to a taxon of the graph (a match by name, not a verified identity)");
    fixtureRecordAt(parents, 0).matched_taxon_label = 5;
    show(raw);
    expect(container.querySelector('[data-testid="calyx-record-unreadable"]')?.textContent).toContain("could not be displayed");
  });
  it("a typed multiplication sign before the genus reads the nothotaxon: the same single subject and formula as the plain name", () => {
    show(evidenceOf("hybrid-formula-typed-times-before-genus")); openAll();
    expect(container.querySelectorAll('[data-testid="calyx-subject"]')).toHaveLength(1);
    expect(itemTexts("hybrid_formula")).toEqual(["Ophrys sicula x speculum"]);
  });
  it("both questions about one taxon: both sections for the one subject and no pointer to 'the other question'", () => {
    show(evidenceOf("hybrid-and-reverse-question-one-taxon")); openAll();
    expect(container.querySelectorAll('[data-testid="calyx-subject"]')).toHaveLength(1);
    expect(section("hybrid_formula")).not.toBeNull();
    expect(section("parent_nothotaxa")).not.toBeNull();
    expect(container.textContent).not.toContain("ask which hybrids have it as a parent");
  });
  it("no internal id in any sentence of these hybrid, remark and reverse captures", () => {
    const names = Object.keys(fixtures).filter((n) => /^(remark-|hybrid-|parent-)/.test(n));
    for (const name of names) {
      const se = evidenceOf(name);
      const strings: string[] = [];
      const walkIt = (v: unknown, key: string) => {
        if (typeof v === "string" && ["statement", "explanation"].includes(key)) strings.push(v);
        else if (Array.isArray(v)) v.forEach((x) => (key === "reading" && typeof x === "string" ? strings.push(x) : walkIt(x, key)));
        else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walkIt(x, k));
      };
      walkIt(fixtureRecordAt(se).subjects ?? se, "");
      expect(strings.join(" | "), name).not.toMatch(/taxon:|graph node|kg_node|edge \d|implied:/);
    }
  });
});

describe("(synthetic) cut lists are said to be cut", () => {
  it("a remark list the backend marks as not fully shown, and a formula whose parents are not all shown", () => {
    const raw = clone("remark-shown");
    fixtureRecordAt(raw, "subjects", 0, "evidence", "checklist_remark").all_stored_remarks_shown = false;
    show(raw);
    openAll();
    expect(section("remark_text")?.textContent).toContain("Not every stored remark of the checklist is shown here.");
    show(evidenceOf("remark-shown"));
    openAll();
    expect(section("remark_text")?.textContent).not.toContain("Not every stored remark");
    const f = clone("hybrid-formula-both-parents-matched");
    fixtureRecordAt(f, "subjects", 0, "evidence", "hybrid_formula", "formulas", 0).all_parents_shown = false;
    show(f);
    openAll();
    expect(notes("hybrid_formula")).toContain("Not every parent the formula names is shown here.");
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
