import { describe, expect, it } from "vitest";

import { evaluatePlannerResult } from "../../scripts/enforce-planner-provider-policy.mjs";

describe("planner provider degradation policy", () => {
  it("allows a healthy provider result", () => {
    expect(evaluatePlannerResult({ type: "result", is_error: false })).toEqual({
      ok: true,
      degraded: false,
      reason: "PROVIDER_HEALTHY",
    });
  });

  it.each([
    "ANTHROPIC_CREDIT_EXHAUSTED",
    "ANTHROPIC_RATE_LIMITED",
    "ANTHROPIC_PROVIDER_ERROR",
  ])("allows known capacity degradation: %s", (cause) => {
    expect(
      evaluatePlannerResult({
        type: "result",
        is_error: true,
        provider_failure_cause: cause,
      }),
    ).toEqual({ ok: true, degraded: true, reason: cause });
  });

  it("fails closed for authentication or permission failures", () => {
    expect(evaluatePlannerResult({ type: "result", is_error: true, api_error_status: 401 }).ok).toBe(false);
    expect(evaluatePlannerResult({ type: "result", is_error: true, api_error_status: 403 }).ok).toBe(false);
  });

  it("fails closed when no authoritative result record exists", () => {
    expect(evaluatePlannerResult([{ type: "system", subtype: "init" }]).ok).toBe(false);
  });
});
