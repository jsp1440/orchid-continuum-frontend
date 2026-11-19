// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import CalyxEvidencePanel from "@/components/calyx/CalyxEvidencePanel";
import { evidenceOf } from "@/lib/__fixtures__/calyxScientificEvidence";
import { composeAnswerWithEvidence, readScientificEvidence } from "@/lib/calyxScientificEvidence";

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
const open = (label: RegExp) => {
  const b = Array.from(container.querySelectorAll("button")).find((x) => label.test(x.textContent ?? ""));
  if (!b) throw new Error(`no button ${label}`);
  act(() => { b.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};
const button = (label: RegExp) => Array.from(container.querySelectorAll("button")).find((x) => label.test(x.textContent ?? ""))?.textContent;
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
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("1. a name held back by the privacy gate", () => {
  it("is counted and said as held back, never as unread or as failed (vernacular-names-unassigned-tag-and-withheld-name)", () => {
    show(evidenceOf("vernacular-names-unassigned-tag-and-withheld-name"));
    expect(button(/Common names this checklist gives/)).toContain("1 of 2 shown \u00b7 1 held back by the privacy gate");
    open(/Common names this checklist gives/);
    expect(text()).toContain("held back by the privacy gate of the graph reader and not shown");
    expect(text()).not.toMatch(/failed a check|were not read|was not read/);
  });
  it("(synthetic) the same count on a remark-pollinator block", () => {
    const raw = clone("pollination-with-checklist-remark");
    fixtureRecordAt(raw, "subjects", 0, "evidence", "remark_pollinator").names_held_back_by_privacy_gate = 2;
    show(raw);
    expect(container.querySelector('[data-kind="remark_pollinator"] h5')?.textContent).toContain("1 of 1 shown \u00b7 2 held back by the privacy gate");
  });
  it("(synthetic) a count of zero prints no privacy-gate phrase, as in the backend's own responses where nothing was held back", () => {
    const raw = clone("vernacular-names-of-a-taxon");
    fixtureRecordAt(raw, "subjects", 0, "evidence", "vernacular_names").names_held_back_by_privacy_gate = 0;
    show(raw);
    open(/Common names this checklist gives/);
    expect(button(/Common names this checklist gives/)).toContain("3 of 3 shown");
    expect(text()).not.toMatch(/privacy gate/);
  });
});

describe("2. a group that is not found carries the groups the checklist writes differently", () => {
  it("shows them as written differently, none read, not as a result list (group-not-found-two-writings-named)", () => {
    show(evidenceOf("group-not-found-two-writings-named"));
    const candidates = container.querySelector('[data-kind="group_candidates"]')!;
    expect(candidates.querySelector("h5")?.textContent).toContain("Groups the checklist writes differently (none was read)");
    expect(Array.from(candidates.querySelectorAll('[data-testid="calyx-record-text"]')).map((n) => n.textContent)).toEqual(["Dendrobium sect. 22 Latouria", "Dendrobium sect. Latouria"]);
    expect(candidates.textContent).toContain("Written differently by the source. None of these was read. They are not a result list.");
    expect(container.querySelector('[data-kind="group_taxa"] button')?.textContent).toContain("not found under this exact writing");
  });
  it("(synthetic) a cut list of candidates says so", () => {
    const raw = clone("group-not-found-two-writings-named");
    fixtureRecordAt(raw, "group_taxa").candidates_truncated = true;
    show(raw);
    expect(container.querySelector('[data-kind="group_candidates"]')?.textContent).toContain("The list of these groups is cut.");
  });
});

describe("3. records held without a list", () => {
  it.each([
    ["vernacular-lookup-records-held-back", 'the common name "Hidden Orchid"'],
    ["pollinator-taxa-all-held-back", 'the insect name "Andrena occulta" in the checklist\'s remarks'],
    ["group-not-found-two-writings-named", 'a group of Dendrobium named as in "section Latouria"'],
  ])("%s does not read as 'no records'", (name, label) => {
    show(evidenceOf(name));
    expect(container.querySelector("h3")?.textContent).toBe("A list could not be set out for this question");
    expect(all("calyx-held-without-list")[0].textContent).toBe(`Checklist records are held for ${label}, but none could be listed.`);
    expect(container.querySelector("h3")?.textContent).not.toMatch(/Nothing was retrieved|no such|no records/i);
  });
  it("the vernacular lookup's summary says records are held, not that nothing was retrieved", () => {
    show(evidenceOf("vernacular-lookup-records-held-back"));
    expect(button(/Taxa for which this checklist writes that name/)).toContain("records are held; none could be listed");
    expect(button(/Taxa for which this checklist writes that name/)).not.toMatch(/nothing retrieved|0 listed/i);
  });
  it("the insect-name turn with every row held back says 0 of 1 shown and keeps the reader's statement", () => {
    show(evidenceOf("pollinator-taxa-all-held-back"));
    expect(button(/Taxa whose checklist remark names this insect/)).toContain("0 of 1 shown");
    open(/Taxa whose checklist remark names this insect/);
    expect(text()).toContain("held back by the graph reader");
  });
});

describe("4. a turn with more than one question", () => {
  it.each([
    "two-questions-only-the-first-read",
    "two-questions-taxon-read-name-question-noticed",
    "two-questions-taxon-read-group-question-noticed",
  ])("%s: the sentence that says one part was not read is visible, once", (name) => {
    const raw = evidenceOf(name) as { notices: string[]; also_asked: string[] };
    show(raw);
    expect(raw.notices.length).toBeGreaterThan(0);
    for (const line of raw.notices) expect(occurrences(all("calyx-notices")[0].textContent ?? "", line)).toBe(1);
    expect(all("calyx-notices")).toHaveLength(1);
  });
  it("(synthetic) an also_asked sentence that is not among the notices is shown too; an unreadable one is named", () => {
    const raw = clone("two-questions-only-the-first-read");
    fixtureRecordAt(raw).also_asked = [...fixtureArrayAt(raw, "also_asked"), "Another part was not read."];
    show(raw);
    expect(all("calyx-notices")[0].textContent).toContain("Another part was not read.");
    fixtureRecordAt(raw).also_asked = "oops";
    show(raw);
    expect(text()).toContain("The notices could not be displayed.");
  });
  it("(synthetic) a not_applicable turn that carries a notice still shows it", () => {
    const raw = clone("orchid-asked-as-the-pollinator");
    fixtureRecordAt(raw).notices = ["One question is read per turn: another part was not read."];
    show(raw);
    expect(all("calyx-notices")[0].textContent).toContain("another part was not read");
  });
});

describe("5. an orchid asked as if it were the pollinator", () => {
  it("shows the explaining sentence and no pollination block (orchid-asked-as-the-pollinator)", () => {
    show(evidenceOf("orchid-asked-as-the-pollinator"));
    const raw = evidenceOf("orchid-asked-as-the-pollinator") as { explanation: string };
    expect(container.querySelector("section")?.getAttribute("data-evidence-kind")).toBe("not_applicable");
    expect(text()).toContain(raw.explanation);
    expect(all("calyx-evidence-pollination")).toHaveLength(0);
    expect(all("calyx-record-section")).toHaveLength(0);
    expect(all("calyx-subject")).toHaveLength(0);
    // the answer keeps its text whole; the explanation is moved only when it is the answer's last paragraph
    const answer = `Intro.\n\n${raw.explanation}`;
    expect(composeAnswerWithEvidence(answer, readScientificEvidence(raw)).answerText).toBe("Intro.");
  });
});

describe("6. the tag beside a vernacular name is built from fields, not from sentences", () => {
  it("shows the tag as written from tag_as_written whatever the sentence says", () => {
    const raw = clone("vernacular-lookup-two-writings");
    fixtureRecordAt(raw, "subjects", 0, "evidence", "vernacular_lookup", "items", 0).statement = "sentence that moved the tag elsewhere";
    show(raw);
    open(/Taxa for which this checklist writes that name/);
    expect(Array.from(container.querySelectorAll('[data-kind="vernacular_lookup"] li span.block')).map((n) => n.textContent).join(" | ")).toContain("name as the source writes it: Pico de loro (Chile)");
  });
});

describe("7. nothing in a heading says 'narrower' or 'subgroup of'", () => {
  it("the group section says what the source does (group-taxa-informal-group)", () => {
    show(evidenceOf("group-taxa-informal-group"));
    const section = container.querySelector('[data-kind="group_narrower"]')!;
    expect(section.querySelector("h5")?.textContent).toContain("Groups written after this one in the same remark (the source does not say how they relate; separate statements, not added to the list)");
    open(/Taxa this checklist lists under the group/);
    expect(all("calyx-record-note")[0].textContent).toContain("also carry a term written after this one in the same remark");
    expect(own("h4, h5, button, [data-testid='calyx-record-note']")).not.toMatch(/narrower|subgroup of/i);
  });
});

describe("8. remark pollinators carry more of the source", () => {
  it("shows the name as written with its hint inside it, and labels the stored name (pollination-remark-later-writing-with-its-own-hint)", () => {
    show(evidenceOf("pollination-remark-later-writing-with-its-own-hint"));
    const remark = container.querySelector('[data-kind="remark_pollinator"]')!;
    const names = Array.from(remark.querySelectorAll('[data-testid="calyx-record-text"]')).map((n) => n.textContent);
    expect(names.slice(0, 2)).toEqual(["Andrena cinerea (Sardinia)", "A. senecionis (Spain, S-France)"]);
    expect(remark.textContent).not.toContain("hint as written: (Sardinia)");
    expect(remark.textContent).toContain("name stored and found under: Andrena senecionis (derivation, code as returned: genus_abbreviation_expanded_v1)");
    expect(remark.querySelectorAll("a")).toHaveLength(0);
  });
  it("(synthetic) a stored_name is labelled, never shown as the source's writing", () => {
    const raw = clone("pollination-remark-later-writing-with-its-own-hint");
    fixtureRecordAt(raw, "subjects", 0, "evidence", "remark_pollinator", "pollinator_names", 1).stored_name = "Andrena senecionis Pérez";
    show(raw);
    expect(container.querySelector('[data-kind="remark_pollinator"]')?.textContent).toContain("name stored and found under: Andrena senecionis P\u00e9rez (derivation");
  });
  it("the insect-name turn shows a later writing of the same name and an open-ended remark (pollinator-taxa-hedges-per-taxon)", () => {
    show(evidenceOf("pollinator-taxa-hedges-per-taxon"));
    open(/Taxa whose checklist remark names this insect/);
    const notes = Array.from(container.querySelectorAll('[data-kind="pollinator_taxa"] li span.block')).map((n) => n.textContent).join(" | ");
    expect(notes).toContain("the same name is written again in the remark: A. cinerea (N. Africa)");
    expect(notes).not.toContain("hint as written: (Sardinia)");
    const raw = clone("pollinator-taxa-hedges-per-taxon");
    fixtureRecordAt(raw, "subjects", 0, "evidence", "pollinator_taxa", "taxa", 1).source_list_open_ended = true;
    show(raw);
    expect(container.querySelector('[data-kind="pollinator_taxa"]')?.textContent).toContain("The remark goes on after its list of names.");
  });
});

describe("9. counts come from the structured counts", () => {
  it("a held-back row is never displayed as unread", () => {
    show(evidenceOf("pollinator-taxa-all-held-back"));
    expect(text()).not.toMatch(/not read\./);
  });
});

function own(selector: string) {
  return Array.from(container.querySelectorAll(selector)).map((n) => n.textContent).join(" | ");
}
