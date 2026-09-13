import { describe, expect, it } from 'vitest';
import { changedWorkFingerprint, type GovernorState, type Provider, type WorkUnit } from './providerGovernor';
import { admitWorkflowProviderExecution } from './workflowGovernorAdmission';

const providers: Provider[] = ['anthropic', 'gemini', 'openai'];

function emptyState(overrides: Partial<GovernorState> = {}): GovernorState {
  const usage = () => ({ calls: 0, tokens: 0, costUsd: 0, lastDispatchAt: null });
  return {
    noApiMode: false,
    dayKey: '2026-09-05',
    daily: { anthropic: usage(), gemini: usage(), openai: usage() },
    wave: { anthropic: usage(), gemini: usage(), openai: usage() },
    lastFingerprint: null,
    ...overrides,
  };
}

const baseConfig = {
  noApiMode: false,
  materialWorkThreshold: 1,
  minimumDispatchIntervalMs: 60_000,
  dailyMaxCalls: 10,
  waveMaxCalls: 2,
};

const work = [{ issueNumber: 535, materialRevision: 'workflow-wire-v1' }];

describe('workflow provider admission', () => {
  it.each(['true', 'false'])('denies unverified worker JSON at the CLI boundary with NO-API=%s', (noApiMode) => {
    const output = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/provider-governor-workflow-gate.ts'], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        OC_PROVIDER_NOW: '2026-09-05T17:30:00.000Z',
        OC_PROVIDER_NO_API_MODE: noApiMode,
        OC_PROVIDER_WORK_JSON: JSON.stringify([{
          issueNumber: 607, adequateProviders: ['anthropic'],
          routingEvidence: [{ kind: 'repository-policy', reference: 'Claude is required', sha256: 'a'.repeat(64) }],
          verifiedRoutingRules: [{ verified: true }],
        }]),
      },
    });
    expect(output).toContain('allow_paid_execution=false\nprovider=\n');
    expect(output).toContain(`reason=${noApiMode === 'true' ? 'provider-no-api' : 'routing-evidence-required'}`);
  });

  it('hard-parks every paid provider while NO-API mode is active', () => {
    const result = admitWorkflowProviderExecution({
      now: '2026-09-05T17:30:00.000Z',
      work,
      state: emptyState(),
      config: { ...baseConfig, noApiMode: true },
    });

    expect(result.allowPaidExecution).toBe(false);
    expect(result.provider).toBeNull();
    expect(result.reason).toBe('provider-no-api');
    expect(result.telemetry.noApiMode).toBe(true);
  });

  it('never authorizes a disabled provider', () => {
    const evidence = { kind: 'tested-precedent' as const, reference: 'fixture://disabled-provider', sha256: 'a'.repeat(64) };
    const restricted: WorkUnit = { ...work[0], adequateProviders: ['anthropic'], routingEvidence: [evidence] };
    const result = admitWorkflowProviderExecution({
      now: '2026-09-05T17:30:00.000Z',
      work: [restricted],
      state: emptyState(),
      config: {
        ...baseConfig, disabledProviders: ['anthropic'],
        verifiedRoutingRules: [{ evidence, workFingerprint: changedWorkFingerprint([{ ...restricted, routingEvidence: [] }]) }],
      },
    });

    expect(result.allowPaidExecution).toBe(false);
    expect(result.provider).toBeNull();
    expect(result.reason).toBe('no-provider-within-governor');
  });

  it('does not accept provider necessity asserted through worker JSON', () => {
    const result = admitWorkflowProviderExecution({
      now: '2026-09-05T17:30:00.000Z',
      work: JSON.parse('[{"issueNumber":607,"adequateProviders":["anthropic"],"routingEvidence":[{"kind":"repository-policy","reference":"Claude is required","verified":true}]}]'),
      state: emptyState(), config: baseConfig,
    });
    expect(result).toMatchObject({ allowPaidExecution: false, provider: null, reason: 'routing-evidence-required' });
  });

  it('suppresses unchanged deterministic ticks before paid execution', () => {
    const first = admitWorkflowProviderExecution({
      now: '2026-09-05T17:30:00.000Z',
      work,
      state: emptyState(),
      config: baseConfig,
    });
    expect(first.allowPaidExecution).toBe(true);

    for (let tick = 0; tick < 12; tick += 1) {
      const repeated = admitWorkflowProviderExecution({
        now: `2026-09-05T17:${String(31 + tick).padStart(2, '0')}:00.000Z`,
        work,
        state: emptyState({ lastFingerprint: first.fingerprint }),
        config: baseConfig,
      });
      expect(repeated.allowPaidExecution).toBe(false);
      expect(repeated.reason).toBe('unchanged-work-fingerprint');
    }
  });

  it('chooses the cheapest adequate enabled provider hook without invoking it', () => {
    const result = admitWorkflowProviderExecution({
      now: '2026-09-05T17:30:00.000Z',
      work,
      state: emptyState(),
      config: {
        ...baseConfig,
        providerPriority: { anthropic: 30, gemini: 10, openai: 20 },
        disabledProviders: ['openai'],
      },
    });

    expect(result.allowPaidExecution).toBe(true);
    expect(result.provider).toBe('gemini');
    expect(providers).toContain(result.provider);
    expect(result.reason).toBe('cheapest-adequate-provider');
  });
});
import { execFileSync } from 'node:child_process';
