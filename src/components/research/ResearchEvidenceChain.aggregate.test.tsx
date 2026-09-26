// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import aggregateBackend from "@/lib/__fixtures__/researchAggregateDetail.realBackend.json";
import realBackend from "@/lib/__fixtures__/researchEvidenceChain.realBackend.json";
import { assertAggregateRecord, MalformedEvidenceResponse } from "@/lib/researchEvidenceChain";
import type { ResearchEvidenceLink } from "@/lib/researchStation";

import ResearchEvidenceChain from "./ResearchEvidenceChain";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AGGREGATE_ID = String(aggregateBackend.aggregate_id);
const aggregateLink = {
  project_id: realBackend.project.project_id,
  evidence_kind: "AGGREGATE",
  evidence_id: AGGREGATE_ID,
  relationship: "SUPPORTS",
} as ResearchEvidenceLink;
const links = [...(realBackend.project_evidence.items as unknown as ResearchEvidenceLink[]), aggregateLink];

let container: HTMLDivElement;
let root: Root;
let aggregateResponse: () => Response;
const requested: string[] = [];

function respond(url: string): Response {
  requested.push(url);
  if (url.includes(`/api/evidence-aggregation/aggregates/${AGGREGATE_ID}`)) return aggregateResponse();
  if (url.includes("/api/candidate-knowledge/candidates/3")) return new Response(JSON.stringify(realBackend.candidate_detail["3"]));
  if (url.includes("/api/candidate-knowledge/candidates/8")) return new Response(JSON.stringify({ detail: "CANDIDATE_DATABASE_UNAVAILABLE" }), { status: 503 });
  if (url.includes("/api/candidate-knowledge/conflicts")) return new Response(JSON.stringify(realBackend.candidate_conflicts));
  if (url.includes("/reasoning-ledgers")) return new Response(JSON.stringify(realBackend.project_reasoning_ledgers));
  return new Response("{}", { status: 404 });
}

beforeEach(() => {
  requested.length = 0;
  aggregateResponse = () => new Response(JSON.stringify(aggregateBackend.aggregate_detail));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => respond(String(url))));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function flush() {
  for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
}

async function renderAggregate() {
  act(() => root.render(<ResearchEvidenceChain projectId={realBackend.project.project_id} links={links} />));
  await flush();
  return container.querySelector(`[data-testid="research-evidence-AGGREGATE-${AGGREGATE_ID}"]`);
}

describe("ResearchEvidenceChain aggregate links against a captured evidence-aggregation payload", () => {
  it("reads GET /api/evidence-aggregation/aggregates/{id} and shows status, counts, uncertainty and candidates", async () => {
    const item = await renderAggregate();
    expect(requested.some((url) => url.endsWith(`/api/evidence-aggregation/aggregates/${AGGREGATE_ID}`))).toBe(true);
    expect(item?.querySelector('[data-testid="research-aggregate-statement"]')?.textContent)
      .toBe("masdevallia veitchiana · flower color · multiple values reported");
    expect(item?.querySelector('[data-testid="research-aggregate-standing"]')?.textContent)
      .toBe("Consensus status: mixed evidence · Human review required · Verification: unverified · Not published · Current version");
    expect(item?.querySelector('[data-testid="research-aggregate-counts"]')?.textContent)
      .toBe("Evidence: independent sources 2 · documents 2 · supporting 0 · contradicting 0 · unresolved 1 · duplicate 0");
    expect(item?.querySelector('[data-testid="research-aggregate-uncertainty"]')?.textContent)
      .toBe("Uncertainty: conflicts 0 · independence uncertain 0 · taxon ambiguity 0");
    expect(item?.querySelector('[data-testid="research-aggregate-priority"]')?.textContent)
      .toContain("not a probability that the claim is true");
    expect(item?.querySelector('[data-testid="research-aggregate-candidates"]')?.textContent)
      .toBe("Contributing candidates: #3 v1, #8 v1");
    expect(item?.textContent).not.toContain("Aggregate detail is not read");
  });

  it("never matches candidate ledger citations against an aggregate id", async () => {
    // Aggregate 3 and candidate 3 are different records; the ledger cites candidate 3.
    const item = await renderAggregate();
    expect(item?.querySelector('[data-testid="research-evidence-ledger"]')?.textContent)
      .toContain("matched for candidate links only");
    expect(item?.querySelector('[data-testid="research-evidence-ledger"]')?.textContent).not.toContain("Cited in ledger");
    const candidate = container.querySelector('[data-testid="research-evidence-CANDIDATE-3"]');
    expect(candidate?.querySelector('[data-testid="research-evidence-ledger"]')?.textContent).toContain("Cited in ledger");
  });

  it("states a captured 404 (superseded / absent) as unreadable, never as no evidence", async () => {
    aggregateResponse = () => new Response(JSON.stringify(aggregateBackend.aggregate_after_supersede.body), {
      status: aggregateBackend.aggregate_after_supersede.status,
    });
    const item = await renderAggregate();
    expect(item?.querySelector('[data-testid="research-aggregate-unavailable"]')?.textContent)
      .toContain("No active version of this aggregate is readable");
    expect(item?.querySelector('[data-testid="research-aggregate-statement"]')).toBeNull();
  });

  it.each([
    ["503 database unavailable", () => new Response(JSON.stringify({ detail: { code: "AGGREGATION_DATABASE_UNAVAILABLE" } }), { status: 503 }), /could not be read/],
    ["401 signed out", () => new Response(JSON.stringify({ detail: "Not authenticated" }), { status: 401 }), /could not be read: Not authenticated/],
    ["malformed 200", () => new Response(JSON.stringify({ aggregate_id: "3" })), /not in the expected shape/],
  ])("fails closed on %s", async (_name, response, message) => {
    aggregateResponse = response;
    const item = await renderAggregate();
    expect(item?.querySelector('[data-testid="research-aggregate-unavailable"]')?.textContent).toMatch(message);
    expect(item?.querySelector('[data-testid="research-aggregate-counts"]')).toBeNull();
  });

  it("does not claim current or unpublished standing the payload does not state", async () => {
    aggregateResponse = () => new Response(JSON.stringify({
      ...aggregateBackend.aggregate_detail,
      supersession_state: undefined,
      source_count: undefined,
      confidence_dimensions: { ...aggregateBackend.aggregate_detail.confidence_dimensions, score_is_truth_probability: undefined },
    }));
    const item = await renderAggregate();
    expect(item?.querySelector('[data-testid="research-aggregate-standing"]')?.textContent).toContain("Not confirmed as the current version");
    expect(item?.querySelector('[data-testid="research-aggregate-counts"]')?.textContent).toContain("independent sources not recorded");
    expect(item?.querySelector('[data-testid="research-aggregate-priority"]')).toBeNull();
  });
});

describe("assertAggregateRecord", () => {
  it("accepts the captured payload and rejects off-contract shapes", () => {
    expect(assertAggregateRecord(aggregateBackend.aggregate_detail).aggregate_id).toBe(aggregateBackend.aggregate_id);
    for (const bad of [null, [], {}, { ...aggregateBackend.aggregate_detail, published: "false" },
      { ...aggregateBackend.aggregate_detail, contributing_candidate_ids: ["3"] },
      { ...aggregateBackend.aggregate_detail, uncertainty_dimensions: [] }]) {
      expect(() => assertAggregateRecord(bad)).toThrow(MalformedEvidenceResponse);
    }
  });
});
