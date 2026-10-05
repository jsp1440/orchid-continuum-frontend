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
  validationStatus: 'ok' as 'ok' | 'unavailable',
  source: 'pending' as 'live' | 'cache' | 'proxy' | 'inaturalist' | 'empty' | 'pending',
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
  fetchValidatedSpeciesOutcome: vi.fn(async () => ({
    status: live.validationStatus,
    names: live.validationStatus === 'ok' ? live.validated : [],
  })),
}));

import { supabase } from '@/lib/supabase';
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
  live.validationStatus = 'ok';
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
    live.source = 'live';
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

  it('requires a backbone match before an iNaturalist fallback can create a species plate', async () => {
    live.source = 'inaturalist';
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
    expect(text).not.toContain('Dracula chimaera');
    expect(text).toContain('Verified');
  });

  it('shows no iNaturalist species plates when the backbone returns no names', async () => {
    live.source = 'inaturalist';
    live.images = [
      {
        scientific_name: 'Dracula vampira',
        image_url: 'https://images.example.test/a.jpg',
        image_urls: ['https://images.example.test/a.jpg'],
      },
    ];
    live.validated = [];
    await renderGenus('Dracula');
    const text = container.textContent ?? '';
    expect(text).not.toContain('View dossier Dracula vampira');
    expect(container.querySelector('[data-testid="genus-plates-empty"]')).not.toBeNull();
    expect(text).toContain('fallback photographs were returned');
    expect(text).toContain('taxonomic backbone returned no names to confirm them');
    expect(text).not.toContain('image services returned no photographed species');
  });

  it('reports a backbone outage without claiming a successful zero-name result', async () => {
    live.source = 'inaturalist';
    live.validationStatus = 'unavailable';
    live.images = [
      {
        scientific_name: 'Dracula vampira',
        image_url: 'https://images.example.test/a.jpg',
        image_urls: ['https://images.example.test/a.jpg'],
      },
    ];
    await renderGenus('Dracula');
    const text = container.textContent ?? '';
    expect(text).toContain('taxonomic backbone is unavailable');
    expect(text).not.toContain('taxonomic backbone returned no names');
  });

  it('reports matched fallback photographs whose image files fail to load', async () => {
    live.source = 'inaturalist';
    live.validated = ['Dracula vampira'];
    live.images = [
      {
        scientific_name: 'Dracula vampira',
        image_url: 'https://images.example.test/a.jpg',
        image_urls: ['https://images.example.test/a.jpg'],
      },
    ];
    await renderGenus('Dracula');
    const image = container.querySelector('img[src="https://images.example.test/a.jpg"]');
    expect(image).not.toBeNull();
    await act(async () => {
      image?.dispatchEvent(new Event('error', { bubbles: true }));
    });
    const text = container.textContent ?? '';
    expect(text).toContain('matched the taxonomic backbone');
    expect(text).toContain('image files could not be loaded');
    expect(text).not.toContain('none matched the taxonomic backbone');
  });
});

describe('GenusDetail — AI-generated summary is labelled as inference (FRONTEND-SCI-INTEGRITY-001)', () => {
  const invoke = () => vi.mocked(supabase.functions.invoke);

  it('labels a returned summary as AI-generated, unsourced and not a field observation', async () => {
    invoke().mockResolvedValueOnce({
      data: { narrative: 'A genus of epiphytic orchids.' },
      error: null,
    } as never);
    await renderGenus('Dracula');

    const block = container.querySelector('[data-testid="genus-ai-narrative"]');
    expect(block).not.toBeNull();
    expect(block?.getAttribute('data-epistemic-state')).toBe('ai-generated');
    expect(container.querySelector('[data-testid="genus-ai-narrative-badge"]')?.textContent).toBe('AI-generated');

    const text = block?.textContent ?? '';
    expect(text).toContain('A genus of epiphytic orchids.');
    expect(text).toContain('not a field observation');
    expect(text).toContain('genus name');
    expect(text).toContain('cites no sources');
    expect(text).toContain('no review status is recorded');
    // It must never be presented as a human field note.
    expect(container.textContent ?? '').not.toContain('Field Note');
    expect(container.textContent ?? '').not.toContain('field note about');
  });

  it('sends only the genus name to the summary service', async () => {
    invoke().mockResolvedValueOnce({ data: { narrative: 'x' }, error: null } as never);
    await renderGenus('Dracula');
    expect(invoke()).toHaveBeenCalledWith('genus-narrative', { body: { genus: 'Dracula' } });
  });

  it('shows no summary and no substitute text when the service is unavailable', async () => {
    // The default mock returns an error: nothing may stand in for the summary.
    await renderGenus('Dracula');
    expect(container.querySelector('[data-testid="genus-ai-narrative"]')).toBeNull();
    expect(container.textContent ?? '').not.toContain('AI-generated');
  });

  it('shows no summary when the service answers with an empty narrative', async () => {
    invoke().mockResolvedValueOnce({ data: { narrative: '' }, error: null } as never);
    await renderGenus('Dracula');
    expect(container.querySelector('[data-testid="genus-ai-narrative"]')).toBeNull();
  });
});
