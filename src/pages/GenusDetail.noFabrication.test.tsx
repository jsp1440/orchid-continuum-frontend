// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenusImage } from '@/lib/genusData';

/**
 * The genus profile used to render a hand-authored dataset (species count,
 * tribe, description, range, elevation, habitat, pollinators, mycorrhizae and
 * per-species plates with distribution / elevation / conservation) as if it
 * were Continuum data. Only live backend content may render now, and missing
 * content must show an honest unavailable / empty state.
 */

const live = vi.hoisted(() => ({
  images: [] as GenusImage[],
  validated: [] as string[],
  source: 'pending' as 'empty' | 'pending',
}));

vi.mock('@/components/orchid/Navbar', () => ({ default: () => null }));
vi.mock('@/components/orchid/Footer', () => ({ default: () => null }));
vi.mock('@/components/orchid/HeroCarousel', () => ({ default: () => null }));
vi.mock('@/components/orchid/ImageSourceIndicator', () => ({ default: () => null }));
vi.mock('@/components/orchid/GenusOccurrenceMap', () => ({ default: () => null }));
vi.mock('@/components/orchid/NeighborGeneraSection', () => ({ default: () => null }));
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn(async () => ({ data: null, error: new Error('offline') })) } },
}));
vi.mock('@/lib/knowledgeGraph', () => ({
  fetchGenusGraphEvidence: vi.fn(async () => ({ status: 'unavailable' })),
}));
vi.mock('@/lib/genusData', async () => ({
  ...(await vi.importActual<typeof import('@/lib/genusData')>('@/lib/genusData')),
  warmBackends: vi.fn(),
  fetchGenusImagesWithSource: vi.fn(async () => ({
    images: live.images,
    source: live.source,
  })),
  fetchValidatedSpecies: vi.fn(async () => live.validated),
}));

import GenusDetail from './GenusDetail';

// Values that existed only in the removed hand-authored genus dataset.
const FABRICATED_FACTS = [
  '118 species',
  'Pleurothallidinae',
  'Fungus gnats',
  'Bradysia',
  'Mycetophilidae',
  'Tulasnella',
  'Ceratobasidium',
  '1,500–2,800 m',
  '1,800–2,400 m',
  '1,900–2,200 m',
  'Andean cloud forest',
  'Data Deficient',
  'Endemic · Vulnerable',
  'Pichincha',
  'Ecuador, Colombia',
  'mimicking mushrooms',
];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function renderGenus(name: string) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/genus/${name}`]}>
        <Routes>
          <Route path="/genus/:name" element={<GenusDetail />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  // Let the mocked fetches resolve and state settle.
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function assertNoFabricatedFacts() {
  const text = container.textContent ?? '';
  for (const fact of FABRICATED_FACTS) expect(text, fact).not.toContain(fact);
}

beforeEach(() => {
  live.images = [];
  live.validated = [];
  live.source = 'pending';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('GenusDetail — no fabricated genus facts', () => {
  it('outage: shows honest unavailable / empty states and no local facts', async () => {
    await renderGenus('Dracula');
    const text = container.textContent ?? '';
    expect(text).toContain('Dracula');
    expect(container.querySelector('[data-testid="genus-profile-unsourced-notice"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="genus-plates-empty"]')).not.toBeNull();
    expect(text).toContain('image services are unavailable');
    expect(text).not.toContain('image services returned no photographed species');
    // Pollinator, mycorrhizal, elevation and habitat rows all state the gap.
    expect(text.match(/Evidence unavailable/g)?.length).toBe(4);
    expect(text).not.toContain('Provisional · genus-level');
    assertNoFabricatedFacts();
  });

  it('uses a definitive empty message only after a successful image response', async () => {
    live.source = 'empty';
    await renderGenus('Dracula');
    const text = container.textContent ?? '';
    expect(text).toContain('image services returned no photographed species');
    expect(text).not.toContain('image services are unavailable');
  });

  it('partial payload: a live image record becomes a name-only plate, flagged Unverified', async () => {
    live.images = [
      {
        scientific_name: 'Dracula vampira (Luer) Luer',
        image_url: 'https://images.example.test/dracula-vampira.jpg',
        image_urls: ['https://images.example.test/dracula-vampira.jpg'],
        image_source: 'Example library',
        image_license: 'CC BY',
      },
    ];
    await renderGenus('Dracula');
    const text = container.textContent ?? '';
    expect(text).toContain('Dracula vampira');
    expect(text).toContain('Example library · CC BY');
    expect(text).toContain('Unverified');
    expect(text).not.toContain('Verified ');
    expect(container.querySelector('[data-testid="genus-plates-empty"]')).toBeNull();
    assertNoFabricatedFacts();
  });

  it('a limited backbone sample verifies matches without hiding trusted images outside the sample', async () => {
    live.images = [
      {
        scientific_name: 'Dracula vampira',
        image_url: 'https://images.example.test/a.jpg',
        image_urls: ['https://images.example.test/a.jpg'],
      },
      {
        scientific_name: 'Dracula chimaera',
        image_url: 'https://images.example.test/b.jpg',
        image_urls: ['https://images.example.test/b.jpg'],
      },
    ];
    live.validated = ['Dracula vampira'];
    await renderGenus('Dracula');
    const text = container.textContent ?? '';
    expect(text).toContain('Dracula vampira');
    expect(text).toContain('Dracula chimaera');
    expect(text).toContain('Verified');
    expect(text).toContain('Unverified');
    assertNoFabricatedFacts();
  });
});
