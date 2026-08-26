// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyGenusState } from '@/lib/dailyGenusContext';
import type { GenusMediaItem } from '@/lib/genusMediaResolver';

// React 18 needs this flag before act() drives updates outside a test runner
// that sets it automatically.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  useDailyGenus: vi.fn(),
}));

vi.mock('@/lib/dailyGenusContext', () => ({
  useDailyGenus: mocks.useDailyGenus,
}));

const { default: DailyGenusFeatureContinuum } = await import(
  '@/components/orchid/DailyGenusFeatureContinuum'
);

function mediaItem(overrides: Partial<GenusMediaItem>): GenusMediaItem {
  return {
    media_id: overrides.image_url ?? 'media',
    taxon_id: null,
    scientific_name: 'Cattleya labiata Lindl.',
    genus: 'Cattleya',
    image_url: 'https://cdn.example.test/a.jpg',
    thumbnail_url: '',
    source_name: 'Continuum approved library',
    source_record_url: null,
    license: 'CC BY 4.0',
    attribution: null,
    media_kind: 'photograph',
    quality_score: null,
    ...overrides,
  };
}

function state(overrides: Partial<DailyGenusState>): DailyGenusState {
  return {
    genus: 'Cattleya',
    continuum: null,
    continuumStatus: 'ready',
    diagnostic: null,
    ...overrides,
  };
}

function continuumWithMedia(items: GenusMediaItem[]) {
  return {
    genus: 'Cattleya',
    media: {
      status: 'ok' as const,
      requested_genus: 'Cattleya',
      accepted_genus: 'Cattleya',
      generated_at: null,
      items,
      summary: { eligible_count: items.length, returned_count: items.length, exclusion_counts: {} },
    },
    graph: { status: 'unavailable' as const },
    relationships: null,
    domains: [],
    conservation: { state: 'unavailable' as const, nodes: null, edges: null, relationship: null },
    gaps: [],
  };
}

let container: HTMLDivElement;
let root: Root;

function render() {
  act(() => {
    root.render(
      <MemoryRouter>
        <DailyGenusFeatureContinuum />
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('DailyGenusFeatureContinuum media integrity', () => {
  it('shows each species once and each photograph once in the representative strip', () => {
    mocks.useDailyGenus.mockReturnValue(
      state({
        continuum: continuumWithMedia([
          mediaItem({ image_url: 'https://cdn.example.test/hero.jpg' }),
          // Same species, different photograph — must not take a second tile.
          mediaItem({
            image_url: 'https://cdn.example.test/labiata-2.jpg',
            scientific_name: 'Cattleya labiata',
          }),
          // Same photograph as the hero under a different query string.
          mediaItem({
            image_url: 'https://cdn.example.test/hero.jpg?w=400',
            scientific_name: 'Cattleya mossiae',
          }),
          mediaItem({
            image_url: 'https://cdn.example.test/trianae.jpg',
            scientific_name: 'Cattleya trianae Linden & Rchb.f.',
          }),
        ]) as never,
      }),
    );
    render();

    const tiles = Array.from(container.querySelectorAll('li img')) as HTMLImageElement[];
    expect(tiles.map((img) => img.getAttribute('src'))).toEqual([
      'https://cdn.example.test/trianae.jpg',
    ]);
  });

  it('normalises displayed names to genus + epithet and keeps authorship as provenance', () => {
    mocks.useDailyGenus.mockReturnValue(
      state({ continuum: continuumWithMedia([mediaItem({})]) as never }),
    );
    render();

    expect(container.textContent).toContain('Cattleya labiata');
    expect(container.querySelector('figcaption p')?.textContent).toBe('Cattleya labiata');
    expect(container.textContent).toContain('Recorded as Cattleya labiata Lindl.');
  });

  it('drops a broken photograph from the page and yields to the next approved one', () => {
    mocks.useDailyGenus.mockReturnValue(
      state({
        continuum: continuumWithMedia([
          mediaItem({ image_url: 'https://cdn.example.test/broken.jpg' }),
          mediaItem({
            image_url: 'https://cdn.example.test/working.jpg',
            scientific_name: 'Cattleya trianae',
          }),
        ]) as never,
      }),
    );
    render();

    const hero = container.querySelector('figure img') as HTMLImageElement;
    expect(hero.getAttribute('src')).toBe('https://cdn.example.test/broken.jpg');

    act(() => {
      hero.dispatchEvent(new Event('error', { bubbles: false }));
    });

    // The failed URL is gone from the DOM, so no browser broken-image icon can
    // survive, and the next APPROVED photograph takes the slot — nothing was
    // fetched from outside the Continuum media contract.
    const remaining = Array.from(container.querySelectorAll('img')).map((img) =>
      img.getAttribute('src'),
    );
    expect(remaining).not.toContain('https://cdn.example.test/broken.jpg');
    expect(container.querySelector('figure img')?.getAttribute('src')).toBe(
      'https://cdn.example.test/working.jpg',
    );
  });

  it('falls back to the explicit no-photograph state when every approved image fails', () => {
    mocks.useDailyGenus.mockReturnValue(
      state({
        continuum: continuumWithMedia([
          mediaItem({ image_url: 'https://cdn.example.test/only-broken.jpg' }),
        ]) as never,
      }),
    );
    render();

    act(() => {
      (container.querySelector('figure img') as HTMLImageElement).dispatchEvent(
        new Event('error', { bubbles: false }),
      );
    });

    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.textContent).toContain('No approved Continuum photograph available');
    expect(container.textContent).toContain('will not substitute an uncontrolled third-party image');
  });
});

describe('DailyGenusFeatureContinuum evidence states', () => {
  it('does not claim a knowledge gap when the evidence service did not answer', () => {
    mocks.useDailyGenus.mockReturnValue(
      state({ continuum: null, continuumStatus: 'unavailable' }),
    );
    render();

    expect(container.textContent).toContain('Evidence unavailable');
    expect(container.textContent).toContain('The Continuum evidence service did not respond');
    expect(container.textContent).not.toContain('knowledge gap');
  });

  it('reports linked relationships as available evidence, scoped to the genus', () => {
    mocks.useDailyGenus.mockReturnValue(
      state({
        continuum: {
          ...continuumWithMedia([]),
          relationships: {
            genus: 'Cattleya',
            speciesCount: null,
            description: '',
            isFallback: false,
            fungi: { count: 3, summary: '3 partnerships', items: ['Tulasnella'], hasData: true },
            pollinators: { count: null, summary: 'No data yet', items: [], hasData: false },
            climate: { count: null, summary: 'No data yet', items: [], hasData: false },
            geography: { count: null, summary: 'No data yet', items: [], hasData: false },
            conservation: { count: null, summary: 'No data yet', items: [], hasData: false },
            cultivation: { count: null, summary: 'No data yet', items: [], hasData: false },
            knowledge: { count: null, summary: 'No data yet', items: [], hasData: false },
          },
        } as never,
      }),
    );
    render();

    expect(container.textContent).toContain('Evidence available');
    expect(container.textContent).toContain('3 partnerships');
    expect(container.textContent).toContain('It describes the genus, not every species within it.');
    // An empty relationship stays an explicit gap, never a zero-valued claim.
    expect(container.textContent).toContain('knowledge gap');
  });
});
