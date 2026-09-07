import {
  decideProviderDispatch,
  recordDispatch,
  type DispatchRequest,
  type GovernorState,
  type GovernorTelemetry,
  type Provider,
} from './providerGovernor';
import {
  deserializeGovernorState,
  governorTelemetrySnapshot,
  rollGovernorDay,
  serializeGovernorState,
} from './governorState';

export interface ProviderInvocationResult {
  tokens?: number | null;
  costUsd?: number | null;
}

export interface GovernorRuntimeResult {
  dispatched: boolean;
  provider: Provider | null;
  reason: string;
  fingerprint: string;
  serializedState: string;
  decisionTelemetry: GovernorTelemetry;
  stateTelemetry: ReturnType<typeof governorTelemetrySnapshot>;
}

export interface GovernorRuntimeInput extends Omit<DispatchRequest, 'state'> {
  serializedState: string;
}

/**
 * Single governed boundary between deterministic scheduling and any paid model
 * execution. The callback is never invoked unless the governor authorizes a
 * dispatch. This module contains no provider SDK/network code itself.
 */
export async function executeGovernedProviderTick(
  input: GovernorRuntimeInput,
  invokeProvider: (provider: Provider) => Promise<ProviderInvocationResult>,
): Promise<GovernorRuntimeResult> {
  let state: GovernorState = deserializeGovernorState(input.serializedState);
  const dayKey = input.now.slice(0, 10);
  state = rollGovernorDay(state, dayKey);

  const decision = decideProviderDispatch({
    now: input.now,
    work: input.work,
    policies: input.policies,
    state,
    materialWorkThreshold: input.materialWorkThreshold,
  });

  if (!decision.dispatch) {
    return {
      dispatched: false,
      provider: null,
      reason: decision.reason,
      fingerprint: decision.fingerprint,
      serializedState: serializeGovernorState(state),
      decisionTelemetry: decision.telemetry,
      stateTelemetry: governorTelemetrySnapshot(state),
    };
  }

  const usage = await invokeProvider(decision.provider);
  state = recordDispatch(state, decision.provider, decision.fingerprint, input.now, usage);

  return {
    dispatched: true,
    provider: decision.provider,
    reason: decision.reason,
    fingerprint: decision.fingerprint,
    serializedState: serializeGovernorState(state),
    decisionTelemetry: decision.telemetry,
    stateTelemetry: governorTelemetrySnapshot(state),
  };
}
