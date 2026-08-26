// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpeciesDossierEnvelope, DossierSection, EvidenceReceipt } from '@/lib/speciesDossier';

/**
 * Regression coverage for wiring fetchSpeciesDossier's evidence receipts
 * (evidence_state / confidence / license / attribution) into the live
 * /species/:slug page, without breaking the existing ocBackend-backed
 * taxonomy/conservation/mycorrhizal rendering.
 */

const mocks = vi.hoisted(() => ({
  fetchSpeciesById: vi.fn(),
  fetchMycorrhizal: vi.fn(),
  fetchSpeciesDossier: vi.fn(),
  useAuth: vi.fn(() => ({ session: null })),
}));

vi.mock('@/contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/contexts/AuthContext')>(
    '@/contexts/AuthContext',
  );
  return {
    ...actual,
    useAuth: mocks.useAuth,
  };
});

vi.mock('@/lib/ocBackend', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ocBackend')>('@/lib/ocBackend');
  return {
    ...actual,
    fetchSpeciesById: mocks.fetchSpeciesById,
    fetchMycorrhizal: mocks.fetchMycorrhizal,
  };
});

vi.mock('@/lib/speciesDossier', async () => {
  const actual = await vi.importActual<typeof import('@/lib/speciesDossier')>('@/lib/speciesDossier');
  return {
    ...actual,
    fetchSpeciesDossier: mocks.fetchSpeciesDossier,
  };
});

const { default: SpeciesDossier } = await import('@/pages/SpeciesDossier');

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function emptySection(overrides: Partial<DossierSection> = {}): DossierSection {
  return {
    state: 'unavailable',
    summary: null,
    items: [],
    receipts: [],
    unavailable_reason: null,
    ...overrides,
  };
}

function receipt(overrides: Partial<EvidenceReceipt> = {}): EvidenceReceipt {
  return {
    source_id: 'src-1',
    source_name: 'GBIF Occurrence Index',
    source_url: 'https://gbif.org/record/1',
    record_id: 'rec-1',
    retrieved_at: '2026-08-01T00:00:00Z',
    license: 'CC-BY 4.0',
    attribution: 'Global Biodiversity Information Facility',
    evidence_state: 'available',
    confidence: 0.87,
    notes: null,
    ...overrides,
  };
}

