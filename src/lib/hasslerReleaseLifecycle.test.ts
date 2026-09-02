import { describe, expect, it } from 'vitest';
import {
  HASSLER_LIFECYCLE_STATES,
  interpretHasslerReleaseStatus,
} from './hasslerReleaseLifecycle';

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    read_only: true,
    automatic_promotion: false,
    lifecycle: {
      lifecycle_state: 'STAGED_COMPLETE',
      lifecycle_rationale: 'Staging completed; awaiting owner activation.',
      lifecycle_states: [...HASSLER_LIFECYCLE_STATES],
      expected_release: { filename: 'WorldOrchids 26-08 (Aug 2 2026).csv', version_label: '26-08' },
      active_vs_staged: {
        state: 'active_release_differs_from_exact_release',
        active_release_id: 'rel-active',
        staged_release_id: 'rel-staged',
      },
      superseded: false,
      unavailable_evidence: ['durable change report is not available'],
      evidence_complete: false,
    },
    downstream_relink_impact: {
      counts_complete: false,
      unresolved_blockers: ['change report absent'],
      domains: [
        { surface: 'pollinator_links', count: 12, count_evidence: 'observed' },
        { surface: 'mycorrhiza_links', count: 0, count_evidence: 'unavailable' },
      ],
    },
    ...overrides,
  };
}

describe('interpretHasslerReleaseStatus — fail-closed contract', () => {
  it('maps a complete valid payload', () => {
    const result = interpretHasslerReleaseStatus(validPayload());
    expect(result.kind).toBe('available');
    if (result.kind !== 'available') return;
    expect(result.status.lifecycleState).toBe('STAGED_COMPLETE');
    expect(result.status.activeVsStaged).toBe('active_release_differs_from_exact_release');
    expect(result.status.expectedRelease.versionLabel).toBe('26-08');
    expect(result.status.unavailableEvidence).toContain('durable change report is not available');
    expect(result.status.evidenceComplete).toBe(false);
    expect(result.status.relinkUnresolvedBlockers).toContain('change report absent');
  });

  it('treats a non-object payload as unreachable, not as a lifecycle', () => {
    expect(interpretHasslerReleaseStatus(null).kind).toBe('unreachable');
    expect(interpretHasslerReleaseStatus('nope').kind).toBe('unreachable');
    expect(interpretHasslerReleaseStatus([]).kind).toBe('unreachable');
  });

  it('is unreachable — never ABSENT — when the lifecycle state is missing or unrecognized', () => {
    expect(interpretHasslerReleaseStatus(validPayload({ lifecycle: {} })).kind).toBe('unreachable');
    const bogus = interpretHasslerReleaseStatus(
      validPayload({ lifecycle: { lifecycle_state: 'NOT_A_REAL_STATE' } }),
    );
    expect(bogus.kind).toBe('unreachable');
  });

  it('preserves ABSENT and UNAVAILABLE as real classified states', () => {
    for (const state of ['ABSENT', 'UNAVAILABLE'] as const) {
      const result = interpretHasslerReleaseStatus(
        validPayload({ lifecycle: { lifecycle_state: state } }),
      );
      expect(result.kind).toBe('available');
      if (result.kind === 'available') expect(result.status.lifecycleState).toBe(state);
    }
  });

  it('never renders a withheld downstream count as zero', () => {
    const result = interpretHasslerReleaseStatus(validPayload());
    if (result.kind !== 'available') throw new Error('expected available');
    const observed = result.status.relinkDomains.find((d) => d.surface === 'pollinator_links');
    const withheld = result.status.relinkDomains.find((d) => d.surface === 'mycorrhiza_links');
    expect(observed).toMatchObject({ count: 12, countObserved: true });
    // The backend carried a literal 0 with evidence 'unavailable' — it must not
    // be trusted as a real zero.
    expect(withheld).toMatchObject({ count: null, countObserved: false });
  });

  it('coerces governance invariants strictly (missing read_only is not assumed safe)', () => {
    const result = interpretHasslerReleaseStatus(validPayload({ read_only: undefined, automatic_promotion: 'yes' }));
    if (result.kind !== 'available') throw new Error('expected available');
    expect(result.status.readOnly).toBe(false);
    // Any non-true automatic_promotion is surfaced as-is; a truthy string must
    // not silently become "true".
    expect(result.status.automaticPromotion).toBe(false);
  });

  it('surfaces a reported automatic promotion truthfully', () => {
    const result = interpretHasslerReleaseStatus(validPayload({ automatic_promotion: true }));
    if (result.kind !== 'available') throw new Error('expected available');
    expect(result.status.automaticPromotion).toBe(true);
  });
});
