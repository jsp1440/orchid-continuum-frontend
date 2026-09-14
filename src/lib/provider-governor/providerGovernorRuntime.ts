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
 * dispatch and its reservation is durably saved. The caller must serialize
 * ticks and load the latest saved state; the sink must reject stale writes.
 * This module contains no provider SDK/network code itself.
 */
export async function executeGovernedProviderTick(
  input: GovernorRuntimeInput,
  invokeProvider: (provider: Provider) => Promise<ProviderInvocationResult>,
  persistState?: (serializedState: string) => Promise<void>,
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
    verifiedRoutingRules: input.verifiedRoutingRules,
  });

  const result = (dispatched: boolean, provider: Provider | null, reason: string): GovernorRuntimeResult => ({
    dispatched,
    provider,
    reason,
    fingerprint: decision.fingerprint,
    serializedState: serializeGovernorState(state),
    decisionTelemetry: { ...decision.telemetry, selectedProvider: provider, reason },
    stateTelemetry: governorTelemetrySnapshot(state),
  });

  if (!decision.dispatch) return result(false, null, decision.reason);
  if (!persistState) return result(false, null, 'provider-state-persistence-required');

  const previous = state;
  // Reserve the attempt and fingerprint before any external effect. UNKNOWN
  // usage is deliberate: an exception/crash does not prove a call was free.
  state = recordDispatch(previous, decision.provider, decision.fingerprint, input.now);
  try {
    await persistState(serializeGovernorState(state));
  } catch {
    return result(false, null, 'provider-state-persistence-failed');
  }

  let usage: ProviderInvocationResult;
  try {
    usage = await invokeProvider(decision.provider);
  } catch {
    // Keep the reserved attempt; never retry or broaden provider authority.
    return result(true, decision.provider, 'provider-invocation-failed');
  }

  const measured = recordDispatch(previous, decision.provider, decision.fingerprint, input.now, usage);
  try {
    await persistState(serializeGovernorState(measured));
  } catch {
    return result(true, decision.provider, 'provider-telemetry-persistence-failed');
  }
  state = measured;
  return result(true, decision.provider, decision.reason);
}
