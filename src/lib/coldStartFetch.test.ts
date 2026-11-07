import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithColdStartRetry } from './coldStartFetch';

const FAST = { timeoutMs: 20, retryTimeoutMs: 60, retryDelayMs: 1 };

function hang(_input: unknown, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    );
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchWithColdStartRetry', () => {
  it('returns the first response without retrying when it arrives in time', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const res = await fetchWithColdStartRetry('https://api.test/x', {}, undefined, FAST);
    expect(res?.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('retries once after a timeout and returns the slow backend answer', async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(hang)
      .mockImplementationOnce(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const res = await fetchWithColdStartRetry('https://api.test/x', {}, undefined, FAST);
    expect(res?.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('retries a gateway status (cold start) but not other HTTP statuses', async () => {
    const gateway = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', gateway);
    expect((await fetchWithColdStartRetry('https://api.test/x', {}, undefined, FAST))?.status).toBe(200);
    expect(gateway).toHaveBeenCalledTimes(2);

    const notFound = vi.fn(async () => new Response('', { status: 404 }));
    vi.stubGlobal('fetch', notFound);
    expect((await fetchWithColdStartRetry('https://api.test/x', {}, undefined, FAST))?.status).toBe(404);
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it('fails closed with null after two attempts produce no response', async () => {
    const fetcher = vi.fn(hang);
    vi.stubGlobal('fetch', fetcher);
    expect(await fetchWithColdStartRetry('https://api.test/x', {}, undefined, FAST)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('returns the last gateway response when both attempts are 502/503/504', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 502 }));
    vi.stubGlobal('fetch', fetcher);
    expect((await fetchWithColdStartRetry('https://api.test/x', {}, undefined, FAST))?.status).toBe(502);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('never retries after the caller aborts', async () => {
    const fetcher = vi.fn(hang);
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    const pending = fetchWithColdStartRetry('https://api.test/x', {}, controller.signal, {
      ...FAST,
      timeoutMs: 1_000,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
