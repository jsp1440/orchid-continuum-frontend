export const PARKED_PAID_PROVIDERS = ['anthropic', 'gemini', 'openai'] as const;

export type ParkedPaidProvider = (typeof PARKED_PAID_PROVIDERS)[number];

export interface NoApiProviderParkingPolicy {
  mode: 'no-api';
  paidProviderCallsAllowed: 0;
  providers: Record<ParkedPaidProvider, 'disabled'>;
}

/**
 * Canonical fail-closed parking policy for frequent deterministic scheduler ticks.
 *
 * This object intentionally contains no credentials, SDK clients, model names, or
 * execution callbacks. Consumers must cross the separate governed admission
 * boundary before any paid-provider execution can exist.
 */
export function getNoApiProviderParkingPolicy(): NoApiProviderParkingPolicy {
  return {
    mode: 'no-api',
    paidProviderCallsAllowed: 0,
    providers: {
      anthropic: 'disabled',
      gemini: 'disabled',
      openai: 'disabled',
    },
  };
}

export function assertPaidProviderParked(
  provider: string,
  policy: NoApiProviderParkingPolicy = getNoApiProviderParkingPolicy(),
): void {
  if ((PARKED_PAID_PROVIDERS as readonly string[]).includes(provider)) {
    throw new Error(`paid provider ${provider} is parked while NO-API mode is active`);
  }

  if (policy.paidProviderCallsAllowed !== 0) {
    throw new Error('NO-API policy must allow zero paid provider calls');
  }
}
