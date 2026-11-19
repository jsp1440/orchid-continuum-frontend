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

describe("an evidence part this page does not know", () => {
  it("is named as 'could not be displayed' for that part only; sentences and other parts stay; no crash", () => {
    const raw = clone("pollination-species");
    fixtureRecordAt(raw, "subjects", 0, "evidence").weather_forecast = { anything: [1, 2, 3] };
    fixtureRecordAt(raw, "subjects", 0, "evidence").another_new_kind = "text";
    fixtureRecordAt(raw, "subjects", 0, "evidence").ignored_when_empty = null;
    show(raw);
    expect(all("calyx-evidence-sentences")[0].querySelectorAll("li")).toHaveLength(fixtureArrayAt(raw, "reading").length);
    const notes = all("calyx-record-unreadable").map((n) => n.textContent);
    expect(notes).toEqual([
      "An evidence part this page does not know (weather_forecast): could not be displayed.",
      "An evidence part this page does not know (another_new_kind): could not be displayed.",
    ]);
    expect(container.querySelector('[data-kind="not_retrieved"]')).not.toBeNull();
    expect(text()).not.toContain("anything");
  });
  it("an unknown key beside a known kind in a two-taxa turn only affects its own taxon", () => {
    const raw = clone("distribution-two-species");
    fixtureRecordAt(raw, "subjects", 1, "evidence").mystery = {};
    show(raw);
    expect(all("calyx-record-unreadable")).toHaveLength(1);
    expect(all("calyx-subject")).toHaveLength(2);
  });
});

describe("place of publication", () => {
  it("shows the citation exactly as written, the row name, the year only as the parenthesised year, and that it is unchecked", () => {
    show(evidenceOf("publication-species"));
    open(/Checklist place of publication/);
    const section = container.querySelector('[data-kind="publication"]')!;
    expect(section.querySelector('[data-testid="calyx-record-text"]')?.textContent).toBe("Gard. Dict., ed. 8: no. 8 (1768)");
    expect(section.textContent).toContain("Checklist row: Ophrys sphegodes Mill.");
    expect(section.textContent).toContain("year in parentheses in the citation: 1768");
    expect(section.textContent).not.toMatch(/published in 1768|date of publication: /i);
    expect(all("calyx-record-note")[0].textContent).toBe("Not checked against the publication.");
    expect(section.textContent).toContain("documented \u00b7 UNREVIEWED");
    expect(section.querySelectorAll("a")).toHaveLength(0);
  });

  it("shows nothing retrieved, never 'unpublished', when the row has no Literature field", () => {
    show(evidenceOf("publication-none"));
    open(/Checklist place of publication/);
    const section = container.querySelector('[data-kind="publication"]')!;
    expect(section.querySelectorAll('[data-testid="calyx-record-text"]')).toHaveLength(0);
    expect(section.textContent).toContain("Nothing retrieved in this store");
    expect(section.textContent).not.toMatch(/unpublished|not published|never published|year in parentheses/i);
  });

  it("two topics in one subject give two record areas", () => {
    show(evidenceOf("publication-and-distribution"));
    expect(container.querySelector('[data-kind="distribution"]')).not.toBeNull();
    expect(container.querySelector('[data-kind="publication"]')).not.toBeNull();
    expect(text()).toContain("Topics read: distribution, publication");
  });

  it("variety turn: the place of publication belongs to the one taxon shown", () => {
    show(evidenceOf("publication-variety"));
    open(/Checklist place of publication/);
    expect(text()).toContain("Field Guide Orchids Europe Medit. 241 (2019)");
    expect(text()).toContain("year in parentheses in the citation: 2019");
  });

  it("with no year it says so and invents none; a withheld place shows no field of the record", () => {
    const raw = clone("publication-species");
    const place = fixtureRecordAt(raw, "subjects", 0, "evidence", "publication", "places", 0);
    place.year = null;
    show(raw);
    open(/Checklist place of publication/);
    expect(text()).toContain("No year is given for this citation");
    expect(text()).not.toContain("year in parentheses in the citation");
    const withheld = clone("publication-species");
    Object.assign(fixtureRecordAt(withheld, "subjects", 0, "evidence", "publication", "places", 0), { withheld_by_privacy_gate: true, as_written_by_source: "SECRET CITATION" });
    show(withheld); // same mounted section, still open from above
    expect(text()).toContain("Place of publication withheld by the privacy gate.");
    expect(text()).not.toContain("SECRET CITATION");
  });

  it("does not claim a verification state the backend did not report", () => {
    const raw = clone("publication-species");
    delete fixtureRecordAt(raw, "subjects", 0, "evidence", "publication").is_verified_publication;
    show(raw);
    open(/Checklist place of publication/);
    expect(all("calyx-record-note")[0].textContent).toBe("Whether this was checked against the publication is not reported.");
  });

  it("a malformed place (non-integer year, non-text citation) makes only that part unreadable", () => {
    for (const mutate of [(p: Record<string, unknown>) => { p.year = "1768"; }, (p: Record<string, unknown>) => { p.as_written_by_source = 5; }]) {
      const raw = clone("publication-species");
      mutate(fixtureRecordAt(raw, "subjects", 0, "evidence", "publication", "places", 0));
      show(raw);
      expect(all("calyx-record-unreadable")[0].textContent).toBe("Checklist place of publication: could not be displayed.");
      expect(all("calyx-evidence-sentences")[0].querySelectorAll("li").length).toBe(fixtureArrayAt(raw, "reading").length);
    }
  });
});

describe("synonym listing: records_attached", () => {
  it.each(["synonym-ambiguous", "synonym-accepted-taxon-is-a-variety", "synonym-with-infraspecific-word"])(
    "%s: records_attached false reads 'No records attached' beside the returned explanation",
    (name) => {
      const raw = evidenceOf(name) as { explanation: string; subjects: Array<{ synonym_resolution: { records_attached: boolean } }> };
      expect(raw.subjects[0].synonym_resolution.records_attached).toBe(false);
      show(raw);
      open(/Name lookup in the checklist/);
      expect(all("calyx-record-note")[0].textContent).toBe("No records attached to this name lookup.");
      expect(text()).toContain(raw.explanation);
      expect(text()).not.toMatch(/error|failed|unavailable/i);
    },
  );

  it("records_attached true or absent adds no note", () => {
    const raw = clone("synonym-resolved-distribution");
    fixtureRecordAt(raw, "subjects", 0, "evidence", "synonym_resolution").records_attached = true;
    show(raw);
    open(/Name lookup in the checklist/);
    expect(all("calyx-record-note")).toHaveLength(0);
  });
});

describe("variety turn with a synonym notice", () => {
  it("shows the notice (the synonym listing) and the distribution of the taxon read", () => {
    show(evidenceOf("synonym-beside-variety-notice"));
    const raw = evidenceOf("synonym-beside-variety-notice") as { notices: string[] };
    expect(all("calyx-notices")[0].textContent).toContain(raw.notices[0]);
    expect(container.querySelector('[data-kind="distribution"]')).not.toBeNull();
  });
});
