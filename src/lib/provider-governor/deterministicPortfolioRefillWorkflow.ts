import {
  decideDeterministicPortfolioRefill,
  type DeterministicRefillDecision,
} from './deterministicPortfolioRefill';

export interface DeterministicRefillWorkflowEnv {
  queued: string | undefined;
  running: string | undefined;
  validating: string | undefined;
  targetActionable: string | undefined;
  maxRefillPerTick: string | undefined;
}

export interface DeterministicRefillWorkflowResult extends DeterministicRefillDecision {
  telemetry: {
    mode: 'deterministic-no-api';
    paidProviderCalls: 0;
  };
}

function parseNonNegativeInteger(raw: string | undefined, field: string): number {
  if (raw === undefined || raw.trim() === '') {
    throw new Error(`${field} is required`);
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return value;
}

/**
 * Workflow-facing adapter for the frequent portfolio-refill scheduler.
 *
 * It intentionally accepts only inventory/policy counters. Provider names,
 * credentials, model configuration, token budgets, and network clients are not
 * part of this boundary, so a scheduler tick cannot invoke a paid model.
 */
export function evaluateDeterministicPortfolioRefillWorkflow(
  env: DeterministicRefillWorkflowEnv,
): DeterministicRefillWorkflowResult {
  const decision = decideDeterministicPortfolioRefill(
    {
      queued: parseNonNegativeInteger(env.queued, 'queued'),
      running: parseNonNegativeInteger(env.running, 'running'),
      validating: parseNonNegativeInteger(env.validating, 'validating'),
    },
    {
      targetActionable: parseNonNegativeInteger(env.targetActionable, 'targetActionable'),
      maxRefillPerTick: parseNonNegativeInteger(env.maxRefillPerTick, 'maxRefillPerTick'),
    },
  );

  return {
    ...decision,
    telemetry: {
      mode: 'deterministic-no-api',
      paidProviderCalls: 0,
    },
  };
}
