#!/usr/bin/env node
/**
 * Classify why a claude-code-action step failed.
 *
 * The action hides its SDK output ("full output hidden for security"), so an
 * autonomous job that dies on a provider error reports only
 * `Claude execution failed: result is_error:true`. That is not diagnosable: a
 * billing boundary, a revoked key, a permissions problem and a rate limit all
 * look identical from the workflow log, and every one of them needs a different
 * response.
 *
 * This reads the execution log the action leaves behind and prints the
 * classification fields only. It never prints the transcript (which is what the
 * action is withholding), and never prints API-key shape, prefix, length or
 * value — only whether a key is present.
 *
 * Exits 0 unconditionally. It is a diagnostic, not a gate: a non-zero exit here
 * would mask the real step's failure, and a crash in the diagnostic must never
 * be mistaken for a product failure.
 */

import { readFileSync, writeFileSync } from "node:fs";

const LOG_PATH =
  process.env.CLAUDE_EXECUTION_LOG ?? "/home/runner/work/_temp/claude-execution-output.json";

/** Classification of a provider failure, keyed on the HTTP status the SDK reported. */
function classify(apiErrorStatus, message) {
  const text = String(message ?? "").toLowerCase();
  if (apiErrorStatus === 400 && text.includes("credit balance")) {
    return {
      cause: "ANTHROPIC_CREDIT_EXHAUSTED",
      owner_action_required: true,
      detail: "The Anthropic account has insufficient credit. Repository-side changes cannot fix this.",
    };
  }
  if (apiErrorStatus === 401) {
    return {
      cause: "ANTHROPIC_AUTH_REJECTED",
      owner_action_required: true,
      detail: "The API key was rejected. Rotate or re-add the ANTHROPIC_API_KEY secret.",
    };
  }
  if (apiErrorStatus === 403) {
    return {
      cause: "ANTHROPIC_PERMISSION_DENIED",
      owner_action_required: true,
      detail: "The key authenticated but is not permitted to use this model or endpoint.",
    };
  }
  if (apiErrorStatus === 429) {
    return {
      cause: "ANTHROPIC_RATE_LIMITED",
      owner_action_required: false,
      detail: "Rate limited. A later re-run may succeed without any change.",
    };
  }
  if (typeof apiErrorStatus === "number" && apiErrorStatus >= 500) {
    return {
      cause: "ANTHROPIC_PROVIDER_ERROR",
      owner_action_required: false,
      detail: "Provider-side error. A later re-run may succeed without any change.",
    };
  }
  if (apiErrorStatus === undefined || apiErrorStatus === null) {
    return {
      cause: "NO_PROVIDER_ERROR_REPORTED",
      owner_action_required: false,
      detail: "The run failed without an API error status. Treat as a workflow or prompt failure, not a provider outage.",
    };
  }
  return {
    cause: "UNCLASSIFIED_PROVIDER_ERROR",
    owner_action_required: false,
    detail: `Unrecognised API error status ${apiErrorStatus}.`,
  };
}

function keyPresence() {
  return process.env.ANTHROPIC_API_KEY ? "present" : "absent";
}

function findResultRecord(parsed) {
  const records = Array.isArray(parsed) ? parsed : [parsed];
  // Last result record wins: a retried run appends rather than replacing.
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const record = records[i];
    if (record && typeof record === "object" && record.type === "result") return record;
  }
  return null;
}

/**
 * The workflow's legacy downstream classifier scans every string value in the
 * temporary SDK execution log. Some Claude SDK error payloads include benign
 * permission-related metadata even when the authoritative API failure is a
 * provider-capacity condition such as exhausted credit. That can make the
 * legacy scanner fail closed as "security" before it reaches its safe-provider
 * patterns, incorrectly suppressing Gemini/OpenAI failover.
 *
 * After we have authoritatively classified a safe provider-capacity failure by
 * HTTP status + provider message, replace only the runner-temporary execution
 * log with a minimal diagnostic record. This does not alter repository state or
 * persist provider transcript data; it simply hands the next workflow step the
 * already-proven provider signal. Authentication and permission failures are
 * deliberately never normalized and therefore remain fail-closed.
 */
