// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Outage / partial-payload rendering of the Relationship Explorer page: no
 * locally authored relationship data may render, the outage is stated, and a
 * missing count is "Not available", never 0.
 */

vi.mock('@/components/interactions/InteractionDiscoveryPanel', () => ({ default: () => null }));
vi.mock('@/components/orchid/EcologicalNeighborhood', () => ({ default: () => null }));
vi.mock('@/lib/ecologicalNeighborhood', () => ({ fetchSpeciesEcologicalNeighborhood: async () => [] }));
vi.mock('@/lib/genusData', async () => ({
  ...(await vi.importActual<typeof import('@/lib/genusData')>('@/lib/genusData')),
  fetchGenusImagesWithSource: vi.fn(async () => ({ images: [], source: 'pending' })),
}));

import RelationshipExplorer from './RelationshipExplorer';

const FALLBACK_MARKERS = ['Safe MVP', 'Build 203C', 'Thouars', "Darwin's orchid", 'atlas_seed', '0.024', 'fungal partner candidate', 'Safe-mvp'];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function renderSpecies(name: string) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/relationship-explorer/${encodeURIComponent(name)}`]}>
        <Routes>
          <Route path="/relationship-explorer/:species" element={<RelationshipExplorer />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('RelationshipExplorer page — no fallback payloads', () => {
  it('outage: states the service did not respond and renders no fallback content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('network down');
    }));
    await renderSpecies('Angraecum sesquipedale');
    const text = container.textContent ?? '';
    expect(container.querySelector('[data-testid="relationship-explorer-unavailable"]')).not.toBeNull();
    expect(text).toContain('Payload sourceUnavailable');
    expect(text).toContain('No atlas summary is available yet for this species.');
    for (const marker of FALLBACK_MARKERS) expect(text, marker).not.toContain(marker);
  });

  it('partial API payload: shows the API field, "Not available" for a missing count, no outage banner', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({
        scientific_name: 'Angraecum sesquipedale',
        atlas_summary: { occurrence_count: null, atlas_readiness: 'reported by api', atlas_confidence_score: null, countries: null, elevation_range: null },
      }),
      { status: 200 },
    )));
    await renderSpecies('Angraecum sesquipedale');
    const text = container.textContent ?? '';
    expect(container.querySelector('[data-testid="relationship-explorer-unavailable"]')).toBeNull();
    expect(text).toContain('Payload sourceRelationship Explorer API');
    expect(text).toContain('reported by api');
    expect(text).toContain('Not availableoccurrence records');
    expect(text).not.toMatch(/(^|[^0-9])0occurrence records/);
    for (const marker of FALLBACK_MARKERS) expect(text, marker).not.toContain(marker);
  });
});
