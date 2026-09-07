import { describe, expect, it } from 'vitest';
import type { GovernorState, ProviderUsage } from './providerGovernor';
import {
  deserializeGovernorState,
  governorTelemetrySnapshot,
  rollGovernorDay,
  serializeGovernorState,
  startNewGovernorWave,
} from './governorState';

const usage = (overrides: Partial<ProviderUsage> = {}): ProviderUsage => ({
  calls: 0,
  tokens: 0,
  costUsd: 0,
  lastDispatchAt: null,
  ...overrides,
});

const state = (): GovernorState => ({
  noApiMode: true,
  dayKey: '2026-09-05',
  lastFingerprint: 'fingerprint-1',
  daily: {
    anthropic: usage({ calls: 2, tokens: null, costUsd: null, lastDispatchAt: '2026-09-05T12:00:00Z' }),
    gemini: usage({ calls: 1, tokens: 1000, costUsd: 0.1, lastDispatchAt: '2026-09-05T11:00:00Z' }),
    openai: usage(),
  },
  wave: {
    anthropic: usage({ calls: 1, tokens: null, costUsd: null, lastDispatchAt: '2026-09-05T12:00:00Z' }),
    gemini: usage({ calls: 1, tokens: 1000, costUsd: 0.1, lastDispatchAt: '2026-09-05T11:00:00Z' }),
    openai: usage(),
  },
});

describe('provider governor durable state #535', () => {
  it('round-trips persisted state without changing NO-API mode or UNKNOWN telemetry', () => {
    const restored = deserializeGovernorState(serializeGovernorState(state()));
    expect(restored.noApiMode).toBe(true);
    expect(restored.daily.anthropic.tokens).toBeNull();
    expect(restored.daily.anthropic.costUsd).toBeNull();
    expect(restored).toEqual(state());
  });

  it('fails closed on malformed persisted usage rather than silently resetting budgets', () => {
    const malformed = JSON.parse(serializeGovernorState(state()));
    malformed.state.daily.gemini.calls = -1;
    expect(() => deserializeGovernorState(JSON.stringify(malformed))).toThrow('daily.gemini: invalid calls');
  });

  it('rolls daily ceilings only when the day changes and preserves the circuit breaker', () => {
    const current = state();
    expect(rollGovernorDay(current, '2026-09-05')).toBe(current);

    const next = rollGovernorDay(current, '2026-09-06');
    expect(next.noApiMode).toBe(true);
    expect(next.lastFingerprint).toBe('fingerprint-1');
    expect(next.daily.anthropic.calls).toBe(0);
    expect(next.daily.gemini.calls).toBe(0);
    expect(next.wave.anthropic.calls).toBe(1);
  });

  it('starts a new wave without erasing daily usage, fingerprints, or NO-API mode', () => {
    const next = startNewGovernorWave(state());
    expect(next.noApiMode).toBe(true);
    expect(next.lastFingerprint).toBe('fingerprint-1');
    expect(next.daily.anthropic.calls).toBe(2);
    expect(next.wave.anthropic.calls).toBe(0);
    expect(next.wave.gemini.calls).toBe(0);
  });

  it('exposes Mission-Control-safe telemetry with UNKNOWN preserved as null', () => {
    const snapshot = governorTelemetrySnapshot(state());
    expect(snapshot.noApiMode).toBe(true);
    expect(snapshot.daily.anthropic.tokens).toBeNull();
    expect(snapshot.daily.anthropic.costUsd).toBeNull();
    expect(snapshot.daily.gemini.tokens).toBe(1000);
    expect(snapshot.daily.gemini.costUsd).toBe(0.1);
  });
});
