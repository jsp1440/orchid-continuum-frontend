import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

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

function inspectWorkflow(path) {
  const source = readFileSync(path, "utf8");
  const lines = source.split("\n");
  const findings = [];
  let runBlockIndent = null;

  if (!/^permissions:\s*$/m.test(source)) {
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

    if (/^(pull_request_target|workflow_run):\s*$/.test(trimmed)) {
      findings.push(`${lineNumber}: privileged trigger "${trimmed.replace(":", "")}" is not permitted in an autonomous build workflow`);
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

    const uses = trimmed.match(/^uses:\s*([^\s@]+)@([^\s#]+)(?:\s+#.*)?$/);
    if (uses && !uses[1].startsWith("./") && !FULL_SHA_RE.test(uses[2])) {
      findings.push(`${lineNumber}: pin ${uses[1]} to a full 40-character commit SHA`);
    }

    const shellContext = /^run:\s*\S/.test(trimmed) || runBlockIndent !== null;
    if (shellContext && /\$\{\{\s*github\./.test(line)) {
      findings.push(`${lineNumber}: pass github context through a quoted environment variable; do not interpolate it into shell code`);
    }
  });

  return findings;
}

const workflows = changedFiles().filter(WORKFLOW_RE);
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

console.log(
  workflows.length
    ? `Governed workflow security check passed for ${workflows.length} changed workflow(s).`
    : "No workflow files changed; governed workflow security check passed."
);
