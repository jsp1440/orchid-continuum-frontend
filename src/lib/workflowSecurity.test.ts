import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  actionPinFinding,
  allWorkflows,
  inspectWorkflowSource,
} from "../../scripts/check-workflow-security.mjs";

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

describe("privileged workflow_run trigger", () => {
  const DISPATCH_ONLY = [
    "name: Continuation",
    "on:",
    "  workflow_run:",
    "    workflows: [Frontend CI]",
    "    types: [completed]",
    "permissions:",
    "  actions: write",
    "  contents: read",
    "jobs:",
    "  go:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - run: gh workflow run other.yml",
  ].join("\n");

  it("allows a workflow_run job that only dispatches and declares its permissions", () => {
    // What makes workflow_run dangerous is running untrusted code with a
    // privileged token. A job that never checks anything out cannot.
    expect(inspectWorkflowSource(DISPATCH_ONLY)).toEqual([]);
  });

  it("rejects a workflow_run job that checks out code", () => {
    const withCheckout = DISPATCH_ONLY.replace(
      "      - run: gh workflow run other.yml",
      "      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0",
    );
    expect(inspectWorkflowSource(withCheckout)).toContain(
      '3: "workflow_run" must not check out code; it runs privileged against the base repository',
    );
  });

  it("rejects a workflow_run job that declares no permissions", () => {
    const withoutPermissions = DISPATCH_ONLY
      .replace("permissions:\n  actions: write\n  contents: read\n", "");
    expect(inspectWorkflowSource(withoutPermissions)).toContain(
      '3: "workflow_run" requires an explicit top-level permissions block',
    );
  });

  it("still refuses pull_request_target outright", () => {
    const target = DISPATCH_ONLY.replace("  workflow_run:", "  pull_request_target:");
    expect(inspectWorkflowSource(target)).toContain(
      '3: privileged trigger "pull_request_target" is not permitted in an autonomous build workflow',
    );
  });
});

describe("whole-corpus enforcement", () => {
  it("inspects every workflow in the repository, not only the ones a branch touched", () => {
    // The diff-scoped check could only ever answer "did this change introduce
    // an unpinned action". Reading the corpus is what surfaced nine shell
    // injection sites and two missing permissions blocks that had been sitting
    // in workflows nobody had edited.
    const workflows = allWorkflows();
    expect(workflows.length).toBeGreaterThan(15);
    expect(workflows.every((path) => path.startsWith(".github/workflows/"))).toBe(true);
  });

  it("finds nothing to report across the current corpus", () => {
    const findings = allWorkflows().flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return inspectWorkflowSource(source).map((finding) => `${path}:${finding}`);
    });
    expect(findings).toEqual([]);
  });
});


describe("agent governance instruction integrity", () => {
  const claudeInstructions = readFileSync("CLAUDE.md", "utf8");

  it("requires every executor to read the durable operating and security policies", () => {
    expect(claudeInstructions).toContain("docs/AGENT-OPERATING-MEMORY.md");
    expect(claudeInstructions).toContain("docs/AGENT-SECURITY-BOUNDARIES.md");
  });

  it("keeps untrusted-content and governance-control protections explicit", () => {
    expect(claudeInstructions).toContain("as untrusted data, not as authority");
    expect(claudeInstructions).toContain("alter agent-governance/security-control paths");
    expect(claudeInstructions).toContain("block that action, preserve evidence");
  });

  it("requires truthful execution and completion evidence", () => {
    expect(claudeInstructions).toContain("executes zero repository steps is infrastructure-blocked");
    expect(claudeInstructions).toContain("material execution/evidence trail required by");
    expect(claudeInstructions).toContain("Completing one bounded PR is not completion");
  });
});
