// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HeroOrchid from './HeroOrchid';
const { daily } = vi.hoisted(() => ({ daily: { current: {} as { genus: string; continuumStatus: string; continuum: { media: { items: { scientific_name: string; image_url: string; source_name: string; license: string; attribution: string | null; media_id: string }[] } } } } }));
vi.mock('@/lib/dailyGenusContext', () => ({ useDailyGenus: () => daily.current }));
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => false }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const media = (name: string, url: string) => ({ scientific_name: name, image_url: url, source_name: 'Fixture source', license: 'CC-BY', attribution: name, media_id: url });
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => { vi.useFakeTimers(); daily.current = { genus: 'Alpha', continuumStatus: 'ready', continuum: { media: { items: [media('Alpha first', 'https://content.eol.org./blocked.jpg'), media('Alpha second', 'https://images.invalid/a.jpg'), media('Alpha third', 'https://images.invalid/b.jpg')] } } }; host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); });
const render = (props = {}) => act(() => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><HeroOrchid {...props} /></MemoryRouter>));
const image = () => host.querySelector('img')!;
const load = () => act(() => image().dispatchEvent(new Event('load')));
it('skips blocked first media and preserves that photograph’s identity and source', () => { render(); expect(image().src).toBe('https://images.invalid/a.jpg'); expect(host.textContent).toContain('Alpha second'); expect(host.textContent).toContain('Photographer: Alpha second'); });
it.each([null, '   '])('prefers a credited photo over an observation with attribution %j', (attribution) => {
  const credited = { ...media('Alpha', 'https://images.invalid/credited.jpg'), attribution: '  Fixture photographer  ' };
  daily.current.continuum.media.items = [
    { ...media('Alpha observed', 'https://static.inaturalist.org/photos/123/observation.jpg'), attribution },
    credited,
  ];

  render();
  expect(image().src).toBe(credited.image_url);
  expect(host.textContent).toContain('Photographer: Fixture photographer');
});
it('advances on actual image failure and withholds the resolved species until load', () => { const resolved = vi.fn(); render({ onSpeciesResolved: resolved }); expect(resolved).toHaveBeenLastCalledWith(null); act(() => image().dispatchEvent(new Event('error'))); expect(image().src).toBe('https://images.invalid/b.jpg'); load(); expect(resolved).toHaveBeenLastCalledWith('Alpha third'); });
it('does not leave a stalled image forever', () => { render(); act(() => vi.advanceTimersByTime(9000)); expect(image().src).toBe('https://images.invalid/b.jpg'); act(() => vi.advanceTimersByTime(9000)); expect(host.querySelector('img')).toBeNull(); expect(host.textContent).toContain('could not be loaded'); });
it('rotates a successfully loaded photograph after 45 seconds, with a pause control', () => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); render(); load(); act(() => vi.advanceTimersByTime(45000)); expect(image().src).toBe('https://images.invalid/b.jpg'); load(); act(() => [...host.querySelectorAll('button')].find(e => e.textContent === 'Pause photographs')!.click()); act(() => vi.advanceTimersByTime(45000)); expect(image().src).toBe('https://images.invalid/b.jpg'); });
it('manual next pauses automatic rotation', () => { render(); act(() => host.querySelector<HTMLButtonElement>('[aria-label="Next orchid photograph"]')!.click()); load(); act(() => vi.advanceTimersByTime(45000)); expect(image().src).toBe('https://images.invalid/b.jpg'); expect(host.textContent).toContain('Resume photographs'); });
it('clears failures and old identity when the featured genus changes', () => { render(); act(() => image().dispatchEvent(new Event('error'))); daily.current = { ...daily.current, genus: 'Beta', continuum: { media: { items: [media('Beta new', 'https://images.invalid/a.jpg')] } } }; render(); expect(image().alt).toContain('Beta new'); expect(image().src).toBe('https://images.invalid/a.jpg'); expect(host.textContent).not.toContain('Alpha third'); });
