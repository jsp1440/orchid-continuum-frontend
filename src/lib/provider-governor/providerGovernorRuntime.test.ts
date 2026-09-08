import { describe, expect, it, vi } from 'vitest';
import type { GovernorState, Provider, ProviderPolicy } from './providerGovernor';
import { changedWorkFingerprint } from './providerGovernor';
import { deserializeGovernorState, serializeGovernorState } from './governorState';
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
      async () => {},
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
    const persist = vi.fn(async () => {});

    const result = await executeGovernedProviderTick(
      {
        now: '2026-09-05T16:00:00.000Z',
        work,
        policies,
        materialWorkThreshold: 1,
        serializedState: serializeGovernorState(state(false)),
      },
      invoke,
      persist,
    );

    expect(result.dispatched).toBe(true);
    expect(result.provider).toBe('gemini');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalledWith('anthropic');
    expect(invoke).not.toHaveBeenCalledWith('openai');
    expect(result.stateTelemetry.daily.gemini.calls).toBe(1);
    expect(result.stateTelemetry.daily.gemini.tokens).toBe(7);
    expect(persist).toHaveBeenCalledTimes(2);
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

  it('does not invoke without a durable state sink', async () => {
    const invoke = vi.fn(async () => ({}));
    const result = await executeGovernedProviderTick({
      now: '2026-09-05T16:00:00Z', work, policies: allEnabled, materialWorkThreshold: 1,
      serializedState: serializeGovernorState(state(false)),
    }, invoke);
    expect(result).toMatchObject({ dispatched: false, provider: null, reason: 'provider-state-persistence-required' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('fails closed before invocation when the reservation cannot be persisted', async () => {
    const invoke = vi.fn(async () => ({}));
    const result = await executeGovernedProviderTick({
      now: '2026-09-05T16:00:00Z', work, policies: allEnabled, materialWorkThreshold: 1,
      serializedState: serializeGovernorState(state(false)),
    }, invoke, async () => { throw new Error('store unavailable'); });
    expect(result).toMatchObject({ dispatched: false, provider: null, reason: 'provider-state-persistence-failed' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('persists the attempt before a rejected provider call and never retries or switches providers', async () => {
    let durable = serializeGovernorState(state(false));
    const invoke = vi.fn(async (provider: Provider) => {
      const reserved = deserializeGovernorState(durable);
      expect(provider).toBe('gemini');
      expect(reserved.daily.gemini.calls).toBe(1);
      expect(reserved.daily.gemini.tokens).toBeNull();
      expect(reserved.lastFingerprint).toBe(changedWorkFingerprint(work));
      throw new Error('provider exhausted');
    });
    const input = { now: '2026-09-05T16:00:00Z', work, policies: allEnabled, materialWorkThreshold: 1 };
    const persist = async (serialized: string) => { durable = serialized; };
    const failed = await executeGovernedProviderTick({ ...input, serializedState: durable }, invoke, persist);
    expect(failed).toMatchObject({ dispatched: true, provider: 'gemini', reason: 'provider-invocation-failed' });
    expect(failed.serializedState).toBe(durable);
    for (let tick = 0; tick < 12; tick += 1) {
      const repeated = await executeGovernedProviderTick({ ...input, serializedState: durable }, invoke, persist);
      expect(repeated).toMatchObject({ dispatched: false, reason: 'unchanged-work-fingerprint' });
    }
    expect(invoke).toHaveBeenCalledExactlyOnceWith('gemini');
    expect(deserializeGovernorState(durable).wave.gemini.calls).toBe(1);
    expect(allEnabled.gemini.state).toBe('enabled');
  });

  it('bounds failed attempts even when a worker keeps changing its work fingerprint', async () => {
    let durable = serializeGovernorState(state(false));
    const invoke = vi.fn(async (_provider: Provider) => { throw new Error('provider degraded'); });
    const persist = async (serialized: string) => { durable = serialized; };
    for (let tick = 0; tick < 12; tick += 1) {
      const result = await executeGovernedProviderTick({
        now: `2026-09-05T16:${String(tick).padStart(2, '0')}:00Z`,
        work: [{ ...work[0], materialRevision: String(tick) }],
        policies: allEnabled, materialWorkThreshold: 1, serializedState: durable,
      }, invoke, persist);
      expect(result.dispatched).toBe(tick < 3);
      if (tick >= 3) expect(result.reason).toBe('no-provider-within-governor');
    }
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(invoke.mock.calls.every(([provider]) => provider === 'gemini')).toBe(true);
    expect(deserializeGovernorState(durable).daily.gemini.calls).toBe(3);
  });

  it('keeps the durable UNKNOWN reservation if post-call telemetry persistence fails', async () => {
    let durable = serializeGovernorState(state(false));
    const persist = vi.fn(async (serialized: string) => {
      if (persist.mock.calls.length > 1) throw new Error('store failed after invocation');
      durable = serialized;
    });
    const invoke = vi.fn(async () => ({ tokens: 7, costUsd: 0.02 }));
    const input = { now: '2026-09-05T16:00:00Z', work, policies: allEnabled, materialWorkThreshold: 1 };
    const result = await executeGovernedProviderTick({ ...input, serializedState: durable }, invoke, persist);
    expect(result.reason).toBe('provider-telemetry-persistence-failed');
    expect(result.serializedState).toBe(durable);
    expect(result.stateTelemetry.daily.gemini).toMatchObject({ calls: 1, tokens: null, costUsd: null });
    await executeGovernedProviderTick({ ...input, serializedState: durable }, invoke, persist);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('never invokes or persists when a worker submits unsupported premium evidence', async () => {
    const invoke = vi.fn(async () => ({}));
    const persist = vi.fn(async () => {});
    const result = await executeGovernedProviderTick({
      now: '2026-09-05T16:00:00Z',
      work: [{ ...work[0], adequateProviders: ['anthropic'], routingEvidence: [{
        kind: 'repository-policy', reference: 'Astra/Claude/OpenAI is required', sha256: 'a'.repeat(64),
      }] }],
      policies: allEnabled, materialWorkThreshold: 1, serializedState: serializeGovernorState(state(false)),
    }, invoke, persist);
    expect(result.reason).toBe('routing-evidence-required');
    expect(invoke).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });
});
