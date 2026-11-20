// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenusEntry } from '@/lib/genusData';
import GenusTeaser from './GenusTeaser';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ daily: vi.fn(), invoke: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('@/lib/genusData', async () => {
  const actual = await vi.importActual<typeof import('@/lib/genusData')>('@/lib/genusData');
  return {
    ...actual,
    genusForToday: () => ({ genus: 'Alpha', family: 'Orchidaceae', tribe: 'Test', speciesCount: 1, regions: [] }),
    fetchDailyGenus: mocks.daily,
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const beta = { genus: 'Beta', family: 'Orchidaceae', tribe: 'Test', speciesCount: 2, regions: [] } as unknown as GenusEntry;
const image = (genus: string) => ({ scientific_name: `${genus} floribunda`, image_url: `https://photos.example/${genus}.jpg` });
const response = (genus: string) => ({ ok: true, json: async () => ({ images: [image(genus)] }) }) as Response;

describe('GenusTeaser request isolation through the real public resolver', () => {
  let host: HTMLDivElement;
  let root: Root;
  let daily: ReturnType<typeof deferred<GenusEntry>>;

  beforeEach(() => {
    localStorage.clear();
    mocks.invoke.mockReset();
    mocks.daily.mockReset();
    daily = deferred<GenusEntry>();
    mocks.daily.mockReturnValue(daily.promise);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function render() {
    await act(async () => { root.render(<GenusTeaser />); });
  }

  function expectBetaImage() {
    expect(host.querySelector('h2')?.textContent).toBe('Beta');
    expect(host.querySelector('img')?.src).toBe('https://photos.example/Beta.jpg');
    expect(host.querySelector('img')?.alt).toBe('Beta');
  }

  it('keeps the current photo when the previous genus server-cache fallback settles late', async () => {
    const cache = deferred<{ data: { images: ReturnType<typeof image>[] }; error: null }>();
    mocks.invoke.mockReturnValue(cache.promise);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/Alpha?') ? ({ ok: false } as Response) : response('Beta')));
    await render();
    expect(mocks.invoke).toHaveBeenCalledWith('genus-images', { body: { action: 'get', genus: 'Alpha', limit: 5 } });
    await act(async () => daily.resolve(beta));
    expectBetaImage();
    await act(async () => cache.resolve({ data: { images: [image('Alpha')] }, error: null }));
    expectBetaImage();
  });

  it('keeps the current request loading when the aborted previous HTTP request settles', async () => {
    const pendingBeta = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/Beta?')) return pendingBeta.promise;
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    }));
    await render();
    await act(async () => daily.resolve(beta));
    expect(host.querySelector('.animate-pulse')).not.toBeNull();
    expect(host.querySelector('h2')?.textContent).toBe('Beta');
    expect(host.querySelector('img')).toBeNull();
    await act(async () => pendingBeta.resolve(response('Beta')));
    expectBetaImage();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('ignores an old successful HTTP body that completes after the current image', async () => {
    const alphaBody = deferred<{ images: ReturnType<typeof image>[] }>();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/Alpha?')
      ? ({ ok: true, json: () => alphaBody.promise } as Response)
      : response('Beta')));
    await render();
    await act(async () => daily.resolve(beta));
    expectBetaImage();
    await act(async () => alphaBody.resolve({ images: [image('Alpha')] }));
    expectBetaImage();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('renders a healthy current request through the real resolver', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response('Alpha')));
    await render();
    expect(host.querySelector('h2')?.textContent).toBe('Alpha');
    expect(host.querySelector('img')?.src).toBe('https://photos.example/Alpha.jpg');
    expect(host.querySelector('.animate-pulse')).toBeNull();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('keeps the genus visible and moves to the cache after both image endpoints stall', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    mocks.invoke.mockResolvedValue({ data: { images: [image('Alpha')] }, error: null });

    await render();
    expect(host.querySelector('h2')?.textContent).toBe('Alpha');
    expect(host.querySelector('img')).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(7000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.invoke).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(7000));
    expect(mocks.invoke).toHaveBeenCalledWith('genus-images', { body: { action: 'get', genus: 'Alpha', limit: 5 } });
    expect(host.querySelector('img')?.src).toBe('https://photos.example/Alpha.jpg');
    expect(host.querySelector('.animate-pulse')).toBeNull();
  });
});
