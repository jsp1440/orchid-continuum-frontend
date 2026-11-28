// @vitest-environment jsdom
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import FeaturedGenusExperience from './FeaturedGenusExperience';
import { featuredSpecies } from './featuredSpecies';
import type { FeaturedTaxonContinuum } from '@/lib/featuredTaxonContinuum';
import type { GenusMediaItem } from '@/lib/genusMediaResolver';
const { daily, motion } = vi.hoisted(() => ({ daily: { genus: 'Masdevallia', continuum: null as FeaturedTaxonContinuum | null, continuumStatus: 'ready' }, motion: { reduced: false } }));
vi.mock('@/lib/dailyGenusContext', () => ({ useDailyGenus: () => daily }));
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => motion.reduced }));
const photo = (epithet: string, overrides: Partial<GenusMediaItem> = {}): GenusMediaItem => ({ media_id: epithet, genus: 'Masdevallia', scientific_name: `Masdevallia ${epithet}`, taxon_id: null, image_url: `https://example.org/${epithet}.jpg`, thumbnail_url: '', source_name: 'Test source', source_record_url: `https://example.org/records/${epithet}`, license: 'CC BY 4.0', attribution: `Photographer ${epithet}`, media_kind: 'photograph', quality_score: null, ...overrides });
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
let client: QueryClient;
const render = () => act(() => root.render(<QueryClientProvider client={client}><MemoryRouter><FeaturedGenusExperience /></MemoryRouter></QueryClientProvider>));
beforeEach(() => {
  client = new QueryClient(); vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
  vi.useFakeTimers(); motion.reduced = false; daily.genus = 'Masdevallia';
  daily.continuum = { genus: daily.genus, media: { items: ['alba', 'bella', 'caudata', 'densa', 'exigua', 'flava', 'gracilis', 'hirtzii', 'ignea', 'jucunda', 'kimballiana', 'lenta'].map(name => photo(name)) }, relationships: null } as FeaturedTaxonContinuum;
  vi.stubGlobal('IntersectionObserver', class { observe() { this.callback([{ isIntersecting: true }]); } disconnect() {} constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {} });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); client.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('keeps the selected photograph, full source identity, caption and credit synchronized', () => {
  render(); act(() => host.querySelector<HTMLButtonElement>('[aria-label="Study Masdevallia bella"]')!.click());
  expect(host.querySelector('figure img')?.getAttribute('src')).toContain('/bella.jpg');
  expect(host.querySelector('figcaption')?.textContent).toContain('Photographer bella');
  expect(host.querySelector('figcaption a[target="_blank"]')?.getAttribute('href')).toContain('/records/bella');
  expect(host.querySelector('figcaption a[aria-label="Species dossier for Masdevallia bella"]')?.getAttribute('href')).toBe('/species/Masdevallia%20bella?name=Masdevallia%20bella');
  expect(host.querySelector('[aria-label="Study Masdevallia bella"]')).toBeNull();
  act(() => vi.advanceTimersByTime(90_000));
  expect(host.querySelector('figure img')?.getAttribute('src')).toContain('/bella.jpg');
});
it('opens the dossier with the full source name even when the media has a numeric identifier', () => {
  const name = 'Masdevallia rosa-mariae var. minor (A.Smith) B.Jones';
  daily.continuum!.media.items = [photo('alba'), photo('rosa-mariae', { scientific_name: name, taxon_id: '6056' })];
  function Destination() {
    const { slug } = useParams();
    const [query] = useSearchParams();
    return <output>{JSON.stringify([slug, query.get('name'), query.get('dossierCandidate')])}</output>;
  }
  act(() => root.render(<QueryClientProvider client={client}><MemoryRouter><Routes>
    <Route path="/" element={<FeaturedGenusExperience />} />
    <Route path="/species/:slug" element={<Destination />} />
  </Routes></MemoryRouter></QueryClientProvider>));
  const tile = host.querySelector<HTMLAnchorElement>(`a[aria-label="Open dossier for ${name}"]`)!;
  expect(tile.closest('button')).toBeNull();
  act(() => tile.click());
  expect(host.querySelector('output')?.textContent).toBe(JSON.stringify([name, name, '6056']));
});
it('shows the selected photo’s licence and ShareAlike notice, and preserves restricted pictures in both views', () => {
  const deed = 'https://creativecommons.org/licenses/by-sa/4.0/';
  daily.continuum!.media.items = [
    photo('alba', { licence_name: 'CC BY-SA 4.0', licence_url: deed, share_alike_notice: true, unmodified_only: false }),
    photo('bella', { license: 'CC BY-ND', unmodified_only: true }),
  ];
  render();
  expect(host.querySelector('figcaption a[rel~=license]')?.textContent).toBe('CC BY-SA 4.0');
  expect(host.querySelector('figcaption a[rel~=license]')?.getAttribute('href')).toBe(deed);
  expect(host.querySelector('figcaption')?.textContent).toContain('ShareAlike');
  const study = host.querySelector<HTMLButtonElement>('[aria-label="Study Masdevallia bella"]')!;
  expect(host.querySelector<HTMLImageElement>('[aria-label="Open dossier for Masdevallia bella"] img')?.dataset.uncropped).toBe('true');
  act(() => study.click());
  expect(host.querySelector('figure')?.dataset.uncropped).toBe('true');
  expect(host.querySelector('figcaption a[rel~=license]')).toBeNull();
  expect(host.querySelector('figcaption')?.textContent).not.toContain('ShareAlike');
});
it('advances through a moving nine-species window, beyond the first nine', () => {
  render(); for (let i = 0; i < 10; i++) act(() => host.querySelector<HTMLButtonElement>('[aria-label="Next species"]')!.click());
  expect(host.querySelector('[aria-label="Study Masdevallia lenta"]')).not.toBeNull();
  expect(host.querySelector('figure img')?.getAttribute('src')).toContain('/kimballiana.jpg');
  expect(host.querySelector('[aria-label="Study Masdevallia kimballiana"]')).toBeNull();
});
it('rotates after 45 seconds only while visible and respects reduced motion', () => {
  render(); act(() => vi.advanceTimersByTime(45_000));
  expect(host.querySelector('figure img')?.getAttribute('src')).toContain('/bella.jpg');
  motion.reduced = true; render(); act(() => vi.advanceTimersByTime(90_000));
  expect(host.querySelector('figure img')?.getAttribute('src')).toContain('/bella.jpg');
});
it('removes stale genus photos immediately when the canonical genus changes', () => {
  render(); daily.genus = 'Cattleya'; render();
  expect(host.querySelector('figure img')).toBeNull();
  expect(host.textContent).not.toContain('Photographer alba');
  expect(host.querySelector('a')?.getAttribute('href')).toBe('/genus/Cattleya');
});
it('excludes unrelated, unlicensed and duplicate taxa/media without inventing nine species', () => {
  const first = photo('alba');
  const result = featuredSpecies([first, photo('alba', { image_url: 'https://example.org/other.jpg' }), photo('bella', { image_url: first.image_url + '?size=large' }), photo('caudata', { license: null }), photo('other', { genus: 'Cattleya', scientific_name: 'Cattleya other' })], 'Masdevallia');
  expect(result).toEqual([first]);
});

it('removes failed photos and never keeps their credit on another image', () => {
  render(); act(() => host.querySelector('figure img')!.dispatchEvent(new Event('error')));
  expect(host.querySelector('figure img')?.getAttribute('src')).toContain('/bella.jpg');
  expect(host.querySelector('figcaption')?.textContent).toContain('Photographer bella');
  expect(host.querySelector('[aria-label="Study Masdevallia alba"]')).toBeNull();
});
it('keeps observed herbarium-sheet hosts out of the living photograph exhibit', () => {
  expect(featuredSpecies([photo('alba', {image_url: 'https://sweetgum.nybg.org/sheet.jpg'}), photo('bella', {image_url: 'https://d2jcv3kl45hlgi.cloudfront.net/sheet.jpg'})], 'Masdevallia')).toEqual([]);
});

const returned = (name: string, id: number) => ({
  ...photo(name, { media_id: `oc-image:${id}`, taxon_id: String(2000 + id), unmodified_only: true, share_alike_notice: false }),
  backbone_taxon_id: String(8000 + id), identification: { verification: 'source_name' },
});
const page = (items: ReturnType<typeof returned>[], next: string | null) => new Response(JSON.stringify({
  schema: 'oc.featured-genus.species-photo-page.v1', accepted_genus: daily.genus, items, page: { next_cursor: next },
}));
const settle = async () => {
  for (let i = 0; i < 6; i++) await act(async () => { await vi.advanceTimersByTimeAsync(10); });
};
const clickNext = () => act(() => host.querySelector<HTMLButtonElement>('[aria-label="Next species"]')!.click());

it('keeps the current gallery during a sparse traversal, bounds automatic requests and resumes after an empty window', async () => {
  daily.continuum!.media.items = [photo('alba')];
  const seen: (string | null)[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const cursor = new URL(url).searchParams.get('cursor');
    seen.push(cursor);
    if (cursor === 'third') return page([returned('alba', 1), returned('bella', 2), returned('caudata', 3)], null);
    return page([], cursor === null ? 'first' : cursor === 'first' ? 'second' : 'third');
  }));
  render(); await settle();
  expect(seen).toEqual([null, 'first', 'second']);
  expect(host.querySelector('figure img')?.getAttribute('src')).toContain('alba.jpg');
  const more = Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'Continue searching for photographs')!;
  act(() => more.click()); await settle();
  expect(seen).toEqual([null, 'first', 'second', 'third']);
  const nextNames = [];
  for (let i = 0; i < 3; i++) { clickNext(); nextNames.push(host.querySelector('figure img')?.getAttribute('alt')); }
  expect(nextNames).toEqual(['Masdevallia bella', 'Masdevallia caudata', 'Masdevallia alba']);
  expect(host.querySelector('[aria-label="Open dossier for Masdevallia bella"]')?.getAttribute('href')).toContain('dossierCandidate=2002');
});

