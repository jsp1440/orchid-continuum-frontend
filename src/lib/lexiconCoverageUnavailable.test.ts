import { afterEach, describe, expect, it, vi } from 'vitest';

// measureLexiconCoverage() must fail closed (status: 'unavailable', ratio: null)
// rather than fabricate a coverage number when there is nothing to measure --
// i.e. the canonical API is unreachable AND no Famous fallback entries exist.
// That combination cannot occur against the real fallback dataset (45 fixed
// entries), so it is exercised here against an isolated, mocked empty catalogue.
vi.mock('@/data/lexiconEntries', () => ({ entries: [] }));
vi.mock('@/data/famousLexiconSupplement', () => ({ famousLexiconSupplement: [] }));

describe('measureLexiconCoverage fail-closed contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports "unavailable" with a null ratio when canonical is unreachable and no fallback entries exist', async () => {
    const { measureLexiconCoverage } = await import('./lexiconService');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')));

    const report = await measureLexiconCoverage();

    expect(report.status).toBe('unavailable');
    expect(report.canonicalCoverageRatio).toBeNull();
    expect(report.totalEntries).toBe(0);
    expect(report.canonicalReachable).toBe(false);
    expect(report.reason).toBeTruthy();
  });

  it('reports "unavailable" with a null ratio when canonical returns zero entries and no fallback entries exist', async () => {
    const { measureLexiconCoverage } = await import('./lexiconService');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ release: 'x', count: 0, entries: [] }) }),
    );

    const report = await measureLexiconCoverage();

    expect(report.status).toBe('unavailable');
    expect(report.canonicalCoverageRatio).toBeNull();
    expect(report.canonicalReachable).toBe(true);
    expect(report.reason).toBeTruthy();
  });
});
