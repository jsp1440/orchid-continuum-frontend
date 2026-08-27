import { describe, it, expect, vi, afterEach } from 'vitest';
import { securityApi } from '@/lib/securityApi';

// backendConfig defaults CALYX_BACKEND_BASE_URL to a real onrender URL, so the
// client is "configured" in tests. We stub global.fetch to exercise fail-closed
// behavior without any network.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('securityApi — fails closed', () => {
  it('returns unauthorized (no data) on 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('forbidden', { status: 403 })),
    );
    const res = await securityApi.listIncidents();
    expect(res.data).toBeNull();
    expect(res.unauthorized).toBe(true);
  });

  it('returns an error (no data) on network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom');
      }),
    );
    const res = await securityApi.metrics();
    expect(res.data).toBeNull();
    expect(res.error).not.toBeNull();
    // Never fabricates metrics.
  });

  it('returns typed data on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify([{ incident_id: 'i1', title: 't', status: 'open' }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const res = await securityApi.listIncidents();
    expect(res.error).toBeNull();
    expect(res.data?.[0].incident_id).toBe('i1');
  });

  it('never sends fabricated fallback data on 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('err', { status: 500 })),
    );
    const res = await securityApi.domainPosture();
    expect(res.data).toBeNull();
    expect(res.error?.status).toBe(500);
  });
});
