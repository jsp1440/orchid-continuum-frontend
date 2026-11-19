// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeaturedTaxonContinuum } from './featuredTaxonContinuum';

const mocks = vi.hoisted(() => ({ single: vi.fn(), fetch: vi.fn(), genus: 'Cattleya' }));
vi.mock('@/lib/featuredGenus', () => ({
  featuredGenusName: () => mocks.genus,
  msUntilNextRotation: () => 60_000,
}));
vi.mock('@/lib/featuredTaxonContinuum', () => ({ fetchFeaturedTaxonContinuum: mocks.fetch }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }) } }));
vi.stubEnv('VITE_ENABLE_DAILY_GENUS_SNAPSHOT', 'true');
const { DailyGenusProvider, useDailyGenus } = await import('./dailyGenusContext');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type Snapshot = { data: { genus: string } | null; error: null };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function State() {
  const { genus, continuumStatus } = useDailyGenus();
  return <p>{genus}:{continuumStatus}</p>;
}
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.genus = 'Cattleya';
  mocks.fetch.mockImplementation(async (genus: string) => ({ genus }) as FeaturedTaxonContinuum);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
afterAll(() => vi.unstubAllEnvs());
async function mount() {
  await act(async () => { root.render(<DailyGenusProvider><State /></DailyGenusProvider>); });
}
async function resume() {
  await act(async () => { window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
}

describe('Featured Genus refresh ordering', () => {
  it.each(['success', 'failure'])('keeps the newer snapshot when an older snapshot settles with %s', async (outcome) => {
    const old = deferred<Snapshot>();
    mocks.single.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ data: { genus: 'Vanilla' }, error: null });
    await mount();
    await resume();
    expect(container.textContent).toBe('Vanilla:ready');
    await act(async () => {
      if (outcome === 'success') old.resolve({ data: { genus: 'Laelia' }, error: null });
      else old.reject(new Error('old snapshot unavailable'));
    });
    expect(container.textContent).toBe('Vanilla:ready');
    expect(mocks.fetch.mock.calls.map(([genus]) => genus)).toEqual(['Vanilla']);
  });

  it('ignores an older hydration that completes after a newer refresh', async () => {
    const old = deferred<FeaturedTaxonContinuum>();
    mocks.single.mockResolvedValueOnce({ data: { genus: 'Laelia' }, error: null })
      .mockResolvedValueOnce({ data: { genus: 'Vanilla' }, error: null });
    mocks.fetch.mockReturnValueOnce(old.promise);
    await mount();
    await resume();
    await act(async () => { old.resolve({ genus: 'Laelia' } as FeaturedTaxonContinuum); });
    expect(container.textContent).toBe('Vanilla:ready');
  });

  it('does not start hydration after the provider unmounts', async () => {
    const pending = deferred<Snapshot>();
    mocks.single.mockReturnValueOnce(pending.promise);
    await mount();
    act(() => root.render(null));
    await act(async () => { pending.resolve({ data: { genus: 'Laelia' }, error: null }); });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('initializes a later mount with the current rotation identity', async () => {
    mocks.genus = 'Vanilla';
    mocks.single.mockReturnValueOnce(new Promise(() => undefined));
    await mount();
    expect(container.textContent).toBe('Vanilla:loading');
  });
});
