// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DossierGraphIdentity, SpeciesDossierEnvelope } from '@/lib/speciesDossier';

/**
 * The species page mounts the photo gallery only with the World Plants backbone id of the dossier's
 * own one-to-one graph link, never with the route id (public.orchid_taxonomy, another id space).
 */

const mocks = vi.hoisted(() => ({
  fetchSpeciesById: vi.fn(),
  fetchMycorrhizal: vi.fn(),
  fetchSpeciesDossier: vi.fn(),
  resolveFederatedSpecies: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/contexts/AuthContext')>('@/contexts/AuthContext');
  return { ...actual, useAuth: () => ({ session: null }) };
});
vi.mock('@/lib/ocBackend', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ocBackend')>('@/lib/ocBackend');
  return { ...actual, fetchSpeciesById: mocks.fetchSpeciesById, fetchMycorrhizal: mocks.fetchMycorrhizal };
});
vi.mock('@/lib/speciesPublicRecord', () => ({
  fetchSpeciesPublicRecord: (id: string, _name: string | null, signal?: AbortSignal) =>
    mocks.fetchSpeciesById(id, signal),
}));
vi.mock('@/lib/speciesDossier', async () => {
  const actual = await vi.importActual<typeof import('@/lib/speciesDossier')>('@/lib/speciesDossier');
  return {
    ...actual,
    fetchSpeciesDossier: mocks.fetchSpeciesDossier,
    resolveFederatedSpecies: mocks.resolveFederatedSpecies,
  };
});
vi.mock('@/features/species-gallery/SpeciesPhotoGallery', () => ({
  default: ({ taxonId, speciesName }: { taxonId: string; speciesName: string }) => (
    <div data-testid="gallery-stub">{`${taxonId}|${speciesName}`}</div>
  ),
}));

const { default: SpeciesDossier } = await import('@/pages/SpeciesDossier');

const section = { state: 'unavailable', summary: null, items: [], receipts: [], unavailable_reason: null } as const;

function dossier(graph: DossierGraphIdentity | undefined): SpeciesDossierEnvelope {
  const sections = Object.fromEntries(
    [
      'nomenclature', 'protologue', 'type_material', 'historical_media', 'living_media', 'morphology',
      'distribution', 'ecology', 'phenology', 'pollinators', 'mycorrhizae', 'conservation', 'literature',
      'cultivation', 'knowledge_graph', 'calyx_narrative', 'research_gaps',
    ].map((k) => [k, { ...section }]),
  );
  return {
    contract_version: 'oc-species-dossier-v1',
    generated_at: '2026-11-23T00:00:00Z',
    identity: {
      taxon_id: '18346',
      display_name: 'Cattleya labiata',
      full_scientific_name: 'Cattleya labiata Lindl.',
      accepted_name: 'Cattleya labiata',
      authorship: 'Lindl.',
      rank: 'species',
      genus: 'Cattleya',
      specific_epithet: 'labiata',
      taxonomic_status: 'accepted',
      synonyms: [],
    },
    ...sections,
    atlas: {
      contract_version: 'oc-species-atlas-v1',
      taxon_id: '18346',
      generated_at: '2026-11-23T00:00:00Z',
      layers: [],
      unavailable_layers: [],
      provenance: [],
    },
    related_species: [],
    matrix_url: '',
    partner_references: [],
    provenance: [],
    ...(graph ? { graph_identity: graph } : {}),
  } as SpeciesDossierEnvelope;
}

const LINKED: DossierGraphIdentity = {
  status: 'available',
  link_state: 'linked',
  older_id: '18346',
  kg_node_id: 66746,
  canonical_key: 'taxon:32953',
  canonical_key_kind: 'backbone_row',
  backbone_id: '32953',
  accepted_name: 'Cattleya labiata',
};

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/species/18346']}>
      <Routes>
        <Route path="/species/:slug" element={<SpeciesDossier />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.fetchSpeciesById.mockReset().mockResolvedValue({
    taxonomy_id: '18346',
    canonical_name: 'Cattleya labiata',
    genus: 'Cattleya',
    species: 'labiata',
  });
  mocks.fetchMycorrhizal.mockReset().mockResolvedValue({ status: 404, partners: [] });
  mocks.fetchSpeciesDossier.mockReset();
  mocks.resolveFederatedSpecies.mockReset().mockResolvedValue({
    status: 'unresolved', incoming_name: null, matched_name: null, match_state: 'none', taxon_id: null,
    canonical_dossier_url: null, candidates: [], partner_slug: null, reciprocal_source_url: null,
    explanation: 'No federated match.',
  });
});
afterEach(cleanup);

describe('species page photo gallery mount', () => {
  it('mounts with the backbone id of the linked graph key, not the route id', async () => {
    mocks.fetchSpeciesDossier.mockResolvedValue(dossier(LINKED));
    renderPage();
    const stub = await screen.findByTestId('gallery-stub');
    expect(stub.textContent).toBe('32953|Cattleya labiata');
  });

  it('mounts with an implied species concept key', async () => {
    mocks.fetchSpeciesDossier.mockResolvedValue(
      dossier({
        ...LINKED,
        canonical_key: 'taxon:implied:cattleya_labiata',
        canonical_key_kind: 'implied_species_concept',
        backbone_id: null,
      }),
    );
    renderPage();
    expect((await screen.findByTestId('gallery-stub')).textContent).toBe('implied:cattleya_labiata|Cattleya labiata');
  });

  it.each([
    ['no graph_identity (older backend)', undefined],
    ['ambiguous link', { ...LINKED, link_state: 'ambiguous', canonical_key: null, canonical_key_kind: null }],
    ['bridge unavailable', { ...LINKED, status: 'unavailable' }],
    ['no graph node', { ...LINKED, link_state: 'no_graph_node', canonical_key: null, canonical_key_kind: null }],
  ])('is not mounted: %s', async (_label, graph) => {
    mocks.fetchSpeciesDossier.mockResolvedValue(dossier(graph as DossierGraphIdentity | undefined));
    renderPage();
    await waitFor(() => expect(mocks.resolveFederatedSpecies).toHaveBeenCalled());
    await screen.findByText(/Evidence dossier/i);
    expect(screen.queryByTestId('gallery-stub')).toBeNull();
  });
});
