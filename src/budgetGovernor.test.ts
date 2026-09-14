import { describe, expect, it } from "vitest";
import { decideBudget } from "../scripts/oc-budget-governor.mjs";

describe("OC budget governor", () => {
  it("rejects provider execution until separately authorized", () => {
    const result = decideBudget({ providerAuthorized: false, requestedUsd: 0.25 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("provider_not_authorized");
    expect(result.providerCallMade).toBe(false);
  });

  it("allows an authorized ordinary task inside all ceilings", () => {
    const result = decideBudget({ providerAuthorized: true, dailySpent: 1, programSpent: 10, requestedUsd: 0.4 });
    expect(result.allowed).toBe(true);
  });

  it("rejects an ordinary task above its per-task cap", () => {
    const result = decideBudget({ providerAuthorized: true, requestedUsd: 0.51 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("task_cap_exceeded");
  });

  it("rejects a reservation that would cross the daily hard cap", () => {
    const result = decideBudget({ providerAuthorized: true, dailySpent: 9.8, requestedUsd: 0.4 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("daily_hard_cap_exceeded");
  });

  it("rejects a reservation that would cross the program cap", () => {
    const result = decideBudget({ providerAuthorized: true, programSpent: 99.8, requestedUsd: 0.4 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("program_cap_exceeded");
  });
});
