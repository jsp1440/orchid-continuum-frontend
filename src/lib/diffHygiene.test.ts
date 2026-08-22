import { describe, expect, it } from "vitest";

import { candidateDiffRanges, classifyDiffCheck } from "../../scripts/check-diff-hygiene.mjs";

/**
 * The verdict logic behind the repo-wide whitespace gate.
 *
 * `git diff --check` exits non-zero *because it found problems*, and prints
 * those problems on stdout. An implementation that reads the non-zero status as
 * "the command failed" reports an unreadable range instead of the defects it
 * was just handed — which is a silent pass in the only case that matters.
 *
 * The third case is the one worth pinning hardest: a non-zero status with no
 * findings means git could not evaluate the range at all (missing base ref,
 * shallow clone). That must never read as clean.
 */

describe("diff hygiene range selection", () => {
  it("uses the pull-request base with a three-dot range", () => {
    expect(candidateDiffRanges("oc-autonomous-integration", "ignored")).toEqual([
      {
        revision: "origin/oc-autonomous-integration",
        range: "origin/oc-autonomous-integration...HEAD",
      },
      {
        revision: "oc-autonomous-integration",
        range: "oc-autonomous-integration...HEAD",
      },
    ]);
  });

  it("uses the push event's previous commit instead of the updated branch tip", () => {
    const before = "0123456789abcdef0123456789abcdef01234567";
    expect(candidateDiffRanges("", before)).toEqual([
      { revision: before, range: `${before}..HEAD` },
    ]);
  });

  it("falls back to HEAD^ for a first push whose before SHA is all zeroes", () => {
    expect(candidateDiffRanges("", "0".repeat(40))).toEqual([
      { revision: "HEAD^", range: "HEAD^..HEAD" },
    ]);
  });
});

describe("diff hygiene verdict", () => {
  it("passes a clean range", () => {
    expect(classifyDiffCheck(0, "")).toMatchObject({ verdict: "clean", exitCode: 0 });
  });

  it("reports the exact defect that escaped to the promotion PR", () => {
    const result = classifyDiffCheck(2, "src/lib/missionControlQueue.ts:19: new blank line at EOF.\n");
    expect(result.verdict).toBe("problems");
    expect(result.exitCode).toBe(1);
    expect(result.findings).toEqual([
      "src/lib/missionControlQueue.ts:19: new blank line at EOF.",
    ]);
  });

  it("lists every finding rather than only the first", () => {
    const result = classifyDiffCheck(
      2,
      "a.ts:1: trailing whitespace.\nb.ts:9: new blank line at EOF.\nc.ts:3: space before tab in indent.\n",
    );
    expect(result.findings).toHaveLength(3);
    expect(result.exitCode).toBe(1);
  });

  it("refuses to call an unevaluable range clean", () => {
    // Non-zero with nothing on stdout: bad revision, missing base, shallow
    // clone. Exit 2 keeps this distinguishable from both clean and dirty.
    expect(classifyDiffCheck(128, "")).toMatchObject({ verdict: "indeterminate", exitCode: 2 });
    expect(classifyDiffCheck(null, "")).toMatchObject({ verdict: "indeterminate", exitCode: 2 });
  });

  it("still fails when git reports findings alongside a zero status", () => {
    // Defensive: trust the findings over the status. A configuration that
    // suppressed the exit code must not turn real defects into a pass.
    expect(classifyDiffCheck(0, "a.ts:1: trailing whitespace.\n")).toMatchObject({
      verdict: "problems",
      exitCode: 1,
    });
  });

  it("ignores blank padding in git output", () => {
    expect(classifyDiffCheck(0, "\n\n  \n")).toMatchObject({ verdict: "clean", exitCode: 0 });
  });
});
