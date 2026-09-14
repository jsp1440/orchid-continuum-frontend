import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

const WORKFLOW_RE = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const FULL_SHA_RE = /^[0-9a-f]{40}$/i;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function changedFiles() {
  const baseRef = process.env.GITHUB_BASE_REF;
  let range;

  if (baseRef) {
    const remoteBase = `origin/${baseRef}`;
    const mergeBase = git(["merge-base", remoteBase, "HEAD"]);
    range = `${mergeBase}...HEAD`;
  } else {
    try {
      git(["rev-parse", "HEAD^"]);
      range = "HEAD^...HEAD";
    } catch {
      return [];
    }
  }

  return git(["diff", "--name-only", range])
    .split("\n")
    .filter(Boolean);
}

/** Whether a workflow checks out repository content at all. */
function workflowChecksOutCode(source) {
  return /^\s*(?:-\s*)?uses:\s*actions\/checkout@/m.test(source);
}

export function actionPinFinding(trimmed, lineNumber = 0) {
  // Workflow steps are YAML list items, so the standard form is
  // `- uses: owner/action@ref`. A matcher that only recognizes a bare `uses:`
  // silently skips nearly every real action declaration.
  const uses = String(trimmed ?? "").match(
    /^(?:-\s*)?uses:\s*([^\s@]+)@([^\s#]+)(?:\s+#.*)?$/,
  );
  if (!uses || uses[1].startsWith("./") || FULL_SHA_RE.test(uses[2])) return null;
  const prefix = lineNumber ? `${lineNumber}: ` : "";
  return `${prefix}pin ${uses[1]} to a full 40-character commit SHA`;
}

function inspectWorkflow(path) {
  return inspectWorkflowSource(readFileSync(path, "utf8"));
}

/**
 * The rules, applied to workflow text rather than to a path, so they can be
 * exercised directly instead of only through whatever happens to be in
 * .github/workflows at the time.
 */
export function inspectWorkflowSource(source) {
  const lines = source.split("\n");
  const findings = [];
  let runBlockIndent = null;

  const declaresPermissions = /^permissions:\s*$/m.test(source);
  const checksOutCode = workflowChecksOutCode(source);

  if (!declaresPermissions) {
    findings.push("declare an explicit top-level permissions block");
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const indent = line.match(/^\s*/)[0].length;
    const trimmed = line.trim();

    if (runBlockIndent !== null && trimmed && indent <= runBlockIndent) {
      runBlockIndent = null;
    }

    if (/^run:\s*[>|]\s*$/.test(trimmed)) {
      runBlockIndent = indent;
    }

    if (/^pull_request_target:\s*$/.test(trimmed)) {
      findings.push(`${lineNumber}: privileged trigger "pull_request_target" is not permitted in an autonomous build workflow`);
    }

    // `workflow_run` runs in the base repository's context with a token, even
    // for a fork's pull request. What makes that dangerous is combining it with
    // checking out and running the code that triggered it. A workflow that
    // never checks anything out cannot execute untrusted code, so the rule is
    // on the combination rather than on the trigger.
    if (/^workflow_run:\s*$/.test(trimmed)) {
      if (checksOutCode) {
        findings.push(`${lineNumber}: "workflow_run" must not check out code; it runs privileged against the base repository`);
      } else if (!declaresPermissions) {
        findings.push(`${lineNumber}: "workflow_run" requires an explicit top-level permissions block`);
      }
    }

    if (/runs-on:\s*.*self-hosted/i.test(trimmed)) {
      findings.push(`${lineNumber}: persistent self-hosted runners are not permitted`);
    }

    if (/allow-unsafe-pr-checkout:\s*true/i.test(trimmed)) {
      findings.push(`${lineNumber}: unsafe fork PR checkout override is not permitted`);
    }

    if (/^path:\s*['"]?\.['"]?\s*$/.test(trimmed)) {
      findings.push(`${lineNumber}: artifact uploads must use explicit paths, never "path: ."`);
    }

    const actionFinding = actionPinFinding(trimmed, lineNumber);
    if (actionFinding) findings.push(actionFinding);

    const shellContext = /^run:\s*\S/.test(trimmed) || runBlockIndent !== null;
    if (shellContext && /\$\{\{\s*github\./.test(line)) {
      findings.push(`${lineNumber}: pass github context through a quoted environment variable; do not interpolate it into shell code`);
    }
  });

  return findings;
}

/**
 * Every workflow in the repository, not only the ones a branch happens to
 * touch.
 *
 * Checking the diff answers "did this change introduce an unpinned action",
 * which lets an unpinned action already in the tree stay there forever, and
 * lets one arrive on a branch that never edits a workflow again. Checking the
 * corpus answers "does this repository contain an unpinned action", which is
 * the question worth failing a build over.
 */
export function allWorkflows() {
  try {
    return readdirSync(".github/workflows")
      .filter((name) => /\.ya?ml$/.test(name))
      .map((name) => `.github/workflows/${name}`)
      .sort();
  } catch {
    return [];
  }
}

function main() {
  // `--changed-only` keeps the older diff-scoped behaviour available for a
  // caller that genuinely wants it; the corpus is the default.
  const changedOnly = process.argv.includes("--changed-only");
  const workflows = changedOnly
    ? changedFiles().filter((path) => WORKFLOW_RE.test(path))
    : allWorkflows();
  const failures = [];

  for (const workflow of workflows) {
    for (const finding of inspectWorkflow(workflow)) {
      failures.push(`${workflow}:${finding}`);
    }
  }

  if (failures.length) {
    console.error("Governed workflow security check failed:\n");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  const scope = changedOnly ? "changed workflow(s)" : "workflow(s) in the repository";
  console.log(
    workflows.length
      ? `Governed workflow security check passed for ${workflows.length} ${scope}.`
      : `No workflow files found; governed workflow security check passed.`,
  );
}

// Keep the pure helpers importable by Vitest and other validation code without
// executing repository-diff discovery as a module import side effect. This also
// lets shallow, specialized workflows run the unit suite without needing an
// origin/main ref solely because a helper was imported.
if (process.argv[1] && process.argv[1].endsWith("check-workflow-security.mjs")) {
  main();
}
