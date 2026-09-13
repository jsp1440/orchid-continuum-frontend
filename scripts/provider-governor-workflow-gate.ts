import { appendFileSync } from 'node:fs';
import { admitWorkflowProviderExecution } from '../src/lib/provider-governor/workflowGovernorAdmission';
import { deserializeGovernorState, rollGovernorDay } from '../src/lib/provider-governor/governorState';
import type { GovernorState, Provider, ProviderUsage, WorkUnit } from '../src/lib/provider-governor/providerGovernor';

const PROVIDERS: Provider[] = ['anthropic', 'gemini', 'openai'];

function booleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function integerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}

function emptyUsage(): ProviderUsage {
  return { calls: 0, tokens: 0, costUsd: 0, lastDispatchAt: null };
}

function freshState(now: string, noApiMode: boolean): GovernorState {
  const dayKey = now.slice(0, 10);
  const usage = () => Object.fromEntries(PROVIDERS.map((provider) => [provider, emptyUsage()])) as GovernorState['daily'];
  return {
    noApiMode,
    dayKey,
    daily: usage(),
    wave: usage(),
    lastFingerprint: null,
  };
}

function parseWork(): WorkUnit[] {
  const serialized = process.env.OC_PROVIDER_WORK_JSON;
  if (serialized) {
    const parsed = JSON.parse(serialized) as unknown;
    if (!Array.isArray(parsed)) throw new Error('OC_PROVIDER_WORK_JSON must be a JSON array');
    return parsed as WorkUnit[];
  }

  const issueNumber = Number(process.env.ISSUE_NUMBER ?? '');
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) return [];
  return [{
    issueNumber,
    headSha: process.env.OC_PROVIDER_HEAD_SHA || null,
    acceptanceState: process.env.OC_PROVIDER_ACCEPTANCE_STATE || null,
    materialRevision: process.env.OC_PROVIDER_MATERIAL_REVISION || null,
    urgentP0: booleanEnv('OC_PROVIDER_URGENT_P0', false),
  }];
}

function parseDisabledProviders(): Provider[] {
  const disabled = (process.env.OC_PROVIDER_DISABLED ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  for (const provider of disabled) {
    if (!PROVIDERS.includes(provider as Provider)) throw new Error(`unknown disabled provider: ${provider}`);
  }
  return disabled as Provider[];
}

function output(name: string, value: string): void {
  const target = process.env.GITHUB_OUTPUT;
  if (target) appendFileSync(target, `${name}=${value}\n`);
  else process.stdout.write(`${name}=${value}\n`);
}

const now = process.env.OC_PROVIDER_NOW || new Date().toISOString();
const noApiMode = booleanEnv('OC_PROVIDER_NO_API_MODE', true);
const serializedState = process.env.OC_PROVIDER_GOVERNOR_STATE;
let state = serializedState ? deserializeGovernorState(serializedState) : freshState(now, noApiMode);
state = rollGovernorDay(state, now.slice(0, 10));

// NO-API is monotonic at this boundary: environment policy can park a persisted
// state, but persisted state can never silently lift an active workflow park.
state = { ...state, noApiMode: state.noApiMode || noApiMode };

const admission = admitWorkflowProviderExecution({
  now,
  work: parseWork(),
  state,
  config: {
    noApiMode,
    materialWorkThreshold: integerEnv('OC_PROVIDER_MATERIAL_WORK_THRESHOLD', 1),
    minimumDispatchIntervalMs: integerEnv('OC_PROVIDER_MINIMUM_DISPATCH_INTERVAL_MS', 3_600_000),
    dailyMaxCalls: integerEnv('OC_PROVIDER_DAILY_MAX_CALLS', 4),
    waveMaxCalls: integerEnv('OC_PROVIDER_WAVE_MAX_CALLS', 1),
    disabledProviders: parseDisabledProviders(),
    providerPriority: {
      anthropic: integerEnv('OC_PROVIDER_PRIORITY_ANTHROPIC', 10),
      gemini: integerEnv('OC_PROVIDER_PRIORITY_GEMINI', 20),
      openai: integerEnv('OC_PROVIDER_PRIORITY_OPENAI', 30),
    },
  },
});

output('allow_paid_execution', String(admission.allowPaidExecution));
output('provider', admission.provider ?? '');
output('reason', admission.reason);
output('fingerprint', admission.fingerprint);
output('telemetry_json', JSON.stringify(admission.telemetry));

if (admission.allowPaidExecution) {
  process.stdout.write(`[provider-governor] admission granted provider=${admission.provider} reason=${admission.reason}\n`);
} else {
  process.stdout.write(`[provider-governor] paid execution parked reason=${admission.reason}\n`);
}
