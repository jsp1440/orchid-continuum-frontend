import type { GovernorState, Provider, ProviderUsage } from './providerGovernor';

const PROVIDERS: Provider[] = ['anthropic', 'gemini', 'openai'];

export interface GovernorStateEnvelope {
  version: 1;
  state: GovernorState;
}

export interface GovernorTelemetrySnapshot {
  dayKey: string;
  noApiMode: boolean;
  lastFingerprint: string | null;
  daily: Record<Provider, ProviderUsage>;
  wave: Record<Provider, ProviderUsage>;
}

function emptyUsage(): ProviderUsage {
  return { calls: 0, tokens: 0, costUsd: 0, lastDispatchAt: null };
}

function cloneUsage(usage: ProviderUsage): ProviderUsage {
  return {
    calls: usage.calls,
    tokens: usage.tokens,
    costUsd: usage.costUsd,
    lastDispatchAt: usage.lastDispatchAt,
  };
}

function cloneUsageMap(source: Record<Provider, ProviderUsage>): Record<Provider, ProviderUsage> {
  return Object.fromEntries(PROVIDERS.map((provider) => [provider, cloneUsage(source[provider])])) as Record<Provider, ProviderUsage>;
}

function assertUsage(value: unknown, label: string): asserts value is ProviderUsage {
  if (!value || typeof value !== 'object') throw new Error(`${label}: invalid usage object`);
  const usage = value as Record<string, unknown>;
  if (!Number.isInteger(usage.calls) || Number(usage.calls) < 0) throw new Error(`${label}: invalid calls`);
  if (!(usage.tokens === null || (typeof usage.tokens === 'number' && Number.isFinite(usage.tokens) && usage.tokens >= 0))) {
    throw new Error(`${label}: invalid tokens`);
  }
  if (!(usage.costUsd === null || (typeof usage.costUsd === 'number' && Number.isFinite(usage.costUsd) && usage.costUsd >= 0))) {
    throw new Error(`${label}: invalid costUsd`);
  }
  if (!(usage.lastDispatchAt === null || (typeof usage.lastDispatchAt === 'string' && Number.isFinite(Date.parse(usage.lastDispatchAt))))) {
    throw new Error(`${label}: invalid lastDispatchAt`);
  }
}

export function serializeGovernorState(state: GovernorState): string {
  return JSON.stringify({ version: 1, state } satisfies GovernorStateEnvelope);
}

export function deserializeGovernorState(serialized: string): GovernorState {
  const parsed = JSON.parse(serialized) as Partial<GovernorStateEnvelope>;
  if (parsed.version !== 1 || !parsed.state) throw new Error('unsupported governor state envelope');
  const state = parsed.state as GovernorState;
  if (typeof state.noApiMode !== 'boolean') throw new Error('invalid noApiMode');
  if (typeof state.dayKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(state.dayKey)) throw new Error('invalid dayKey');
  if (!(state.lastFingerprint === null || typeof state.lastFingerprint === 'string')) throw new Error('invalid lastFingerprint');
  for (const provider of PROVIDERS) {
    assertUsage(state.daily?.[provider], `daily.${provider}`);
    assertUsage(state.wave?.[provider], `wave.${provider}`);
  }
  return {
    ...state,
    daily: cloneUsageMap(state.daily),
    wave: cloneUsageMap(state.wave),
  };
}

export function rollGovernorDay(state: GovernorState, dayKey: string): GovernorState {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) throw new Error('invalid dayKey');
  if (state.dayKey === dayKey) return state;
  return {
    ...state,
    dayKey,
    daily: {
      anthropic: emptyUsage(),
      gemini: emptyUsage(),
      openai: emptyUsage(),
    },
  };
}

export function startNewGovernorWave(state: GovernorState): GovernorState {
  return {
    ...state,
    wave: {
      anthropic: emptyUsage(),
      gemini: emptyUsage(),
      openai: emptyUsage(),
    },
  };
}

export function governorTelemetrySnapshot(state: GovernorState): GovernorTelemetrySnapshot {
  return {
    dayKey: state.dayKey,
    noApiMode: state.noApiMode,
    lastFingerprint: state.lastFingerprint,
    daily: cloneUsageMap(state.daily),
    wave: cloneUsageMap(state.wave),
  };
}
