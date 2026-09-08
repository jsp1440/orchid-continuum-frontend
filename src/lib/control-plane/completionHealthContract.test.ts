import { describe, expect, it } from 'vitest';
import { parseCompletionHealthStatus } from './completionHealthContract';

const base = () => ({
  schema_version: 'oc.operations-status.v1',
  healthy: true,
  counts: {
    queued: 1,
    running: 0,
    validating: 0,
    runtime_backoff: 1,
    repair_backoff: 0,
    blocked: 0,
  },
  issues: {
    queued: [17],
    running: [],
    validating: [],
    runtime_backoff: [535],
    repair_backoff: [],
    blocked: [],
  },
  lanes: [],
  validating_targets: [] as Array<{ issue: number; pr: number; head_sha: string | null }>,
  autonomous_prs: [],
  violations: [] as Array<Record<string, unknown>>,
  provider: { status: 'no_api', degraded: true, reason_code: 'policy' },
  integration: {
    ready: false,
    target: 'oc-autonomous-integration',
    head_sha: 'abc123',
    ahead_by: 4,
  },
  exception_class: 'engineering_exception',
  owner_decision_required: false,
  owner_exception_category: null,
  autonomous_repair_available: false,
  independent_authorized_work_available: true,
  should_interrupt_owner: false,
});

describe('canonical completion health consumer', () => {
  it('keeps provider degradation separate from executable queue state', () => {
    const status = parseCompletionHealthStatus(base());

    expect(status.provider.status).toBe('no_api');
    expect(status.counts.queued).toBe(1);
    expect(status.issues.runtime_backoff).toEqual([535]);
    expect(status.independentAuthorizedWorkAvailable).toBe(true);
    expect(status.shouldInterruptOwner).toBe(false);
  });

  it('consumes structural violations as engineering exceptions', () => {
    const input = base();
    input.healthy = false;
    input.violations = [
      { type: 'executable_parked_conflict', issue: 17 },
      { type: 'duplicate_dispatch_fingerprint', fingerprint: 'same' },
      { type: 'stale_lease', issue: 18 },
    ];
    input.autonomous_repair_available = true;

    const status = parseCompletionHealthStatus(input);
    expect(status.exceptionClass).toBe('engineering_exception');
    expect(status.autonomousRepairAvailable).toBe(true);
    expect(status.shouldInterruptOwner).toBe(false);
  });

  it('requires exact heads for validating targets', () => {
    const input = base();
    input.counts.validating = 1;
    input.issues.validating = [88];
    input.validating_targets = [{ issue: 88, pr: 99, head_sha: null }];

    expect(() => parseCompletionHealthStatus(input)).toThrow('head_sha');
  });

  it('accepts owner interruption only for a canonical protected category', () => {
    const input = base();
    input.exception_class = 'owner_exception';
    input.owner_decision_required = true;
    input.owner_exception_category = 'spending_provider_restoration';
    input.should_interrupt_owner = true;
    input.independent_authorized_work_available = false;

    const status = parseCompletionHealthStatus(input);
    expect(status.ownerExceptionCategory).toBe('spending_provider_restoration');
    expect(status.shouldInterruptOwner).toBe(true);

    input.owner_exception_category = 'ordinary_engineering';
    expect(() => parseCompletionHealthStatus(input)).toThrow('owner_exception_category');
  });

  it('fails closed on missing evidence and contradictory health', () => {
    const missing = base();
    delete missing.counts;
    expect(() => parseCompletionHealthStatus(missing)).toThrow('counts');

    const contradictory = base();
    contradictory.violations = [{ type: 'stale_lease' }];
    expect(() => parseCompletionHealthStatus(contradictory)).toThrow(
      'health and violations contradict',
    );
  });

  it('returns an allow-listed projection without propagating secrets or locality', () => {
    const input = {
      ...base(),
      api_key: 'secret',
      sensitive_locality: { latitude: 1, longitude: 2 },
      provider: { ...base().provider, credential: 'hidden' },
    };

    const rendered = JSON.stringify(parseCompletionHealthStatus(input));
    expect(rendered).not.toContain('secret');
    expect(rendered).not.toContain('latitude');
    expect(rendered).not.toContain('credential');
  });
});
