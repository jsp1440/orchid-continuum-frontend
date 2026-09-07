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

  it("evaluates only deterministic provider admission in NO-API mode", () => {
    expect(governed).toContain("scripts/provider-governor-workflow-gate.ts");
    expect(governed).toContain("Provider admission only:");
  });

  it("contains no reachable or declared paid-provider workflow while hard parked", () => {
    expect(governed).not.toContain("./.github/workflows/orchid-completion-lane.yml");
    expect(governed).not.toContain("secrets: inherit");
    expect(governed).not.toContain("paid-provider-completion:");
  });

  it("does not expose provider credentials or provider actions anywhere in the governed wrapper", () => {
    expect(governed).not.toContain("ANTHROPIC_API_KEY");
    expect(governed).not.toContain("OPENAI_API_KEY");
    expect(governed).not.toContain("GEMINI_API_KEY");
    expect(governed).not.toContain("anthropics/claude-code-action");
    expect(governed).not.toContain("openai/");
    expect(governed).not.toContain("google-gemini");
  });

  it("keeps dispatch throttles explicit at the workflow boundary", () => {
    expect(governed).toContain("OC_PROVIDER_MINIMUM_DISPATCH_INTERVAL_MS: '3600000'");
    expect(governed).toContain("OC_PROVIDER_DAILY_MAX_CALLS: '4'");
    expect(governed).toContain("OC_PROVIDER_WAVE_MAX_CALLS: '1'");
  });
});
