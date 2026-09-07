import { describe, expect, it } from 'vitest';
import {
  changedWorkFingerprint,
  decideProviderDispatch,
  recordDispatch,
  type GovernorState,
  type Provider,
  type ProviderPolicy,
} from './providerGovernor';

const providers: Provider[] = ['anthropic', 'gemini', 'openai'];
const usage = () => ({ calls: 0, tokens: 0, costUsd: 0, lastDispatchAt: null });
const state = (overrides: Partial<GovernorState> = {}): GovernorState => ({
  noApiMode: false,
  dayKey: '2026-09-05',
  daily: { anthropic: usage(), gemini: usage(), openai: usage() },
  wave: { anthropic: usage(), gemini: usage(), openai: usage() },
  lastFingerprint: null,
  ...overrides,
});
const policy = (priority: number, overrides: Partial<ProviderPolicy> = {}): ProviderPolicy => ({
  state: 'enabled',
  priority,
  minimumDispatchIntervalMs: 60 * 60 * 1000,
  dailyMaxCalls: 4,
  dailyMaxTokens: 100_000,
  dailyMaxCostUsd: 5,
  waveMaxCalls: 1,
  waveMaxTokens: 30_000,
  waveMaxCostUsd: 2,
  ...overrides,
});
const policies = () => ({
  anthropic: policy(3),
  gemini: policy(1),
  openai: policy(2),
});
const work = [{ issueNumber: 535, headSha: 'abc', acceptanceState: 'prepared', materialRevision: 'r1' }];

function decide(s = state(), p = policies(), units = work) {
  return decideProviderDispatch({
    now: '2026-09-05T13:00:00Z',
    work: units,
    policies: p,
    state: s,
    materialWorkThreshold: 1,
  });
}

describe('provider governor #535', () => {
  it('makes twelve unchanged scheduler ticks produce zero paid calls', () => {
    const fingerprint = changedWorkFingerprint(work);
    const parked = state({ lastFingerprint: fingerprint });
    for (let tick = 0; tick < 12; tick += 1) {
      const result = decide(parked);
      expect(result.dispatch).toBe(false);
      expect(result.reason).toBe('unchanged-work-fingerprint');
    }
    expect(parked.daily.anthropic.calls + parked.daily.gemini.calls + parked.daily.openai.calls).toBe(0);
  });

  it('hard-parks every provider while NO-API mode is active', () => {
    const result = decide(state({ noApiMode: true }));
    expect(result.dispatch).toBe(false);
    expect(result.reason).toBe('provider-no-api');
    expect(result.telemetry.selectedProvider).toBeNull();
  });

  it('never selects a disabled provider', () => {
    const p = policies();
    p.gemini = policy(1, { state: 'disabled' });
    const result = decide(state(), p);
    expect(result.dispatch).toBe(true);
    if (result.dispatch) expect(result.provider).toBe('openai');
  });

  it('selects the cheapest adequate enabled provider through priority hooks', () => {
    const result = decide();
    expect(result.dispatch).toBe(true);
    if (result.dispatch) expect(result.provider).toBe('gemini');
  });

  it('respects per-task adequacy and escalates only when required', () => {
    const result = decide(state(), policies(), [{ ...work[0], adequateProviders: ['anthropic'] }]);
    expect(result.dispatch).toBe(true);
    if (result.dispatch) expect(result.provider).toBe('anthropic');
  });

  it('parks when the minimum dispatch interval has not elapsed', () => {
    const s = state();
    for (const provider of providers) s.daily[provider].lastDispatchAt = '2026-09-05T12:30:00Z';
    const result = decide(s);
    expect(result.dispatch).toBe(false);
    expect(result.reason).toBe('no-provider-within-governor');
  });

  it('parks when all providers have exhausted wave call ceilings', () => {
    const s = state();
    for (const provider of providers) s.wave[provider].calls = 1;
    const result = decide(s);
    expect(result.dispatch).toBe(false);
    expect(result.reason).toBe('no-provider-within-governor');
  });

  it('fails closed when required token or cost telemetry is UNKNOWN', () => {
    const s = state();
    for (const provider of providers) {
      s.daily[provider].tokens = null;
      s.daily[provider].costUsd = null;
    }
    const result = decide(s);
    expect(result.dispatch).toBe(false);
    expect(result.reason).toBe('no-provider-within-governor');
  });

  it('batches ordinary work instead of dispatching below threshold', () => {
    const result = decideProviderDispatch({
      now: '2026-09-05T13:00:00Z',
      work,
      policies: policies(),
      state: state(),
      materialWorkThreshold: 3,
    });
    expect(result.dispatch).toBe(false);
    expect(result.reason).toBe('batch-threshold-not-met');
  });

  it('allows an urgent P0 to cross the batching threshold without bypassing budgets', () => {
    const result = decideProviderDispatch({
      now: '2026-09-05T13:00:00Z',
      work: [{ ...work[0], urgentP0: true }],
      policies: policies(),
      state: state(),
      materialWorkThreshold: 3,
    });
    expect(result.dispatch).toBe(true);
  });

  it('fingerprints issue/head/acceptance state deterministically and detects material change', () => {
    const first = changedWorkFingerprint(work);
    const reordered = changedWorkFingerprint([...work].reverse());
    const changed = changedWorkFingerprint([{ ...work[0], headSha: 'def' }]);
    expect(first).toBe(reordered);
    expect(changed).not.toBe(first);
  });

  it('records only real telemetry and preserves UNKNOWN rather than estimating it', () => {
    const decision = decide();
    expect(decision.dispatch).toBe(true);
    if (!decision.dispatch) return;
    const updated = recordDispatch(state(), decision.provider, decision.fingerprint, '2026-09-05T13:00:00Z', {
      tokens: null,
      costUsd: null,
    });
    expect(updated.daily[decision.provider].calls).toBe(1);
    expect(updated.daily[decision.provider].tokens).toBeNull();
    expect(updated.daily[decision.provider].costUsd).toBeNull();
    expect(updated.lastFingerprint).toBe(decision.fingerprint);
  });
});
