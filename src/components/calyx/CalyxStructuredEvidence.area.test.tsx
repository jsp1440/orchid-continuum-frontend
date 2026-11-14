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
const clone = (name: string) => structuredClone(evidenceOf(name)) as Record<string, any>;

describe("an area turn (taxa one checklist lists for an area name)", () => {
  it("is headed by the area, not by a species, and calls the list what the checklist lists", () => {
    show(evidenceOf("area-taxa-list"));
    expect(container.querySelector("dt")?.textContent).toBe("Area");
    expect(all("calyx-evidence-species")[0].textContent).toBe("Madagascar");
    expect(container.querySelector("h4")?.textContent).toBe("Area: Madagascar \u00b7 graph node 82397");
    expect(text()).not.toMatch(/Species\b/);
    const button = Array.from(container.querySelectorAll("button")).find((b) => /Taxa this checklist lists for the area/.test(b.textContent ?? ""))!;
    expect(button.textContent).toBe("Show Taxa this checklist lists for the area \u00b7 2 of 2 shown");
    open(/Taxa this checklist lists for the area/);
    expect(all("calyx-record-text").map((n) => n.textContent)).toEqual(["Angraecum sesquipedale", "Angraecum sesquipedale var. angustifolium"]);
    expect(all("calyx-record-note")[0].textContent).toBe("Not an occurrence record. Not a flora or a species count. Taxa listed with a marker: 0.");
    expect(text()).toContain("documented \u00b7 UNREVIEWED");
    expect(all("calyx-evidence-pollination")).toHaveLength(0);
  });

  it("shows a marker of the source verbatim next to its taxon and gives it no meaning", () => {
    show(evidenceOf("area-taxa-with-marker"));
    open(/Taxa this checklist lists for the area/);
    const lines = Array.from(container.querySelectorAll('[data-kind="area_taxa"] li')).map((li) => li.textContent);
    expect(lines.find((l) => l?.startsWith("Ophrys sphegodes var. provincialis"))).toContain("marker as written by the source: ?");
    expect(lines.find((l) => l?.startsWith("Ophrys sphegodes var. garganicoides"))).not.toContain("marker");
    const block = container.querySelector('[data-kind="area_taxa"]')!;
    expect(block.textContent).toContain("Taxa listed with a marker: 1.");
    expect(block.innerHTML).not.toMatch(/title=|<svg|<img|text-red|text-green|line-through/);
    // The page's own wording near the taxa (item lines and the note) gives the marker no meaning.
    const own = [...Array.from(block.querySelectorAll("li > span")), ...all("calyx-record-note")].map((n) => n.textContent).join(" ");
    expect(own).not.toMatch(/doubtful|introduced|uncertain|cultivated|native/i);
  });

  it("shows other writings of the area name beside the list with their own count, never added in", () => {
    show(evidenceOf("area-taxa-with-other-writings"));
    const other = container.querySelector('[data-kind="area_other_writings"]')!;
    expect(other.textContent).toContain("Other writings of this area name (separate statements, not added to the list) \u00b7 1 listed");
    expect(other.textContent).toContain("SE-France \u00b7 1 taxa listed by the checklist under this writing");
    // the list keeps its own count; the other writing's taxa are not in it
    expect(Array.from(container.querySelectorAll("button")).some((b) => /2 of 2 shown/.test(b.textContent ?? ""))).toBe(true);
    open(/Taxa this checklist lists for the area/);
    expect(container.querySelectorAll('[data-kind="area_taxa"] [data-testid="calyx-record-text"]')).toHaveLength(2);
  });

  it("an area name not found reads as nothing retrieved under that exact name, never as 'no orchids'", () => {
    show(evidenceOf("area-not-found"));
    const raw = evidenceOf("area-not-found") as { explanation: string };
    expect(container.querySelector("section")?.getAttribute("data-evidence-kind")).toBe("not_resolved");
    expect(container.querySelector("h3")?.textContent).toBe("Nothing was retrieved under that area name");
    expect(text()).toContain(raw.explanation);
    expect(container.querySelector("h4")?.textContent).toBe("Area: Atlantis");
    open(/Taxa this checklist lists for the area/);
    expect(text()).toContain("nothing retrieved under this exact name");
    expect(all("calyx-record-text")).toHaveLength(0);
    expect(text()).not.toMatch(/no orchids|no taxa|none|0 listed|0 of 0/i);
    expect(text()).not.toMatch(/Species\b|guessed identity/);
  });

  it("(hand-altered copy) says N of M shown when the list is cut", () => {
    const raw = clone("area-taxa-list");
    const taxa = Array.from({ length: 25 }, (_u, i) => ({ taxon: `Altered taxon ${i + 1}`, checklist_row_name: `Altered taxon ${i + 1} X.`, source_marker: null, source_tags: [], marker_meaning: null }));
    Object.assign(raw.subjects[0].evidence.area_taxa, { taxa, taxa_shown: 25, taxa_listed: 40, all_listed_taxa_shown: false });
    show(raw); // altered by this test: the fixtures hold at most 25 taxa
    const button = Array.from(container.querySelectorAll("button")).find((b) => /Taxa this checklist lists/.test(b.textContent ?? ""))!;
    expect(button.textContent).toBe("Show Taxa this checklist lists for the area \u00b7 25 of 40 shown");
    open(/Taxa this checklist lists for the area/);
    expect(container.querySelectorAll('[data-kind="area_taxa"] [data-testid="calyx-record-text"]')).toHaveLength(25);
  });

  it("a malformed taxa list makes only that part unreadable; other writings still show", () => {
    const raw = clone("area-taxa-with-other-writings");
    raw.subjects[0].evidence.area_taxa.taxa = [{ taxon: 5 }];
    show(raw);
    expect(all("calyx-record-unreadable")[0].textContent).toBe("Taxa this checklist lists for the area: could not be displayed.");
    expect(container.querySelector('[data-kind="area_other_writings"]')).not.toBeNull();
    const raw2 = clone("area-taxa-with-marker");
    raw2.subjects[0].evidence.area_taxa.other_writings = [{ label: "Italy", taxa_listed: "3" }];
    show(raw2);
    expect(all("calyx-record-unreadable")[0].textContent).toBe("Other writings of this area name (separate statements, not added to the list): could not be displayed.");
    expect(container.querySelector('[data-kind="area_taxa"]')).not.toBeNull();
  });
});

describe("turns that are not area turns", () => {
  it("a question about an area that names a genus is left alone (not_applicable): no area block", () => {
    show(evidenceOf("area-question-left-alone-genus-named"));
    expect(container.querySelector("section")?.getAttribute("data-evidence-kind")).toBe("not_applicable");
    expect(container.querySelector('[data-kind="area_taxa"]')).toBeNull();
  });
  it("a species question that names an area stays a species turn", () => {
    show(evidenceOf("species-question-naming-an-area"));
    expect(container.querySelector("dt")?.textContent).toBe("Species");
    expect(container.querySelector('[data-kind="area_taxa"]')).toBeNull();
    expect(container.querySelector('[data-kind="distribution"]')).not.toBeNull();
  });
});
