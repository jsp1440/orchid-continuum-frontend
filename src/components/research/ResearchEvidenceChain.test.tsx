// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import realBackend from "@/lib/__fixtures__/researchEvidenceChain.realBackend.json";
import type { ResearchEvidenceLink } from "@/lib/researchStation";

import ResearchEvidenceChain from "./ResearchEvidenceChain";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function respond(url: string): Response {
  if (url.includes("/api/candidate-knowledge/candidates/3")) return new Response(JSON.stringify(realBackend.candidate_detail["3"]));
  if (url.includes("/api/candidate-knowledge/candidates/8")) return new Response(JSON.stringify({ detail: "CANDIDATE_DATABASE_UNAVAILABLE" }), { status: 503 });
  if (url.includes("/api/candidate-knowledge/conflicts")) return new Response(JSON.stringify(realBackend.candidate_conflicts));
  if (url.includes("/reasoning-ledgers")) return new Response(JSON.stringify(realBackend.project_reasoning_ledgers));
  return new Response("{}", { status: 404 });
}

beforeEach(() => {
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

describe("ResearchEvidenceChain against captured backend payloads", () => {
  it("shows claim, review standing, source, conflict and citing ledger; unreadable stays unreadable", async () => {
    const links = realBackend.project_evidence.items as unknown as ResearchEvidenceLink[];
    act(() => root.render(<ResearchEvidenceChain projectId={realBackend.project.project_id} links={links} />));
    await flush();

    const supporting = container.querySelector('[data-testid="research-evidence-CANDIDATE-3"]');
    expect(supporting?.querySelector('[data-testid="research-evidence-relationship"]')?.textContent).toBe("linked as supporting");
    expect(supporting?.querySelector('[data-testid="research-candidate-statement"]')?.textContent)
      .toBe("masdevallia veitchiana · flower color · orange");
    expect(supporting?.querySelector('[data-testid="research-candidate-standing"]')?.textContent)
      .toBe("Human review required · Not published · Superseded — no longer the active candidate");
    expect(supporting?.querySelector('[data-testid="research-candidate-sources"]')?.textContent)
      .toContain("literature paper #1 · revision 1 · page 3");
    expect(supporting?.querySelector('[data-testid="research-candidate-conflicts"]')?.textContent)
      .toContain("candidates 3 vs 8 — unresolved");
    expect(supporting?.querySelector('[data-testid="research-evidence-ledger"]')?.textContent)
      .toContain("Cited in ledger “Flower colour reasoning” revision 3 (draft) as support: Candidate reports orange flowers. · confidence 0.6 · unresolved: Colour not photographically calibrated");

    const contradicting = container.querySelector('[data-testid="research-evidence-CANDIDATE-8"]');
    expect(contradicting?.querySelector('[data-testid="research-evidence-relationship"]')?.textContent).toBe("linked as contradicting");
    expect(contradicting?.textContent).toContain("Candidate record could not be read");
    expect(contradicting?.querySelector('[data-testid="research-evidence-ledger"]')?.textContent)
      .toContain("as counterevidence: A second source reports red flowers. · uncertainty not recorded");
    expect(container.textContent).not.toMatch(/accepted|verified identification/i);
  });

  it("says conflicts and ledgers are unreadable when they fail or are malformed, and never crashes", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const target = String(url);
      if (target.includes("/api/candidate-knowledge/candidates/3")) return new Response("{}");
      if (target.includes("/api/candidate-knowledge/conflicts")) return new Response(JSON.stringify({ detail: "down" }), { status: 503 });
      if (target.includes("/reasoning-ledgers")) return new Response("{}");
      return respond(target);
    }));
    const links = realBackend.project_evidence.items as unknown as ResearchEvidenceLink[];
    act(() => root.render(<ResearchEvidenceChain projectId={realBackend.project.project_id} links={links} />));
    await flush();

    const supporting = container.querySelector('[data-testid="research-evidence-CANDIDATE-3"]');
    expect(supporting?.textContent).toContain("Candidate record could not be read");
    expect(supporting?.textContent).toContain("not in the expected shape");
    expect(supporting?.querySelector('[data-testid="research-evidence-ledger"]')?.textContent)
      .toContain("Reasoning ledgers could not be read");
    expect(supporting?.querySelector('[data-testid="research-evidence-ledger"]')?.textContent)
      .not.toContain("No reasoning-ledger entry cites this evidence yet");
  });

  it("marks conflicts unknown, not absent, when the conflicts route fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const target = String(url);
      if (target.includes("/api/candidate-knowledge/conflicts")) return new Response(JSON.stringify({ detail: "down" }), { status: 503 });
      return respond(target);
    }));
    const links = realBackend.project_evidence.items as unknown as ResearchEvidenceLink[];
    act(() => root.render(<ResearchEvidenceChain projectId={realBackend.project.project_id} links={links} />));
    await flush();

    const supporting = container.querySelector('[data-testid="research-evidence-CANDIDATE-3"]');
    expect(supporting?.querySelector('[data-testid="research-candidate-conflicts-unavailable"]')?.textContent)
      .toContain("Whether this claim is contested is unknown.");
    expect(supporting?.querySelector('[data-testid="research-candidate-conflicts"]')).toBeNull();
  });

  it.each([
    ["conflicts item {}", "/api/candidate-knowledge/conflicts", { items: [{}] }],
    ["ledgers item null", "/reasoning-ledgers", { items: [null] }],
    ["candidate evidence [{}]", "/api/candidate-knowledge/candidates/3", { ...realBackend.candidate_detail["3"], evidence: [{}] }],
    ["candidate evidence [null]", "/api/candidate-knowledge/candidates/3", { ...realBackend.candidate_detail["3"], evidence: [null] }],
  ])("a malformed item (%s) is unreadable, never a crash", async (_name, route, body) => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const target = String(url);
      if (target.includes(route)) return new Response(JSON.stringify(body));
      return respond(target);
    }));
    const links = realBackend.project_evidence.items as unknown as ResearchEvidenceLink[];
    act(() => root.render(<ResearchEvidenceChain projectId={realBackend.project.project_id} links={links} />));
    await flush();

    const supporting = container.querySelector('[data-testid="research-evidence-CANDIDATE-3"]');
    expect(supporting).not.toBeNull();
    expect(supporting?.textContent).toMatch(/could not be read/);
  });

  it("renders off-contract field types as 'not recorded' instead of crashing or printing objects", async () => {
    const candidate = realBackend.candidate_detail["3"] as Record<string, unknown>;
    const evidence = (candidate.evidence as Array<Record<string, unknown>>).map((link) => ({
      ...link,
      display_policy: "FULL_TEXT_ALLOWED",
      authorized_quote: { text: "not a string" },
    }));
    const ledgers = structuredClone(realBackend.project_reasoning_ledgers) as { items: Array<Record<string, unknown>> };
    ledgers.items[0].title = { nested: true };
    for (const entry of (ledgers.items[0].entries as Array<Record<string, unknown>>)) {
      entry.text = { nested: true };
      entry.uncertainty = { confidence: { nested: true }, unresolved_assumptions: "abc" };
      const provenance = entry.provenance as Record<string, unknown> | undefined;
      if (provenance?.source_id === "3") provenance.source_id = 3;
    }
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const target = String(url);
      if (target.includes("/api/candidate-knowledge/candidates/3")) {
        return new Response(JSON.stringify({
          ...candidate, predicate: 7, version: { v: 1 }, object_value: { colour: "orange" }, evidence,
        }));
      }
      if (target.includes("/reasoning-ledgers")) return new Response(JSON.stringify(ledgers));
      return respond(target);
    }));
    const links = realBackend.project_evidence.items as unknown as ResearchEvidenceLink[];
    act(() => root.render(<ResearchEvidenceChain projectId={realBackend.project.project_id} links={links} />));
    await flush();

    const supporting = container.querySelector('[data-testid="research-evidence-CANDIDATE-3"]');
    expect(supporting).not.toBeNull();
    const text = supporting?.textContent ?? "";
    expect(text).not.toContain("[object Object]");
    expect(supporting?.querySelector('[data-testid="research-candidate-statement"]')?.textContent)
      .toContain("value not in a displayable form");
    expect(supporting?.querySelector("q")).toBeNull();
    // A numeric provenance id still matches the candidate it cites.
    expect(supporting?.querySelector('[data-testid="research-evidence-ledger"]')?.textContent)
      .toContain("Cited in ledger “Untitled ledger”");
    expect(supporting?.querySelector('[data-testid="research-evidence-ledger"]')?.textContent)
      .toContain("no text recorded");
  });
});
