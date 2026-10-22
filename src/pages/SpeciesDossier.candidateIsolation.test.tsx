// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpeciesDossierEnvelope } from '@/lib/speciesDossier';

const mocks = vi.hoisted(() => ({ record: vi.fn(), fungi: vi.fn(), dossier: vi.fn(), federation: vi.fn() }));
vi.mock('@/components/orchid/Navbar', () => ({ default: () => null }));
vi.mock('@/components/orchid/Footer', () => ({ default: () => null }));
vi.mock('@/lib/speciesPublicRecord', () => ({ fetchSpeciesPublicRecord: mocks.record }));
vi.mock('@/lib/ocBackend', () => ({ fetchMycorrhizal: mocks.fungi }));
vi.mock('@/lib/speciesDossier', async () => ({
  ...await vi.importActual<typeof import('@/lib/speciesDossier')>('@/lib/speciesDossier'),
  fetchSpeciesDossier: mocks.dossier,
  resolveFederatedSpecies: mocks.federation,
}));
const { default: SpeciesDossier } = await import('@/pages/SpeciesDossier');
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function envelope(name: string, id: string, marker: string): SpeciesDossierEnvelope {
  const section = () => ({ state: 'unavailable', summary: null, items: [], receipts: [], unavailable_reason: null });
  return {
    contract_version: 'oc-species-dossier-v1', generated_at: '2026-08-01T00:00:00Z',
    identity: { taxon_id: id, display_name: name, full_scientific_name: name, accepted_name: name, authorship: null, rank: 'species', genus: name.split(' ')[0], specific_epithet: name.split(' ')[1], taxonomic_status: 'accepted', synonyms: [] },
    ...Object.fromEntries(['nomenclature','protologue','type_material','historical_media','living_media','morphology','distribution','ecology','phenology','pollinators','mycorrhizae','conservation','literature','cultivation','knowledge_graph','calyx_narrative','research_gaps'].map(key => [key, section()])),
    morphology: { ...section(), state: 'available', summary: marker },
    atlas: { contract_version: 'oc-species-atlas-v1', taxon_id: id, generated_at: '2026-08-01T00:00:00Z', layers: [], unavailable_layers: [], provenance: [] },
    related_species: [], matrix_url: '', partner_references: [], provenance: [],
  } as SpeciesDossierEnvelope;
}
const oldDossier = () => envelope('Cattleya labiata', 'chosen-A', 'OLD CANDIDATE EVIDENCE');
const newDossier = () => envelope('Dracula simia', 'route-B', 'CURRENT ROUTE EVIDENCE');
const unavailable = () => ({ status: 'unavailable', partner_slug: null, explanation: '' });
function Nav() {
  const navigate = useNavigate();
  return <button data-testid="next-species" onClick={() => navigate('/species/route-B?name=Dracula%20simia')}>Next species</button>;
}
let root: Root;
let container: HTMLDivElement;
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); }
function render() {
  act(() => root.render(<MemoryRouter initialEntries={['/species/route-A?name=Cattleya%20labiata']}><Nav /><Routes><Route path="/species/:slug" element={<SpeciesDossier />} /></Routes></MemoryRouter>));
}
async function choose() {
  render(); await flush(); await flush();
  const button = container.querySelector('[data-testid="dossier-ambiguous"] button') as HTMLButtonElement;
  expect(button).not.toBeNull(); act(() => button.click()); await flush();
}
async function navigate() { act(() => (container.querySelector('[data-testid="next-species"]') as HTMLButtonElement).click()); await flush(); await flush(); }
beforeEach(() => {
  vi.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  mocks.record.mockImplementation(async (id: string) => ({ taxonomy_id: id, canonical_name: id === 'route-B' ? 'Dracula simia' : 'Cattleya labiata' }));
  mocks.fungi.mockResolvedValue({ status: 200, partners: [] });
  mocks.federation.mockImplementation(async (params: { name?: string }) => params.name ? { status: 'ambiguous', candidates: [{ taxon_id: 'chosen-A', accepted_name: 'Cattleya labiata' }] } : unavailable());
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('candidate selection remains bound to the current species route', () => {
  it('ignores a selected candidate response from the previous route', async () => {
    const late = deferred<SpeciesDossierEnvelope>();
    mocks.dossier.mockImplementation((id: string) => id === 'chosen-A' ? late.promise : Promise.resolve(id === 'route-B' ? newDossier() : null));
    await choose(); await navigate();
    await act(async () => late.resolve(oldDossier())); await flush();
    expect(container.textContent).toContain('CURRENT ROUTE EVIDENCE');
    expect(container.textContent).not.toContain('OLD CANDIDATE EVIDENCE');
    expect(mocks.federation.mock.calls.some(([params]) => params.taxonId === 'chosen-A')).toBe(false);
  });
  it('ignores a selected candidate federation result after navigation', async () => {
    const late = deferred<ReturnType<typeof unavailable>>();
    mocks.dossier.mockImplementation(async (id: string) => id === 'chosen-A' ? oldDossier() : id === 'route-B' ? newDossier() : null);
    const original = mocks.federation.getMockImplementation()!;
    mocks.federation.mockImplementation((params: { taxonId?: string; name?: string }) => params.taxonId === 'chosen-A' ? late.promise : original(params));
    await choose(); await navigate();
    await act(async () => late.resolve({ status: 'resolved', partner_slug: 'old-partner', explanation: 'OLD PARTNER ATTRIBUTION', reciprocal_source_url: 'https://example.org/old-A' } as ReturnType<typeof unavailable>)); await flush();
    expect(container.textContent).toContain('CURRENT ROUTE EVIDENCE');
    expect(container.textContent).not.toContain('OLD PARTNER ATTRIBUTION');
    expect(container.querySelector('a[href="https://example.org/old-A"]')).toBeNull();
  });
  it('ignores a previous candidate failure without hiding the new dossier', async () => {
    const late = deferred<SpeciesDossierEnvelope>();
    mocks.dossier.mockImplementation((id: string) => id === 'chosen-A' ? late.promise : Promise.resolve(id === 'route-B' ? newDossier() : null));
    await choose(); await navigate();
    await act(async () => late.reject(new Error('late source failure'))); await flush();
    expect(container.textContent).toContain('CURRENT ROUTE EVIDENCE');
    expect(container.querySelector('[data-testid="dossier-unavailable"]')).toBeNull();
  });
  it('ignores a previous candidate federation failure and its loading cleanup', async () => {
    const oldFederation = deferred<Record<string, unknown>>();
    const currentFederation = deferred<Record<string, unknown>>();
    mocks.dossier.mockImplementation(async (id: string) => id === 'chosen-A' ? oldDossier() : id === 'route-B' ? newDossier() : null);
    const original = mocks.federation.getMockImplementation()!;
    mocks.federation.mockImplementation((params: { taxonId?: string; name?: string }) =>
      params.taxonId === 'chosen-A' ? oldFederation.promise : params.taxonId === 'route-B' ? currentFederation.promise : original(params));
    await choose(); await navigate();
    await act(async () => oldFederation.reject(new Error('late attribution failure'))); await flush();
    expect(container.textContent).toContain('Resolving federated source');
    await act(async () => currentFederation.resolve({ status: 'resolved', partner_slug: 'current-partner', explanation: 'CURRENT PARTNER ATTRIBUTION' })); await flush();
    expect(container.textContent).toContain('CURRENT PARTNER ATTRIBUTION');
    expect(container.textContent).not.toContain('Federated source unavailable');
  });
  it('still displays a successful candidate for the unchanged route', async () => {
    mocks.dossier.mockImplementation(async (id: string) => id === 'chosen-A' ? oldDossier() : null);
    await choose(); await flush();
    expect(container.textContent).toContain('OLD CANDIDATE EVIDENCE');
    expect(container.querySelector('[data-testid="dossier-ambiguous"]')).toBeNull();
  });
});
