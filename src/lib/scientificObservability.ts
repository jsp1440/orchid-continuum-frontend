/**
 * Scientific Observability — reviewer-safe trace consumer (SCI-OBS-001).
 *
 * Consumes the backend `sci-obs-event-v1` observation events and reconstructs a
 * reviewer-safe trace for the Verification Workbench. This module is the
 * frontend end of the canonical pipeline trace:
 *
 *   source → acquisition → normalization → taxonomy/evidence resolution →
 *   artifact/graph boundary → API producer → frontend consumer
 *
 * Design invariants (mirroring src/lib/calyxVerification.ts honest-state rules):
 *
 * - Six pipeline states are kept DISTINCT and never collapsed:
 *   `unknown`, `absent`, `withheld`, `contradictory`, `blocked`, `unavailable`.
 *   Absence is never rendered as zero/false; unknown is never rendered as
 *   "no evidence".
 * - This module NEVER surfaces protected locality. Observation events are
 *   already redacted server-side; `assertReviewerSafe` is a client-side
 *   defense-in-depth guard that refuses to render an event carrying raw
 *   coordinates.
 * - The trace is advisory. Nothing here publishes, promotes, or mutates
 *   scientific state.
 */

import { apiRequest, type ApiResult } from '@/lib/api';

export type SafeStatusState =
  | 'ok'
  | 'blocked'
  | 'withheld'
  | 'refused'
  | 'degraded'
  | 'error'
  | 'unknown';

export type PipelineStage =
  | 'source'
  | 'acquisition'
  | 'normalization'
  | 'taxonomy_evidence_resolution'
  | 'artifact_graph_boundary'
  | 'api_producer'
  | 'frontend_consumer';

export type VerificationState =
  | 'unverified'
  | 'verified'
  | 'review_required'
  | 'conflicted'
  | 'withheld'
  | 'failed'
  | 'unknown';

export type ConflictStatus =
  | 'none_observed'
  | 'counterevidence_present'
  | 'contradiction'
  | 'unknown';

export interface SciObsSafeStatus {
  status: SafeStatusState;
  reason_code: string | null;
  blocker: string | null;
  error_code: string | null;
}

export interface SciObsEvent {
  schema_version: string;
  event_id: string;
  event_type: string;
  occurred_at: string;
  recorded_at: string;
  correlation_id: string;
  parent_event_id: string | null;
  sequence: number;
  mission_id?: string | null;
  run_id?: string | null;
  request_id?: string | null;
  taxon?: { canonical_taxon_id?: string | null; accepted_name?: string | null; rank?: string | null } | null;
  subject?: { kind?: string | null; subject_id?: string | null } | null;
  source?: {
    source_id?: string | null;
    source_record_id?: string | null;
    source_anchor_id?: string | null;
    anchor_snippet?: string | null;
    content_hash?: string | null;
    dataset?: string | null;
    dataset_version?: string | null;
  } | null;
  pipeline: { stage: PipelineStage; component: string; component_version?: string | null };
  evidence?: {
    claim_class?: string | null;
    directness?: string | null;
    confidence?: number | null;
    verification_state?: VerificationState | null;
  } | null;
  conflict?: { status?: ConflictStatus | null; counterevidence_ids?: string[] } | null;
  freshness?: { state?: 'fresh' | 'stale' | 'unknown' | null; as_of?: string | null } | null;
  locality_classification?: { sensitivity?: string | null; disclosure?: string | null } | null;
  safe_status: SciObsSafeStatus;
  consumer?: { module?: string | null; surface?: string | null } | null;
  ai?: { provider?: string | null; model?: string | null; prompt_template_version?: string | null } | null;
}

export interface SciObsTraceResponse {
  contract_version: string;
  correlation_id: string;
  event_count: number;
  events: SciObsEvent[];
  reconstructable: boolean;
  governance?: { read_only?: boolean; does_not_publish?: boolean };
}

/**
 * The six distinct reviewer-facing states. These are deliberately NOT merged:
 * a reviewer must be able to tell "we don't know" from "we know it is absent"
 * from "it exists but is withheld from you".
 */
export type TraceCellState =
  | 'present'
  | 'unknown' // never measured / not reported
  | 'absent' // measured and legitimately not present
  | 'withheld' // exists but policy withholds it
  | 'contradictory' // conflicting evidence preserved
  | 'blocked' // a blocker stopped this stage
  | 'unavailable'; // downstream/producer outage

const PROTECTED_LOCALITY_KEYS = [
  'latitude',
  'longitude',
  'lat',
  'lon',
  'lng',
  'decimal_latitude',
  'decimal_longitude',
  'coordinates',
  'geometry',
  'exact_locality',
];

