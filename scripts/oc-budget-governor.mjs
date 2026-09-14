#!/usr/bin/env node
/** Deterministic preflight only. Authorization and known accounting are mandatory. */
const DEFAULTS = Object.freeze({
  programUsd: 100, dailySoftUsd: 5, dailyHardUsd: 10,
  ordinaryTaskUsd: 0.5, difficultTaskUsd: 2,
});
const validMoney = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
  Number.isFinite(Number(value)) && Number(value) >= 0;
const cents = value => Math.ceil(Number(value) * 100 - 1e-9);

export function decideBudget(input = {}) {
  const cfg = { ...DEFAULTS };
  let invalid = false;
  for (const key of Object.keys(cfg)) {
    if (input[key] !== undefined) {
      if (!validMoney(input[key]) || Number(input[key]) > DEFAULTS[key]) invalid = true;
      else cfg[key] = Number(input[key]);
    }
  }
  if (cfg.dailySoftUsd > cfg.dailyHardUsd || cfg.ordinaryTaskUsd > cfg.difficultTaskUsd) invalid = true;
  const providerAuthorized = input.providerAuthorized === true;
  const taskCap = input.difficulty === 'difficult' ? cfg.difficultTaskUsd : cfg.ordinaryTaskUsd;
  const requested = input.requestedUsd === undefined ? taskCap : input.requestedUsd;
  const known = [input.programSpent, input.dailySpent, requested].every(validMoney);
  const programSpent = known ? Number(input.programSpent) : null;
  const dailySpent = known ? Number(input.dailySpent) : null;
  let reason = 'authorized_within_budget';
  if (!providerAuthorized) reason = 'provider_not_authorized';
  else if (invalid || !known || Number(requested) <= 0 || dailySpent > programSpent) reason = 'invalid_budget_state';
  else if (cents(requested) > cents(taskCap)) reason = 'task_cap_exceeded';
  else if (cents(programSpent) + cents(requested) > cents(cfg.programUsd)) reason = 'program_cap_exceeded';
  else if (cents(dailySpent) + cents(requested) > cents(cfg.dailyHardUsd)) reason = 'daily_hard_cap_exceeded';
  if (providerAuthorized && reason === 'authorized_within_budget' && input.programStartedAt !== undefined) {
    const start = Date.parse(input.programStartedAt);
    const now = Date.parse(input.now);
    if (!Number.isFinite(start) || !Number.isFinite(now) || now < start || now >= start + 14 * 86400000) {
      reason = 'program_window_closed';
    }
  }
  return {
    allowed: reason === 'authorized_within_budget', reason,
    requestedUsd: validMoney(requested) ? Number(requested) : null,
    programRemainingUsd: known ? Math.max(0, cfg.programUsd - programSpent) : null,
    dailyRemainingUsd: known ? Math.max(0, cfg.dailyHardUsd - dailySpent) : null,
    dailySoftCapReached: known ? dailySpent >= cfg.dailySoftUsd : null,
    providerAuthorized, providerCallMade: false, config: cfg,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(Array.from({ length: Math.ceil((process.argv.length - 2) / 2) }, (_, i) =>
    [process.argv[2 + i * 2]?.replace(/^--/, ''), process.argv[3 + i * 2]]));
  const decision = decideBudget({
    providerAuthorized: args.authorized === 'true', requestedUsd: args.requested,
    programSpent: args['program-spent'], dailySpent: args['daily-spent'], difficulty: args.difficulty,
  });
  process.stdout.write(`${JSON.stringify(decision)}\n`);
  process.exitCode = decision.allowed ? 0 : 42;
}
