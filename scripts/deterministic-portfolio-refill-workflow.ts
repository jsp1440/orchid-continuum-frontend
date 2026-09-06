import { appendFileSync } from 'node:fs';
import { evaluateDeterministicPortfolioRefillWorkflow } from '../src/lib/provider-governor/deterministicPortfolioRefillWorkflow';

const result = evaluateDeterministicPortfolioRefillWorkflow({
  queued: process.env.OC_PORTFOLIO_QUEUED,
  running: process.env.OC_PORTFOLIO_RUNNING,
  validating: process.env.OC_PORTFOLIO_VALIDATING,
  targetActionable: process.env.OC_PORTFOLIO_TARGET_ACTIONABLE,
  maxRefillPerTick: process.env.OC_PORTFOLIO_MAX_REFILL_PER_TICK,
});

const output = process.env.GITHUB_OUTPUT;
if (!output) {
  throw new Error('GITHUB_OUTPUT is required');
}

appendFileSync(
  output,
  [
    `actionable=${result.actionable}`,
    `refill_count=${result.refillCount}`,
    `needs_refill=${String(result.needsRefill)}`,
    `reason=${result.reason}`,
    `telemetry_json=${JSON.stringify(result.telemetry)}`,
    '',
  ].join('\n'),
  'utf8',
);

process.stdout.write(`${JSON.stringify(result)}\n`);
