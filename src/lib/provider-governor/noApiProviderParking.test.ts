import { describe, expect, it } from 'vitest';

import {
  PARKED_PAID_PROVIDERS,
  assertPaidProviderParked,
  getNoApiProviderParkingPolicy,
} from './noApiProviderParking';

describe('NO-API paid-provider parking', () => {
  it('parks Anthropic, Gemini, and OpenAI with a zero-call policy', () => {
    const policy = getNoApiProviderParkingPolicy();

    expect(policy).toEqual({
      mode: 'no-api',
      paidProviderCallsAllowed: 0,
      providers: {
        anthropic: 'disabled',
        gemini: 'disabled',
        openai: 'disabled',
      },
    });
  });

  it.each(PARKED_PAID_PROVIDERS)('fails closed before %s can execute', (provider) => {
    expect(() => assertPaidProviderParked(provider)).toThrow(
      `paid provider ${provider} is parked while NO-API mode is active`,
    );
  });

  it('does not treat deterministic scheduler work as a paid provider', () => {
    expect(() => assertPaidProviderParked('deterministic-scheduler')).not.toThrow();
  });

  it('cannot be widened to permit paid calls while still claiming NO-API mode', () => {
    const invalidPolicy = {
      ...getNoApiProviderParkingPolicy(),
      paidProviderCallsAllowed: 1 as never,
    };

    expect(() => assertPaidProviderParked('deterministic-scheduler', invalidPolicy)).toThrow(
      'NO-API policy must allow zero paid provider calls',
    );
  });
});
