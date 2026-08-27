/**
 * Deterministic signal engine.
 *
 * The FIRST release uses only transparent, deterministic rules — no opaque ML.
 * Every signal is an independently testable pure function over a bounded window
 * of already-sanitized events (plus optional baselines). Each emitted signal
 * carries: a stable id, a reason, evidence references (event_ids), confidence,
 * a severity contribution, a recommended human response, and known
 * false-positive considerations.
 *
 * Security risk is kept DISTINCT from scientific evidence quality. Scientific
 * novelty (rare taxa, unusual localities, novel hypotheses) is explicitly NOT a
 * security anomaly and must never be scored as one. See the rule catalog:
 * docs/security/RULE_CATALOG.md.
 */

import type { SecurityEvent, Severity } from './envelope';

export interface Signal {
  /** Stable rule identifier, e.g. "auth.repeated_failures". */
  signal_id: string;
  /** Human-readable reason this fired. */
  reason: string;
  /** event_ids that constitute the evidence for this signal. */
  evidence: string[];
  /** [0,1] — how confident the rule is that this is real (not severity). */
  confidence: number;
  /** Contribution toward the incident risk score, before weighting. */
  severity: Severity;
  /** What a human reviewer should do next. */
  recommended_response: string;
  /** Known reasons this may be a false positive. */
  false_positive_notes: string;
}

/** Minimal, bounded context a rule may consult. */
export interface RuleContext {
  /** Sanitized events in the evaluation window (already validated). */
  events: SecurityEvent[];
  /** Optional per-key baselines, keyed by baseline dimension. */
  baseline?: BaselineLookup;
  /** Rule thresholds (configuration-controlled). */
  config: RuleConfig;
}

export interface BaselineStat {
  mean: number;
  stddev: number;
  sampleSize: number;
  /** True when insufficient data — cold start. */
  coldStart: boolean;
  windowLabel: string;
}

export type BaselineLookup = (dimension: string, key: string) => BaselineStat | undefined;

/** All thresholds live here so they are configurable + testable. */
export interface RuleConfig {
  authFailureThreshold: number;
  authFailureWindowMs: number;
  bulkAccessThreshold: number;
  baselineSigma: number;
  minBaselineSamples: number;
}

export const DEFAULT_RULE_CONFIG: RuleConfig = {
  authFailureThreshold: 5,
  authFailureWindowMs: 10 * 60 * 1000,
  bulkAccessThreshold: 1000,
  baselineSigma: 3,
  minBaselineSamples: 30,
};

type Rule = (ctx: RuleContext) => Signal[];

function ms(iso: string): number {
  return Date.parse(iso);
}

// ---------------------------------------------------------------------------
// Individual rules — each exported for isolated unit testing.
// ---------------------------------------------------------------------------

/** R1: repeated authentication failures for the same actor in a window. */
export const ruleRepeatedAuthFailures: Rule = ({ events, config }) => {
  const byActor = new Map<string, SecurityEvent[]>();
  for (const e of events) {
    if (e.source_category !== 'auth') continue;
    if (e.event_type !== 'auth.login.failure' && e.outcome !== 'failure') continue;
    const key = e.actor_ref ?? e.correlation.actor_ref ?? 'anonymous';
    const bucket = byActor.get(key) ?? [];
    bucket.push(e);
    byActor.set(key, bucket);
  }
  const signals: Signal[] = [];
  for (const [actor, list] of byActor) {
    const sorted = [...list].sort((a, b) => ms(a.occurred_at) - ms(b.occurred_at));
    // Sliding window count.
    let start = 0;
    let maxInWindow = 0;
    let evidence: string[] = [];
    for (let end = 0; end < sorted.length; end += 1) {
      while (
        ms(sorted[end].occurred_at) - ms(sorted[start].occurred_at) >
        config.authFailureWindowMs
      ) {
        start += 1;
      }
      const count = end - start + 1;
      if (count > maxInWindow) {
        maxInWindow = count;
        evidence = sorted.slice(start, end + 1).map((e) => e.event_id);
      }
    }
    if (maxInWindow >= config.authFailureThreshold) {
      signals.push({
        signal_id: 'auth.repeated_failures',
        reason: `${maxInWindow} failed authentications for actor ${actor} within ${Math.round(
          config.authFailureWindowMs / 60000,
        )} min (threshold ${config.authFailureThreshold})`,
        evidence,
        confidence: Math.min(1, 0.5 + maxInWindow / 20),
        severity: maxInWindow >= config.authFailureThreshold * 3 ? 'high' : 'medium',
        recommended_response:
          'Review the source IP/service and whether the account is under credential-stuffing. Do NOT auto-lock; confirm with the account owner via the existing workflow.',
        false_positive_notes:
          'A user mistyping a password, an expired session refresh loop, or a misconfigured client can all produce clustered failures.',
      });
    }
  }
  return signals;
};

