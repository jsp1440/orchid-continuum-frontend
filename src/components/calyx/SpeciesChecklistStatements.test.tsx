// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SpeciesChecklistStatements from "@/components/calyx/SpeciesChecklistStatements";
import { readSpeciesChecklistStatements } from "@/lib/calyxSpeciesChecklistStatements";
import busy from "@/lib/__fixtures__/calyxSpeciesChecklistStatements/busy.json";
import chloraea from "@/lib/__fixtures__/calyxSpeciesChecklistStatements/enabled-chloraea.json";
import disabled from "@/lib/__fixtures__/calyxSpeciesChecklistStatements/disabled.json";
import gate from "@/lib/__fixtures__/calyxSpeciesChecklistStatements/enabled-angraecum-gate.json";
import noNode from "@/lib/__fixtures__/calyxSpeciesChecklistStatements/no-graph-node-no-such-name.json";
import sphegodes from "@/lib/__fixtures__/calyxSpeciesChecklistStatements/enabled-sphegodes-incomplete.json";

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
  vi.restoreAllMocks();
});

async function mount(taxonId: string | null, body: unknown) {
  const fetcher = vi.fn(async () => readSpeciesChecklistStatements(body));
  await act(async () => { root.render(<SpeciesChecklistStatements fetcher={fetcher} taxonId={taxonId} />); });
  return fetcher;
}
const openAll = () => {
  for (const b of Array.from(container.querySelectorAll("button"))) act(() => { b.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};
const quiet = () => ["log", "info", "warn", "error", "debug"].map((m) => vi.spyOn(console, m as "log").mockImplementation(() => undefined));

describe("inert: renders nothing and logs nothing", () => {
  it.each([
    ["the route is switched off", disabled.body],
    ["the taxon has no graph node", noNode.body],
    ["an answer that is not the v1 envelope", { schema: "other", status: "available" }],
    ["an unknown status", { ...disabled.body, status: "nothing_recorded" }],
  ])("%s", async (_name, body) => {
    const spies = quiet();
    await mount("101", body);
    expect(container.innerHTML).toBe("");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
  it("without a taxon id nothing is fetched and nothing is drawn", async () => {
    const fetcher = await mount(null, chloraea.body);
    expect(fetcher).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
  });
  it("a fetch that rejects leaves the page as it was, without a log", async () => {
    const spies = quiet();
    const fetcher = vi.fn(async () => { throw new Error("boom"); });
    await act(async () => { root.render(<SpeciesChecklistStatements fetcher={fetcher} taxonId="101" />); });
    expect(container.innerHTML).toBe("");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("a stated gap", () => {
  it("busy: 'could not be read' with the returned explanation; not 'none' and not 'no statements'", async () => {
    await mount("101", busy.body);
    const section = container.querySelector('[data-testid="species-checklist-statements"]');
    expect(section?.getAttribute("data-state")).toBe("could_not_be_read");
    expect(section?.textContent).toContain("Checklist statements could not be read");
    expect(section?.textContent).toContain("were not retrieved because the evidence path was busy. Nothing is concluded from that.");
    expect(section?.textContent).not.toMatch(/no statements|none|does not exist|undefined/i);
  });
  it("an available envelope whose block cannot be read says 'could not be displayed'", async () => {
    const body = structuredClone(chloraea.body);
    Object.assign(body.scientific_evidence, { reading: "x" });
    await mount("101", body);
    expect(container.textContent).toContain("Checklist statements could not be displayed");
  });
});

describe("available", () => {
  it("draws the notice as returned, the sentences once, and the records through the structured components", async () => {
    await mount("102", chloraea.body);
    const section = container.querySelector('[data-testid="species-checklist-statements"]');
    expect(section?.getAttribute("data-state")).toBe("available");
    expect(container.querySelector("h3")?.textContent).toBe("Checklist statements for Chloraea bletioides");
    expect(container.querySelector('[data-testid="species-checklist-notice"]')?.textContent).toBe(chloraea.body.notice);
    expect(container.querySelectorAll('[data-testid="species-checklist-sentences"] li').length).toBe(chloraea.body.scientific_evidence.reading.length);
    expect(container.querySelector('[data-testid="calyx-subject-sentences"]')).toBeNull();
    const kinds = Array.from(container.querySelectorAll("[data-kind]")).map((n) => n.getAttribute("data-kind"));
    expect(kinds).toEqual(expect.arrayContaining(["distribution", "synonymy", "publication", "conservation", "vernacular_names", "infrageneric_placement"]));
    openAll();
    expect(container.textContent).not.toMatch(/could not be displayed|undefined|\[object|NaN|\bnull\b/);
  });
  it("a topic that holds nothing says 'nothing retrieved', never none or absent", async () => {
    await mount("102", chloraea.body);
    const empty = Array.from(container.querySelectorAll('[data-kind="conservation"], [data-kind="vernacular_names"], [data-kind="infrageneric_placement"]'));
    expect(empty).toHaveLength(3);
    // the placement summary is the backend's own count of terms shown (0), the other two are "nothing retrieved"
    for (const section of empty) expect(section.textContent).toMatch(/nothing retrieved|0 terms shown/);
    openAll();
    expect(container.textContent).toContain("Nothing retrieved in this store");
    expect(container.textContent).not.toMatch(/has no (remark|conservation|common names)|is not threatened|does not exist/i);
  });
  it("a place held back by the privacy gate is said as held back", async () => {
    await mount("103", gate.body);
    openAll();
    expect(container.querySelector('[data-kind="publication"]')?.textContent).toContain("Place of publication withheld by the privacy gate.");
    expect(container.textContent).not.toMatch(/42\.3601|71\.0589/);
  });
  it("a list that was not read to its end says so; a topic marked not read is named", async () => {
    await mount("101", sphegodes.body);
    expect(container.querySelector('[data-testid="species-checklist-not-to-the-end"]')?.textContent).toBe("Not every topic was read to its end; a list may be cut.");
    const body = structuredClone(chloraea.body);
    body.topic_status.vernacular_names = "not_read";
    body.all_topics_read = false;
    await mount("102", body);
    expect(container.querySelector('[data-testid="species-checklist-not-read"]')?.textContent).toBe("Not read this time: vernacular_names. Nothing is concluded about them.");
    expect(container.querySelector('[data-testid="species-checklist-not-to-the-end"]')).toBeNull();
  });
  it("the page's own lines carry no internal id and no link", async () => {
    await mount("102", chloraea.body);
    openAll();
    const own = Array.from(container.querySelectorAll('h3, h4, h5, button, [data-testid="calyx-record-text"], [data-testid="calyx-record-note"], li span.block')).map((n) => n.textContent).join(" | ");
    expect(own).not.toMatch(/taxon:|kg_node|canonical_key|edge_id|node_id/);
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });
  it("fetches again for another taxon and draws nothing for the old one while waiting", async () => {
    const fetcher = vi.fn(async (id: string) => readSpeciesChecklistStatements(id === "102" ? chloraea.body : disabled.body));
    await act(async () => { root.render(<SpeciesChecklistStatements fetcher={fetcher} taxonId="102" />); });
    expect(container.querySelector('[data-state="available"]')).not.toBeNull();
    await act(async () => { root.render(<SpeciesChecklistStatements fetcher={fetcher} taxonId="101" />); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(container.innerHTML).toBe("");
  });
});
