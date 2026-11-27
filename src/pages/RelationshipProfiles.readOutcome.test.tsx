// @vitest-environment jsdom
/**
 * Pollinator and mycorrhiza profiles: "the relationship records could not be
 * checked" (read failed) must stay distinct from "not yet linked" (read
 * succeeded, no rows). Every taxon here is SYNTHETIC.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MycorrhizaProfile from './MycorrhizaProfile';
import PollinatorProfile from './PollinatorProfile';

vi.mock('@/components/orchid/Navbar', () => ({ default: () => null }));
vi.mock('@/components/orchid/Footer', () => ({ default: () => null }));
vi.mock('@/components/orchid/AtlasMiniMap', () => ({ default: () => null }));

const data = vi.hoisted(() => ({
  pollinators: [] as unknown[],
  mycorrhizae: [] as unknown[],
  failed: { pollinators: false, mycorrhiza: false },
}));
vi.mock('@/lib/orchidContinuum', () => ({
  fetchAtlasOccurrencePoints: async () => [],
  fetchPollinatorAggregates: async () => data.pollinators,
  fetchPollinator: async (slug: string) =>
    (data.pollinators as { slug: string }[]).find((p) => p.slug === slug) ?? null,
  fetchMycorrhizalAggregates: async () => data.mycorrhizae,
  fetchMycorrhiza: async (slug: string) =>
    (data.mycorrhizae as { slug: string }[]).find((m) => m.slug === slug) ?? null,
  didRelationshipReadFail: (kind: 'pollinators' | 'mycorrhiza') => data.failed[kind],
}));

const species = [{ id: 'sp-fixture-1', scientificName: 'Fixturea exempli', slug: 'fixturea-exempli' }];
const pollinator = {
  taxon: 'Fixture pollinator', slug: 'fixture-pollinator', speciesCount: 1, occurrenceCount: 0, species,
};
const fungus = { taxon: 'Fixture fungus', slug: 'fixture-fungus', speciesCount: 1, species };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;

beforeEach(() => {
  data.pollinators = [];
  data.mycorrhizae = [];
  data.failed = { pollinators: false, mycorrhiza: false };
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

async function renderAt(path: string) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/pollinators" element={<PollinatorProfile />} />
        <Route path="/pollinators/:taxa" element={<PollinatorProfile />} />
        <Route path="/mycorrhizae" element={<MycorrhizaProfile />} />
        <Route path="/mycorrhizae/:taxa" element={<MycorrhizaProfile />} />
      </Routes>
    </MemoryRouter>,
  ));
  return host;
}
const outcome = (host: HTMLElement) => host.querySelector('[data-testid="relationship-read-outcome"]');

it('mycorrhiza: a successful empty read keeps the honest "Awaiting" state and no alert', async () => {
  const host = await renderAt('/mycorrhizae');
  expect(outcome(host)).toBeNull();
  expect(host.textContent).toContain('Awaiting Orchid Continuum Record');
  expect(host.textContent).toContain('No mycorrhizal data will be fabricated.');
});

it('mycorrhiza: a failed read says the records could not be checked, not that none exist', async () => {
  data.failed.mycorrhiza = true;
  const host = await renderAt('/mycorrhizae');
  expect(outcome(host)?.getAttribute('role')).toBe('alert');
  expect(outcome(host)?.textContent).toContain('Mycorrhizal relationship records could not be checked');
  expect(outcome(host)?.textContent).toContain('not evidence that no association exists');
  expect(host.textContent).not.toContain('Awaiting Orchid Continuum Record');
  expect(host.textContent).not.toContain('not yet linked');
});

it('mycorrhiza: rows shown beside a failed read are marked as possibly incomplete', async () => {
  data.failed.mycorrhiza = true;
  data.mycorrhizae = [fungus];
  const host = await renderAt('/mycorrhizae');
  expect(outcome(host)?.textContent).toContain('may be incomplete');
  expect(host.textContent).toContain('Fixture fungus');
});

it('mycorrhiza: a complete read with rows shows them and no alert', async () => {
  data.mycorrhizae = [fungus];
  const host = await renderAt('/mycorrhizae/fixture-fungus');
  expect(outcome(host)).toBeNull();
  expect(host.textContent).toContain('Fixturea exempli');
});

it('pollinator profile: a successful read with no match keeps "not yet linked" and no alert', async () => {
  const host = await renderAt('/pollinators/fixture-pollinator');
  expect(outcome(host)).toBeNull();
  expect(host.textContent).toContain('Pollinator relationship not yet linked');
});

it('pollinator profile: a failed read says the records could not be checked, never "not yet linked"', async () => {
  data.failed.pollinators = true;
  const host = await renderAt('/pollinators/fixture-pollinator');
  expect(outcome(host)?.getAttribute('role')).toBe('alert');
  expect(outcome(host)?.textContent).toContain('Pollinator relationship records could not be checked');
  expect(outcome(host)?.textContent).toContain('not evidence that no relationship exists');
  expect(host.textContent).not.toContain('not yet linked');
});

it('pollinator index: a failed read replaces the "not yet linked" placeholder', async () => {
  data.failed.pollinators = true;
  const host = await renderAt('/pollinators');
  expect(outcome(host)?.textContent).toContain('could not be checked');
  expect(host.textContent).not.toContain('not yet linked');
});

it('pollinator index: a successful empty read keeps the placeholder; rows render without an alert', async () => {
  let host = await renderAt('/pollinators');
  expect(outcome(host)).toBeNull();
  expect(host.textContent).toContain('Pollinator data not yet linked');
  act(() => root!.unmount());
  data.pollinators = [pollinator];
  host = await renderAt('/pollinators');
  expect(outcome(host)).toBeNull();
  expect(host.textContent).toContain('Fixture pollinator');
});

it('pollinator profile: a found pollinator beside a failed read is marked as possibly incomplete', async () => {
  data.failed.pollinators = true;
  data.pollinators = [pollinator];
  const host = await renderAt('/pollinators/fixture-pollinator');
  expect(outcome(host)?.textContent).toContain('may be incomplete');
  expect(host.textContent).toContain('Fixturea exempli');
});
