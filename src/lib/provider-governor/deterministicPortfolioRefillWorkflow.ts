import {
  decideDeterministicPortfolioRefill,
  type DeterministicRefillDecision,
} from './deterministicPortfolioRefill';

export interface DeterministicRefillWorkflowEnv {
  queued: string | undefined;
  running: string | undefined;
  validating: string | undefined;
  maxActiveLanes: string | undefined;
  wavesAhead: string | undefined;
  targetFloor: string | undefined;
  maxRefillPerTick: string | undefined;
}

export interface DeterministicRefillWorkflowResult extends DeterministicRefillDecision {
  targetActionable: number;
  telemetry: {
    mode: 'deterministic-no-api';
    paidProviderCalls: 0;
    maxActiveLanes: number;
    wavesAhead: number;
    targetFloor: number;
    targetActionable: number;
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

export function derivePortfolioTargetActionable(
  maxActiveLanes: number,
  wavesAhead: number,
  targetFloor: number,
): number {
  if (!Number.isInteger(maxActiveLanes) || maxActiveLanes <= 0) {
    throw new Error('maxActiveLanes must be a positive integer');
  }
  if (!Number.isInteger(wavesAhead) || wavesAhead <= 0) {
    throw new Error('wavesAhead must be a positive integer');
  }
  if (!Number.isInteger(targetFloor) || targetFloor < 0) {
    throw new Error('targetFloor must be a non-negative integer');
  }

  return Math.max(targetFloor, maxActiveLanes * wavesAhead);
}

/**
 * Workflow-facing adapter for the frequent portfolio-refill scheduler.
 *
 * The actionable target is derived from configured execution width rather than
 * a fixed backlog number: keep at least `wavesAhead` waves available, subject
 * to the MVP floor. This lets the Portfolio Steward scale automatically when
 * lane capacity changes while remaining deterministic and provider-free.
 *
 * It intentionally accepts only inventory/policy counters. Provider names,
 * credentials, model configuration, token budgets, and network clients are not
 * part of this boundary, so a scheduler tick cannot invoke a paid model.
 */
export function evaluateDeterministicPortfolioRefillWorkflow(
  env: DeterministicRefillWorkflowEnv,
): DeterministicRefillWorkflowResult {
  const maxActiveLanes = parseNonNegativeInteger(env.maxActiveLanes, 'maxActiveLanes');
  const wavesAhead = parseNonNegativeInteger(env.wavesAhead, 'wavesAhead');
  const targetFloor = parseNonNegativeInteger(env.targetFloor, 'targetFloor');
  const targetActionable = derivePortfolioTargetActionable(
    maxActiveLanes,
    wavesAhead,
    targetFloor,
  );

  const decision = decideDeterministicPortfolioRefill(
    {
      queued: parseNonNegativeInteger(env.queued, 'queued'),
      running: parseNonNegativeInteger(env.running, 'running'),
      validating: parseNonNegativeInteger(env.validating, 'validating'),
    },
    {
      targetActionable,
      maxRefillPerTick: parseNonNegativeInteger(env.maxRefillPerTick, 'maxRefillPerTick'),
    },
  );

  return {
    ...decision,
    targetActionable,
    telemetry: {
      mode: 'deterministic-no-api',
      paidProviderCalls: 0,
      maxActiveLanes,
      wavesAhead,
      targetFloor,
      targetActionable,
    },
  };
}
