import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMissionControlOperations, runtimeSubsystemFrom } from './missionControlOps';

/**
 * The backend does not mount GET /api/runner/autonomous-status (it answers
 * 404) while GET /api/runtime/configuration answers. The Runners / Jobs row
 * must then say the runner status is unavailable instead of presenting
 * defaults ("running: no; cycles: 0; queue depth: 0; completed: 0") as facts.
 */

// Synthetic shape of the real /api/runtime/configuration keys (booleans only).
const CONFIGURATION = {
  api_key_configured: true,
  owner_access_code_configured: true,
  owner_session_secret_configured: true,
  database_configured: true,
  owner_auth_ready: true,
  allowed_origin_configured: true,
  runtime_enabled: true,
  interval_seconds: 300,
};

const DEFAULT_FACTS = ['running: no', 'cycles: 0', 'queue depth: 0', 'completed: 0', 'failed: 0', 'thread alive: no'];

afterEach(() => vi.unstubAllGlobals());

describe('runtimeSubsystemFrom', () => {
  it('status route missing + configuration answered → "runner status unavailable", no default facts', () => {
    const row = runtimeSubsystemFrom(undefined, CONFIGURATION);
    expect(row).not.toBeNull();
    expect(row!.status).toBe('unknown');
    expect(row!.summary).toMatch(/^Runner status unavailable/);
    expect(row!.summary).toContain('Runtime configured (from /api/runtime/configuration): yes');
    for (const fact of DEFAULT_FACTS) expect(row!.summary).not.toContain(fact);
    expect(row!.dataSource).toBe('runtime configuration (GET /api/runtime/configuration)');
  });

  it('a status payload missing counters reports them as unknown, not zero', () => {
    const row = runtimeSubsystemFrom({ runtime_engine: { running: true, thread_alive: true } }, CONFIGURATION);
    expect(row!.status).toBe('healthy');
    expect(row!.summary).toContain('running: yes');
    expect(row!.summary).toContain('cycles: unknown');
    expect(row!.summary).toContain('queue depth: unknown');
    expect(row!.summary).toContain('completed: unknown');
    expect(row!.summary).not.toContain('cycles: 0');
  });

  it('real counters from a status payload are reported as given', () => {
    const row = runtimeSubsystemFrom(
      { runtime_engine: { running: false, thread_alive: false, cycle_count: 0, queue_depth: 4, completed_count: 9, failed_count: 1 } },
      CONFIGURATION,
    );
    expect(row!.summary).toContain('running: no');
    expect(row!.summary).toContain('cycles: 0');
    expect(row!.summary).toContain('queue depth: 4');
    expect(row!.summary).toContain('completed: 9');
  });

  it('returns null when neither payload is available', () => {
    expect(runtimeSubsystemFrom(undefined, undefined)).toBeNull();
  });
});

describe('fetchMissionControlOperations — autonomous-status 404', () => {
  it('shows the runner row as unavailable when only /api/runtime/configuration answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/runtime/configuration')) {
          return new Response(JSON.stringify(CONFIGURATION), { status: 200 });
        }
        return new Response(JSON.stringify({ detail: 'Not Found' }), { status: 404 });
      }),
    );
    const ops = await fetchMissionControlOperations();
    const runner = ops.globalHealth.find((row) => row.id === 'runners_jobs');
    expect(runner).toBeDefined();
    expect(runner!.status).toBe('unknown');
    expect(runner!.summary).toMatch(/^Runner status unavailable/);
    for (const fact of DEFAULT_FACTS) expect(runner!.summary).not.toContain(fact);
    const diag = ops.diagnostics.find((d) => d.endpoint.endsWith('/api/runner/autonomous-status'));
    expect(diag?.status).toBe('error');
  });
});
