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
const open = (label: RegExp) => {
  const b = Array.from(container.querySelectorAll("button")).find((x) => label.test(x.textContent ?? ""));
  if (!b) throw new Error(`no button ${label}`);
  act(() => { b.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};
const button = (label: RegExp) => Array.from(container.querySelectorAll("button")).find((x) => label.test(x.textContent ?? ""))?.textContent;
const clone = (name: string) => structuredClone(evidenceOf(name)) as Record<string, any>;
/** The page's own wording around the source's text: item lines, notes and section headings. */
const own = (selector: string) => Array.from(container.querySelectorAll(selector)).map((n) => n.textContent).join(" | ");

describe("a taxon's common names", () => {
  it("shows the name with the parenthesised text exactly as written; never a language, a country or an identification", () => {
    show(evidenceOf("vernacular-names-of-a-taxon"));
    open(/Common names this checklist gives/);
    expect(all("calyx-record-text").map((n) => n.textContent)).toEqual(["Vanille (DE)", "Vainilla (EN)"]);
    expect(button(/Common names this checklist gives/)).toContain("3 of 3 shown");
    const lines = own('[data-kind="vernacular_names"] li, [data-testid="calyx-record-note"]');
    expect(lines).toContain("A common name is not an identification.");
    expect(lines).toContain("The checklist gives this name for 3 taxa.");
    expect(lines).not.toMatch(/German|English|French|Spanish|language|flag|country|identified as/i);
    expect(container.innerHTML).not.toMatch(/<img|<svg|title=|lang=/);
  });

  it("says exactly that a tag follows a later name and is not attached to this one", () => {
    show(evidenceOf("vernacular-names-unassigned-tag-and-withheld-name"));
    open(/Common names this checklist gives/);
    expect(all("calyx-record-text")[0].textContent).toBe("Lappland-Fingerwurz");
    expect(text()).toContain("The source writes (DE) after a later name of the same group and does not say whether it applies to this name; it is not attached.");
    expect(button(/Common names this checklist gives/)).toContain("1 of 2 shown");
    expect(text()).toContain("held back by the privacy gate");
  });

  it("(synthetic) a name whose text is not in the data is said to be missing, not dropped", () => {
    const raw = clone("vernacular-names-of-a-taxon");
    raw.subjects[0].evidence.vernacular_names.names[1].name_as_written = null;
    show(raw);
    open(/Common names this checklist gives/);
    expect(all("calyx-record-text").map((n) => n.textContent)).toEqual(["Vanille (DE)", "A name is not shown here (see the statements)."]);
  });

  it("none retrieved reads as nothing retrieved, not as 'has no common name'", () => {
    show(evidenceOf("vernacular-names-none"));
    expect(button(/Common names this checklist gives/)).toBe("Show Common names this checklist gives for the taxon \u00b7 nothing retrieved");
    expect(own("button, h5, [data-testid='calyx-record-note']")).not.toMatch(/has no|no common name|no such/i);
  });
});

describe("a turn that names a common name and no taxon", () => {
  it("lists the taxa without marking one as the answer, and shows the tag as written", () => {
    show(evidenceOf("vernacular-lookup-two-writings"));
    expect(container.querySelector("dt")?.textContent).toBe("Common name asked");
    expect(container.querySelector("h4")?.textContent).toMatch(/^Common name asked: pico de loro/);
    expect(text()).not.toMatch(/Species\b/);
    open(/Taxa for which this checklist writes that name/);
    expect(all("calyx-record-text").map((n) => n.textContent)).toEqual(["Chloraea chrysantha", "Chloraea crispa"]);
    const notes = own('[data-kind="vernacular_lookup"] li span.block');
    expect(notes).toContain("name as the source writes it: Pico de loro (Chile)");
    expect(notes).toContain("name as the source writes it: pico de loro (Chile)");
    expect(all("calyx-record-note")[0].textContent).toBe("Not an identification. Several taxa are listed; none is marked as the answer.");
    expect(own('[data-kind="vernacular_lookup"] li, [data-testid="calyx-record-note"]')).not.toMatch(/country|language|the answer is|identified as/i);
  });

  it("not found is nothing retrieved under that exact name", () => {
    show(evidenceOf("vernacular-lookup-not-found"));
    expect(container.querySelector("section")?.getAttribute("data-evidence-kind")).toBe("not_resolved");
    expect(container.querySelector("h3")?.textContent).toBe("Nothing was retrieved under that exact name");
    expect(container.querySelector("h4")?.textContent).toBe("Common name asked: Atlantis Slipper");
    expect(button(/Taxa for which this checklist writes that name/)).toContain("nothing retrieved under this exact name");
    expect(all("calyx-record-text")).toHaveLength(0);
    expect(own("h3, h4, button, [data-testid='calyx-record-note']")).not.toMatch(/no such name|no common name|has no/i);
  });
});

describe("placement below the genus", () => {
  it("shows the words of the source verbatim and calls an informal group an informal grouping, nothing more", () => {
    show(evidenceOf("placement-informal-group"));
    open(/What this checklist's remark writes below the genus/);
    expect(all("calyx-record-text")[0].textContent).toBe("anceps group, polyanthum subgroup");
    const notes = own('[data-kind="infrageneric_placement"] li span.block');
    expect(notes).toContain('"anceps group" (an informal grouping as written)');
    expect(notes).toContain('"polyanthum subgroup" (an informal grouping as written)');
    expect(notes).not.toMatch(/section|subgenus|rank/i);
    expect(all("calyx-record-note")[0].textContent).toBe("What one checklist writes in a remark; not a classification by the Continuum.");
  });

  it("a rank word is shown as written and labelled only as a rank word as written", () => {
    show(evidenceOf("placement-of-a-taxon"));
    open(/What this checklist's remark writes below the genus/);
    expect(all("calyx-record-text")[0].textContent).toBe("sect. 22 Latouria, aberrans subgroup");
    const notes = own('[data-kind="infrageneric_placement"] li span.block');
    expect(notes).toContain('"sect. 22 Latouria" (a rank word as written)');
    expect(notes).toContain('"aberrans subgroup" (an informal grouping as written)');
  });

  it("(synthetic) a kind the page does not know is shown as returned", () => {
    const raw = clone("placement-of-a-taxon");
    raw.subjects[0].evidence.infrageneric_placement.placements[0].terms[0].kind = "something_new";
    show(raw);
    open(/What this checklist's remark writes below the genus/);
    expect(text()).toContain("(kind as returned: something_new)");
  });
});

describe("a turn that names a group", () => {
  it("shows both writings when the question wrote the group differently", () => {
    show(evidenceOf("group-taxa-asked-in-another-writing"));
    expect(container.querySelector("dt")?.textContent).toBe("Group");
    expect(container.querySelector("h4")?.textContent).toMatch(/^Group \(as written by the checklist\): Dendrobium sect\. 15 Pedilonum/);
    open(/Taxa this checklist lists under the group/);
    expect(all("calyx-record-note")[0].textContent).toContain('Asked as "Dendrobium section Pedilonum"; the checklist\'s writing: "Dendrobium sect. 15 Pedilonum".');
    expect(all("calyx-record-note")[0].textContent).toContain("not a classification by the Continuum");
    expect(all("calyx-record-note")[0].textContent).toContain("This is not the list of the taxa of the group.");
    expect(text()).not.toMatch(/Species\b/);
  });

  it("an informal group is never labelled a section or given a rank", () => {
    show(evidenceOf("group-taxa-informal-group"));
    expect(container.querySelector("h4")?.textContent).toMatch(/anceps group/);
    expect(own("h4, [data-testid='calyx-record-note'], button")).not.toMatch(/section|sect\.|subgenus|rank/i);
  });

  it("says N of M shown when the list is cut", () => {
    show(evidenceOf("group-taxa-list-cut-at-25"));
    expect(button(/Taxa this checklist lists under the group/)).toContain("25 of 31 shown");
    open(/Taxa this checklist lists under the group/);
    expect(all("calyx-record-note")[0].textContent).toContain("The list is cut");
  });

  it("(synthetic) groups written after this one and other writings sit beside the list with their own counts, never in it", () => {
    const raw = clone("group-taxa-informal-group");
    Object.assign(raw.subjects[0].evidence.group_taxa, {
      narrower_groups: [{ label: "Epidendrum anceps group, polyanthum subgroup", taxa_listed: 3 }],
      other_writings: [{ label: "Epidendrum anceps agg.", taxa_listed: 2 }],
    });
    show(raw);
    expect(container.querySelector('[data-kind="group_narrower"]')?.textContent).toContain("3 taxa listed by the checklist under this writing");
    expect(container.querySelector('[data-kind="group_other_writings"]')?.textContent).toContain("Epidendrum anceps agg. \u00b7 2 taxa listed");
    open(/Taxa this checklist lists under the group/);
    expect(container.querySelectorAll('[data-kind="group_taxa"] [data-testid="calyx-record-text"]').length).toBeLessThanOrEqual(2);
    raw.subjects[0].evidence.group_taxa.narrower_groups = [{ taxa_listed: 3 }];
    show(raw);
    expect(all("calyx-record-unreadable")[0].textContent).toBe("Groups written after this one in the same remark (the source does not say how they relate; separate statements, not added to the list): could not be displayed.");
  });

});

describe("pollinators named in a checklist remark", () => {
  it("is a separate block labelled as a compiler's statement, beside (not inside) the cited records", () => {
    show(evidenceOf("pollination-with-checklist-remark"));
    const remark = container.querySelector('[data-kind="remark_pollinator"]')!;
    expect(remark.querySelector("h5")?.textContent).toContain("compiler's statement, not a cited record");
    expect(remark.querySelector('[data-testid="calyx-record-text"]')?.textContent).toBe("Andrena (Melandrena) nigroaenea");
    expect(remark.textContent).toContain("introduced in the remark as: Main pollinator");
    expect(remark.textContent).toContain("A compiler's statement in a checklist remark: not an observation and not a cited record.");
    expect(remark.textContent).toContain("It does not establish pollination.");
    expect(remark.querySelectorAll("a")).toHaveLength(0);
    expect(remark.contains(container.querySelector('[data-kind="relationships"]'))).toBe(false);
    expect(container.querySelector('[data-kind="relationships"]')?.contains(remark) ?? false).toBe(false);
  });

  it("does not change the pollination line", () => {
    show(evidenceOf("pollination-with-checklist-remark"));
    expect(all("calyx-evidence-pollination")[0].dataset.pollination).toBe("not-established");
    expect(all("calyx-evidence-pollination")[0].textContent).toContain("Verified pollination: not established.");
  });

  it("a DOI field on a remark name is not linked", () => {
    const raw = clone("pollination-with-checklist-remark");
    raw.subjects[0].evidence.remark_pollinator.pollinator_names[0].doi = "10.1234/abcd";
    show(raw);
    expect(container.querySelector('[data-kind="remark_pollinator"] a')).toBeNull();
    expect(container.querySelector('[data-kind="remark_pollinator"]')?.textContent).not.toContain("10.1234/abcd");
  });

  it("a turn without a remark is unchanged", () => {
    show(evidenceOf("pollination-no-remark-unchanged"));
    expect(container.querySelector('[data-kind="remark_pollinator"]')).toBeNull();
    expect(all("calyx-evidence-pollination")[0].dataset.pollination).toBe("not-established");
  });

  it("for a variety the remark sits in the variety's own block", () => {
    show(evidenceOf("pollination-variety-own-remark"));
    const blocks = all("calyx-subject");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].dataset.scope).toBe("direct_subtaxon");
    expect(blocks[0].querySelector('[data-kind="remark_pollinator"]')).not.toBeNull();
  });

  it("(synthetic) a hint or a qualifier is shown as written; a malformed name makes only that part unreadable", () => {
    const raw = clone("pollination-with-checklist-remark");
    Object.assign(raw.subjects[0].evidence.remark_pollinator.pollinator_names[0], { hint_of_source: "(? male)", qualifier_of_source: "probably" });
    show(raw);
    expect(container.querySelector('[data-kind="remark_pollinator"]')?.textContent).toContain("hint as written: (? male)");
    expect(container.querySelector('[data-kind="remark_pollinator"]')?.textContent).toContain("qualifier as written: probably");
    raw.subjects[0].evidence.remark_pollinator.pollinator_names[0].name_as_written_by_source = 5;
    show(raw);
    expect(all("calyx-record-unreadable")[0].textContent).toBe("Pollinators named in a checklist remark (a compiler's statement, not a cited record): could not be displayed.");
    expect(all("calyx-evidence-sentences")).toHaveLength(1);
  });
});

describe("a turn that names an insect and no taxon", () => {
  it("says only the remarks were read and shows no pollination line", () => {
    show(evidenceOf("pollinator-taxa-list"));
    expect(container.querySelector("dt")?.textContent).toBe("Insect name asked");
    expect(container.querySelector("h4")?.textContent).toMatch(/^Insect name asked \(a name in checklist remarks\): Andrena nigroaenea/);
    expect(all("calyx-evidence-pollination")).toHaveLength(0);
    expect(text()).not.toMatch(/Species\b/);
    open(/Taxa whose checklist remark names this insect/);
    const note = all("calyx-record-note")[0].textContent ?? "";
    expect(note).toContain("Only the checklist's remarks were read; the cited interaction records were not searched by this insect name.");
    expect(note).toContain("Not an observation.");
    expect(note).toContain("Pollination is not established.");
    expect(note).toContain("not a resolved animal taxon");
    expect(container.querySelector('[data-kind="pollinator_taxa"]')?.querySelectorAll("a")).toHaveLength(0);
    expect(own('[data-kind="pollinator_taxa"] li span.block')).toContain("name as written in the remark: A. nigroaenea");
  });

  it("not found is nothing retrieved under that exact name", () => {
    show(evidenceOf("pollinator-name-not-found"));
    expect(container.querySelector("h3")?.textContent).toBe("Nothing was retrieved under that exact name");
    expect(button(/Taxa whose checklist remark names this insect/)).toContain("nothing retrieved under this exact name");
    expect(all("calyx-record-text")).toHaveLength(0);
    expect(own("h3, h4, button")).not.toMatch(/no pollinator|not a pollinator|never/i);
  });
});
