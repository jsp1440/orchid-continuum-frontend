import { describe, expect, it } from 'vitest';
import { evaluateDeterministicPortfolioRefillWorkflow } from './deterministicPortfolioRefillWorkflow';

const baseEnv = {
  queued: '7',
  running: '1',
  validating: '2',
  targetActionable: '10',
  maxRefillPerTick: '5',
};

describe('deterministic portfolio refill workflow adapter', () => {
  it('proves unchanged scheduler ticks cannot create paid-provider calls', () => {
    for (let tick = 0; tick < 12; tick += 1) {
      expect(evaluateDeterministicPortfolioRefillWorkflow(baseEnv)).toEqual({
        actionable: 10,
        refillCount: 0,
        needsRefill: false,
        reason: 'inventory-sufficient',
        telemetry: {
          mode: 'deterministic-no-api',
          paidProviderCalls: 0,
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
      targetActionable: '20',
      maxRefillPerTick: '4',
    });

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
  });
});
