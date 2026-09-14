#!/usr/bin/env node

/**
 * Fail-closed provider budget governor for Orchid Continuum completion lanes.
 * This module performs deterministic preflight only; it never calls a model API.
 */

const DEFAULTS = Object.freeze({
  programUsd: 100,
  dailySoftUsd: 5,
  dailyHardUsd: 10,
  ordinaryTaskUsd: 0.5,
  difficultTaskUsd: 2,
});

function money(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function decideBudget(input = {}) {
  const cfg = {
    programUsd: money(input.programUsd, DEFAULTS.programUsd),
    dailySoftUsd: money(input.dailySoftUsd, DEFAULTS.dailySoftUsd),
    dailyHardUsd: money(input.dailyHardUsd, DEFAULTS.dailyHardUsd),
    ordinaryTaskUsd: money(input.ordinaryTaskUsd, DEFAULTS.ordinaryTaskUsd),
    difficultTaskUsd: money(input.difficultTaskUsd, DEFAULTS.difficultTaskUsd),
  };
  const providerAuthorized = input.providerAuthorized === true;
  const programSpent = money(input.programSpent);
  const dailySpent = money(input.dailySpent);
  const requested = money(
    input.requestedUsd,
    input.difficulty === "difficult" ? cfg.difficultTaskUsd : cfg.ordinaryTaskUsd,
  );
  const taskCap = input.difficulty === "difficult" ? cfg.difficultTaskUsd : cfg.ordinaryTaskUsd;

  let allowed = true;
  let reason = "authorized_within_budget";
  if (!providerAuthorized) {
    allowed = false;
    reason = "provider_not_authorized";
  } else if (requested > taskCap) {
    allowed = false;
    reason = "task_cap_exceeded";
  } else if (programSpent + requested > cfg.programUsd) {
    allowed = false;
    reason = "program_cap_exceeded";
  } else if (dailySpent + requested > cfg.dailyHardUsd) {
    allowed = false;
    reason = "daily_hard_cap_exceeded";
  }

  return {
    allowed,
    reason,
    requestedUsd: requested,
    programRemainingUsd: Math.max(0, cfg.programUsd - programSpent),
    dailyRemainingUsd: Math.max(0, cfg.dailyHardUsd - dailySpent),
    dailySoftCapReached: dailySpent >= cfg.dailySoftUsd,
    providerAuthorized,
    providerCallMade: false,
    config: cfg,
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[name] = next;
      i += 1;
    } else {
      out[name] = true;
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const decision = decideBudget({
    providerAuthorized: String(args.authorized).toLowerCase() === "true",
    programSpent: args["program-spent"],
    dailySpent: args["daily-spent"],
    requestedUsd: args.requested,
    difficulty: args.difficulty,
  });
  process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
  process.exitCode = decision.allowed ? 0 : 42;
}
