// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  speciesDossierCalyxHref,
  parseSpeciesDossierCalyxContext,
} from '@/lib/speciesDossierCalyxNavigation';
import { buildCalyxTurnContext } from '@/lib/calyxConversation';

/**
 * Species Dossier → Ask Calyx, through the real chain.
 *
 * The producer, parser and turn adapter existed but nothing used them: the
 * dossier had no Ask Calyx action, Calyx did not recognise the origin, and the
 * turn context never carried the exact species. This exercises producer →
 * parser → turn adapter → mounted consumer so the path cannot silently come
 * apart at any one of those joins.
 *
 * The scientific boundary is the point. A dossier is full of evidence receipts,
 * confidence values, conclusions and occurrence records. None of that may ride
 * along, and the species that does ride along is a statement about what the
 * visitor was reading — never about what has been established.
 */

const GENUS = 'Cattleya';
const SPECIES = 'Cattleya purpurata';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({ user: null, session: null, loading: false })),
}));

vi.mock('@/contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/contexts/AuthContext')>(
    '@/contexts/AuthContext',
  );
  return { ...actual, useAuth: mocks.useAuth };
});

// The Calyx workspace itself is a large authenticated surface with its own
// backend. The route wrapper — which is what consumes the handoff — is the unit
// under test, so only the workspace beneath it is stood down.
vi.mock('@/pages/CalyxWorkspace', () => ({
  default: () => <div data-testid="calyx-workspace" />,
}));

import AtlasAwareCalyxRoute from '@/components/calyx/AtlasAwareCalyxRoute';

const href = () => speciesDossierCalyxHref({ genus: GENUS, taxon: SPECIES })!;
const searchOf = (url: string) => url.slice(url.indexOf('?'));

let container: HTMLDivElement;
let root: Root;

async function mountCalyxAt(url: string) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/calyx" element={<AtlasAwareCalyxRoute />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

describe('species dossier opens Calyx on the exact species', () => {
  it('produces a handoff the parser accepts', () => {
    const context = parseSpeciesDossierCalyxContext(searchOf(href()));
    expect(context).not.toBeNull();
    expect(context!.genus).toBe(GENUS);
    expect(context!.taxon).toBe(SPECIES);
    expect(context!.contextIsEvidence).toBe(false);
  });

  it('carries the exact species into the turn context as non-evidence', () => {
    const turn = buildCalyxTurnContext({
      projectId: 'p-1',
      uploadedFiles: [],
      routeSearch: searchOf(href()),
    }) as { route_context?: Record<string, unknown> };

    expect(turn.route_context?.taxon).toBe(SPECIES);
    expect(turn.route_context?.taxon_source).toBe('species-dossier-calyx');
    expect(turn.route_context?.taxon_is_evidence).toBe(false);
    expect(turn.route_context?.featured_taxon).toEqual({
      rank: 'genus',
      accepted_name: GENUS,
    });
  });

  it('sends nothing from the dossier but the subject', () => {
    const turn = buildCalyxTurnContext({
      projectId: 'p-1',
      uploadedFiles: [],
      routeSearch: searchOf(href()),
    }) as { route_context?: Record<string, unknown> };

    // Enumerated, not sampled: a new key added to the adapter must be
    // considered here rather than travelling unnoticed.
    expect(Object.keys(turn.route_context!).sort()).toEqual([
      'featured_taxon',
      'origin',
      'taxon',
      'taxon_is_evidence',
      'taxon_source',
    ]);
  });

  it('refuses to carry appended locality or evidence fields', () => {
    // A hostile or careless caller appending to the URL must not widen what the
    // turn context asserts.
    const hostile =
      `${searchOf(href())}&lat=-23.5&locality=Serra+do+Mar&occurrence_id=urn:1` +
      '&collector=Smith&catalogue_number=K000123&confidence=0.98&conclusion=endangered';
    const turn = buildCalyxTurnContext({
      projectId: 'p-1',
      uploadedFiles: [],
      routeSearch: hostile,
    }) as { route_context?: Record<string, unknown> };

    const serialized = JSON.stringify(turn.route_context);
    for (const leak of ['lat', 'locality', 'occurrence_id', 'collector', 'catalogue', 'confidence', 'conclusion', 'Serra']) {
      expect(serialized).not.toContain(leak);
    }
  });

  it('names the species on the mounted Calyx route', async () => {
    await mountCalyxAt(href());
    const text = container.textContent ?? '';
    expect(text).toContain('Continuing from the Species Dossier');
    expect(text).toContain(SPECIES);
    // The workspace still mounts beneath the banner.
    expect(container.querySelector('[data-testid="calyx-workspace"]')).not.toBeNull();
  });

  it('does not claim a research project the visitor never had', async () => {
    await mountCalyxAt(href());
    const text = container.textContent ?? '';
    expect(text).not.toContain('Project not supplied');
    expect(text).not.toContain('Continuing from Research Station');
  });

  it('states that the carried subject is not a finding', async () => {
    await mountCalyxAt(href());
    const text = container.textContent ?? '';
    expect(text).toMatch(/navigation context/i);
    expect(text).toMatch(/not what has been established/i);
  });

  it('offers a return path that exists', async () => {
    await mountCalyxAt(href());
    const back = [...container.querySelectorAll('a')].find((a) =>
      /back to .* species/i.test(a.textContent ?? ''),
    );
    // /species?genus= is a real supported route; /species/<binomial> is not,
    // because a dossier is addressed by taxonomy_id.
    expect(back?.getAttribute('href')).toBe(`/species?genus=${GENUS}`);
  });

  it('renders no dossier banner for an unrelated Calyx arrival', async () => {
    await mountCalyxAt('/calyx?genus=Cattleya&origin=homepage-featured-taxon');
    expect(container.textContent ?? '').not.toContain('Continuing from the Species Dossier');
  });
});
