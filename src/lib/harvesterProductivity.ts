import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

/**
 * Client for GET /api/mission-control/harvesters/productivity
 * (backend HARVESTER-PRODUCTIVITY-001).
 *
 * The older /harvesters endpoint reports rows_processed: 0 and rows_inserted: 0
 * as literals for every harvester, so "nothing was inserted" and "nobody
 * instrumented this" are indistinguishable there. This contract separates them,
 * and the types here are built so a caller cannot accidentally collapse them
 * again: an unavailable metric carries `value: null`, and `formatMetric` is the
 * only sanctioned way to render one.
 */

export type MetricState = 'measured' | 'unavailable';

export type Metric = {
  state: MetricState;
  /** null whenever state is 'unavailable' — never 0 standing in for "unknown". */
  value: number | null;
};

export type WindowKey = '24h' | '7d' | '30d';

export type HarvesterWindow = {
  runs_attempted: number;
  runs_succeeded: number;
  runs_failed: number;
  failure_rate: number | null;
  marginal_yield_per_1000_fetched: number | null;
  records_fetched: Metric;
  records_accepted: Metric;
  records_rejected: Metric;
  records_duplicate: Metric;
  records_new: Metric;
  records_updated: Metric;
  records_linked: Metric;
  records_unlinked: Metric;
  graph_elements: Metric;
};

export type BindingConfidence = 'exact' | 'shared' | 'approximate';

export type HarvesterProductivity = {
  harvester_id: string;
  job_name: string;
  binding_confidence: BindingConfidence;
  binding_note: string;
  telemetry_state: 'instrumented' | 'uninstrumented' | 'unavailable';
  last_successful_run?: string | null;
  windows: Partial<Record<WindowKey, HarvesterWindow>>;
  review_flags: string[];
};

export type HarvesterProductivityReport = {
  schema_version: string;
  generated_at?: string;
  telemetry_state: 'available' | 'unavailable';
  reason?: string;
  source_table?: string;
  harvesters: HarvesterProductivity[];
  warnings?: string[];
  blockers?: string[];
};

export const PRODUCTIVITY_PATH = '/api/mission-control/harvesters/productivity';

/** Rendered instead of a number when nothing measured the metric. */
export const UNAVAILABLE_LABEL = 'not measured';

/**
 * The single sanctioned way to display a counter.
 *
 * Returns a string, never a number, so an unavailable metric cannot be summed,
 * compared, or formatted as 0 further down the render path.
 */
export function formatMetric(metric: Metric | undefined): string {
  if (!metric || metric.state !== 'measured' || metric.value === null || metric.value === undefined) {
    return UNAVAILABLE_LABEL;
  }
  return metric.value.toLocaleString();
}

/** True only when the backend said it measured this and the number is zero. */
export function isMeasuredZero(metric: Metric | undefined): boolean {
  return metric?.state === 'measured' && metric.value === 0;
}

export function formatRate(rate: number | null | undefined, suffix = ''): string {
  if (rate === null || rate === undefined) return UNAVAILABLE_LABEL;
  return `${rate.toLocaleString()}${suffix}`;
}

export const REVIEW_FLAG_COPY: Record<string, string> = {
  high_failure_rate: 'More than half of recent runs failed',
  repeated_runs_zero_new_records: 'Ran repeatedly and retained nothing new',
  high_throughput_no_new_records: 'Processed a large volume and retained nothing new',
  stale_beyond_30d: 'No successful run in over 30 days',
};

export function describeFlag(flag: string): string {
  return REVIEW_FLAG_COPY[flag] ?? flag.replace(/_/g, ' ');
}

export const BINDING_COPY: Record<BindingConfidence, string> = {
  exact: 'Reads the job that measures this source.',
  shared: 'Shares its job with another harvester — the same measurement, reported twice.',
  approximate: 'Bound to a job that does not record this source’s ingestion.',
};

export async function loadHarvesterProductivity(
  signal?: AbortSignal,
): Promise<HarvesterProductivityReport> {
  const response = await fetch(`${CALYX_BACKEND_BASE_URL}${PRODUCTIVITY_PATH}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    // Fail closed: an unreachable endpoint is unavailable telemetry, not an
    // empty set of harvesters that happen to have done nothing.
    return {
      schema_version: 'unknown',
      telemetry_state: 'unavailable',
      reason: `Productivity telemetry request failed (${response.status}).`,
      harvesters: [],
    };
  }
  return (await response.json()) as HarvesterProductivityReport;
}
