// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeaturedGenusProfile } from '@/lib/featuredGenusProfile';

// React 18 needs this flag before act() drives updates outside a test runner
// that sets it automatically.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  fetchFeaturedGenusProfile: vi.fn(),
}));

vi.mock('@/lib/featuredGenusProfile', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/featuredGenusProfile')>();
  return { ...actual, fetchFeaturedGenusProfile: mocks.fetchFeaturedGenusProfile };
});

const { default: GenusScientificProfile } = await import(
  '@/components/orchid/GenusScientificProfile'
);

function profileFixture(overrides: Partial<FeaturedGenusProfile> = {}): FeaturedGenusProfile {
  return {
    requestedGenus: 'Cattleya',
    acceptedGenus: 'Cattleya',
    generatedAt: '2026-10-11T00:00:00+00:00',
    taxonomy: {
      state: 'known',
      recordedSpeciesCount: 142,
      recordedSpeciesCountScope: 'accepted names in the OC taxonomy backbone',
      representativeNames: ['Cattleya labiata', 'Cattleya trianae'],
    },
    media: { state: 'known', status: 'ok', returnedCount: 9 },
    habitat: {
      state: 'known',
      climateTag: 'tropical',
      collectionTag: 'epiphyte',
      minElevationM: 600,
      maxElevationM: 1800,
      source: 'oc_widget.v_genus_of_day_cards',
    },
    knowledgeGraph: { state: 'known', nodeCount: 58, edgeCount: 121 },
    domains: {
      taxonomy: { state: 'known', linkedNodes: 12, linkedEdges: 20 },
      pollinators: { state: 'unknown', linkedNodes: 0, linkedEdges: 0 },
      conservation: { state: 'unavailable', linkedNodes: null, linkedEdges: null },
    },
    gaps: ['pollinators'],
    provenance: { taxonomy: 'public.orchid_taxonomy' },
    notes: ['Knowledge-gap states describe our records, never the genus itself.'],
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

async function render(genus: string) {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <GenusScientificProfile genus={genus} />
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

describe('GenusScientificProfile boundary discipline', () => {
  it('renders nothing for a non-canonical genus and never calls the backend', async () => {
    await render('not a genus');
    expect(container.textContent).toBe('');
    expect(mocks.fetchFeaturedGenusProfile).not.toHaveBeenCalled();
  });

  it('renders nothing when the taxonomy backbone rejects the genus', async () => {
    mocks.fetchFeaturedGenusProfile.mockResolvedValue({ status: 'invalid_genus' });
    await render('Cattleya');
    expect(container.textContent).toBe('');
  });
});

describe('GenusScientificProfile exhibit', () => {
  it('renders the accepted genus, verified counts, and continuation links', async () => {
    mocks.fetchFeaturedGenusProfile.mockResolvedValue({ status: 'ok', profile: profileFixture() });
    await render('Cattleya');

    expect(container.textContent).toContain('Scientific Profile');
    expect(container.textContent).toContain('Cattleya');
    expect(container.textContent).toContain('142');
    expect(container.textContent).toContain('9');

    expect(container.querySelector('a[href^="/atlas?genera=Cattleya"]')).not.toBeNull();
    expect(container.querySelector('a[href="/relationship-matrix?genus=Cattleya"]')).not.toBeNull();
    expect(container.querySelector('a[href="/species?genus=Cattleya"]')).not.toBeNull();
    expect(container.querySelector('a[href^="/research?genus=Cattleya"]')).not.toBeNull();
  });

  it('marks a synonym request with the accepted name', async () => {
    // The backbone resolved the requested synonym genus to the accepted genus.
    mocks.fetchFeaturedGenusProfile.mockResolvedValue({
      status: 'ok',
      profile: profileFixture({ requestedGenus: 'Broughtonia' }),
    });
    await render('Broughtonia');
    expect(container.textContent).toContain('Requested as Broughtonia — accepted name Cattleya');
  });

  it('keeps research details collapsed until the toggle is pressed', async () => {
    mocks.fetchFeaturedGenusProfile.mockResolvedValue({ status: 'ok', profile: profileFixture() });
    await render('Cattleya');

    expect(container.querySelector('[data-testid="genus-scientific-profile-details"]')).toBeNull();

    const toggle = container.querySelector(
      '[data-testid="genus-scientific-profile-toggle"]',
    ) as HTMLButtonElement;
    expect(toggle).not.toBeNull();

    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const details = container.querySelector('[data-testid="genus-scientific-profile-details"]');
    expect(details).not.toBeNull();
    expect(details?.textContent).toContain('Documented');
    expect(details?.textContent).toContain('Representative names');
    expect(details?.textContent).toContain('Cattleya labiata');
    expect(details?.textContent).toContain('600–1,800 m');
    expect(details?.textContent).toContain('58 nodes · 121 relationships');
    expect(details?.textContent).toContain('Pollinators');
  });

  it('presents a knowledge gap as "not yet linked" — never as absence or zero', async () => {
    mocks.fetchFeaturedGenusProfile.mockResolvedValue({ status: 'ok', profile: profileFixture() });
    await render('Cattleya');

    const toggle = container.querySelector(
      '[data-testid="genus-scientific-profile-toggle"]',
    ) as HTMLButtonElement;
    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const details = container.querySelector('[data-testid="genus-scientific-profile-details"]');
    expect(details?.textContent).toContain('Not yet linked');
    expect(details?.textContent).toContain('No linked evidence yet for Pollinators');
    expect(details?.textContent).toContain('it is not evidence of absence');
  });

  it('states that no substitute photograph is shown when the genus has none approved', async () => {
    mocks.fetchFeaturedGenusProfile.mockResolvedValue({
      status: 'ok',
      profile: profileFixture({
        media: { state: 'unknown', status: 'no_approved_media', returnedCount: 0 },
      }),
    });
    await render('Cattleya');

    const toggle = container.querySelector(
      '[data-testid="genus-scientific-profile-toggle"]',
    ) as HTMLButtonElement;
    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('No approved photographs are linked to this genus yet');
    expect(container.textContent).toContain('No substitute image is shown in their place');
  });
});

describe('GenusScientificProfile unavailable state', () => {
  it('says the service did not answer and makes no fallback claim', async () => {
    mocks.fetchFeaturedGenusProfile.mockResolvedValue({ status: 'unavailable' });
    await render('Cattleya');

    expect(
      container.querySelector('[data-testid="genus-scientific-profile-unavailable"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain('did not answer');
    expect(container.textContent).not.toContain('knowledge gap');
    expect(container.textContent).not.toContain('Not yet linked');
  });
});
