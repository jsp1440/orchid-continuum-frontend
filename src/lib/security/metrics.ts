/**
 * Operational analytics for the security control plane.
 *
 * These are operational metrics (per the directive), not checklist-completion
 * vanity metrics, and NOT employee gamification: no public "repeat offender"
 * rankings, no per-person scoreboards. Assets are services/resources, actors
 * are pseudonymous.
 */

import type { Incident, Disposition } from './incident';
import type { RuleHealth } from './disposition';

export interface SecurityMetrics {
  incidents_by_status: Record<string, number>;
  incidents_by_severity_band: Record<string, number>;
  signals_by_rule: Record<string, number>;
  confirmed_vs_false_positive: { confirmed: number; false_positive: number; rate?: number };
  mean_time_to_review_ms?: number;
  repeat_affected_assets: { asset: string; count: number }[];
  prevented_or_paused_actions: number;
  events_rejected: number;
  simulated_incidents: number;
}

export interface MetricsInput {
  incidents: Incident[];
  /** Count of events quarantined/rejected at ingest. */
  eventsRejected?: number;
  /** Count of consequential actions blocked or paused by policy. */
  preventedOrPausedActions?: number;
  ruleHealth?: RuleHealth[];
}

function inc(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

export function computeMetrics(input: MetricsInput): SecurityMetrics {
  const incidents_by_status: Record<string, number> = {};
  const incidents_by_severity_band: Record<string, number> = {};
  const signals_by_rule: Record<string, number> = {};
  const assetCounts: Record<string, number> = {};

  let confirmed = 0;
  let falsePositive = 0;
  let simulated = 0;
  const reviewLatencies: number[] = [];

  for (const i of input.incidents) {
    inc(incidents_by_status, i.status);
    inc(incidents_by_severity_band, i.risk.band);
    if (i.simulated) simulated += 1;
    for (const s of i.contributing_signals) inc(signals_by_rule, s.signal_id);
    for (const a of i.affected_assets) inc(assetCounts, a);

    const d: Disposition | undefined = i.disposition;
    if (d === 'confirmed_incident') confirmed += 1;
    if (d === 'false_positive') falsePositive += 1;

    if (d) {
      const latency = Date.parse(i.updated_at) - Date.parse(i.created_at);
      if (Number.isFinite(latency) && latency >= 0) reviewLatencies.push(latency);
    }
  }

  const verdicts = confirmed + falsePositive;
  const repeat_affected_assets = Object.entries(assetCounts)
    .filter(([, c]) => c > 1)
    .map(([asset, count]) => ({ asset, count }))
    .sort((a, b) => b.count - a.count);

  return {
    incidents_by_status,
    incidents_by_severity_band,
    signals_by_rule,
    confirmed_vs_false_positive: {
      confirmed,
      false_positive: falsePositive,
      rate: verdicts > 0 ? confirmed / verdicts : undefined,
    },
    mean_time_to_review_ms:
      reviewLatencies.length > 0
        ? Math.round(reviewLatencies.reduce((a, b) => a + b, 0) / reviewLatencies.length)
        : undefined,
    repeat_affected_assets,
    prevented_or_paused_actions: input.preventedOrPausedActions ?? 0,
    events_rejected: input.eventsRejected ?? 0,
    simulated_incidents: simulated,
  };
}