it('retries after an unavailable route and holds the current working photograph', async () => {
  daily.continuum!.media.items = [photo('alba')];
  let recovered = false;
  vi.stubGlobal('fetch', vi.fn(async () => recovered ? page([returned('bella', 2)], null) : new Response(null, { status: 404 })));
  render(); await settle();
  expect(host.querySelector('figure img')?.getAttribute('alt')).toBe('Masdevallia alba');
  recovered = true;
  const retry = Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'Retry photographs')!;
  act(() => retry.click()); await settle(); clickNext();
  expect(host.querySelector('figcaption')?.textContent).toContain('Photographer bella');
});

it('cancels an old genus page and discards its late photos', async () => {
  let complete!: (response: Response) => void;
  let oldSignal: AbortSignal | undefined;
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    if (String(url).includes('Masdevallia')) {
      oldSignal = init.signal!;
      return new Promise<Response>(resolve => { complete = resolve; });
    }
    return Promise.resolve(page([], null));
  }));
  render(); await settle();
  daily.genus = 'Cattleya'; render(); await settle();
  expect(oldSignal?.aborted).toBe(true);
  complete(page([returned('stale', 1)], null)); await settle();
  expect(host.textContent).not.toContain('Masdevallia');
});

it('retains named hybrids independently from ordinary epithets and species starting with x', () => {
  const items = featuredSpecies([
    photo('hybrid', { scientific_name: 'Masdevallia x alba' }),
    photo('alba'), photo('xanthina'),
  ], 'Masdevallia', true);
  expect(items.map(item => item.scientific_name)).toEqual(['Masdevallia x alba', 'Masdevallia alba', 'Masdevallia xanthina']);
});

