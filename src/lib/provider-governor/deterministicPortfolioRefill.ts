export interface PortfolioInventory {
  queued: number;
  running: number;
  validating: number;
}

export interface DeterministicRefillPolicy {
  targetActionable: number;
  maxRefillPerTick: number;
}

export interface DeterministicRefillDecision {
  actionable: number;
  refillCount: number;
  needsRefill: boolean;
  reason: 'inventory-sufficient' | 'deterministic-refill-required';
}

const assertNonNegativeInteger = (value: number, field: string): void => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
};

/**
 * Pure deterministic scheduling decision for portfolio refill.
 *
 * This intentionally contains no model/provider selection, credentials, network
 * access, or spending behavior. It is safe to run on every scheduler tick. Paid
 * model execution, if ever re-enabled, remains a separate governor-authorized
 * concern downstream of this decision.
 */
export function decideDeterministicPortfolioRefill(
  inventory: PortfolioInventory,
  policy: DeterministicRefillPolicy,
): DeterministicRefillDecision {
  assertNonNegativeInteger(inventory.queued, 'queued');
  assertNonNegativeInteger(inventory.running, 'running');
  assertNonNegativeInteger(inventory.validating, 'validating');
  assertNonNegativeInteger(policy.targetActionable, 'targetActionable');
  assertNonNegativeInteger(policy.maxRefillPerTick, 'maxRefillPerTick');

  const actionable = inventory.queued + inventory.running + inventory.validating;
  const deficit = Math.max(0, policy.targetActionable - actionable);
  const refillCount = Math.min(deficit, policy.maxRefillPerTick);

  return {
    actionable,
    refillCount,
    needsRefill: refillCount > 0,
    reason: refillCount > 0 ? 'deterministic-refill-required' : 'inventory-sufficient',
  };
}
