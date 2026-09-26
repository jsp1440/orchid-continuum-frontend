import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { load } from 'js-yaml';
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
  it('requires canonical context validation at the caller revision before dispatch', () => {
    const dispatch = load(readFileSync('.github/workflows/orchid-deterministic-dispatch.yml', 'utf8')) as {
      jobs: Record<string, { needs?: string; permissions?: Record<string, string>;
        steps?: Array<{ uses?: string; run?: string; with?: Record<string, unknown> }> }>;
    };
    expect(dispatch.jobs.lane.needs).toBe('context-contract');
    const context = dispatch.jobs['context-contract'];
    expect(context.permissions).toEqual({ contents: 'read' });
    expect(context.steps?.find(step => step.uses?.startsWith('actions/checkout@'))?.with).toEqual({
      ref: '${{ github.event.pull_request.head.sha || github.sha }}', 'persist-credentials': false,
    });
    expect(context.steps?.some(step => step.run === 'node scripts/verify-autonomy-context.mjs')).toBe(true);
  });
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
