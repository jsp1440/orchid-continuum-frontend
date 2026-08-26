import { describe, it, expect, beforeEach } from "vitest";
import { ScientificRagPipeline, __resetRunCounter } from "./pipeline";
import { __resetLedgerSequence } from "./ledger";
import { buildEvidenceViewModel } from "./evidenceView";
import { PHALAENOPSIS_PUBLICATION_V1 } from "./fixtures/phalaenopsisPublication";
import { PHALAENOPSIS_DEMO_QUESTION } from "./index";

function fresh() {
  __resetRunCounter();
  __resetLedgerSequence();
  const p = new ScientificRagPipeline();
  p.processPublication(PHALAENOPSIS_PUBLICATION_V1);
  return p;
}

describe("evidence view model", () => {
  beforeEach(() => {
    __resetRunCounter();
    __resetLedgerSequence();
  });

  it("assigns verified and inferred states for a good answer", () => {
    const p = fresh();
    const { answer, verification } = p.askCalyx(PHALAENOPSIS_DEMO_QUESTION);
    const vm = buildEvidenceViewModel(answer, verification, [...p.claims.values()]);
    expect(vm.overallVerdict).toBe("verified");
    const states = new Set(vm.rows.map((r) => r.state));
    expect(states.has("verified")).toBe(true);
    expect(states.has("inferred")).toBe(true);
    // Every non-insufficient row exposes provenance.
    for (const row of vm.rows) {
      if (row.state === "insufficient") continue;
      expect(row.supportingPassage).toBeTruthy();
      expect(row.locator).toBeTruthy();
      expect(row.acceptedTaxon || row.publishedTaxon).toBeTruthy();
    }
  });

  it("marks every row blocked when the answer is blocked", () => {
    const p = fresh();
    const { answer, verification } = p.askCalyx(PHALAENOPSIS_DEMO_QUESTION);
    // Force a block by corrupting metadata.
    const blocked = { ...verification, verdict: "blocked" as const, blockReasons: ["forced"] };
    const vm = buildEvidenceViewModel(answer, blocked, [...p.claims.values()]);
    expect(vm.overallVerdict).toBe("blocked");
    expect(vm.rows.every((r) => r.state === "blocked")).toBe(true);
  });

  it("renders an insufficient row when there is no evidence", () => {
    __resetRunCounter();
    __resetLedgerSequence();
    const p = new ScientificRagPipeline();
    const { answer, verification } = p.askCalyx(PHALAENOPSIS_DEMO_QUESTION);
    const vm = buildEvidenceViewModel(answer, verification, []);
    expect(vm.rows).toHaveLength(1);
    expect(vm.rows[0].state).toBe("insufficient");
  });
});
