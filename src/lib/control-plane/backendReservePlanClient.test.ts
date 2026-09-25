import { describe, expect, it, vi } from 'vitest';
import capturedPlan from './__fixtures__/evidence_gap_reserve_plan.json';
import {
  BACKEND_RESERVE_PLAN_PATH,
  admitBackendReservePlan,
  fetchBackendReservePlan,
  reservePlanUrl,
  withBackendReserveSource,
} from './backendReservePlanClient';

/**
 * `__fixtures__/evidence_gap_reserve_plan.json` is the exact body the Calyx
 * backend route returns in tests/test_evidence_gap_reserve_plan_route.py
 * (jsp1440/orchid-calyx-backend PR #1623, branch claude/r1-K-gap-reserve-endpoint).
 */

const BASE = 'https://calyx.test';

function jsonResponse(body: unknown, init: { status?: number; contentType?: string } = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': init.contentType ?? 'application/json' },
  });
}

const options = (fetchImpl: typeof fetch) => ({
  baseUrl: BASE,
  mode: 'deterministic-no-api' as const,
  fetchImpl,
});

describe('backendReservePlanClient', () => {
  it('admits the captured backend plan as bounded research missions', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(capturedPlan)) as unknown as typeof fetch;
    const admission = await admitBackendReservePlan([], options(fetchImpl));

    expect(admission.mode).toBe('deterministic-no-api');
    expect(admission.paidProviderCalls).toBe(0);
    expect(admission.transportFailure).toBeNull();
    expect(admission.bridge.upstreamBlocked).toBe(false);
    expect(admission.bridge.rejected).toEqual([]);
    expect(admission.bridge.plan.create).toHaveLength(3);
    for (const prepared of admission.bridge.plan.create) {
      expect(prepared.body).toContain('Canonical bounded research mission:');
      expect(prepared.body).toContain(
        '- Automatic publication, KG/taxonomy mutation, and locality disclosure: disabled',
      );
      expect(prepared.body).not.toMatch(/distribution/i);
    }
    expect(admission.source).toEqual({
      sourceKind: 'brain-knowledge-gap',
      state: 'connected',
      evidence: ['backend reserve plan refill_planned: 3 proposal(s)'],
    });
  });

  it('sends one bounded, credential-free GET with held fingerprints', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(capturedPlan)) as unknown as typeof fetch;
    const held = capturedPlan.proposals[0].material_fingerprint;
    await fetchBackendReservePlan({ ...options(fetchImpl), reserveDepth: 99, heldFingerprints: [held, 'bad'] });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe(BACKEND_RESERVE_PLAN_PATH);
    expect(parsed.searchParams.get('reserve_depth')).toBe('3');
    expect(parsed.searchParams.getAll('fingerprint')).toEqual([held]);
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit' });
    expect(reservePlanUrl({ baseUrl: `${BASE}/`, mode: 'deterministic-no-api' })).toBe(
      `${BASE}${BACKEND_RESERVE_PLAN_PATH}?reserve_depth=3`,
    );
  });

  it.each([
    ['html', jsonResponse('<!doctype html><html></html>', { contentType: 'text/html' }), 'non_json_response'],
    ['server error', jsonResponse({ detail: 'x' }, { status: 503 }), 'http_503'],
    ['bad json', jsonResponse('{not json', {}), 'invalid_json'],
    ['wrong shape', jsonResponse({ schema: 'oc.reserve-refill.v1' }), 'invalid_plan_shape'],
  ])('fails closed on %s', async (_label, response, reason) => {
    const fetchImpl = vi.fn(async () => response) as unknown as typeof fetch;
    const admission = await admitBackendReservePlan([], options(fetchImpl));
    expect(admission.transportFailure).toBe(reason);
    expect(admission.bridge.upstreamBlocked).toBe(true);
    expect(admission.bridge.plan.create).toEqual([]);
    expect(admission.source.state).toBe('unavailable');
  });

  it('fails closed on a transport error and refuses non-provider-free modes', async () => {
    const throwing = vi.fn(async () => { throw new TypeError('network'); }) as unknown as typeof fetch;
    expect((await admitBackendReservePlan([], options(throwing))).transportFailure).toBe('transport_error');
    const untouched = vi.fn() as unknown as typeof fetch;
    const refused = await fetchBackendReservePlan({
      ...options(untouched),
      mode: 'paid-provider' as unknown as 'deterministic-no-api',
    });
    expect(refused).toEqual({ ok: false, reason: 'unsupported_mode' });
    expect(untouched).not.toHaveBeenCalled();
  });

  it('treats the backend fail-closed status as blocked and surfaces its reason', async () => {
    const unavailable = {
      ...capturedPlan,
      status: 'evidence_gaps_unavailable',
      status_reason: 'knowledge-graph evidence coverage unavailable (DATABASE_URL is not configured)',
      proposals: [],
    };
    const fetchImpl = vi.fn(async () => jsonResponse(unavailable)) as unknown as typeof fetch;
    const admission = await admitBackendReservePlan([], options(fetchImpl));
    expect(admission.bridge.upstreamBlocked).toBe(true);
    expect(admission.bridge.plan.create).toEqual([]);
    expect(admission.upstreamReason).toContain('DATABASE_URL is not configured');
    expect(admission.source.state).toBe('unavailable');
    expect(admission.source.evidence[0]).toContain('evidence_gaps_unavailable');
  });

  it('suppresses proposals whose lineage is already open', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(capturedPlan)) as unknown as typeof fetch;
    const first = await admitBackendReservePlan([], options(fetchImpl));
    const existing = first.bridge.plan.create.map((prepared) => ({
      state: 'open' as const,
      kind: 'issue' as const,
      title: prepared.title,
      sourceKey: prepared.sourceKey,
    }));
    const second = await admitBackendReservePlan(existing, options(fetchImpl));
    expect(second.bridge.plan.create).toEqual([]);
  });

  it('registers the backend plan as the brain-knowledge-gap steward source', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(capturedPlan)) as unknown as typeof fetch;
    const admission = await admitBackendReservePlan([], options(fetchImpl));
    const input = withBackendReserveSource(
      {
        queueBridgeSources: [
          { sourceKind: 'brain-knowledge-gap' as const, state: 'unknown' as const, evidence: [] },
          { sourceKind: 'self-audit' as const, state: 'connected' as const, evidence: ['x'] },
        ],
      },
      admission,
    );
    expect(input.queueBridgeSources).toEqual([
      { sourceKind: 'self-audit', state: 'connected', evidence: ['x'] },
      admission.source,
    ]);
  });
});
