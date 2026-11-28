// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { featuredGenusName, WINDOW_MS } from './featuredGenus';

const midnight = Date.UTC(2026, 10, 29);
const current = featuredGenusName(midnight - 1);
const next = featuredGenusName(midnight);
const lead = 5 * 60_000;
const resolveSnapshot = vi.hoisted(() => vi.fn<(date: string) => string | null>());
vi.mock('./supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: (_column: string, date: string) => ({
    abortSignal: () => ({ single: async () => ({ data: { snapshot_date: date, genus: resolveSnapshot(date) } }) }),
  }) }) }) },
}));

const requests: string[] = [];
const photographs: string[] = [];
let failure: 'wrong-genus' | 'unbound-evidence' | 'wrong-evidence-genus' | 'unbound-media' | 'taxonomy' | 'evidence' | 'media' | 'photo' | 'pending' | 'live-only-photo' | null;

function response(input: RequestInfo | URL) {
  const url = new URL(String(input));
  const genus = url.searchParams.get('genus') || url.pathname.split('/').pop()!;
  requests.push(genus);
  const broken = genus === next ? failure : null;
  if (url.pathname.startsWith('/api/media/genus/')) {
    const image = `https://images.example/${genus}.jpg`;
    return Response.json({
      status: 'ok', requested_genus: genus, accepted_genus: broken === 'unbound-media' ? null : genus,
      items: [...(broken === 'live-only-photo' ? [{ scientific_name: genus + ' bella', genus,
        image_url: 'https://d2jcv3kl45hlgi.cloudfront.net/cover.jpg', source_name: 'Archive',
        license: 'CC BY', attribution: 'Photographer' }] : []), { scientific_name: `${genus} alba`, genus, image_url: image, source_name: 'Specimen archive',
        license: broken === 'media' ? null : 'CC BY', attribution: 'Photographer' }],
    });
  }
  if (url.pathname.startsWith('/api/knowledge-graph/genus/')) {
    return Response.json({ focal_node: { label: broken === 'wrong-genus' ? 'Vanilla' : genus },
      graph: { node_count: 2, edge_count: 1 }, pagination: { truncated: false, next_offset: null },
      domain_coverage: { taxonomy: { nodes: broken === 'taxonomy' ? 0 : 2, edges: 0 } } });
  }
  if (url.pathname === '/api/continuum/graph') {
    const reported = broken === 'unbound-evidence' ? {} : { genus: broken === 'wrong-evidence-genus' ? 'Vanilla' : genus };
    return Response.json({ ...reported, nodes: broken === 'evidence' ? {} : {
      fungi: { status: 'empty', source: 'curated source', count: 0 },
    } });
  }
  return new Response(null, { status: 404 });
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(midnight - lead - 1000);
  vi.stubEnv('VITE_ENABLE_DAILY_GENUS_SNAPSHOT', 'false');
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  requests.length = photographs.length = 0;
  failure = null;
  resolveSnapshot.mockReset();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => response(input)));
  vi.stubGlobal('Image', class {
    naturalWidth = 640;
    naturalHeight = 480;
    onload?: () => void;
    onerror?: () => void;
    removeAttribute = vi.fn();
    set src(url: string) {
      photographs.push(url);
      if (failure === 'pending') return;
      void Promise.resolve().then(() => (failure === 'photo' || url.includes('cloudfront.net')) ? this.onerror?.() : this.onload?.());
    }
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function mount() {
  const { DailyGenusProvider, useDailyGenus } = await import('./dailyGenusContext');
  const displays: string[] = [];
  function Consumer() {
    const { genus, continuum, continuumStatus } = useDailyGenus();
    displays.push([genus, continuum?.genus || '', continuumStatus].join('/'));
    return <output>{displays[displays.length - 1]}</output>;
  }
  const view = render(<DailyGenusProvider><Consumer /></DailyGenusProvider>);
  await act(async () => {});
  return { view, displays };
}

async function advance(time: number) {
  await act(() => vi.advanceTimersByTimeAsync(time));
}

it('loads next-window taxonomy, relationship evidence and the usable photo before midnight, then swaps atomically', async () => {
  const { view, displays } = await mount();
  expect(view.container.textContent).toBe(`${current}/${current}/ready`);
  await advance(1000);
  expect(requests.filter(name => name === next)).toHaveLength(3);
  expect(photographs).toEqual([`https://images.example/${next}.jpg`]);
  expect(view.container.textContent).toBe(`${current}/${current}/ready`);
  await advance(lead);
  expect(view.container.textContent).toBe(`${next}/${next}/ready`);
  expect(requests.filter(name => name === next)).toHaveLength(3);
  expect(displays.slice(1)).not.toContain(`${next}//loading`);
});

it.each(['wrong-genus', 'taxonomy', 'evidence', 'unbound-evidence', 'wrong-evidence-genus', 'unbound-media', 'media', 'photo'] as const)(
  'retains the working exhibit for %s failure and bounds the retry across focus events', async (problem) => {
    const { view } = await mount();
    failure = problem;
    await advance(1000 + lead);
    const calls = requests.length;
    await act(async () => {
      window.dispatchEvent(new Event('pageshow'));
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(requests).toHaveLength(calls);
    expect(requests.filter(name => name === next)).toHaveLength(6);
    expect(view.container.textContent).toBe(`${current}/${current}/ready`);
  },
);

it('validates both mounted homepage hero projections when they rank different records first', async () => {
  const { view } = await mount();
  failure = 'live-only-photo';
  await advance(1000 + lead);
  expect(photographs.filter(url => url.includes('cloudfront.net'))).toHaveLength(2);
  expect(photographs.filter(url => url.includes('images.example'))).toHaveLength(2);
  expect(view.container.textContent).toBe(`${current}/${current}/ready`);
});

it('uses the single boundary attempt to recover a headline photo that failed during preparation', async () => {
  const { view } = await mount();
  failure = 'photo';
  await advance(1000);
  expect(view.container.textContent).toBe(`${current}/${current}/ready`);
  failure = null;
  await advance(lead);
  expect(view.container.textContent).toBe(`${next}/${next}/ready`);
  expect(requests.filter(name => name === next)).toHaveLength(6);
});

it('bounds a stalled photo at preload and rollover without clearing the current exhibit', async () => {
  const { view } = await mount();
  failure = 'pending';
  await advance(1000 + lead + 10_001);
  expect(photographs).toHaveLength(2);
  expect(view.container.textContent).toBe(`${current}/${current}/ready`);
});

it('rechecks the new date’s snapshot and discards the stale prepared genus', async () => {
  vi.stubEnv('VITE_ENABLE_DAILY_GENUS_SNAPSHOT', 'true');
  resolveSnapshot.mockImplementation(date => date.endsWith('28') ? 'Vanilla' : 'Cattleya');
  const { view } = await mount();
  await advance(1000);
  expect(photographs).toEqual(['https://images.example/Cattleya.jpg']);
  resolveSnapshot.mockReturnValue('Paphiopedilum');
  await advance(lead);
  expect(view.container.textContent).toBe('Paphiopedilum/Paphiopedilum/ready');
  expect(resolveSnapshot.mock.calls.map(([date]) => date)).toEqual(['2026-11-28', '2026-11-29', '2026-11-29']);
});

it('drops a missed window on resume and aborts unfinished image work on unmount', async () => {
  const { view } = await mount();
  failure = 'pending';
  await advance(1000);
  vi.setSystemTime(midnight + WINDOW_MS + 50);
  failure = null;
  await act(async () => { window.dispatchEvent(new Event('pageshow')); });
  const later = featuredGenusName(Date.now());
  expect(view.container.textContent).toBe(`${later}/${later}/ready`);
  vi.setSystemTime(midnight + 2 * WINDOW_MS - lead + 50);
  failure = 'pending';
  await act(async () => { window.dispatchEvent(new Event('pageshow')); });
  const calls = requests.length;
  view.unmount();
  await advance(WINDOW_MS);
  expect(requests).toHaveLength(calls);
  expect(vi.getTimerCount()).toBe(0);
});

it('cancels pending media, taxonomy and relationship requests when the provider unmounts', async () => {
  const { view } = await mount();
  const signals: AbortSignal[] = [];
  vi.stubGlobal('fetch', (_url: RequestInfo | URL, init: RequestInit) => new Promise<Response>((_, reject) => {
    const signal = init.signal!;
    signals.push(signal);
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  await advance(1000);
  expect(signals).toHaveLength(3);
  view.unmount();
  await advance(lead);
  expect(signals.every(signal => signal.aborted)).toBe(true);
  expect(signals).toHaveLength(3);
});
