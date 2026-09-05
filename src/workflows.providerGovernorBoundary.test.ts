import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const governed = readFileSync(
  resolve(__dirname, "../.github/workflows/orchid-completion-governed.yml"),
  "utf8",
);

describe("provider governor workflow boundary", () => {
  it("fails closed with every paid provider disabled while NO-API mode is active", () => {
    expect(governed).toContain("OC_PROVIDER_NO_API_MODE: 'true'");
    expect(governed).toContain("OC_PROVIDER_DISABLED: 'anthropic,gemini,openai'");
  });

  it("evaluates the deterministic governor before the legacy paid-provider lane", () => {
    const gate = governed.indexOf("scripts/provider-governor-workflow-gate.ts");
    const paidLane = governed.indexOf("./.github/workflows/orchid-completion-lane.yml");

    expect(gate).toBeGreaterThan(-1);
    expect(paidLane).toBeGreaterThan(gate);
    expect(governed).toContain(
      "if: needs.provider-admission.outputs.allow_paid_execution == 'true'",
    );
  });

  it("does not expose provider credentials or provider actions in the admission job", () => {
    const admission = governed.split("  paid-provider-completion:")[0];

    expect(admission).not.toContain("ANTHROPIC_API_KEY");
    expect(admission).not.toContain("OPENAI_API_KEY");
    expect(admission).not.toContain("GEMINI_API_KEY");
    expect(admission).not.toContain("anthropics/claude-code-action");
    expect(admission).not.toContain("openai/");
    expect(admission).not.toContain("google-gemini");
  });

  it("keeps dispatch throttles explicit at the workflow boundary", () => {
    expect(governed).toContain("OC_PROVIDER_MINIMUM_DISPATCH_INTERVAL_MS: '3600000'");
    expect(governed).toContain("OC_PROVIDER_DAILY_MAX_CALLS: '4'");
    expect(governed).toContain("OC_PROVIDER_WAVE_MAX_CALLS: '1'");
  });
});
