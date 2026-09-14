import { describe, expect, it } from "vitest";
import { selectLanes } from "../scripts/oc-multilane-selector.mjs";

describe("multi-lane selector", () => {
  it("selects up to eight independent eligible issues", () => {
    const issues = Array.from({ length: 10 }, (_, i) => ({ number: i + 1, labels: ["oc-queued"] }));
    const result = selectLanes({ issues, runningCount: 0, maxActiveLanes: 8 });
    expect(result.selected).toEqual([1,2,3,4,5,6,7,8]);
  });

  it("accounts for already-running capacity", () => {
    const issues = Array.from({ length: 10 }, (_, i) => ({ number: i + 1, labels: ["oc-queued"] }));
    const result = selectLanes({ issues, runningCount: 6, maxActiveLanes: 8 });
    expect(result.selected).toEqual([1,2]);
  });

  it("skips blocked, validating, owner-gated, backoff, and durable-PR lineages", () => {
    const issues = [
      { number: 1, labels: ["oc-queued", "oc-blocked"] },
      { number: 2, labels: ["oc-queued", "oc-validating"] },
      { number: 3, labels: ["oc-queued", "oc-owner-gate"] },
      { number: 4, labels: ["oc-queued", "oc-runtime-backoff"] },
      { number: 5, labels: ["oc-queued"], hasDurablePr: true },
      { number: 6, labels: ["oc-queued"] },
    ];
    expect(selectLanes({ issues }).selected).toEqual([6]);
  });
});
