import { describe, it, expect, vi, afterEach } from 'vitest';
import { mockFetchSequence, rejectingFetch, type FetchMockResponse } from './testing/fetchMock';
import { fetchCalyxScienceDashboard } from './calyxScience';
import captured from './__fixtures__/calyxScienceDashboard.realBackend.json';

const SECTION_ORDER = ['summary', 'status', 'departments', 'gaps', 'datasets', 'missions', 'harvesters', 'dossiers'] as const;

// fetchCalyxScienceDashboard fires eight independent /api/science/* requests
// in this fixed declaration order: summary, status, departments, gaps,
// datasets, missions, harvesters, dossiers. Promise.allSettled starts every
// readJson() call synchronously before the first await, so a fetch double
// that replays responses by call order lines up with that order.
// Healthy responses are the backend's own payloads, captured verbatim (see the
// fixture's `_capture` note). Failing endpoints below use a synthetic HTTP
// error status, which is an error state only.
const ALL_OK: FetchMockResponse[] = SECTION_ORDER.map((section) => ({ ok: true, body: captured[section] }));

describe('fetchCalyxScienceDashboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns every section with no sectionErrors when all eight endpoints succeed', async () => {
    globalThis.fetch = mockFetchSequence(ALL_OK);

    const dashboard = await fetchCalyxScienceDashboard();

    expect(dashboard.sectionErrors).toEqual({});
    expect(dashboard.summary?.department_count).toBe(captured.summary.department_count);
    expect(dashboard.status?.known_gap_count).toBe(captured.status.known_gap_count);
    expect(dashboard.departments).toHaveLength(captured.departments.departments.length);
    expect(dashboard.gaps).toHaveLength(captured.gaps.gaps.length);
  });

  it('marks a failed endpoint as unavailable instead of fabricating an empty result for it', async () => {
    const responses: FetchMockResponse[] = [...ALL_OK];
    responses[6] = { ok: false, status: 503, body: {} }; // harvesters endpoint down

    globalThis.fetch = mockFetchSequence(responses);

    const dashboard = await fetchCalyxScienceDashboard();

    expect(dashboard.sectionErrors.harvesters).toMatch(/503/);
    expect(dashboard.harvesters).toEqual([]);
    // The other seven sections are unaffected by the one failure.
    expect(dashboard.sectionErrors.departments).toBeUndefined();
    expect(dashboard.departments).toHaveLength(captured.departments.departments.length);
    expect(dashboard.summary?.department_count).toBe(captured.summary.department_count);
  });

  it('records sectionErrors for summary/status separately so counts are not silently dropped to zero', async () => {
    const responses: FetchMockResponse[] = [...ALL_OK];
    responses[0] = { ok: false, status: 500, body: {} }; // summary endpoint down

    globalThis.fetch = mockFetchSequence(responses);

    const dashboard = await fetchCalyxScienceDashboard();

    expect(dashboard.summary).toBeNull();
    expect(dashboard.sectionErrors.summary).toMatch(/500/);
    // status still succeeded independently.
    expect(dashboard.status?.known_gap_count).toBe(captured.status.known_gap_count);
  });

  it('throws when every endpoint is unreachable, so the caller renders a full-page error instead of an empty dashboard', async () => {
    globalThis.fetch = rejectingFetch(new Error('network unreachable'));

    await expect(fetchCalyxScienceDashboard()).rejects.toThrow('network unreachable');
  });
});