/**
 * Defense-in-depth: refuse to treat an event as reviewer-safe if it somehow
 * carries raw protected-locality keys anywhere in its structure. Server-side
 * redaction should make this impossible; this guarantees the frontend never
 * renders a leak even if that fails.
 */
export function assertReviewerSafe(event: SciObsEvent): boolean {
  const scan = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.every(scan);
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (PROTECTED_LOCALITY_KEYS.includes(k.toLowerCase())) return false;
        if (!scan(v)) return false;
      }
    }
    return true;
  };
  return scan(event);
}

/**
 * Canonical trace ordering: sequence, then recorded_at, then event_id.
 * Matches the backend `ObservationStore.by_correlation` tie-break.
 */
export function reconstructTrace(events: SciObsEvent[]): SciObsEvent[] {
  return [...events].sort((a, b) => {
    if ((a.sequence ?? 0) !== (b.sequence ?? 0)) return (a.sequence ?? 0) - (b.sequence ?? 0);
    if (a.recorded_at !== b.recorded_at) return a.recorded_at < b.recorded_at ? -1 : 1;
    return a.event_id < b.event_id ? -1 : a.event_id > b.event_id ? 1 : 0;
  });
}

/**
 * Is the lineage connected? Every non-root event's parent must resolve to
 * another event in the trace, and exactly one root (parent === null) exists.
 * Returns false for a broken/partial trace so the UI can say so honestly
 * instead of implying completeness.
 */
export function lineageIsConnected(events: SciObsEvent[]): boolean {
  if (events.length === 0) return false;
  const ids = new Set(events.map((e) => e.event_id));
  const roots = events.filter((e) => e.parent_event_id === null);
  if (roots.length !== 1) return false;
  return events.every((e) => e.parent_event_id === null || ids.has(e.parent_event_id));
}

/**
 * Classify an event's evidence cell into one of the six distinct states.
 * The precedence order preserves the most safety-critical distinction first
 * (blocked/withheld/contradictory) before falling back to unknown/absent.
 */
export function classifyEvidence(event: SciObsEvent): TraceCellState {
  const status = event.safe_status?.status;
  if (status === 'blocked') return 'blocked';
  if (status === 'withheld') return 'withheld';
  if (status === 'degraded' || status === 'error' || status === 'refused') return 'unavailable';

  const conflict = event.conflict?.status;
  if (conflict === 'contradiction' || conflict === 'counterevidence_present') return 'contradictory';

  const vs = event.evidence?.verification_state;
  if (vs === 'conflicted') return 'contradictory';
  if (vs === 'withheld') return 'withheld';
  if (vs === 'unknown' || vs == null) {
    // No evidence block at all → unknown; an explicit empty is 'absent'.
    return event.evidence ? 'unknown' : 'absent';
  }
  return 'present';
}

/** Confidence for display: null/undefined stays UNKNOWN — never coerced to 0. */
export function displayConfidence(event: SciObsEvent): number | 'unknown' {
  const c = event.evidence?.confidence;
  return typeof c === 'number' ? c : 'unknown';
}

export interface TraceSummary {
  correlationId: string;
  eventCount: number;
  reconstructable: boolean;
  lineageConnected: boolean;
  reviewerSafe: boolean;
  states: Record<TraceCellState, number>;
  hasCounterevidence: boolean;
  hasWithheld: boolean;
  hasBlocked: boolean;
}

export function summarizeTrace(response: SciObsTraceResponse): TraceSummary {
  const ordered = reconstructTrace(response.events);
  const states: Record<TraceCellState, number> = {
    present: 0,
    unknown: 0,
    absent: 0,
    withheld: 0,
    contradictory: 0,
    blocked: 0,
    unavailable: 0,
  };
  for (const e of ordered) states[classifyEvidence(e)] += 1;
  return {
    correlationId: response.correlation_id,
    eventCount: ordered.length,
    reconstructable: response.reconstructable && ordered.length > 0,
    lineageConnected: lineageIsConnected(ordered),
    reviewerSafe: ordered.every(assertReviewerSafe),
    states,
    hasCounterevidence: states.contradictory > 0,
    hasWithheld: states.withheld > 0,
    hasBlocked: states.blocked > 0,
  };
}

/** Fetch a reconstructable trace from the canonical read-only backend boundary. */
export function fetchTrace(correlationId: string): Promise<ApiResult<SciObsTraceResponse>> {
  return apiRequest<SciObsTraceResponse>(
    `/api/scientific-observability/trace/${encodeURIComponent(correlationId)}`,
  );
}
