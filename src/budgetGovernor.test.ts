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
    const result = decideBudget({ programSpent: 0, dailySpent: 0, providerAuthorized: true, requestedUsd: 0.51 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("task_cap_exceeded");
  });

  it("rejects a reservation that would cross the daily hard cap", () => {
    const result = decideBudget({ programSpent: 9.8, providerAuthorized: true, dailySpent: 9.8, requestedUsd: 0.4 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("daily_hard_cap_exceeded");
  });

  it("rejects a reservation that would cross the program cap", () => {
    const result = decideBudget({ dailySpent: 0, providerAuthorized: true, programSpent: 99.8, requestedUsd: 0.4 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("program_cap_exceeded");
  });
});

describe('budget fail-closed edge cases', () => {
  it('rejects malformed/missing balances and raised policy ceilings', () => {
    for (const bad of [undefined, null, '', 'unknown', -1, Infinity, NaN]) {
      expect(decideBudget({ providerAuthorized: true, programSpent: bad, dailySpent: 0, requestedUsd: 0.25 }).allowed).toBe(false);
    }
    expect(decideBudget({ providerAuthorized: true, programSpent: 0, dailySpent: 0, programUsd: 1000 }).allowed).toBe(false);
  });
  it('never lets remaining budget or truthy strings override authorization=false', () => {
    for (const providerAuthorized of [false, 'true', 1, undefined]) {
      expect(decideBudget({ providerAuthorized, programSpent: 0, dailySpent: 0, requestedUsd: 0.25 }).reason).toBe('provider_not_authorized');
    }
  });
  it('enforces the difficult-task ceiling and 14-day program window', () => {
    const input = { providerAuthorized: true, programSpent: 0, dailySpent: 0, difficulty: 'difficult', requestedUsd: 2 };
    expect(decideBudget(input).allowed).toBe(true);
    expect(decideBudget({ ...input, requestedUsd: 2.01 }).reason).toBe('task_cap_exceeded');
    expect(decideBudget({ ...input, programStartedAt: '2026-09-01T00:00:00Z', now: '2026-09-15T00:00:00Z' }).reason).toBe('program_window_closed');
  });
});
