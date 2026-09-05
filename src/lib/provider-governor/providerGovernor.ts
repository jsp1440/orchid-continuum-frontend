import { createHash } from 'node:crypto';

export type Provider = 'anthropic' | 'gemini' | 'openai';
export type ProviderState = 'enabled' | 'disabled';

export interface ProviderPolicy {
  state: ProviderState;
  priority: number;
  minimumDispatchIntervalMs: number;
  dailyMaxCalls: number;
  dailyMaxTokens: number | null;
  dailyMaxCostUsd: number | null;
  waveMaxCalls: number;
  waveMaxTokens: number | null;
  waveMaxCostUsd: number | null;
}

export interface ProviderUsage {
  calls: number;
  tokens: number | null;
  costUsd: number | null;
  lastDispatchAt: string | null;
}

export interface GovernorState {
  noApiMode: boolean;
  dayKey: string;
  daily: Record<Provider, ProviderUsage>;
  wave: Record<Provider, ProviderUsage>;
  lastFingerprint: string | null;
}

export interface WorkUnit {
  issueNumber: number;
  headSha?: string | null;
  acceptanceState?: string | null;
  materialRevision?: string | null;
  urgentP0?: boolean;
  adequateProviders?: Provider[];
}

export interface DispatchRequest {
  now: string;
  work: WorkUnit[];
  policies: Record<Provider, ProviderPolicy>;
  state: GovernorState;
  materialWorkThreshold: number;
}

export type DispatchDecision =
  | { dispatch: false; reason: string; fingerprint: string; telemetry: GovernorTelemetry }
  | { dispatch: true; provider: Provider; reason: string; fingerprint: string; telemetry: GovernorTelemetry };

export interface GovernorTelemetry {
  noApiMode: boolean;
  eligibleWorkCount: number;
  providerStates: Record<Provider, ProviderState>;
  selectedProvider: Provider | null;
  reason: string;
}

const PROVIDERS: Provider[] = ['anthropic', 'gemini', 'openai'];

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function changedWorkFingerprint(work: WorkUnit[]): string {
  const material = work
    .map((unit) => ({
      issueNumber: unit.issueNumber,
      headSha: unit.headSha ?? null,
      acceptanceState: unit.acceptanceState ?? null,
      materialRevision: unit.materialRevision ?? null,
      urgentP0: Boolean(unit.urgentP0),
      adequateProviders: [...(unit.adequateProviders ?? PROVIDERS)].sort(),
    }))
    .sort((a, b) => a.issueNumber - b.issueNumber);
  return createHash('sha256').update(stable(material)).digest('hex');
}

function belowCeiling(usage: ProviderUsage, policy: ProviderPolicy, scope: 'daily' | 'wave'): boolean {
  const maxCalls = scope === 'daily' ? policy.dailyMaxCalls : policy.waveMaxCalls;
  const maxTokens = scope === 'daily' ? policy.dailyMaxTokens : policy.waveMaxTokens;
  const maxCost = scope === 'daily' ? policy.dailyMaxCostUsd : policy.waveMaxCostUsd;
  if (usage.calls >= maxCalls) return false;
  if (maxTokens !== null && (usage.tokens === null || usage.tokens >= maxTokens)) return false;
  if (maxCost !== null && (usage.costUsd === null || usage.costUsd >= maxCost)) return false;
  return true;
}

function cooldownSatisfied(nowMs: number, usage: ProviderUsage, policy: ProviderPolicy): boolean {
  if (!usage.lastDispatchAt) return true;
  const last = Date.parse(usage.lastDispatchAt);
  return Number.isFinite(last) && nowMs - last >= policy.minimumDispatchIntervalMs;
}

function providerCanHandle(provider: Provider, work: WorkUnit[]): boolean {
  return work.every((unit) => (unit.adequateProviders ?? PROVIDERS).includes(provider));
}

export function decideProviderDispatch(request: DispatchRequest): DispatchDecision {
  const fingerprint = changedWorkFingerprint(request.work);
  const providerStates = Object.fromEntries(PROVIDERS.map((p) => [p, request.policies[p].state])) as Record<Provider, ProviderState>;
  const baseTelemetry = { noApiMode: request.state.noApiMode, eligibleWorkCount: request.work.length, providerStates };
  const deny = (reason: string): DispatchDecision => ({
    dispatch: false,
    reason,
    fingerprint,
    telemetry: { ...baseTelemetry, selectedProvider: null, reason },
  });

  if (request.state.noApiMode) return deny('provider-no-api');
  if (request.work.length === 0) return deny('no-material-work');
  if (request.state.lastFingerprint === fingerprint) return deny('unchanged-work-fingerprint');
  if (request.work.length < request.materialWorkThreshold && !request.work.some((unit) => unit.urgentP0)) {
    return deny('batch-threshold-not-met');
  }

  const nowMs = Date.parse(request.now);
  if (!Number.isFinite(nowMs)) return deny('invalid-now');

  const candidates = PROVIDERS
    .filter((provider) => request.policies[provider].state === 'enabled')
    .filter((provider) => providerCanHandle(provider, request.work))
    .filter((provider) => belowCeiling(request.state.daily[provider], request.policies[provider], 'daily'))
    .filter((provider) => belowCeiling(request.state.wave[provider], request.policies[provider], 'wave'))
    .filter((provider) => cooldownSatisfied(nowMs, request.state.daily[provider], request.policies[provider]))
    .sort((a, b) => request.policies[a].priority - request.policies[b].priority);

  if (candidates.length === 0) return deny('no-provider-within-governor');
  const provider = candidates[0];
  const reason = 'cheapest-adequate-provider';
  return {
    dispatch: true,
    provider,
    reason,
    fingerprint,
    telemetry: { ...baseTelemetry, selectedProvider: provider, reason },
  };
}

export function recordDispatch(
  state: GovernorState,
  provider: Provider,
  fingerprint: string,
  now: string,
  telemetry: { tokens?: number | null; costUsd?: number | null } = {},
): GovernorState {
  const apply = (usage: ProviderUsage): ProviderUsage => ({
    calls: usage.calls + 1,
    tokens: telemetry.tokens == null || usage.tokens == null ? null : usage.tokens + telemetry.tokens,
    costUsd: telemetry.costUsd == null || usage.costUsd == null ? null : usage.costUsd + telemetry.costUsd,
    lastDispatchAt: now,
  });
  return {
    ...state,
    lastFingerprint: fingerprint,
    daily: { ...state.daily, [provider]: apply(state.daily[provider]) },
    wave: { ...state.wave, [provider]: apply(state.wave[provider]) },
  };
}
