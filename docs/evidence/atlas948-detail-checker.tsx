// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Atlas from './src/pages/Atlas';
import { AtlasFilterProvider } from '@/contexts/AtlasFilterContext';

const service = vi.hoisted(() => ({ pending: new Map<string, (value: unknown) => void>() }));
vi.mock('@/components/orchid/Navbar', () => ({ default: () => null }));
vi.mock('@/components/orchid/Footer', () => ({ default: () => null }));
vi.mock('@/components/atlas/AtlasDebugPanel', () => ({ default: () => null }));
vi.mock('@/components/atlas/AtlasCompletenessBadge', () => ({ default: () => null }));
vi.mock('@/components/atlas/AtlasTour', () => ({ default: () => null }));
vi.mock('@/components/atlas/GrandTour', () => ({ default: () => null }));
vi.mock('@/components/orchid/SourceBadges', () => ({ SourceCitation: () => null }));
vi.mock('@/components/atlas/LiveAtlasMap', () => ({ default: ({ points, onSelect }: { points: Array<{id:string}>; onSelect:(point:unknown)=>void }) => <div>{points.map(point => <button key={point.id} data-pick={point.id} onClick={() => onSelect(point)}>Pick {point.id}</button>)}</div> }));
vi.mock('@/lib/orchidContinuum', () => ({
  fetchAtlasOccurrencePoints: async () => ['A','B'].map(id => ({id, canonicalName:`Fixture ${id}`, genus:'Fixture', species:id, lat:1,lng:2,country:'Fixtureland',pollinators:[],dataset:'Synthetic',verified:false,assessmentResolved:false})),
  fetchAtlasFacets: async () => ({genera:[],tribes:[],countries:[],growthForms:[],habitats:[],iucnCodes:[],pollinatorTaxa:[],datasets:[]}),
  fetchAtlasOccurrence: (id:string) => new Promise(resolve => service.pending.set(id, resolve)),
  applyAtlasFilters: (points:unknown[]) => points,
  canonicalSlug: (name:string) => name,
}));
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
function HistoryBack() { const navigate=useNavigate(); return <button data-history-back onClick={() => navigate(-1)}>History back</button>; }
let root:ReturnType<typeof createRoot>;
let host:HTMLDivElement;
beforeEach(async () => {
  service.pending.clear();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External fetch forbidden'); }));
  host=document.createElement('div'); document.body.append(host); root=createRoot(host);
  await act(async () => root.render(<MemoryRouter initialEntries={['/atlas?occurrence=B','/atlas?occurrence=A']} initialIndex={1}><HistoryBack/><AtlasFilterProvider><Atlas/></AtlasFilterProvider></MemoryRouter>));
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const historyBack=async() => act(async () => (host.querySelector("[data-history-back]") as HTMLButtonElement).click());
const finish=async(id:string) => act(async () => service.pending.get(id)!({id, scientificName:`Resolved ${id}`, imageUrl:`https://fixtures.invalid/${id}.jpg`,isPlaceholder:false,verified:true,pollinators:[],habitatDescription:`Habitat ${id}`,dataset:`Dataset ${id}`,taxonomyId:`taxon-${id}`}));
const card=() => host.querySelector('[aria-label="Close species card"]')!.parentElement!;


const pick = async (id: string) => act(async () => {
  (host.querySelector(`[data-pick="${id}"]`) as HTMLButtonElement).click();
});
const closeCard = async () => act(async () => {
  (host.querySelector('[aria-label="Close species card"]') as HTMLButtonElement).click();
});

it('map selection withholds previous evidence then renders the matching resolved record', async () => {
  await finish('A');
  await pick('B');
  expect(card().textContent).toContain('Atlas record · B');
  expect(card().textContent).not.toContain('Resolved A');
  expect(card().textContent).not.toContain('Dataset A');
  expect(card().querySelector('img')).toBeNull();
  expect(card().querySelector('a[href="/species/taxon-A"]')).toBeNull();
  await finish('B');
  expect(card().textContent).toContain('Resolved B');
  expect(card().textContent).toContain('Habitat B');
  expect(card().querySelector('img')?.getAttribute('src')).toBe('https://fixtures.invalid/B.jpg');
  expect(card().querySelector('a[href="/species/taxon-B"]')).not.toBeNull();
});

it('closing during a pending request prevents resurrection and a new selection stays independent', async () => {
  await closeCard();
  await finish('A');
  expect(host.querySelector('[aria-label="Close species card"]')).toBeNull();
  await pick('B');
  expect(card().textContent).not.toContain('Resolved A');
  expect(card().querySelector('img')).toBeNull();
  await finish('B');
  expect(card().textContent).toContain('Resolved B');
  expect(card().textContent).not.toContain('Resolved A');
});

it('reselecting A after resolved B withholds B even when the new A result is absent', async () => {
  await finish('A');
  await pick('B');
  await finish('B');
  expect(card().textContent).toContain('Resolved B');
  await pick('A');
  expect(card().textContent).toContain('Atlas record · A');
  expect(card().textContent).not.toContain('Resolved B');
  expect(card().textContent).not.toContain('Dataset B');
  expect(card().querySelector('img')).toBeNull();
  expect(card().querySelector('a[href="/species/taxon-B"]')).toBeNull();
  await act(async () => service.pending.get('A')!(null));
  expect(card().textContent).not.toContain('Resolved B');
  expect(card().textContent).not.toContain('Verified');
});
