import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dispatcher = readFileSync(
  resolve(__dirname, "../.github/workflows/orchid-deterministic-dispatch.yml"),
  "utf8",
);

describe("deterministic completion dispatch boundary", () => {
  it("routes every issue slot through the governed completion wrapper", () => {
    const governedUses = dispatcher.match(
      /uses: \.\/\.github\/workflows\/orchid-completion-governed\.yml/g,
    );

    expect(governedUses).toHaveLength(5);
    expect(dispatcher).not.toContain("./.github/workflows/orchid-completion-lane.yml");
  });

  it("contains no paid provider action or credential reference", () => {
    expect(dispatcher).not.toContain("ANTHROPIC_API_KEY");
    expect(dispatcher).not.toContain("OPENAI_API_KEY");
    expect(dispatcher).not.toContain("GEMINI_API_KEY");
    expect(dispatcher).not.toContain("anthropics/claude-code-action");
    expect(dispatcher).not.toContain("openai/");
    expect(dispatcher).not.toContain("google-gemini");
    expect(dispatcher).not.toContain("secrets: inherit");
  });

  it("does not run empty queue slots", () => {
    for (let index = 1; index <= 5; index += 1) {
      expect(dispatcher).toContain(`if: inputs.issue${index} != ''`);
      expect(dispatcher).toContain(`issue_number: \${{ inputs.issue${index} }}`);
    }
  });

  it("keeps the dispatcher read-only", () => {
    expect(dispatcher).toContain("contents: read");
    expect(dispatcher).toContain("issues: read");
    expect(dispatcher).not.toContain("contents: write");
    expect(dispatcher).not.toContain("issues: write");
    expect(dispatcher).not.toContain("pull-requests: write");
  });
});