function dossier(overrides: Partial<SpeciesDossierEnvelope> = {}): SpeciesDossierEnvelope {
  const base: SpeciesDossierEnvelope = {
    contract_version: 'oc-species-dossier-v1',
    generated_at: '2026-08-01T00:00:00Z',
    identity: {
      taxon_id: 'cattleya-labiata',
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
    nomenclature: emptySection(),
    protologue: emptySection(),
    type_material: emptySection(),
    historical_media: emptySection(),
    living_media: emptySection(),
    morphology: emptySection(),
    distribution: emptySection(),
    ecology: emptySection(),
    phenology: emptySection(),
    pollinators: emptySection(),
    mycorrhizae: emptySection(),
    conservation: emptySection(),
    literature: emptySection(),
    cultivation: emptySection(),
    knowledge_graph: emptySection(),
    calyx_narrative: emptySection(),
    research_gaps: emptySection(),
    atlas: {
      contract_version: 'oc-species-atlas-v1',
      taxon_id: 'cattleya-labiata',
      generated_at: '2026-08-01T00:00:00Z',
      layers: [],
      unavailable_layers: [],
      provenance: [],
    },
    related_species: [],
    matrix_url: '',
    partner_references: [],
    provenance: [],
  };
  return { ...base, ...overrides };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.fetchSpeciesById.mockReset().mockResolvedValue({
    taxonomy_id: 'cattleya-labiata',
    canonical_name: 'Cattleya labiata',
    genus: 'Cattleya',
    species: 'labiata',
    family: 'Orchidaceae',
  });
  mocks.fetchMycorrhizal.mockReset().mockResolvedValue({ status: 404, partners: [] });
  mocks.fetchSpeciesDossier.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderPage() {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/species/cattleya-labiata']}>
        <Routes>
          <Route path="/species/:slug" element={<SpeciesDossier />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

describe('evidence receipt rendering', () => {
  it('renders evidence_state, confidence, license, and attribution for a section the backend covered', async () => {
    mocks.fetchSpeciesDossier.mockResolvedValue(
      dossier({
        distribution: emptySection({
          state: 'available',
          summary: 'Recorded across the Brazilian Atlantic Forest.',
          receipts: [
            receipt({
              source_name: 'GBIF Occurrence Index',
              confidence: 0.87,
              license: 'CC-BY 4.0',
              attribution: 'Global Biodiversity Information Facility',
              evidence_state: 'available',
            }),
          ],
        }),
      }),
    );

    renderPage();
    await flush();

    const section = Array.from(container.querySelectorAll('[data-testid="dossier-section"]')).find(
      (el) => el.getAttribute('data-section-label') === 'Distribution',
    );
    expect(section).toBeTruthy();
    expect(section?.textContent).toContain('Recorded across the Brazilian Atlantic Forest.');
    expect(section?.querySelector('[data-testid="evidence-state"]')?.textContent).toBe('Available');
    expect(section?.querySelector('[data-testid="evidence-confidence"]')?.textContent).toContain(
      '0.87',
    );
    expect(section?.querySelector('[data-testid="evidence-license"]')?.textContent).toContain(
      'CC-BY 4.0',
    );
    expect(section?.querySelector('[data-testid="evidence-attribution"]')?.textContent).toContain(
      'Global Biodiversity Information Facility',
    );
    expect(section?.querySelector('a[href="https://gbif.org/record/1"]')).toBeTruthy();
  });

  it('renders one card per receipt when a section carries multiple sources', async () => {
    mocks.fetchSpeciesDossier.mockResolvedValue(
      dossier({
        literature: emptySection({
          state: 'available',
          summary: 'Multiple primary descriptions on file.',
          receipts: [
            receipt({ source_id: 'a', source_name: 'Source A' }),
            receipt({ source_id: 'b', source_name: 'Source B', confidence: 0.4 }),
          ],
        }),
      }),
    );

    renderPage();
    await flush();

    const section = Array.from(container.querySelectorAll('[data-testid="dossier-section"]')).find(
      (el) => el.getAttribute('data-section-label') === 'Literature',
    );
    expect(section?.querySelectorAll('[data-testid="evidence-receipt"]')).toHaveLength(2);
  });
});

describe('honest fallback when evidence is missing', () => {
  it('shows an unavailable state and reason instead of fabricating evidence', async () => {
    mocks.fetchSpeciesDossier.mockResolvedValue(
      dossier({
        cultivation: emptySection({
          state: 'unavailable',
          unavailable_reason: 'No cultivation records have been linked yet.',
        }),
      }),
    );

    renderPage();
    await flush();

    const section = Array.from(container.querySelectorAll('[data-testid="dossier-section"]')).find(
      (el) => el.getAttribute('data-section-label') === 'Cultivation',
    );
    expect(section?.querySelector('[data-testid="evidence-state"]')?.textContent).toBe('Unavailable');
    expect(section?.textContent).toContain('No cultivation records have been linked yet.');
    expect(section?.querySelectorAll('[data-testid="evidence-receipt"]')).toHaveLength(0);
  });

  it('reports confidence as not supplied rather than inventing a number', async () => {
    mocks.fetchSpeciesDossier.mockResolvedValue(
      dossier({
        ecology: emptySection({
          state: 'provisional',
          summary: 'Habitat notes exist but are unverified.',
          receipts: [receipt({ confidence: null })],
        }),
      }),
    );

    renderPage();
    await flush();

    const section = Array.from(container.querySelectorAll('[data-testid="dossier-section"]')).find(
      (el) => el.getAttribute('data-section-label') === 'Ecology',
    );
    const confidenceText = section?.querySelector('[data-testid="evidence-confidence"]')?.textContent ?? '';
    expect(confidenceText).toContain('not supplied');
    expect(confidenceText).not.toMatch(/\d\.\d\d/);
  });

  it('treats a zero confidence as a real reported value, not as absent', async () => {
    mocks.fetchSpeciesDossier.mockResolvedValue(
      dossier({
        phenology: emptySection({
          state: 'modeled',
          receipts: [receipt({ confidence: 0 })],
        }),
      }),
    );

    renderPage();
    await flush();

    const section = Array.from(container.querySelectorAll('[data-testid="dossier-section"]')).find(
      (el) => el.getAttribute('data-section-label') === 'Phenology',
    );
    const confidenceText = section?.querySelector('[data-testid="evidence-confidence"]')?.textContent ?? '';
    expect(confidenceText).toContain('0.00');
    expect(confidenceText).not.toContain('not supplied');
  });

  it('shows license as not stated rather than inventing one', async () => {
    mocks.fetchSpeciesDossier.mockResolvedValue(
      dossier({
        morphology: emptySection({
          state: 'provisional',
          receipts: [receipt({ license: null })],
        }),
      }),
    );

    renderPage();
    await flush();

    const section = Array.from(container.querySelectorAll('[data-testid="dossier-section"]')).find(
      (el) => el.getAttribute('data-section-label') === 'Morphology',
    );
    expect(section?.querySelector('[data-testid="evidence-license"]')?.textContent).toContain(
      'not stated',
    );
  });

  it('does not render an attribution line when the backend omitted one', async () => {
    mocks.fetchSpeciesDossier.mockResolvedValue(
      dossier({
        morphology: emptySection({
          state: 'provisional',
          receipts: [receipt({ attribution: null })],
        }),
      }),
    );

    renderPage();
    await flush();

    const section = Array.from(container.querySelectorAll('[data-testid="dossier-section"]')).find(
      (el) => el.getAttribute('data-section-label') === 'Morphology',
    );
    expect(section?.querySelector('[data-testid="evidence-attribution"]')).toBeNull();
  });

  it('shows an honest page-level fallback when the dossier endpoint fails, without breaking the rest of the page', async () => {
    mocks.fetchSpeciesDossier.mockRejectedValue(new Error('503'));

    renderPage();
    await flush();

    expect(container.textContent).toContain('Evidence dossier is not currently available.');
    // The rest of the page must still render from the existing ocBackend contract.
    expect(container.textContent).toContain('Cattleya labiata');
    expect(container.querySelectorAll('[data-testid="dossier-section"]')).toHaveLength(0);
  });
});

describe('conservation and distribution evidence merged into their existing blocks', () => {
  it('renders dossier conservation evidence inside the Conservation status block, not a duplicate generic section', async () => {
    mocks.fetchSpeciesDossier.mockResolvedValue(
      dossier({
        conservation: emptySection({
          state: 'available',
          summary: 'Assessed as Endangered under IUCN criteria B1ab.',
          receipts: [
            receipt({
              source_name: 'IUCN Red List',
              confidence: 0.9,
              license: 'CC-BY-NC 4.0',
            }),
          ],
        }),
      }),
    );

    renderPage();
    await flush();

    const sections = Array.from(
      container.querySelectorAll('[data-testid="dossier-section"]'),
    ).filter((el) => el.getAttribute('data-section-label') === 'Conservation evidence');
    expect(sections).toHaveLength(1);
    expect(sections[0].textContent).toContain('Assessed as Endangered under IUCN criteria B1ab.');
    expect(sections[0].querySelector('[data-testid="evidence-license"]')?.textContent).toContain(
      'CC-BY-NC 4.0',
    );
  });

  it('renders dossier distribution evidence inside the Native range & habitat block, not a duplicate generic section', async () => {
    mocks.fetchSpeciesDossier.mockResolvedValue(
      dossier({
        distribution: emptySection({
          state: 'available',
          summary: 'Recorded across the Brazilian Atlantic Forest.',
          receipts: [receipt({ source_name: 'GBIF Occurrence Index' })],
        }),
      }),
    );

    renderPage();
    await flush();

    const sections = Array.from(
      container.querySelectorAll('[data-testid="dossier-section"]'),
    ).filter((el) => el.getAttribute('data-section-label') === 'Distribution');
    expect(sections).toHaveLength(1);
    expect(sections[0].textContent).toContain('Recorded across the Brazilian Atlantic Forest.');
  });

  it('does not render conservation/distribution evidence blocks when the dossier fetch failed, without breaking the ocBackend fallback', async () => {
    mocks.fetchSpeciesDossier.mockRejectedValue(new Error('503'));

    renderPage();
    await flush();

    expect(
      container.querySelectorAll('[data-testid="dossier-section"]'),
    ).toHaveLength(0);
    expect(container.textContent).toContain('Not yet assessed in the Continuum record.');
  });
});

describe('no regression to existing SpeciesDossier behavior', () => {
  it('still renders taxonomy fields from fetchSpeciesById', async () => {
    mocks.fetchSpeciesDossier.mockResolvedValue(dossier());
    renderPage();
    await flush();
    expect(container.textContent).toContain('Orchidaceae');
    expect(container.textContent).toContain('Cattleya');
  });

  it('still degrades mycorrhizal partners to "Data coming soon" on a 404, unaffected by the dossier mycorrhizae section', async () => {
    mocks.fetchMycorrhizal.mockResolvedValue({ status: 404, partners: [] });
    mocks.fetchSpeciesDossier.mockResolvedValue(
      dossier({ mycorrhizae: emptySection({ state: 'available', summary: 'ignored' }) }),
    );

    renderPage();
    await flush();

    expect(container.textContent).toContain('Data coming soon');
    expect(container.textContent).toContain('no record yet');
    // The legacy mycorrhizal block must still be driven by fetchMycorrhizal, not the dossier section.
    expect(
      Array.from(container.querySelectorAll('[data-testid="dossier-section"]')).some(
        (el) => el.getAttribute('data-section-label') === 'Mycorrhizae',
      ),
    ).toBe(false);
  });

  it('still renders real mycorrhizal partners when fetchMycorrhizal returns records', async () => {
    mocks.fetchMycorrhizal.mockResolvedValue({
      status: 200,
      partners: [{ fungal_taxon: 'Rhizoctonia sp.', family: 'Ceratobasidiaceae', type: 'orchid mycorrhiza' }],
    });
    mocks.fetchSpeciesDossier.mockResolvedValue(dossier());

    renderPage();
    await flush();

    expect(container.textContent).toContain('Rhizoctonia sp.');
  });

  it('still shows the conservation status fallback when ocBackend has no assessment', async () => {
    mocks.fetchSpeciesById.mockResolvedValue({
      taxonomy_id: 'cattleya-labiata',
      canonical_name: 'Cattleya labiata',
    });
    mocks.fetchSpeciesDossier.mockResolvedValue(dossier());

    renderPage();
    await flush();

    expect(container.textContent).toContain('Not yet assessed in the Continuum record.');
  });
});

describe('Species Dossier → Atlas mounted continuity', () => {
  function atlasLink(): HTMLAnchorElement | null {
    return container.querySelector<HTMLAnchorElement>('a[href^="/atlas?species="]');
  }

  it('routes the View on Atlas action through the canonical identity resolver, not a hand-built query', async () => {
    mocks.fetchSpeciesById.mockResolvedValue({
      taxonomy_id: 'cattleya-labiata',
      canonical_name: 'Cattleya labiata',
    });
    mocks.fetchSpeciesDossier.mockResolvedValue(dossier());

    renderPage();
    await flush();

    const link = atlasLink();
    expect(link).toBeTruthy();
    // Exactly the bounded canonical binomial, URL-encoded, and nothing else.
    expect(link?.getAttribute('href')).toBe('/atlas?species=Cattleya+labiata');
    expect(link?.textContent).toContain('View on Atlas');
  });

  it('prefers the dossier accepted name over the ocBackend canonical name for the Atlas subject', async () => {
    mocks.fetchSpeciesById.mockResolvedValue({
      taxonomy_id: 'cattleya-labiata',
      canonical_name: 'Cattleya percivaliana',
    });
    mocks.fetchSpeciesDossier.mockResolvedValue(
      dossier({
        identity: {
          ...dossier().identity,
          accepted_name: 'Cattleya labiata',
        },
      }),
    );

    renderPage();
    await flush();

    expect(atlasLink()?.getAttribute('href')).toBe('/atlas?species=Cattleya+labiata');
  });

  it('fails closed: hides the Atlas action when only an opaque route id is available', async () => {
    // No canonical_name / scientific_name from ocBackend, and the dossier fetch
    // fails, so the only thing identifying the record is the opaque route slug.
    mocks.fetchSpeciesById.mockResolvedValue({
      taxonomy_id: 'cattleya-labiata',
    });
    mocks.fetchSpeciesDossier.mockRejectedValue(new Error('503'));

    renderPage();
    await flush();

    // The rest of the page still renders, but the Atlas action must be absent
    // rather than leaking the route id into an Atlas search.
    expect(atlasLink()).toBeNull();
    expect(container.querySelector('a[href^="/atlas"]')).toBeNull();
  });

  it('fails closed when the authoritative identity field is malformed instead of widening it', async () => {
    mocks.fetchSpeciesById.mockResolvedValue({
      taxonomy_id: 'cattleya-labiata',
      canonical_name: 'Cattleya labiata',
    });
    // Accepted name is supplied first but malformed (an opaque route fragment);
    // the resolver must fail closed rather than skip down to the clean canonical.
    mocks.fetchSpeciesDossier.mockResolvedValue(
      dossier({
        identity: {
          ...dossier().identity,
          accepted_name: '/species/opaque-route-id',
          full_scientific_name: '/species/opaque-route-id',
        },
      }),
    );

    renderPage();
    await flush();

    expect(atlasLink()).toBeNull();
  });
});
