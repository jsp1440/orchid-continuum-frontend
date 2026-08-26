// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ScientificRagPipeline, __resetRunCounter } from "@/lib/scientific-rag/pipeline";
import { __resetLedgerSequence } from "@/lib/scientific-rag/ledger";
import { computeMetrics } from "@/lib/scientific-rag/missionControl";
import { PHALAENOPSIS_PUBLICATION_V1 } from "@/lib/scientific-rag/fixtures/phalaenopsisPublication";
import { PHALAENOPSIS_DEMO_QUESTION } from "@/lib/scientific-rag";

const { default: ScientificEvidencePanel } = await import("./ScientificEvidencePanel");

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  __resetRunCounter();
  __resetLedgerSequence();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ScientificEvidencePanel", () => {
  it("renders a verified grounded answer with provenance and no protected locality", () => {
    const p = new ScientificRagPipeline();
    p.processPublication(PHALAENOPSIS_PUBLICATION_V1);
    const { answer, verification } = p.askCalyx(PHALAENOPSIS_DEMO_QUESTION);
    const metrics = computeMetrics(p.ledger, new Date(Date.UTC(2025, 0, 2)).toISOString());

    act(() => {
      root.render(
        <ScientificEvidencePanel
          answer={answer}
          verification={verification}
          claims={[...p.claims.values()]}
          metrics={metrics}
        />,
      );
    });

    const panel = container.querySelector('[data-testid="scientific-evidence-panel"]');
    expect(panel).not.toBeNull();
    expect(container.querySelector('[data-testid="evidence-verdict"]')?.textContent).toContain("verified");
    const rows = container.querySelectorAll('[data-testid="evidence-row"]');
    expect(rows.length).toBeGreaterThan(0);
    // Both verified and inferred states are represented in the DOM.
    const states = [...rows].map((r) => r.getAttribute("data-state"));
    expect(states).toContain("verified");
    expect(states).toContain("inferred");
    // Protected locality never reaches the DOM.
    expect(container.textContent).not.toContain("15.4021");
    expect(container.textContent).not.toContain("120.9312");
    // Metrics strip is derived and rendered.
    expect(container.querySelector('[data-testid="evidence-metrics"]')).not.toBeNull();
  });

  it("renders a blocked verdict with reasons when verification fails", () => {
    const p = new ScientificRagPipeline();
    p.processPublication(PHALAENOPSIS_PUBLICATION_V1);
    const { answer } = p.askCalyx(PHALAENOPSIS_DEMO_QUESTION);
    const blocked = {
      answerId: answer.answerId,
      correlationId: answer.correlationId,
      verdict: "blocked" as const,
      checks: [{ id: "numeric", label: "Numeric values supported", status: "fail" as const, detail: "unsupported value" }],
      blockReasons: ["Numeric values supported: unsupported value"],
      contradictions: [],
      verifier: "oc-evidence-gate",
      verifierVersion: "1.0.0",
    };

    act(() => {
      root.render(
        <ScientificEvidencePanel answer={answer} verification={blocked} claims={[...p.claims.values()]} />,
      );
    });

    expect(container.querySelector('[data-testid="evidence-verdict"]')?.textContent).toContain("blocked");
    expect(container.textContent).toContain("unsupported value");
    const rows = container.querySelectorAll('[data-testid="evidence-row"]');
    expect([...rows].every((r) => r.getAttribute("data-state") === "blocked")).toBe(true);
  });
});