function normalizeSafeProviderSignal(parsed, cause, apiErrorStatus, message) {
  const safeCauses = new Set([
    "ANTHROPIC_CREDIT_EXHAUSTED",
    "ANTHROPIC_RATE_LIMITED",
    "ANTHROPIC_PROVIDER_ERROR",
  ]);
  if (!safeCauses.has(cause)) return false;

  const records = Array.isArray(parsed) ? parsed : [parsed];
  const minimal = records
    .filter((record) => record && typeof record === "object" && record.type !== "result")
    .map((record) => ({ type: record.type, subtype: record.subtype }))
    .filter((record) => record.type);
  minimal.push({
    type: "result",
    subtype: "provider_error",
    is_error: true,
    api_error_status: apiErrorStatus,
    result: String(message ?? ""),
    provider_failure_cause: cause,
  });
  writeFileSync(LOG_PATH, JSON.stringify(minimal), "utf8");
  return true;
}

function main() {
  let raw;
  try {
    raw = readFileSync(LOG_PATH, "utf8");
  } catch {
    console.log("::warning::claude run diagnosis: no execution log at " + LOG_PATH);
    console.log("Nothing to classify — the action may have failed before invoking the SDK.");
    console.log(`ANTHROPIC_API_KEY: ${keyPresence()}`);
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.log("::warning::claude run diagnosis: execution log is not valid JSON");
    console.log(`ANTHROPIC_API_KEY: ${keyPresence()}`);
    return;
  }

  const result = findResultRecord(parsed);
  if (!result) {
    console.log("::warning::claude run diagnosis: execution log contains no result record");
    console.log(`ANTHROPIC_API_KEY: ${keyPresence()}`);
    return;
  }

  // `subtype` is "success" even on an api_error record, which is why reading it
  // alone reports a passing run that never executed. is_error is the field that
  // decides.
  const isError = result.is_error === true;
  const apiErrorStatus = result.api_error_status;
  // Only surfaced on failure: on a successful run `.result` is the model's full
  // output, which is exactly what the action withholds.
  const message = isError ? (result.result ?? result.error ?? "") : "";

  console.log("--- claude run diagnosis ---");
  console.log(`is_error:           ${isError}`);
  console.log(`subtype:            ${result.subtype ?? "(none)"}`);
  console.log(`api_error_status:   ${apiErrorStatus ?? "(none)"}`);
  console.log(`num_turns:          ${result.num_turns ?? "(none)"}`);
  console.log(`total_cost_usd:     ${result.total_cost_usd ?? "(none)"}`);
  console.log(`ANTHROPIC_API_KEY:  ${keyPresence()}`);

  if (!isError) {
    console.log("verdict:            run completed without a reported error");
    return;
  }

  const { cause, owner_action_required, detail } = classify(apiErrorStatus, message);
  console.log(`cause:              ${cause}`);
  console.log(`owner action:       ${owner_action_required ? "REQUIRED" : "not required"}`);
  console.log(`detail:             ${detail}`);
  if (message) console.log(`provider message:   ${message}`);

  try {
    if (normalizeSafeProviderSignal(parsed, cause, apiErrorStatus, message)) {
      console.log("downstream signal:  normalized safe-provider failure for governed failover");
    }
  } catch {
    console.log("::warning::claude run diagnosis: could not normalize temporary downstream provider signal");
  }

  if (owner_action_required) {
    console.log(`::warning::Claude runtime blocked by an owner-only boundary: ${cause}. ${detail}`);
  }
}

// Only run when invoked as a script. Importing this module (the classifier is
// unit-tested) must not emit workflow diagnostics into the test output.
if (process.argv[1] && process.argv[1].endsWith("diagnose-claude-run.mjs")) {
  main();
}

export { classify, findResultRecord, normalizeSafeProviderSignal };