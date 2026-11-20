// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
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
const render = () => act(() => root.render(<MemoryRouter><FeaturedGenusExperience /></MemoryRouter>));
beforeEach(() => {
  vi.useFakeTimers(); motion.reduced = false; daily.genus = 'Masdevallia';
  daily.continuum = { genus: daily.genus, media: { items: ['alba', 'bella', 'caudata', 'densa', 'exigua', 'flava', 'gracilis', 'hirtzii', 'ignea', 'jucunda', 'kimballiana', 'lenta'].map(name => photo(name)) }, relationships: null } as FeaturedTaxonContinuum;
  vi.stubGlobal('IntersectionObserver', class { observe() { this.callback([{ isIntersecting: true }]); } disconnect() {} constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {} });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('keeps the selected photograph, full source identity, caption and credit synchronized', () => {
  render(); act(() => host.querySelector<HTMLButtonElement>('[aria-label="Study Masdevallia bella"]')!.click());
  expect(host.querySelector('figure img')?.getAttribute('src')).toContain('/bella.jpg');
  expect(host.querySelector('figcaption')?.textContent).toContain('Photographer bella');
  expect(host.querySelector('figcaption a')?.getAttribute('href')).toContain('/records/bella');
  expect(host.querySelector('[aria-pressed=true]')?.getAttribute('aria-label')).toBe('Study Masdevallia bella');
  act(() => vi.advanceTimersByTime(90_000));
  expect(host.querySelector('figure img')?.getAttribute('src')).toContain('/bella.jpg');
});
it('advances through a moving nine-species window, beyond the first nine', () => {
  render(); for (let i = 0; i < 10; i++) act(() => host.querySelector<HTMLButtonElement>('[aria-label="Next species"]')!.click());
  expect(host.querySelectorAll('.recovery-species-grid button')).toHaveLength(9);
  expect(host.querySelector('figure img')?.getAttribute('src')).toContain('/kimballiana.jpg');
  expect(host.querySelector('[aria-label="Study Masdevallia kimballiana"]')).not.toBeNull();
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
