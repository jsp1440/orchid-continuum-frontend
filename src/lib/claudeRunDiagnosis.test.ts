import { describe, expect, it } from "vitest";

import { classify, findResultRecord } from "../../scripts/diagnose-claude-run.mjs";

/**
 * The classifier that turns `is_error:true` into a named cause.
 *
 * claude-code-action withholds its SDK output, so every autonomous frontend job
 * that dies on a provider error reports only "result is_error:true". A billing
 * boundary, a revoked key, a permission problem and a rate limit are then
 * indistinguishable in the workflow log — and they need opposite responses:
 * one needs the owner, one needs a re-run, one needs neither.
 *
 * These cases pin the distinction that matters most: whether a human has to do
 * something, or whether re-running is enough.
 */

describe("claude run diagnosis", () => {
  it("names credit exhaustion as an owner boundary", () => {
    const verdict = classify(400, "Credit balance is too low");
    expect(verdict.cause).toBe("ANTHROPIC_CREDIT_EXHAUSTED");
    expect(verdict.owner_action_required).toBe(true);
  });

  it("does not mistake other 400s for a billing problem", () => {
    // A malformed request is a repository-side bug, not something the owner
    // fixes in a billing console. Classifying it as credit would send the wrong
    // person to the wrong place.
    const verdict = classify(400, "messages.0.content: field required");
    expect(verdict.cause).not.toBe("ANTHROPIC_CREDIT_EXHAUSTED");
  });

  it("separates auth, permission, rate limit and provider faults", () => {
    expect(classify(401, "invalid x-api-key").cause).toBe("ANTHROPIC_AUTH_REJECTED");
    expect(classify(403, "not permitted").cause).toBe("ANTHROPIC_PERMISSION_DENIED");
    expect(classify(429, "rate limit").cause).toBe("ANTHROPIC_RATE_LIMITED");
    expect(classify(503, "overloaded").cause).toBe("ANTHROPIC_PROVIDER_ERROR");
  });

  it("marks only the boundaries a human must clear as owner-action", () => {
    // Rate limits and provider faults clear themselves; keys and credit do not.
    expect(classify(429, "rate limit").owner_action_required).toBe(false);
    expect(classify(503, "overloaded").owner_action_required).toBe(false);
    expect(classify(401, "invalid x-api-key").owner_action_required).toBe(true);
  });

  it("refuses to invent a provider outage when no API error was reported", () => {
    // A failure with no api_error_status is a workflow or prompt failure.
    // Reporting it as a provider outage would send someone to the wrong system
    // and let a real repository bug sit unattributed.
    const verdict = classify(undefined, "");
    expect(verdict.cause).toBe("NO_PROVIDER_ERROR_REPORTED");
    expect(verdict.owner_action_required).toBe(false);
  });

  it("reads the last result record, so a retry does not report the first attempt", () => {
    const log = [
      { type: "system", subtype: "init" },
      { type: "result", subtype: "success", is_error: true, api_error_status: 429 },
      { type: "result", subtype: "success", is_error: false },
    ];
    expect(findResultRecord(log)?.is_error).toBe(false);
  });

  it("survives a log with no result record at all", () => {
    expect(findResultRecord([{ type: "system", subtype: "init" }])).toBeNull();
    expect(findResultRecord({ type: "system" })).toBeNull();
  });
});
