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
 * This runs from the always-on gate. Pull requests compare against their base;
 * push events compare against the event's previous commit so a direct push does
 * not accidentally diff HEAD against itself.
 *
 * Exit codes: 0 clean, 1 whitespace errors found, 2 could not determine the
 * range. Two is deliberately not a silent pass: a check that cannot see the
 * diff must not report success.
 */

import { spawnSync } from "node:child_process";

const FULL_SHA_RE = /^[0-9a-f]{40}$/i;
const ZERO_SHA_RE = /^0{40}$/;

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

function revisionExists(revision) {
  return git(["rev-parse", "--verify", "--quiet", `${revision}^{commit}`]).status === 0;
}

/**
 * Candidate ranges are kept pure so CI event semantics are unit-testable.
 * PRs use a three-dot range from their base. Pushes use the event's `before`
 * commit with a two-dot range; on a first push where GitHub reports all zeroes,
 * HEAD^ is the bounded fallback. If none can be resolved, the check fails closed.
 */
export function candidateDiffRanges(baseRef, beforeSha) {
  const base = String(baseRef ?? "").trim();
  if (base) {
    return [
      { revision: `origin/${base}`, range: `origin/${base}...HEAD` },
      { revision: base, range: `${base}...HEAD` },
    ];
  }

  const before = String(beforeSha ?? "").trim();
  if (FULL_SHA_RE.test(before) && !ZERO_SHA_RE.test(before)) {
    return [{ revision: before, range: `${before}..HEAD` }];
  }

  return [{ revision: "HEAD^", range: "HEAD^..HEAD" }];
}

function resolveRange() {
  const candidates = candidateDiffRanges(
    process.env.GITHUB_BASE_REF,
    process.env.GITHUB_EVENT_BEFORE,
  );
  for (const candidate of candidates) {
    if (revisionExists(candidate.revision)) return candidate.range;
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
  const range = resolveRange();
  if (!range) {
    console.error(
      "diff hygiene: could not resolve a commit range to compare. " +
        "Ensure checkout has full history and push events provide github.event.before.",
    );
    process.exit(2);
  }

  const { status, stdout } = git(["diff", "--check", range]);
  const { verdict, findings, exitCode } = classifyDiffCheck(status, stdout);

  if (verdict === "clean") {
    console.log(`diff hygiene: clean for ${range}.`);
    return;
  }

  if (verdict === "indeterminate") {
    console.error(
      `diff hygiene: 'git diff --check ${range}' failed (status ${status}) without listing findings.`,
    );
    process.exit(exitCode);
  }

  console.error(`diff hygiene: ${findings.length} whitespace problem(s) for ${range}:`);
  for (const finding of findings) console.error(`  ${finding}`);
  console.error(
    "\nThese are trailing whitespace, blank lines at end of file, or space-before-tab.",
  );
  process.exit(exitCode);
}

// Only run when invoked as a script, so importing the pure helpers for tests does
// not shell out to git or call process.exit.
if (process.argv[1] && process.argv[1].endsWith("check-diff-hygiene.mjs")) {
  main();
}
