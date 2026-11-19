import { afterEach, describe, expect, it, vi } from 'vitest';

import { CALYX_BACKEND_UNREACHABLE, describeWorkspaceLoadFailures, loadCalyxWorkspace } from './calyxWorkspace';
import { fetchReasoningMap, isReasoningMapFailure } from './cognitiveIntegration';

/**
 * Release 1 journey 14: with the backend down, /speak-with-calyx printed
 * "TypeError: Failed to fetch" three times under "Degraded connections" and
 * "Failed to fetch" under the reasoning map. That is browser transport text:
 * it tells a visitor nothing and reads as a crash.
 *
 * The visitor must be told, honestly, that the Calyx backend could not be
 * reached — and nothing technical (exception class, browser error string,
 * HTTP status line) may reach the page.
 */

const RAW = /TypeError|Failed to fetch|NetworkError|Load failed|HTTP \d{3}|\b50\d\b|Parallel platform request failed/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Calyx workspace load failures', () => {
  it('names an unreachable backend once, without exception text', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    const snapshot = await loadCalyxWorkspace();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(snapshot.errors).toHaveLength(1);
    expect(snapshot.errors[0]).toContain(CALYX_BACKEND_UNREACHABLE);
    expect(snapshot.errors[0]).toMatch(/platform capabilities, the homepage document and orchestrator status could not be loaded/);
    expect(snapshot.errors.join(' ')).not.toMatch(RAW);
    expect(snapshot.orchestratorState).toBe('unavailable');
    expect(snapshot.capabilities).toBeNull();
  });

  it('reports a server failure as unavailable without the status line', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Internal Server Error\nTraceback (most recent call last)', { status: 503 })));
    const snapshot = await loadCalyxWorkspace();
    expect(snapshot.errors).toEqual([
      'Platform capabilities could not be loaded from the Calyx backend right now.',
      'The homepage document could not be loaded from the Calyx backend right now.',
      'Orchestrator status could not be loaded from the Calyx backend right now.',
    ]);
    expect(snapshot.errors.join(' ')).not.toMatch(RAW);
    expect(snapshot.errors.join(' ')).not.toMatch(/Traceback/);
  });

  it('keeps an owner-authentication answer out of the degraded list', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (
      String(url).endsWith('/brain/orchestrator/status')
        ? new Response('{}', { status: 401 })
        : new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    )));
    const snapshot = await loadCalyxWorkspace();
    expect(snapshot.errors).toEqual([]);
    expect(snapshot.orchestratorState).toBe('authentication_required');
  });

  it('combines a partial outage honestly', () => {
    expect(describeWorkspaceLoadFailures([
      { source: 'orchestrator status', failure: 'unreachable' },
      { source: 'the homepage document', failure: 'unavailable' },
    ])).toEqual([
      `${CALYX_BACKEND_UNREACHABLE} — orchestrator status could not be loaded. Check your connection or try again in a moment.`,
      'The homepage document could not be loaded from the Calyx backend right now.',
    ]);
    expect(describeWorkspaceLoadFailures([])).toEqual([]);
  });
});

describe('reasoning map when the backend is unreachable', () => {
  it('says the backend is unreachable instead of echoing the fetch error', async () => {
    const result = await fetchReasoningMap('Any question', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch);
    expect(isReasoningMapFailure(result)).toBe(true);
    if (!isReasoningMapFailure(result)) return;
    expect(result.kind).toBe('network');
    expect(result.message).toContain(CALYX_BACKEND_UNREACHABLE);
    expect(result.message).not.toMatch(RAW);
  });
});
