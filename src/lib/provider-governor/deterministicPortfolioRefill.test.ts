import { describe, expect, it } from 'vitest';
import { decideDeterministicPortfolioRefill } from './deterministicPortfolioRefill';

describe('deterministic portfolio refill scheduling', () => {
  it('runs frequent inventory math without any paid-provider concept', () => {
    const decision = decideDeterministicPortfolioRefill(
      { queued: 3, running: 1, validating: 2 },
      { targetActionable: 10, maxRefillPerTick: 5 },
    );

    expect(decision).toEqual({
      actionable: 6,
      refillCount: 4,
      needsRefill: true,
      reason: 'deterministic-refill-required',
    });
    expect(Object.keys(decision)).not.toContain('provider');
    expect(Object.keys(decision)).not.toContain('apiKey');
    expect(Object.keys(decision)).not.toContain('cost');
  });

  it('does no refill work on unchanged sufficient ticks', () => {
    for (let tick = 0; tick < 12; tick += 1) {
      expect(
        decideDeterministicPortfolioRefill(
          { queued: 7, running: 1, validating: 2 },
          { targetActionable: 10, maxRefillPerTick: 5 },
        ),
      ).toEqual({
        actionable: 10,
        refillCount: 0,
        needsRefill: false,
        reason: 'inventory-sufficient',
      });
    }
  });

  it('caps each deterministic refill wave independently of scheduler frequency', () => {
    expect(
      decideDeterministicPortfolioRefill(
        { queued: 0, running: 0, validating: 0 },
        { targetActionable: 20, maxRefillPerTick: 5 },
      ).refillCount,
    ).toBe(5);
  });

  it('fails closed on malformed inventory or policy values', () => {
    expect(() =>
      decideDeterministicPortfolioRefill(
        { queued: -1, running: 0, validating: 0 },
        { targetActionable: 10, maxRefillPerTick: 5 },
      ),
    ).toThrow('queued must be a non-negative integer');

    expect(() =>
      decideDeterministicPortfolioRefill(
        { queued: 0, running: 0, validating: 0 },
        { targetActionable: 10, maxRefillPerTick: Number.NaN },
      ),
    ).toThrow('maxRefillPerTick must be a non-negative integer');
  });
});
