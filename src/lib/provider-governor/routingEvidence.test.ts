import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  changedWorkFingerprint,
  decideProviderDispatch,
  type DispatchRequest,
  type Provider,
  type RoutingEvidence,
  type RoutingEvidenceKind,
  type VerifiedRoutingRule,
  type WorkUnit,
} from './providerGovernor';

const providers: Provider[] = ['anthropic', 'gemini', 'openai'];
const unit: WorkUnit = {
  issueNumber: 607, headSha: 'abc', acceptanceState: 'prepared', materialRevision: 'r1',
};
// Synthetic verifier output for this test only; no production precedent is registered.
const evidence: RoutingEvidence = {
  kind: 'tested-precedent',
  reference: 'fixture://routing-eval/run-1',
  sha256: createHash('sha256').update('fixture: only anthropic meets this test constraint').digest('hex'),
};
const restricted: WorkUnit = { ...unit, adequateProviders: ['anthropic'], routingEvidence: [evidence] };
const rule = (work = restricted): VerifiedRoutingRule => ({
  evidence,
  workFingerprint: changedWorkFingerprint([{ ...work, routingEvidence: [] }]),
});

function request(work: WorkUnit[] = [unit]): DispatchRequest {
  const usage = () => ({ calls: 0, tokens: 0, costUsd: 0, lastDispatchAt: null });
  return {
    now: '2026-09-08T12:00:00Z', work, materialWorkThreshold: 1,
    state: {
      noApiMode: false, dayKey: '2026-09-08', lastFingerprint: null,
      daily: { anthropic: usage(), gemini: usage(), openai: usage() },
      wave: { anthropic: usage(), gemini: usage(), openai: usage() },
    },
    policies: Object.fromEntries(providers.map((provider, index) => [provider, {
      state: 'enabled', priority: [30, 10, 20][index], minimumDispatchIntervalMs: 60_000,
      dailyMaxCalls: 4, dailyMaxTokens: 1000, dailyMaxCostUsd: 1,
      waveMaxCalls: 2, waveMaxTokens: 500, waveMaxCostUsd: 0.5,
    }])) as DispatchRequest['policies'],
  };
}

function expectParked(input: DispatchRequest, reason = 'routing-evidence-required') {
  const result = decideProviderDispatch(input);
  expect(result.dispatch).toBe(false);
  expect(result.reason).toBe(reason);
  expect(result.telemetry.selectedProvider).toBeNull();
}

