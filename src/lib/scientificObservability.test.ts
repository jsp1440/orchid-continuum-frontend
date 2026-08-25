import { describe, expect, it } from 'vitest';
import {
  assertReviewerSafe,
  classifyEvidence,
  displayConfidence,
  lineageIsConnected,
  reconstructTrace,
  summarizeTrace,
  type SciObsEvent,
  type SciObsTraceResponse,
} from './scientificObservability';

function ev(partial: Partial<SciObsEvent> & Pick<SciObsEvent, 'event_id' | 'event_type'>): SciObsEvent {
  return {
    schema_version: 'sci-obs-event-v1',
    occurred_at: '2026-08-25T18:00:00+00:00',
    recorded_at: '2026-08-25T18:00:00+00:00',
    correlation_id: 'OC:EVENT:00000000000000000000000000000001',
    parent_event_id: null,
    sequence: 1,
    pipeline: { stage: 'taxonomy_evidence_resolution', component: 'test' },
    safe_status: { status: 'ok', reason_code: null, blocker: null, error_code: null },
    ...partial,
  };
}

describe('reconstructTrace ordering', () => {
  it('orders by sequence then recorded_at then event_id', () => {
    const events = [
      ev({ event_id: 'OC:EVENT:c', event_type: 'x', sequence: 3 }),
      ev({ event_id: 'OC:EVENT:a', event_type: 'x', sequence: 1 }),
      ev({ event_id: 'OC:EVENT:b', event_type: 'x', sequence: 2 }),
    ];
    expect(reconstructTrace(events).map((e) => e.sequence)).toEqual([1, 2, 3]);
  });
});

describe('lineageIsConnected', () => {
  it('accepts a connected DAG with a single root and branching parents', () => {
    const root = ev({ event_id: 'OC:EVENT:root', event_type: 'harvest.run.started', sequence: 1 });
    const a = ev({ event_id: 'OC:EVENT:a', event_type: 'x', sequence: 2, parent_event_id: 'OC:EVENT:root' });
    const b = ev({ event_id: 'OC:EVENT:b', event_type: 'x', sequence: 3, parent_event_id: 'OC:EVENT:a' });
    const c = ev({ event_id: 'OC:EVENT:c', event_type: 'x', sequence: 4, parent_event_id: 'OC:EVENT:a' });
    expect(lineageIsConnected([root, a, b, c])).toBe(true);
  });

  it('rejects a trace with a dangling parent', () => {
    const root = ev({ event_id: 'OC:EVENT:root', event_type: 'x', parent_event_id: null, sequence: 1 });
    const orphan = ev({ event_id: 'OC:EVENT:o', event_type: 'x', parent_event_id: 'OC:EVENT:missing', sequence: 2 });
    expect(lineageIsConnected([root, orphan])).toBe(false);
  });

  it('rejects an empty trace', () => {
    expect(lineageIsConnected([])).toBe(false);
  });
});

describe('classifyEvidence keeps the six states distinct', () => {
  it('blocked status wins', () => {
    expect(classifyEvidence(ev({ event_id: 'OC:EVENT:1', event_type: 'x', safe_status: { status: 'blocked', reason_code: null, blocker: 'x', error_code: null } }))).toBe('blocked');
  });
  it('withheld status is distinct from blocked and error', () => {
    expect(classifyEvidence(ev({ event_id: 'OC:EVENT:2', event_type: 'x', safe_status: { status: 'withheld', reason_code: 'WITHHELD_BY_POLICY', blocker: null, error_code: null } }))).toBe('withheld');
  });
  it('counterevidence is contradictory, not absent', () => {
    expect(classifyEvidence(ev({ event_id: 'OC:EVENT:3', event_type: 'x', conflict: { status: 'counterevidence_present', counterevidence_ids: ['c1'] } }))).toBe('contradictory');
  });
  it('degraded/refused downstream is unavailable', () => {
    expect(classifyEvidence(ev({ event_id: 'OC:EVENT:4', event_type: 'x', safe_status: { status: 'degraded', reason_code: null, blocker: null, error_code: null } }))).toBe('unavailable');
  });
  it('missing evidence block is absent; present-but-unknown is unknown', () => {
    expect(classifyEvidence(ev({ event_id: 'OC:EVENT:5', event_type: 'x' }))).toBe('absent');
    expect(classifyEvidence(ev({ event_id: 'OC:EVENT:6', event_type: 'x', evidence: { verification_state: 'unknown' } }))).toBe('unknown');
  });
});

describe('displayConfidence never coerces unknown to zero', () => {
  it('null confidence is unknown, not 0', () => {
    expect(displayConfidence(ev({ event_id: 'OC:EVENT:7', event_type: 'x', evidence: { confidence: null } }))).toBe('unknown');
    expect(displayConfidence(ev({ event_id: 'OC:EVENT:8', event_type: 'x', evidence: { confidence: 0.4 } }))).toBe(0.4);
  });
});

describe('assertReviewerSafe fail-closed locality guard', () => {
  it('accepts a redacted event', () => {
    expect(assertReviewerSafe(ev({ event_id: 'OC:EVENT:9', event_type: 'x', source: { source_id: 'GBIF', dataset: 'x' } }))).toBe(true);
  });
  it('rejects an event that leaked raw coordinates anywhere', () => {
    const leaked = ev({ event_id: 'OC:EVENT:10', event_type: 'x' }) as unknown as Record<string, unknown>;
    (leaked as { extensions?: unknown }).extensions = { latitude: 19.4, note: 'x' };
    expect(assertReviewerSafe(leaked as unknown as SciObsEvent)).toBe(false);
  });
});

describe('summarizeTrace', () => {
  const response: SciObsTraceResponse = {
    contract_version: 'sci-obs-api-v1',
    correlation_id: 'OC:EVENT:00000000000000000000000000000001',
    event_count: 3,
    reconstructable: true,
    events: [
      ev({ event_id: 'OC:EVENT:r', event_type: 'harvest.run.started', sequence: 1, parent_event_id: null }),
      ev({ event_id: 'OC:EVENT:w', event_type: 'locality.access.denied', sequence: 2, parent_event_id: 'OC:EVENT:r', safe_status: { status: 'withheld', reason_code: 'CAPABILITY_REQUIRED', blocker: 'protected_locality', error_code: null } }),
      ev({ event_id: 'OC:EVENT:x', event_type: 'evidence.assertion.conflicted', sequence: 3, parent_event_id: 'OC:EVENT:r', conflict: { status: 'counterevidence_present', counterevidence_ids: ['c'] } }),
    ],
  };

  it('preserves distinct withheld/contradictory states and reports lineage', () => {
    const s = summarizeTrace(response);
    expect(s.eventCount).toBe(3);
    expect(s.reconstructable).toBe(true);
    expect(s.lineageConnected).toBe(true);
    expect(s.reviewerSafe).toBe(true);
    expect(s.hasWithheld).toBe(true);
    expect(s.hasCounterevidence).toBe(true);
    expect(s.states.withheld).toBe(1);
    expect(s.states.contradictory).toBe(1);
  });
});