// Run against the disposable Calyx/PostgreSQL reference service with its 12 Testlive species.
const nativeFetch = globalThis.fetch;
it.runIf(import.meta.env.VITE_PHOTO_REFERENCE_TEST === 'true')('traverses the reference Calyx API from an empty page through a complete hero cycle', async () => {
  vi.useRealTimers();
  daily.genus = 'Testlive';
  daily.continuum = null;
  const requests: number[] = [];
  vi.stubGlobal('fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    // Node's real HTTP transport and jsdom use distinct AbortSignal classes.
    const { transferableAbortController } = await import('node:util');
    const controller = transferableAbortController();
    if (options?.signal?.aborted) controller.abort();
    options?.signal?.addEventListener('abort', () => controller.abort(), { once: true });
    const response = await nativeFetch(url, { ...options, signal: controller.signal });
    const payload = await response.clone().json();
    requests.push(payload.items.length);
    return response;
  });
  render();
  const waitForName = async (name: string) => {
    for (let tick = 0; tick < 60 && host.querySelector('figure img')?.getAttribute('alt') !== name; tick++) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    }
    expect(host.querySelector('figure img')?.getAttribute('alt'), host.textContent + JSON.stringify(requests)).toBe(name);
  };
  await waitForName('Testlive alba');
  const names = ['bella', 'citrina', 'densa', 'eximia', 'flava', 'grandis', 'humilis', 'ignea', 'jucunda', 'kalina', 'laeta', 'alba'];
  for (const name of names) {
    clickNext();
    await waitForName(`Testlive ${name}`);
  }
  expect(requests).toEqual([0, 10, 2]);
  expect(host.querySelector('figure a')?.getAttribute('href')).toContain('dossierCandidate=95500');
  expect(host.querySelector('figcaption')?.textContent).toContain('Rights holder');
});
