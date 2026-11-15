import { describe, expect, it } from "vitest";

import {
  fetchSpeciesChecklistStatements,
  readSpeciesChecklistStatements,
  type FetchLike,
} from "@/lib/calyxSpeciesChecklistStatements";
import busy from "@/lib/__fixtures__/calyxSpeciesChecklistStatements/busy.json";
import chloraea from "@/lib/__fixtures__/calyxSpeciesChecklistStatements/enabled-chloraea.json";
import disabled from "@/lib/__fixtures__/calyxSpeciesChecklistStatements/disabled.json";
import gate from "@/lib/__fixtures__/calyxSpeciesChecklistStatements/enabled-angraecum-gate.json";
import noNode from "@/lib/__fixtures__/calyxSpeciesChecklistStatements/no-graph-node-no-such-name.json";
import notFound from "@/lib/__fixtures__/calyxSpeciesChecklistStatements/species-not-found.json";
import sphegodes from "@/lib/__fixtures__/calyxSpeciesChecklistStatements/enabled-sphegodes-incomplete.json";
import timeBudget from "@/lib/__fixtures__/calyxSpeciesChecklistStatements/time-budget-exceeded.json";

const clone = <T,>(value: T): T => structuredClone(value);

describe("the captured envelopes (backend #2426 836af0c9, local PostgreSQL, real MCP stdio server)", () => {
  it("records the captured HTTP facts: 200 with no-store for every state, 404 for an unknown id", () => {
    for (const f of [busy, chloraea, disabled, gate, noNode, sphegodes, timeBudget]) {
      expect(f.http_status).toBe(200);
      expect(f.cache_control).toBe("no-store");
    }
    expect(notFound.http_status).toBe(404);
  });
  it("switched off and no graph node are inert", () => {
    expect(readSpeciesChecklistStatements(disabled.body)).toEqual({ kind: "inert" });
    expect(readSpeciesChecklistStatements(noNode.body)).toEqual({ kind: "inert" });
  });
  it("busy and over-the-budget are 'could not be read' with the returned explanation and code, never an absence", () => {
    const b = readSpeciesChecklistStatements(busy.body);
    expect(b).toMatchObject({ kind: "could_not_be_read", code: "BUSY" });
    expect(JSON.stringify(b)).toContain("Nothing is concluded from that.");
    expect(readSpeciesChecklistStatements(timeBudget.body)).toMatchObject({ kind: "could_not_be_read", code: "TIME_BUDGET_EXCEEDED" });
  });
  it("an available envelope is read with the same reader as a Calyx turn", () => {
    const r = readSpeciesChecklistStatements(chloraea.body);
    expect(r.kind).toBe("available");
    if (r.kind !== "available") return;
    expect(r.evidence.kind).toBe("available");
    expect(r.evidence.structured?.topics).toEqual(["distribution", "conservation", "synonymy", "publication", "vernacular_names", "infrageneric_placement"]);
    expect(r.topicsNotRead).toEqual([]);
    expect(r.allTopicsRead).toBe(true);
    expect(r.notice).toContain("unreviewed");
    expect(r.acceptedName).toBe("Chloraea bletioides");
  });
  it("a taxon whose synonyms exceed one read says all_topics_read false", () => {
    const r = readSpeciesChecklistStatements(sphegodes.body);
    expect(r).toMatchObject({ kind: "available", allTopicsRead: false, topicsNotRead: [] });
  });
  it("a place held back by the privacy gate stays held back (no text, no coordinates)", () => {
    const r = readSpeciesChecklistStatements(gate.body);
    expect(r.kind).toBe("available");
    expect(JSON.stringify(r)).not.toMatch(/42\.3601|71\.0589/);
  });
});

describe("fail closed", () => {
  it.each([
    ["not an object", 5],
    ["null", null],
    ["another schema", { ...clone(chloraea.body), schema: "oc.species-checklist-statements.v2" }],
    ["no status", { ...clone(disabled.body), status: undefined }],
    ["an unknown status", { ...clone(disabled.body), status: "nothing_recorded" }],
  ])("%s is inert", (_name, raw) => {
    expect(readSpeciesChecklistStatements(raw)).toEqual({ kind: "inert" });
  });
  it.each([
    ["no block", (b: any) => { b.scientific_evidence = null; }],
    ["a block of another status", (b: any) => { b.scientific_evidence.status = "not_resolved"; }],
    ["a block whose reading is not a list", (b: any) => { b.scientific_evidence.reading = "x"; }],
    ["a topic_status that is not an object", (b: any) => { b.topic_status = ["read"]; }],
  ])("an available envelope with %s could not be displayed", (_name, edit) => {
    const body = clone(chloraea.body);
    edit(body);
    expect(readSpeciesChecklistStatements(body)).toEqual({ kind: "could_not_be_displayed" });
  });
  it("(synthetic) topics marked not_read are named as returned", () => {
    const body: any = clone(chloraea.body);
    body.topic_status.vernacular_names = "not_read";
    body.all_topics_read = false;
    expect(readSpeciesChecklistStatements(body)).toMatchObject({ kind: "available", topicsNotRead: ["vernacular_names"], allTopicsRead: false });
  });
});

describe("fetchSpeciesChecklistStatements", () => {
  const answer = (status: number, body: unknown): FetchLike => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

  it("asks the route of the taxon, with the id encoded", async () => {
    const seen: string[] = [];
    const f: FetchLike = async (url) => { seen.push(url); return { ok: true, status: 200, json: async () => disabled.body }; };
    await fetchSpeciesChecklistStatements("calyx:101", undefined, f);
    expect(seen).toEqual(["https://orchid-calyx-backend.onrender.com/api/platform/species/calyx%3A101/checklist-statements"]);
  });
  it("200 is read; 404 and other 4xx are inert; 5xx is could not be read", async () => {
    expect((await fetchSpeciesChecklistStatements("101", undefined, answer(200, chloraea.body))).kind).toBe("available");
    expect(await fetchSpeciesChecklistStatements("999", undefined, answer(404, notFound.body))).toEqual({ kind: "inert" });
    expect(await fetchSpeciesChecklistStatements("x", undefined, answer(422, { detail: [] }))).toEqual({ kind: "inert" });
    expect(await fetchSpeciesChecklistStatements("101", undefined, answer(503, {}))).toEqual({ kind: "could_not_be_read", explanation: null, code: "HTTP_503" });
    expect(await fetchSpeciesChecklistStatements("101", undefined, answer(500, "not json"))).toMatchObject({ kind: "could_not_be_read" });
  });
  it("a network failure and an unparseable body are inert; an aborted request is rethrown", async () => {
    const down: FetchLike = async () => { throw new TypeError("Failed to fetch"); };
    expect(await fetchSpeciesChecklistStatements("101", undefined, down)).toEqual({ kind: "inert" });
    const broken: FetchLike = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad json"); } });
    expect(await fetchSpeciesChecklistStatements("101", undefined, broken)).toEqual({ kind: "inert" });
    const controller = new AbortController();
    controller.abort();
    await expect(fetchSpeciesChecklistStatements("101", controller.signal, down)).rejects.toThrow();
  });
});
