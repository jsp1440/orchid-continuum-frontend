export const OPERATIONS_STATUS_SCHEMA_VERSION = 'oc.operations-status.v1' as const;

export const OWNER_EXCEPTION_CATEGORIES = [
  'governance',
  'scientific_activation',
  'sensitive_locality',
  'credential_security',
  'spending_provider_restoration',
  'destructive_irreversible',
  'production_activation',
  'integration_main_promotion',
] as const;

export type OwnerExceptionCategory = (typeof OWNER_EXCEPTION_CATEGORIES)[number];
export type ExceptionClass =
  | 'none'
  | 'informational'
  | 'engineering_exception'
  | 'owner_exception';

export const COMPLETION_BUCKETS = [
  'queued',
  'running',
  'validating',
  'runtime_backoff',
  'repair_backoff',
  'blocked',
] as const;

export type CompletionBucket = (typeof COMPLETION_BUCKETS)[number];
export type CompletionIdentity = string | number | null;

export interface CompletionHealthStatus {
  schemaVersion: typeof OPERATIONS_STATUS_SCHEMA_VERSION;
  healthy: boolean;
  counts: Record<CompletionBucket, number>;
  issues: Record<CompletionBucket, CompletionIdentity[]>;
  lanes: Array<{
    issue: CompletionIdentity;
    lane: string | null;
    ageSeconds: number | null;
    stale: boolean;
  }>;
  validatingTargets: Array<{
    issue: CompletionIdentity;
    pr: CompletionIdentity;
    headSha: string | null;
  }>;
  autonomousPrs: Array<{
    number: CompletionIdentity;
    headSha: string | null;
    ciState: string | null;
    mergeable: boolean | null;
  }>;
  violations: Array<Record<string, unknown> & { type: string }>;
  provider: {
    status: string | null;
    degraded: boolean;
    reasonCode: string | null;
  };
  integration: {
    ready: boolean;
    target: string | null;
    headSha: string | null;
    aheadBy: number | null;
  };
  exceptionClass: ExceptionClass;
  ownerDecisionRequired: boolean;
  ownerExceptionCategory: OwnerExceptionCategory | null;
  autonomousRepairAvailable: boolean;
  independentAuthorizedWorkAvailable: boolean;
  shouldInterruptOwner: boolean;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid ${field}: expected object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`invalid ${field}: expected array`);
  return value;
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`invalid ${field}: expected boolean`);
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error(`invalid ${field}: expected string or null`);
  return value;
}

function identity(value: unknown, field: string): CompletionIdentity {
  if (value === null || typeof value === 'string' || typeof value === 'number') return value;
  throw new Error(`invalid ${field}: expected string, number, or null`);
}

function nonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`invalid ${field}: expected non-negative number`);
  }
  return value;
}

function nullableNonNegativeNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  return nonNegativeNumber(value, field);
}

function parseBuckets(value: unknown, field: string): Record<CompletionBucket, CompletionIdentity[]> {
  const input = record(value, field);
  return Object.fromEntries(
    COMPLETION_BUCKETS.map((bucket) => [
      bucket,
      array(input[bucket], `${field}.${bucket}`).map((item, index) =>
        identity(item, `${field}.${bucket}[${index}]`),
      ),
    ]),
  ) as Record<CompletionBucket, CompletionIdentity[]>;
}

function parseCounts(
  value: unknown,
  issues: Record<CompletionBucket, CompletionIdentity[]>,
): Record<CompletionBucket, number> {
  const input = record(value, 'counts');
  return Object.fromEntries(
    COMPLETION_BUCKETS.map((bucket) => {
      const count = nonNegativeNumber(input[bucket], `counts.${bucket}`);
      if (!Number.isInteger(count) || count !== issues[bucket].length) {
        throw new Error(`invalid counts.${bucket}: must equal issue bucket length`);
      }
      return [bucket, count];
    }),
  ) as Record<CompletionBucket, number>;
}

function parseViolations(value: unknown): Array<Record<string, unknown> & { type: string }> {
  return array(value, 'violations').map((item, index) => {
    const violation = record(item, `violations[${index}]`);
    if (typeof violation.type !== 'string' || !violation.type.trim()) {
      throw new Error(`invalid violations[${index}].type`);
    }
    return { ...violation, type: violation.type };
  });
}

function parseExceptionClass(value: unknown): ExceptionClass {
  const allowed: ExceptionClass[] = [
    'none',
    'informational',
    'engineering_exception',
    'owner_exception',
  ];
  if (!allowed.includes(value as ExceptionClass)) throw new Error('invalid exception_class');
  return value as ExceptionClass;
}