/** R2: authorization denials (privilege boundary being probed). */
export const ruleAuthorizationDenials: Rule = ({ events }) => {
  const denials = events.filter(
    (e) => e.source_category === 'authz' && e.outcome === 'denied',
  );
  if (denials.length < 3) return [];
  return [
    {
      signal_id: 'authz.repeated_denials',
      reason: `${denials.length} authorization denials in window`,
      evidence: denials.map((e) => e.event_id),
      confidence: 0.6,
      severity: denials.length >= 10 ? 'high' : 'medium',
      recommended_response:
        'Check whether one actor is enumerating protected resources vs. a broken client. Correlate with auth failures.',
      false_positive_notes:
        'A newly deployed client with stale scopes will generate benign denials.',
    },
  ];
};

/** R3: privilege escalation / role change. */
export const rulePrivilegeEscalation: Rule = ({ events }) => {
  const changes = events.filter(
    (e) =>
      e.source_category === 'admin' &&
      (e.event_type.includes('role') || e.event_type.includes('privilege')) &&
      e.action === 'grant',
  );
  return changes.map((e) => ({
    signal_id: 'admin.privilege_escalation',
    reason: `privilege/role grant observed (${e.event_type})`,
    evidence: [e.event_id],
    confidence: 0.5,
    severity: 'high' as Severity,
    recommended_response:
      'Confirm the grant was requested through the governed admin workflow and by an authorized approver.',
    false_positive_notes:
      'Legitimate onboarding and scheduled role rotations trigger this by design; treat as investigative, not conclusive.',
  }));
};

/** R4: unexpected write by a read-only service. */
export const ruleReadOnlyServiceWrite: Rule = ({ events }) => {
  const writes = events.filter(
    (e) =>
      e.source_category === 'database' &&
      e.action === 'write' &&
      String(e.metadata.declared_access ?? '').toLowerCase() === 'read-only',
  );
  return writes.map((e) => ({
    signal_id: 'database.readonly_write',
    reason: `service ${e.service} declared read-only performed a write`,
    evidence: [e.event_id],
    confidence: 0.8,
    severity: 'high' as Severity,
    recommended_response:
      'Verify the service credential scope. A read-only worker writing is a strong misconfiguration or compromise signal.',
    false_positive_notes:
      'A recently re-scoped service whose metadata label lags reality.',
  }));
};

/** R5: bulk export / enumeration beyond a threshold or baseline. */
export const ruleBulkAccess: Rule = ({ events, baseline, config }) => {
  const signals: Signal[] = [];
  for (const e of events) {
    if (e.source_category !== 'database') continue;
    const rows = Number(e.metadata.row_count ?? 0);
    if (!Number.isFinite(rows) || rows <= 0) continue;

    const stat = baseline?.('db.read_rows', e.service);
    let anomalous = rows >= config.bulkAccessThreshold;
    let reason = `${rows} rows accessed (absolute threshold ${config.bulkAccessThreshold})`;
    let confidence = 0.5;

    if (stat && !stat.coldStart && stat.sampleSize >= config.minBaselineSamples) {
      const z = stat.stddev > 0 ? (rows - stat.mean) / stat.stddev : 0;
      if (z >= config.baselineSigma) {
        anomalous = true;
        reason = `${rows} rows is ${z.toFixed(1)}σ above the ${stat.windowLabel} baseline (mean ${stat.mean.toFixed(
          0,
        )})`;
        confidence = Math.min(0.9, 0.5 + z / 20);
      }
    }
    if (anomalous) {
      signals.push({
        signal_id: 'database.bulk_access',
        reason,
        evidence: [e.event_id],
        confidence,
        severity: 'medium',
        recommended_response:
          'Confirm whether an authorized export/report job is running. Correlate with the actor and mission.',
        false_positive_notes:
          'Scheduled analytics exports and legitimate research bulk pulls look identical; use the baseline + mission context.',
      });
    }
  }
  return signals;
};

