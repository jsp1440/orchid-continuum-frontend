import { afterEach, describe, expect, it, vi } from 'vitest';
import { universityApi } from './universityApi';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('University session discovery API', () => {
  it('sends learner bearer identity and bounded pagination parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [], next_cursor: null, has_more: false }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await universityApi.listSessions('learner-token', 'cursor-value', 10);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/learning/sessions?');
    expect(String(url)).toContain('limit=10');
    expect(String(url)).toContain('cursor=cursor-value');
    expect(init.headers.Authorization).toBe('Bearer learner-token');
    expect(init.method).toBe('GET');
  });

  it('does not reuse learner identity on public University requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await universityApi.catalog();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });
});
