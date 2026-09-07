import { describe, expect, it, vi } from 'vitest';
import type { GovernorState, Provider, ProviderPolicy } from './providerGovernor';
import { changedWorkFingerprint } from './providerGovernor';
import { serializeGovernorState } from './governorState';
import { executeGovernedProviderTick } from './providerGovernorRuntime';

const providers: Provider[] = ['anthropic', 'gemini', 'openai'];

function usage() {
  return { calls: 0, tokens: 0, costUsd: 0, lastDispatchAt: null };
}

function state(noApiMode = true): GovernorState {
  return {
    noApiMode,
    dayKey: '2026-09-05',
    lastFingerprint: null,
    daily: { anthropic: usage(), gemini: usage(), openai: usage() },
    wave: { anthropic: usage(), gemini: usage(), openai: usage() },
  };
}

function policy(state: 'enabled' | 'disabled', priority: number): ProviderPolicy {
  return {
    state,
    priority,
    minimumDispatchIntervalMs: 60_000,
    dailyMaxCalls: 10,
    dailyMaxTokens: null,
    dailyMaxCostUsd: null,
    waveMaxCalls: 3,
    waveMaxTokens: null,
    waveMaxCostUsd: null,
  };
}

const allEnabled = {
  anthropic: policy('enabled', 2),
  gemini: policy('enabled', 1),
  openai: policy('enabled', 3),
};

const work = [{ issueNumber: 535, headSha: 'abc', materialRevision: 'runtime-wire' }];

describe('executeGovernedProviderTick', () => {
  it('never invokes a paid provider while NO-API mode is active', async () => {
    const invoke = vi.fn(async () => ({ tokens: 1, costUsd: 0.01 }));
    const result = await executeGovernedProviderTick(
      {
        now: '2026-09-05T16:00:00.000Z',
        work,
        policies: allEnabled,
        materialWorkThreshold: 1,
        serializedState: serializeGovernorState(state(true)),
      },
      invoke,
    );

    expect(result.dispatched).toBe(false);
    expect(result.reason).toBe('provider-no-api');
    expect(invoke).not.toHaveBeenCalled();
    expect(result.stateTelemetry.noApiMode).toBe(true);
  });

  it('does not invoke providers on unchanged deterministic ticks', async () => {
    const current = state(false);
    current.lastFingerprint = changedWorkFingerprint(work);
    const invoke = vi.fn(async () => ({ tokens: 1, costUsd: 0.01 }));

    for (let tick = 0; tick < 12; tick += 1) {
      const result = await executeGovernedProviderTick(
        {
          now: `2026-09-05T16:${String(tick).padStart(2, '0')}:00.000Z`,
          work,
          policies: allEnabled,
          materialWorkThreshold: 1,
          serializedState: serializeGovernorState(current),
        },
        invoke,
      );
      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe('unchanged-work-fingerprint');
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it('never invokes disabled providers and selects the cheapest adequate enabled hook', async () => {
    const policies = {
      anthropic: policy('disabled', 1),
      gemini: policy('enabled', 2),
      openai: policy('disabled', 3),
    };
    const invoke = vi.fn(async (provider: Provider) => {
      expect(provider).toBe('gemini');
      return { tokens: 7, costUsd: 0.02 };
    });

    const result = await executeGovernedProviderTick(
      {
        now: '2026-09-05T16:00:00.000Z',
        work,
        policies,
        materialWorkThreshold: 1,
        serializedState: serializeGovernorState(state(false)),
      },
      invoke,
    );

    expect(result.dispatched).toBe(true);
    expect(result.provider).toBe('gemini');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalledWith('anthropic');
    expect(invoke).not.toHaveBeenCalledWith('openai');
    expect(result.stateTelemetry.daily.gemini.calls).toBe(1);
    expect(result.stateTelemetry.daily.gemini.tokens).toBe(7);
  });

  it('fails closed before invocation when every provider is disabled', async () => {
    const disabled = Object.fromEntries(providers.map((provider, index) => [provider, policy('disabled', index)])) as Record<Provider, ProviderPolicy>;
    const invoke = vi.fn(async () => ({ tokens: 1, costUsd: 0.01 }));

    const result = await executeGovernedProviderTick(
      {
        now: '2026-09-05T16:00:00.000Z',
        work,
        policies: disabled,
        materialWorkThreshold: 1,
        serializedState: serializeGovernorState(state(false)),
      },
      invoke,
    );

    expect(result.dispatched).toBe(false);
    expect(result.reason).toBe('no-provider-within-governor');
    expect(invoke).not.toHaveBeenCalled();
  });
});
