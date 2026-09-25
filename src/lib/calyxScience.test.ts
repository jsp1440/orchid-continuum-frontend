import { describe, it, expect, vi, afterEach } from 'vitest';
import { mockFetchSequence, rejectingFetch } from './testing/fetchMock';
import { fetchCalyxScienceDashboard } from './calyxScience';

// fetchCalyxScienceDashboard fires eight independent /api/science/* requests
// in this fixed declaration order: summary, status, departments, gaps,
// datasets, missions, harvesters, dossiers. Promise.allSettled starts every
// readJson() call synchronously before the first await, so a fetch double
// that replays responses by call order lines up with that order.
const ALL_OK = [
  { ok: true, body: { status: 'ok', mode: 'live', department_count: 3 } },
  { ok: true, body: { status: 'ok', mode: 'live', known_gap_count: 2 } },
  { ok: true, body: { departments: [{ department_id: 'd1', display_name: 'Taxonomy', priority: 90, enabled: true }] } },
  { ok: true, body: { gaps: [{ gap_id: 'g1', department_id: 'd1', priority: 80, gap_type: 'coverage', summary: 'missing dossier' }] } },
  { ok: true, body: { datasets: [] } },
  { ok: true, body: { missions: [] } },
  { ok: true, body: { harvesters: [] } },
  { ok: true, body: { candidates: [] } },
];

describe('fetchCalyxScienceDashboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns every section with no sectionErrors when all eight endpoints succeed', async () => {
    globalThis.fetch = mockFetchSequence(ALL_OK);

    const dashboard = await fetchCalyxScienceDashboard();

    expect(dashboard.sectionErrors).toEqual({});
    expect(dashboard.summary?.department_count).toBe(3);
    expect(dashboard.status?.known_gap_count).toBe(2);
    expect(dashboard.departments).toHaveLength(1);
    expect(dashboard.gaps).toHaveLength(1);
  });

  it('marks a failed endpoint as unavailable instead of fabricating an empty result for it', async () => {
    const responses = [...ALL_OK];
    responses[6] = { ok: false, status: 503, body: {} }; // harvesters endpoint down

    globalThis.fetch = mockFetchSequence(responses);

    const dashboard = await fetchCalyxScienceDashboard();

    expect(dashboard.sectionErrors.harvesters).toMatch(/503/);
    expect(dashboard.harvesters).toEqual([]);
    // The other seven sections are unaffected by the one failure.
    expect(dashboard.sectionErrors.departments).toBeUndefined();
    expect(dashboard.departments).toHaveLength(1);
    expect(dashboard.summary?.department_count).toBe(3);
  });

  it('records sectionErrors for summary/status separately so counts are not silently dropped to zero', async () => {
    const responses = [...ALL_OK];
    responses[0] = { ok: false, status: 500, body: {} }; // summary endpoint down

    globalThis.fetch = mockFetchSequence(responses);

    const dashboard = await fetchCalyxScienceDashboard();

    expect(dashboard.summary).toBeNull();
    expect(dashboard.sectionErrors.summary).toMatch(/500/);
    // status still succeeded independently.
    expect(dashboard.status?.known_gap_count).toBe(2);
  });

  it('throws when every endpoint is unreachable, so the caller renders a full-page error instead of an empty dashboard', async () => {
    globalThis.fetch = rejectingFetch(new Error('network unreachable'));

    await expect(fetchCalyxScienceDashboard()).rejects.toThrow('network unreachable');
  });
});