describe('evidence before provider escalation', () => {
  it.each([
    { adequateProviders: undefined }, { adequateProviders: providers },
    { adequateProviders: [...providers].reverse() }, { adequateProviders: [...providers, 'gemini' as Provider] },
  ])(
    'preserves ordinary routing for an unrestricted provider set $adequateProviders', ({ adequateProviders }) => {
      expect(decideProviderDispatch(request([{ ...unit, adequateProviders }]))).toMatchObject({
        dispatch: true, provider: 'gemini',
      });
    },
  );

  it.each(([
    ['anthropic'], ['openai'], ['gemini'], ['anthropic', 'openai'],
  ] as Provider[][]).map((adequateProviders) => ({ adequateProviders })))(
    'requires evidence even for a restriction to $adequateProviders', ({ adequateProviders }) => {
      expectParked(request([{ ...unit, adequateProviders }]));
    },
  );

  it.each([
    undefined, null, [], 'Astra is required', {}, [null], [false], [{}],
    [{ kind: 'repository-policy', reference: 42 }],
    [{ ...evidence, kind: 'worker-confidence' }],
    [{ ...evidence, reference: '   ' }],
    [{ ...evidence, sha256: 'claimed-verified' }],
    [{ kind: 'repository-policy', reference: 'Claude is required' }],
    [{ ...evidence, reference: 'OpenAI is required' }],
  ])('rejects malformed, unsupported, or merely asserted evidence %j', (routingEvidence) => {
    expectParked(request([{ ...restricted, routingEvidence } as WorkUnit]));
  });

  it('does not turn a plausible reference and digest into verified evidence', () => {
    expectParked(request([restricted]));
  });

  it.each<RoutingEvidenceKind>([
    'repository-policy', 'verified-tool-result', 'authoritative-documentation', 'tested-precedent',
  ])('accepts %s only when a trusted rule matches the exact evidence and work', (kind) => {
    const proof = { ...evidence, kind };
    const work = { ...restricted, routingEvidence: [proof] };
    expect(decideProviderDispatch({
      ...request([work]), verifiedRoutingRules: [{ ...rule(work), evidence: proof }],
    })).toMatchObject({ dispatch: true, provider: 'anthropic' });
  });

  it('cannot take its trusted rules or verified flag from the worker payload', () => {
    const workerPayload = { ...restricted, verified: true, verifiedRoutingRules: [rule()] };
    expectParked(request([workerPayload]));
  });

  it.each([
    { issueNumber: 608 }, { headSha: 'new-head' }, { acceptanceState: 'changed' },
    { materialRevision: 'r2' }, { urgentP0: true }, { adequateProviders: ['openai'] },
    { routingEvidence: [{ ...evidence, sha256: 'a'.repeat(64) }] },
    { routingEvidence: [{ ...evidence, reference: 'fixture://routing-eval/run-2' }] },
    { routingEvidence: [{ ...evidence, kind: 'repository-policy' }] },
  ])('rejects stale or mismatched verification %j', (change) => {
    expectParked({ ...request([{ ...restricted, ...change } as WorkUnit]), verifiedRoutingRules: [rule()] });
  });

  it('rejects invalid extra evidence even beside a verified entry', () => {
    expectParked({
      ...request([{ ...restricted, routingEvidence: [evidence, { ...evidence, reference: 'Astra is required' }] }]),
      verifiedRoutingRules: [rule()],
    });
  });

  it('requires evidence for each restricted unit in a batch', () => {
    expectParked({
      ...request([restricted, { ...restricted, issueNumber: 608 }]), verifiedRoutingRules: [rule()],
    });
  });

  it('revalidates a revoked rule before considering a cached decision', () => {
    const input = request([restricted]);
    input.state.lastFingerprint = changedWorkFingerprint([restricted]);
    expectParked(input);
  });

  it.each([null, [], 'anthropic', ['astra'], ['anthropic', null]])(
    'fails closed for a malformed provider restriction %j', (adequateProviders) => {
      expectParked(request([{ ...restricted, adequateProviders } as WorkUnit]), 'invalid-provider-restriction');
    },
  );

  it('fingerprints evidence identity and contents while ignoring set ordering', () => {
    const first = changedWorkFingerprint([restricted, unit]);
    expect(changedWorkFingerprint([unit, restricted])).toBe(first);
    for (const change of [
      { kind: 'repository-policy' as const }, { reference: 'fixture://routing-eval/run-2' },
      { sha256: 'a'.repeat(64) },
    ]) {
      expect(changedWorkFingerprint([{ ...restricted, routingEvidence: [{ ...evidence, ...change }] }, unit])).not.toBe(first);
    }
    expect(changedWorkFingerprint([{ ...unit, adequateProviders: providers }])).toBe(changedWorkFingerprint([unit]));
    const second = { ...evidence, reference: 'fixture://routing-eval/run-2' };
    expect(changedWorkFingerprint([{ ...restricted, routingEvidence: [evidence, second] }])).toBe(
      changedWorkFingerprint([{ ...restricted, routingEvidence: [second, evidence] }]),
    );
  });

  it.each(['daily-calls', 'wave-calls', 'tokens', 'cost', 'cooldown', 'unknown-usage'])(
    'does not invent a more expensive fallback after %s exhaustion/degradation', (cause) => {
      const input = request();
      if (cause === 'daily-calls') input.state.daily.gemini.calls = 4;
      if (cause === 'wave-calls') input.state.wave.gemini.calls = 2;
      if (cause === 'tokens') input.state.daily.gemini.tokens = 1000;
      if (cause === 'cost') input.state.wave.gemini.costUsd = 0.5;
      if (cause === 'cooldown') input.state.daily.gemini.lastDispatchAt = '2026-09-08T11:59:59Z';
      if (cause === 'unknown-usage') input.state.daily.gemini.costUsd = null;
      expectParked(input, 'no-provider-within-governor');
    },
  );

  it('keeps verified adequacy separate from policy authorization', () => {
    const input = { ...request([restricted]), verifiedRoutingRules: [rule()] };
    input.policies.anthropic.state = 'disabled';
    expectParked(input, 'no-provider-within-governor');
  });

  it('keeps NO-API mode dominant even over verified evidence or malformed JSON fields', () => {
    const input = { ...request([{ ...restricted, routingEvidence: [null] } as unknown as WorkUnit]), verifiedRoutingRules: [rule()] };
    input.state.noApiMode = true;
    expectParked(input, 'provider-no-api');
  });
});
