/**
 * Incident model, cross-system correlation, and narrative generation.
 *
 * Correlation groups related events into ONE coherent incident using bounded,
 * transparent rules (shared trace/request/mission id, commit SHA, actor,
 * resource, or time proximity). We deliberately do NOT claim causation from
 * temporal association — inferred relationships are labeled as such.
 *
 * The narrative is derived strictly from structured evidence and separates:
 *   - observed facts,
 *   - deterministic rule results,
 *   - statistical deviations,
 *   - model-assisted interpretations,
 *   - human conclusions.
 *
 * See docs/security/INCIDENT_RESPONSE_RUNBOOK.md.
 */

import type { SecurityEvent } from './envelope';
import type { Signal } from './signals';
import { assessRisk, type RiskAssessment } from './risk';

export const INCIDENT_SCHEMA_VERSION = 'security-incident/1' as const;

export const INCIDENT_STATUSES = [
  'open',
  'investigating',
  'contained',
  'resolved',
  'closed',
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const DISPOSITIONS = [
  'confirmed_incident',
  'benign_expected',
  'false_positive',
  'policy_violation_no_compromise',
  'needs_investigation',
  'test_simulation',
] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export interface TimelineEntry {
  at: string;
  event_id: string;
  event_type: string;
  service: string;
  outcome: string;
  /** How this entry is known — keeps facts distinct from inference. */
  kind: 'observed' | 'derived' | 'model-assisted';
  summary: string;
}

export interface Incident {
  incident_id: string;
  schema_version: typeof INCIDENT_SCHEMA_VERSION;
  title: string;
  status: IncidentStatus;
  created_at: string;
  updated_at: string;
  environment: SecurityEvent['environment'];
  /** Assets touched (service + resource pairs). */
  affected_assets: string[];
  contributing_event_ids: string[];
  contributing_signals: Signal[];
  timeline: TimelineEntry[];
  risk: RiskAssessment;
  /** Why these events were grouped — the correlation keys that matched. */
  correlation_rationale: string;
  narrative: IncidentNarrative;
  disposition?: Disposition;
  reviewer?: string;
  false_positive_reason?: string;
  resolution_notes?: string;
  /** Linkage to PRs / deployments / missions / traces. */
  links: {
    trace_ids: string[];
    mission_ids: string[];
    commit_shas: string[];
  };
  /** True when any contributing event was environment=test (simulated). */
  simulated: boolean;
}

export interface IncidentNarrative {
  observed_facts: string[];
  deterministic_results: string[];
  statistical_deviations: string[];
  model_assisted: string[];
  human_conclusions: string[];
  /** One-paragraph summary assembled from the above, inference labeled. */
  summary: string;
}

// ---------------------------------------------------------------------------
// Correlation
// ---------------------------------------------------------------------------

export interface CorrelationOptions {
  /** Max gap between consecutive events to still be "temporally proximate". */
  timeProximityMs: number;
  now?: () => Date;
  /** Deterministic id generator (injectable for tests). */
  idFactory?: () => string;
}

export const DEFAULT_CORRELATION_OPTIONS: CorrelationOptions = {
  timeProximityMs: 15 * 60 * 1000,
};

/** Strong correlation keys — events sharing any of these are the same incident. */
function strongKeys(e: SecurityEvent): string[] {
  const keys: string[] = [];
  const c = e.correlation;
  if (c.trace_id) keys.push(`trace:${c.trace_id}`);
  if (c.request_id) keys.push(`req:${c.request_id}`);
  if (c.mission_id) keys.push(`mission:${c.mission_id}`);
  if (c.commit_sha) keys.push(`sha:${c.commit_sha}`);
  return keys;
}

/** Weak key — actor + resource within a time window. */
function weakKey(e: SecurityEvent): string | undefined {
  const actor = e.actor_ref ?? e.correlation.actor_ref;
  if (!actor) return undefined;
  return `actor:${actor}`;
}

class UnionFind {
  private parent = new Map<number, number>();
  find(x: number): number {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: number, b: number): void {
    this.parent.set(this.find(a), this.find(b));
  }
}

/**
 * Group events into clusters. Strong keys always join. A weak (actor) key joins
 * only when the two events are within the time-proximity window — so an actor's
 * unrelated activity days apart does not merge into one incident.
 */
export function correlateEvents(
  events: SecurityEvent[],
  options: Partial<CorrelationOptions> = {},
): SecurityEvent[][] {
  const opts = { ...DEFAULT_CORRELATION_OPTIONS, ...options };
  const uf = new UnionFind();
  const strongIndex = new Map<string, number[]>();
  const weakIndex = new Map<string, number[]>();

  events.forEach((e, i) => {
    uf.find(i);
    for (const k of strongKeys(e)) {
      const list = strongIndex.get(k) ?? [];
      list.forEach((j) => uf.union(i, j));
      list.push(i);
      strongIndex.set(k, list);
    }
    const wk = weakKey(e);
    if (wk) {
      const list = weakIndex.get(wk) ?? [];
      for (const j of list) {
        const dt = Math.abs(Date.parse(e.occurred_at) - Date.parse(events[j].occurred_at));
        if (dt <= opts.timeProximityMs) uf.union(i, j);
      }
      list.push(i);
      weakIndex.set(wk, list);
    }
  });

  const clusters = new Map<number, SecurityEvent[]>();
  events.forEach((e, i) => {
    const root = uf.find(i);
    const arr = clusters.get(root) ?? [];
    arr.push(e);
    clusters.set(root, arr);
  });
  return [...clusters.values()];
}

// ---------------------------------------------------------------------------
// Narrative
// ---------------------------------------------------------------------------

function buildNarrative(events: SecurityEvent[], signals: Signal[]): IncidentNarrative {
  const observed_facts = events
    .filter((e) => e.provenance.derivation === 'observed')
    .map((e) => `${e.occurred_at}: ${e.service} ${e.event_type} → ${e.outcome}`);

  const deterministic_results = signals
    .filter((s) => !s.signal_id.startsWith('baseline.'))
    .map((s) => `${s.signal_id}: ${s.reason}`);

  const statistical_deviations = signals
    .filter((s) => /σ|baseline|deviat/i.test(s.reason))
    .map((s) => s.reason);

  const model_assisted = events
    .filter((e) => e.provenance.derivation === 'model-assisted')
    .map((e) => `model-assisted classification: ${e.event_type} (confidence ${e.confidence})`);

  const human_conclusions: string[] = []; // filled by reviewer disposition later

  const summary = [
    observed_facts.length
      ? `Observed ${observed_facts.length} fact(s) across ${new Set(events.map((e) => e.service)).size} service(s).`
      : 'No directly observed facts in window.',
    deterministic_results.length
      ? `${deterministic_results.length} deterministic rule(s) fired.`
      : '',
    statistical_deviations.length
      ? `${statistical_deviations.length} statistical deviation(s) noted (investigative, not conclusive).`
      : '',
    model_assisted.length
      ? `${model_assisted.length} model-assisted interpretation(s) present — treated as inference, not fact.`
      : '',
    'Temporal ordering does not imply causation; relationships beyond shared identifiers are inferred.',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    observed_facts,
    deterministic_results,
    statistical_deviations,
    model_assisted,
    human_conclusions,
    summary,
  };
}

function titleFor(events: SecurityEvent[], signals: Signal[]): string {
  if (signals.length > 0) {
    const top = [...signals].sort(
      (a, b) => severityRank(b.severity) - severityRank(a.severity),
    )[0];
    return `${top.signal_id} on ${events[0]?.service ?? 'unknown'}`;
  }
  return `Activity cluster on ${events[0]?.service ?? 'unknown'}`;
}

function severityRank(s: string): number {
  return ['info', 'low', 'medium', 'high', 'critical'].indexOf(s);
}

function correlationRationale(events: SecurityEvent[]): string {
  const shared: string[] = [];
  const traces = new Set(events.map((e) => e.correlation.trace_id).filter(Boolean));
  const missions = new Set(events.map((e) => e.correlation.mission_id).filter(Boolean));
  const shas = new Set(events.map((e) => e.correlation.commit_sha).filter(Boolean));
  const actors = new Set(
    events.map((e) => e.actor_ref ?? e.correlation.actor_ref).filter(Boolean),
  );
  if (traces.size === 1 && traces.size) shared.push('shared trace id');
  if (missions.size === 1 && [...missions][0]) shared.push('shared mission id');
  if (shas.size === 1 && [...shas][0]) shared.push('shared commit SHA');
  if (actors.size === 1 && [...actors][0]) shared.push('same pseudonymous actor within time window');
  if (shared.length === 0) return 'grouped by temporal proximity only (weak association — verify)';
  return `grouped by ${shared.join(', ')}`;
}

let counter = 0;
function defaultId(): string {
  counter += 1;
  return `inc_${Date.now().toString(36)}_${counter}`;
}

/**
 * Assemble a single Incident from a correlated event cluster and its signals.
 */
export function buildIncident(
  events: SecurityEvent[],
  signals: Signal[],
  options: Partial<CorrelationOptions> = {},
): Incident {
  const now = options.now ?? (() => new Date());
  const id = (options.idFactory ?? defaultId)();
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at),
  );
  const nowIso = now().toISOString();

  const timeline: TimelineEntry[] = sorted.map((e) => ({
    at: e.occurred_at,
    event_id: e.event_id,
    event_type: e.event_type,
    service: e.service,
    outcome: e.outcome,
    kind: e.provenance.derivation,
    summary: `${e.service} ${e.event_type} (${e.outcome})`,
  }));

  const affected_assets = [
    ...new Set(
      sorted.map((e) => (e.resource_type ? `${e.service}:${e.resource_type}` : e.service)),
    ),
  ];

  return {
    incident_id: id,
    schema_version: INCIDENT_SCHEMA_VERSION,
    title: titleFor(sorted, signals),
    status: 'open',
    created_at: nowIso,
    updated_at: nowIso,
    environment: sorted[0]?.environment ?? 'production',
    affected_assets,
    contributing_event_ids: sorted.map((e) => e.event_id),
    contributing_signals: signals,
    timeline,
    risk: assessRisk(signals),
    correlation_rationale: correlationRationale(sorted),
    narrative: buildNarrative(sorted, signals),
    links: {
      trace_ids: [...new Set(sorted.map((e) => e.correlation.trace_id).filter(Boolean))] as string[],
      mission_ids: [...new Set(sorted.map((e) => e.correlation.mission_id).filter(Boolean))] as string[],
      commit_shas: [...new Set(sorted.map((e) => e.correlation.commit_sha).filter(Boolean))] as string[],
    },
    simulated: sorted.some((e) => e.environment === 'test'),
  };
}

/**
 * Map a subset of signals to the cluster that owns their evidence, then build
 * one incident per cluster. Signals whose evidence spans clusters attach to the
 * cluster holding the majority of their evidence.
 */
export function buildIncidents(
  events: SecurityEvent[],
  signals: Signal[],
  options: Partial<CorrelationOptions> = {},
): Incident[] {
  const clusters = correlateEvents(events, options);
  const eventCluster = new Map<string, number>();
  clusters.forEach((cluster, idx) =>
    cluster.forEach((e) => eventCluster.set(e.event_id, idx)),
  );

  const signalsByCluster = new Map<number, Signal[]>();
  for (const s of signals) {
    const votes = new Map<number, number>();
    for (const ev of s.evidence) {
      const idx = eventCluster.get(ev);
      if (idx === undefined) continue;
      votes.set(idx, (votes.get(idx) ?? 0) + 1);
    }
    if (votes.size === 0) continue;
    const winner = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const list = signalsByCluster.get(winner) ?? [];
    list.push(s);
    signalsByCluster.set(winner, list);
  }

  return clusters.map((cluster, idx) =>
    buildIncident(cluster, signalsByCluster.get(idx) ?? [], options),
  );
}
