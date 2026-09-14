import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateDeterministicPortfolioRefillWorkflow } from './lib/provider-governor/deterministicPortfolioRefillWorkflow';

const scheduler = readFileSync('.github/workflows/orchid-continuous-completion.yml', 'utf8');
const inventory = {
  queued: '17',
  running: '1',
  validating: '2',
  maxActiveLanes: '5',
  wavesAhead: '3',
  targetFloor: '20',
  maxRefillPerTick: '5',
};

// This entrypoint computes refill decisions, not leases or queue writes.
// Live durable Queue Bridge acceptance remains a separate requirement.
describe('NO-API portfolio planning', () => {
  it('keeps Portfolio Steward outside canonical implementation capacity', () => {
    expect(scheduler).toContain('Portfolio');
    expect(scheduler).toContain('MAX_ACTIVE_LANES: 8');
    expect(scheduler).toContain('scripts/oc-dispatch-runtime.ts plan');
  });
  it('produces identical no-refill decisions for twelve unchanged ticks', () => {
    const expected = evaluateDeterministicPortfolioRefillWorkflow(inventory);
    expect(expected.actionable).toBe(20);
    expect(expected.targetActionable).toBe(20);
    expect(expected.refillCount).toBe(0);
    for (let tick = 0; tick < 12; tick += 1) {
      expect(evaluateDeterministicPortfolioRefillWorkflow(inventory)).toEqual(expected);
    }
  });
  it('bounds refill after depletion without dispatching a provider', () => {
    const result = evaluateDeterministicPortfolioRefillWorkflow({ ...inventory, queued: '0' });
    expect(result.actionable).toBe(3);
    expect(result.targetActionable).toBe(20);
    expect(result.refillCount).toBe(5);
    expect(result.needsRefill).toBe(true);
    expect(result.telemetry.paidProviderCalls).toBe(0);
  });
  it('fails closed on unknown inventory rather than fabricating an empty queue', () => {
    for (const queued of [undefined, '', '-1', 'unknown', '1.5']) {
      expect(() => evaluateDeterministicPortfolioRefillWorkflow({ ...inventory, queued })).toThrow();
    }
  });
  it('does not claim durable persistence or main promotion from telemetry', () => {
    expect(scheduler).toContain("PROVIDER_AUTHORIZED: 'false'");
    expect(scheduler).not.toMatch(/gh\s+pr\s+merge|git\s+push|--add-label|--remove-label/);
    expect(scheduler).not.toContain('| head -1');
  });
});
