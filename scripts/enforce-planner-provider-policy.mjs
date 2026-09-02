#!/usr/bin/env node

import { readFileSync } from "node:fs";

const LOG_PATH =
  process.env.CLAUDE_EXECUTION_LOG ?? "/home/runner/work/_temp/claude-execution-output.json";

const SAFE_DEGRADED_CAUSES = new Set([
  "ANTHROPIC_CREDIT_EXHAUSTED",
  "ANTHROPIC_RATE_LIMITED",
  "ANTHROPIC_PROVIDER_ERROR",
]);

function findResultRecord(parsed) {
  const records = Array.isArray(parsed) ? parsed : [parsed];
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const record = records[i];
    if (record && typeof record === "object" && record.type === "result") return record;
  }
  return null;
}

function evaluatePlannerResult(parsed) {
  const result = findResultRecord(parsed);
  if (!result) return { ok: false, reason: "NO_RESULT_RECORD" };
  if (result.is_error !== true) return { ok: true, degraded: false, reason: "PROVIDER_HEALTHY" };

  const cause = result.provider_failure_cause;
  if (SAFE_DEGRADED_CAUSES.has(cause)) {
    return { ok: true, degraded: true, reason: cause };
  }

  return { ok: false, degraded: false, reason: cause ?? "UNSAFE_OR_UNCLASSIFIED_PROVIDER_FAILURE" };
}

function main() {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(LOG_PATH, "utf8"));
  } catch {
    console.error("::error::Planner provider evidence is missing or malformed; failing closed.");
    process.exitCode = 1;
    return;
  }

  const verdict = evaluatePlannerResult(parsed);
  if (!verdict.ok) {
    console.error(`::error::Planner provider failure is not a safe capacity degradation: ${verdict.reason}`);
    process.exitCode = 1;
    return;
  }

  if (verdict.degraded) {
    console.log(`::warning::Planner provider is degraded (${verdict.reason}); existing governed completion work may continue without refill.`);
  } else {
    console.log("Planner provider health is good.");
  }
}

if (process.argv[1] && process.argv[1].endsWith("enforce-planner-provider-policy.mjs")) {
  main();
}

export { SAFE_DEGRADED_CAUSES, evaluatePlannerResult, findResultRecord };
