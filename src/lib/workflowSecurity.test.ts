import { describe, expect, it } from "vitest";

import { actionPinFinding } from "../../scripts/check-workflow-security.mjs";

describe("workflow action pin enforcement", () => {
  it("rejects the standard YAML list-item uses form when it is tag-pinned", () => {
    expect(actionPinFinding("- uses: actions/checkout@v4", 12)).toBe(
      "12: pin actions/checkout to a full 40-character commit SHA",
    );
  });

  it("also rejects a bare uses declaration when it is tag-pinned", () => {
    expect(actionPinFinding("uses: actions/setup-node@v4", 8)).toBe(
      "8: pin actions/setup-node to a full 40-character commit SHA",
    );
  });

  it("accepts a full forty-character action commit SHA", () => {
    expect(
      actionPinFinding(
        "- uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0",
        12,
      ),
    ).toBeNull();
  });

  it("does not require a remote SHA for a local action", () => {
    expect(actionPinFinding("- uses: ./ .github/actions/local".replace("./ ", "./"), 4)).toBeNull();
  });
});