function parseOwnerCategory(value: unknown): OwnerExceptionCategory | null {
  if (value === null || value === undefined) return null;
  if (!OWNER_EXCEPTION_CATEGORIES.includes(value as OwnerExceptionCategory)) {
    throw new Error('invalid owner_exception_category');
  }
  return value as OwnerExceptionCategory;
}

/**
 * Consume the canonical backend operations-status projection.
 *
 * This parser fails closed on incomplete or contradictory evidence and returns
 * only allow-listed fields. Unknown input, including secrets or locality detail,
 * is discarded rather than propagated into the frontend control plane.
 */
export function parseCompletionHealthStatus(value: unknown): CompletionHealthStatus {
  const input = record(value, 'operations status');
  if (input.schema_version !== OPERATIONS_STATUS_SCHEMA_VERSION) {
    throw new Error('unsupported operations status schema');
  }

  const issues = parseBuckets(input.issues, 'issues');
  const counts = parseCounts(input.counts, issues);
  const violations = parseViolations(input.violations);
  const healthy = bool(input.healthy, 'healthy');
  if (healthy === (violations.length > 0)) {
    throw new Error('health and violations contradict');
  }

  const lanes = array(input.lanes, 'lanes').map((item, index) => {
    const lane = record(item, `lanes[${index}]`);
    return {
      issue: identity(lane.issue, `lanes[${index}].issue`),
      lane: nullableString(lane.lane, `lanes[${index}].lane`),
      ageSeconds: nullableNonNegativeNumber(lane.age_seconds, `lanes[${index}].age_seconds`),
      stale: bool(lane.stale, `lanes[${index}].stale`),
    };
  });

  const validatingTargets = array(input.validating_targets, 'validating_targets').map(
    (item, index) => {
      const target = record(item, `validating_targets[${index}]`);
      const headSha = nullableString(target.head_sha, `validating_targets[${index}].head_sha`);
      if (!headSha) throw new Error(`invalid validating_targets[${index}].head_sha`);
      return {
        issue: identity(target.issue, `validating_targets[${index}].issue`),
        pr: identity(target.pr, `validating_targets[${index}].pr`),
        headSha,
      };
    },
  );

  const autonomousPrs = array(input.autonomous_prs, 'autonomous_prs').map((item, index) => {
    const pr = record(item, `autonomous_prs[${index}]`);
    const mergeable = pr.mergeable;
    if (!(mergeable === null || typeof mergeable === 'boolean')) {
      throw new Error(`invalid autonomous_prs[${index}].mergeable`);
    }
    return {
      number: identity(pr.number, `autonomous_prs[${index}].number`),
      headSha: nullableString(pr.head_sha, `autonomous_prs[${index}].head_sha`),
      ciState: nullableString(pr.ci_state, `autonomous_prs[${index}].ci_state`),
      mergeable,
    };
  });

  const providerInput = record(input.provider, 'provider');
  const integrationInput = record(input.integration, 'integration');
  const exceptionClass = parseExceptionClass(input.exception_class);
  const ownerDecisionRequired = bool(input.owner_decision_required, 'owner_decision_required');
  const ownerExceptionCategory = parseOwnerCategory(input.owner_exception_category);
  const shouldInterruptOwner = bool(input.should_interrupt_owner, 'should_interrupt_owner');

  if (shouldInterruptOwner && (!ownerDecisionRequired || exceptionClass !== 'owner_exception')) {
    throw new Error('owner interruption invariant violated');
  }
  if (ownerDecisionRequired !== (exceptionClass === 'owner_exception')) {
    throw new Error('owner decision invariant violated');
  }
  if ((exceptionClass === 'owner_exception') !== Boolean(ownerExceptionCategory)) {
    throw new Error('owner exception category invariant violated');
  }

  return {
    schemaVersion: OPERATIONS_STATUS_SCHEMA_VERSION,
    healthy,
    counts,
    issues,
    lanes,
    validatingTargets,
    autonomousPrs,
    violations,
    provider: {
      status: nullableString(providerInput.status, 'provider.status'),
      degraded: bool(providerInput.degraded, 'provider.degraded'),
      reasonCode: nullableString(providerInput.reason_code, 'provider.reason_code'),
    },
    integration: {
      ready: bool(integrationInput.ready, 'integration.ready'),
      target: nullableString(integrationInput.target, 'integration.target'),
      headSha: nullableString(integrationInput.head_sha, 'integration.head_sha'),
      aheadBy: nullableNonNegativeNumber(integrationInput.ahead_by, 'integration.ahead_by'),
    },
    exceptionClass,
    ownerDecisionRequired,
    ownerExceptionCategory,
    autonomousRepairAvailable: bool(
      input.autonomous_repair_available,
      'autonomous_repair_available',
    ),
    independentAuthorizedWorkAvailable: bool(
      input.independent_authorized_work_available,
      'independent_authorized_work_available',
    ),
    shouldInterruptOwner,
  };
}
