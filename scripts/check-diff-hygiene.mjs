#!/usr/bin/env node
/**
 * Repo-wide whitespace hygiene for the changed range.
 *
 * `git diff --check` was previously only wired into
 * calyx-multimodal-workspace-validation.yml, which is path-filtered to
 * src/features/calyx-workspace/** plus four named files. A defect in any other
 * file therefore never met the check on its own pull request.
 *
 * That is exactly how a trailing blank line in src/lib/missionControlQueue.ts
 * reached the integration branch: the file matches none of those paths, so the
 * job never ran. It only surfaced on the promotion pull request, where the
 * accumulated range happened to touch a filtered path and the check finally ran
 * over 100 commits at once - the most expensive possible moment to learn it.
 *
 * This runs from the always-on gate instead, against the pull request's own
 * base, so a whitespace defect fails on the pull request that introduces it
 * regardless of which files it touches.
 *
 * Exit codes: 0 clean, 1 whitespace errors found, 2 could not determine the
 * range. Two is deliberately not a silent pass: a check that cannot see the
 * diff must not report success.
 */

import { spawnSync } from "node:child_process";

/**
 * Runs git and returns {status, stdout}.
 *
 * spawnSync rather than execFileSync on purpose: `git diff --check` exits
 * non-zero *because it found problems*, and its findings arrive on stdout.
 * Treating that non-zero as "the command failed" would report an unreadable
 * range instead of the whitespace errors it just listed.
 */
function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.error) return { status: null, stdout: "" };
  return { status: result.status, stdout: result.stdout ?? "" };
}

function resolveBase() {
  // On a pull request GitHub supplies the target branch; on a push there is no
  // base ref and the merge-base with main is the honest comparison.
  const baseRef = process.env.GITHUB_BASE_REF?.trim();
  const candidates = baseRef ? [`origin/${baseRef}`, baseRef] : ["origin/main", "main"];
  for (const candidate of candidates) {
    if (git(["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`]).status === 0) {
      return candidate;
    }
  }
  return null;
}

/**
 * Turns a `git diff --check` outcome into a verdict.
 *
 * Kept pure and separate from process handling so the three cases that matter
 * can be tested directly: clean, real findings, and a range git could not
 * evaluate. The last one is the dangerous one - it must never read as clean.
 */
export function classifyDiffCheck(status, stdout) {
  const findings = String(stdout ?? "")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (status === 0 && findings.length === 0) return { verdict: "clean", findings, exitCode: 0 };
  if (findings.length > 0) return { verdict: "problems", findings, exitCode: 1 };
  return { verdict: "indeterminate", findings, exitCode: 2 };
}

function main() {
  const base = resolveBase();
  if (!base) {
    console.error(
      "diff hygiene: could not resolve a base commit to compare against. " +
        "Ensure the workflow fetches the base branch (fetch-depth: 0).",
    );
    process.exit(2);
  }

  // Three-dot: only what this branch introduced, not what the base moved on to.
  const { status, stdout } = git(["diff", "--check", `${base}...HEAD`]);
  const { verdict, findings, exitCode } = classifyDiffCheck(status, stdout);

  if (verdict === "clean") {
    console.log(`diff hygiene: clean against ${base}.`);
    return;
  }

  if (verdict === "indeterminate") {
    console.error(
      `diff hygiene: 'git diff --check ${base}...HEAD' failed (status ${status}) without listing findings.`,
    );
    process.exit(exitCode);
  }

  console.error(`diff hygiene: ${findings.length} whitespace problem(s) against ${base}:`);
  for (const finding of findings) console.error(`  ${finding}`);
  console.error(
    "\nThese are trailing whitespace, blank lines at end of file, or space-before-tab.",
  );
  process.exit(exitCode);
}

// Only run when invoked as a script, so importing the classifier for tests does
// not shell out to git or call process.exit.
if (process.argv[1] && process.argv[1].endsWith("check-diff-hygiene.mjs")) {
  main();
}
