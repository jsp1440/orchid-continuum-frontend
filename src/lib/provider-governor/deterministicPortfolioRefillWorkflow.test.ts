import { describe, expect, it } from 'vitest';
import {
  derivePortfolioTargetActionable,
  evaluateDeterministicPortfolioRefillWorkflow,
} from './deterministicPortfolioRefillWorkflow';

const baseEnv = {
  queued: '17',
  running: '1',
  validating: '2',
  maxActiveLanes: '5',
  wavesAhead: '3',
  targetFloor: '20',
  maxRefillPerTick: '5',
};

describe('deterministic portfolio refill workflow adapter', () => {
  it('derives target depth from configured lane capacity with the MVP floor', () => {
    expect(derivePortfolioTargetActionable(5, 3, 20)).toBe(20);
    expect(derivePortfolioTargetActionable(10, 3, 20)).toBe(30);
    expect(derivePortfolioTargetActionable(35, 3, 20)).toBe(105);
  });

  it('proves unchanged scheduler ticks cannot create paid-provider calls', () => {
    for (let tick = 0; tick < 12; tick += 1) {
      expect(evaluateDeterministicPortfolioRefillWorkflow(baseEnv)).toEqual({
        actionable: 20,
        targetActionable: 20,
        refillCount: 0,
        needsRefill: false,
        reason: 'inventory-sufficient',
        telemetry: {
          mode: 'deterministic-no-api',
          paidProviderCalls: 0,
          maxActiveLanes: 5,
          wavesAhead: 3,
          targetFloor: 20,
          targetActionable: 20,
        },
      });
    }
  });

  it('returns bounded deterministic refill work without provider configuration', () => {
    const result = evaluateDeterministicPortfolioRefillWorkflow({
      ...baseEnv,
      queued: '0',
      running: '0',
      validating: '0',
      maxActiveLanes: '35',
      maxRefillPerTick: '4',
    });

    expect(result.targetActionable).toBe(105);
    expect(result.refillCount).toBe(4);
    expect(result.telemetry.paidProviderCalls).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/anthropic|gemini|openai|api[_-]?key|model/i);
  });

  it('fails closed instead of defaulting malformed scheduler state', () => {
    expect(() =>
      evaluateDeterministicPortfolioRefillWorkflow({ ...baseEnv, queued: undefined }),
    ).toThrow('queued is required');

    expect(() =>
      evaluateDeterministicPortfolioRefillWorkflow({ ...baseEnv, maxRefillPerTick: '-1' }),
    ).toThrow('maxRefillPerTick must be a non-negative integer');

    expect(() =>
      evaluateDeterministicPortfolioRefillWorkflow({ ...baseEnv, maxActiveLanes: '0' }),
    ).toThrow('maxActiveLanes must be a positive integer');
  });
});
