import { describe, expect, it } from 'vitest';
import {
  bridgeBackendReservePlan,
  type BackendReservePlan,
  type BackendReserveProposal,
} from './backendReserveQueueBridge';

const proposal = (
  sourceRef: string,
  fingerprint: string,
  overrides: Partial<BackendReserveProposal> = {},
): BackendReserveProposal => ({
  source_ref: sourceRef,
  source_kind: 'issue',
  title: `Prepare ${sourceRef}`,
  labels: ['oc-queued'],
  dependencies: [],
  material_fingerprint: fingerprint,
  semantic_key: `semantic-${sourceRef}`,
  priority: 1,
  ...overrides,
});

const plan = (
  proposals: BackendReserveProposal[],
  overrides: Partial<BackendReservePlan> = {},
): BackendReservePlan => ({
  schema: 'oc.reserve-refill.v1',
  reserve_depth: 2,
  queued_count: 0,
  deficit: 2,
  status: proposals.length ? 'refill_planned' : 'queue_empty_healthy',
  proposals,
  rejections: [],
  ...overrides,
});

const sourceKey = (sourceRef: string) =>
  `jsp1440/orchid-calyx-backend|bounded-engineering-executor|issue:${sourceRef}`;

describe('backend reserve queue persistence bridge', () => {
  it('materializes a valid backend proposal through the canonical Queue Bridge', () => {
    const result = bridgeBackendReservePlan(
      plan([proposal('#1266', 'backend#1266|reserve-v1')], { reserve_depth: 1, deficit: 1 }),
      [],
    );

    expect(result.upstreamBlocked).toBe(false);
    expect(result.rejected).toEqual([]);
    expect(result.plan.create).toHaveLength(1);
    expect(result.plan.create[0].sourceKey).toBe(sourceKey('#1266'));
    expect(result.plan.create[0].labels).toEqual(['oc-prepared', 'oc-p1']);
    expect(result.plan.create[0].body).toContain('backend#1266|reserve-v1');
    expect(result.plan.create[0].body).toContain('semantic-#1266');
  });

  it('does not duplicate an unchanged proposal on a repeated cycle', () => {
    const upstream = plan(
      [proposal('#1266', 'backend#1266|reserve-v1')],
      { reserve_depth: 1, deficit: 1 },
    );
    const first = bridgeBackendReservePlan(upstream, []);
    const existing = [{
      sourceKey: first.plan.create[0].sourceKey,
      title: first.plan.create[0].title,
      state: 'open' as const,
      kind: 'issue' as const,
    }];
    const repeated = bridgeBackendReservePlan(upstream, existing);

    expect(repeated.plan.create).toEqual([]);
    expect(repeated.plan.suppressed).toEqual([
      { sourceKey: sourceKey('#1266'), reason: 'existing-open-lineage' },
    ]);
  });

  it('preserves deterministic priority refill when capacity is depleted', () => {
    const upstream = plan(
      [
        proposal('#low', 'fp-low', { priority: 4 }),
        proposal('#high', 'fp-high', { priority: 0 }),
      ],
      { reserve_depth: 1, deficit: 1 },
    );
    const result = bridgeBackendReservePlan(upstream, []);

    expect(result.plan.create.map((item) => item.sourceKey)).toEqual([
      sourceKey('#high'),
    ]);
  });

  it('rejects duplicate fingerprints and semantic keys within one payload', () => {
    const result = bridgeBackendReservePlan(
      plan([
        proposal('#first', 'fp-shared', { semantic_key: 'semantic-shared' }),
        proposal('#fingerprint-copy', 'fp-shared'),
        proposal('#semantic-copy', 'fp-new', { semantic_key: 'semantic-shared' }),
      ]),
      [],
    );

    expect(result.plan.create.map((item) => item.sourceKey)).toEqual([
      sourceKey('#first'),
    ]);
    expect(result.rejected).toEqual([
      { sourceRef: '#fingerprint-copy', reason: 'duplicate_fingerprint' },
      { sourceRef: '#semantic-copy', reason: 'semantic_duplicate' },
    ]);
  });

  it('fails closed when the upstream planner reports failure', () => {
    const result = bridgeBackendReservePlan(
      plan([proposal('#unsafe', 'fp-unsafe')], {
        status: 'queue_empty_planner_failed',
      }),
      [],
    );

    expect(result.upstreamBlocked).toBe(true);
    expect(result.plan.create).toEqual([]);
    expect(result.rejected).toEqual([
      { sourceRef: null, reason: 'invalid_or_failed_upstream_plan' },
    ]);
  });

  it('fails closed on protected or malformed proposals', () => {
    const malformed = proposal('#malformed', 'fp-malformed');
    malformed.dependencies = [42 as unknown as string];

    const result = bridgeBackendReservePlan(
      plan([
        proposal('#protected', 'fp-protected', { labels: ['oc-owner-gate'] }),
        malformed,
      ]),
      [],
    );

    expect(result.plan.create).toEqual([]);
    expect(result.rejected).toEqual([
      { sourceRef: '#protected', reason: 'protected_proposal' },
      { sourceRef: '#malformed', reason: 'invalid_proposal_contract' },
    ]);
  });

  it('rejects an invalid schema without trusting embedded work', () => {
    const result = bridgeBackendReservePlan(
      plan([proposal('#ignored', 'fp-ignored')], { schema: 'unknown.v1' }),
      [],
    );

    expect(result.upstreamBlocked).toBe(true);
    expect(result.plan.create).toEqual([]);
  });
});