/** R6: deployment from an unexpected / non-governed branch. */
export const ruleUnexpectedDeploymentBranch: Rule = ({ events }) => {
  const deploys = events.filter(
    (e) => e.source_category === 'ci' && e.event_type.startsWith('ci.deploy'),
  );
  const signals: Signal[] = [];
  for (const e of deploys) {
    const branch = String(e.metadata.branch ?? '');
    const governed = e.metadata.governed_branch === true;
    if (branch && !governed) {
      signals.push({
        signal_id: 'ci.unexpected_deploy_branch',
        reason: `deployment triggered from non-governed branch "${branch}"`,
        evidence: [e.event_id],
        confidence: 0.7,
        severity: 'high',
        recommended_response:
          'Verify the deployment was authorized. Production deploys should originate from the governed promotion branch only.',
        false_positive_notes:
          'A sanctioned hotfix branch not yet added to the governed-branch allowlist.',
      });
    }
  }
  return signals;
};

/** R7: failed webhook / signature verification. */
export const ruleWebhookVerificationFailure: Rule = ({ events }) => {
  const fails = events.filter(
    (e) => e.source_category === 'webhook' && e.outcome === 'failure',
  );
  if (fails.length === 0) return [];
  return [
    {
      signal_id: 'webhook.verification_failure',
      reason: `${fails.length} webhook signature verification failure(s)`,
      evidence: fails.map((e) => e.event_id),
      confidence: 0.75,
      severity: fails.length >= 5 ? 'high' : 'medium',
      recommended_response:
        'A forged or misconfigured webhook sender. Confirm the secret rotation status via the existing workflow; do not disable the endpoint automatically.',
      false_positive_notes:
        'A legitimate sender mid secret-rotation will briefly fail verification.',
    },
  ];
};

/** R8: sustained model-provider errors that could trigger unsafe fallback. */
export const ruleProviderErrorStorm: Rule = ({ events }) => {
  const errors = events.filter(
    (e) => e.source_category === 'model' && e.outcome === 'error',
  );
  if (errors.length < 5) return [];
  return [
    {
      signal_id: 'model.provider_error_storm',
      reason: `${errors.length} model-provider errors in window (risk of unsafe fallback)`,
      evidence: errors.map((e) => e.event_id),
      confidence: 0.6,
      severity: 'medium',
      recommended_response:
        'Confirm fallback behavior stays within policy (no secret exposure, no destructive default). Consider pausing autonomous missions.',
      false_positive_notes:
        'A provider outage is operational, not adversarial — but the fallback path still deserves review.',
    },
  ];
};

/** R9: missing provenance for a scientific claim (security-adjacent integrity). */
export const ruleMissingProvenance: Rule = ({ events }) => {
  const misses = events.filter(
    (e) =>
      e.source_category === 'ingestion' &&
      e.event_type === 'ingestion.provenance.missing',
  );
  return misses.map((e) => ({
    signal_id: 'ingestion.missing_provenance',
    reason: 'an ingested scientific claim lacks required provenance',
    evidence: [e.event_id],
    confidence: 0.7,
    severity: 'medium' as Severity,
    recommended_response:
      'Hold the claim behind the evidence gate. This is an integrity signal, NOT a statement that the science is wrong.',
    false_positive_notes:
      'A source whose provenance arrives on a delayed second pass.',
  }));
};

// ---------------------------------------------------------------------------
// Registry + evaluator
// ---------------------------------------------------------------------------

export const RULES: Rule[] = [
  ruleRepeatedAuthFailures,
  ruleAuthorizationDenials,
  rulePrivilegeEscalation,
  ruleReadOnlyServiceWrite,
  ruleBulkAccess,
  ruleUnexpectedDeploymentBranch,
  ruleWebhookVerificationFailure,
  ruleProviderErrorStorm,
  ruleMissingProvenance,
];

/**
 * Evaluate all deterministic rules over a window of events. Note: agent /
 * prompt-injection signals are produced by the AI-safeguard modules
 * (./promptInjection, ./toolPolicy) and merged upstream, keeping this file
 * focused on infrastructure telemetry.
 */
export function evaluateSignals(
  events: SecurityEvent[],
  options: { baseline?: BaselineLookup; config?: Partial<RuleConfig> } = {},
): Signal[] {
  const ctx: RuleContext = {
    events,
    baseline: options.baseline,
    config: { ...DEFAULT_RULE_CONFIG, ...options.config },
  };
  return RULES.flatMap((rule) => rule(ctx));
}
