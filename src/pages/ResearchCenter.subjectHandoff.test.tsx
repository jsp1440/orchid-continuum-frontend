// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Auth is an external service boundary (Supabase session), so it is stubbed.
// Nothing between the dossier href and the receiving modules is.
const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({ user: null, session: null, loading: false })),
}));

vi.mock('@/contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/contexts/AuthContext')>(
    '@/contexts/AuthContext',
  );
  return { ...actual, useAuth: mocks.useAuth };
});

import ResearchCenter from './ResearchCenter';
import { speciesDossierResearchHref } from '@/lib/speciesDossierResearchNavigation';
import { buildCalyxTurnContext, parseCalyxRouteContext } from '@/lib/calyxConversation';
import { applyAtlasFilters, type AtlasOccurrencePoint } from '@/lib/orchidContinuum';

/**
 * The subject must survive the whole journey, not just the first hop.
 *
 * A visitor reading the dossier for Cattleya purpurata continues into Research,
 * then on to Atlas or Calyx. Research names the species in its banner — "this
 * is preserved here as navigation context" — so the onward links have to carry
 * the species. Carrying only the genus token silently widens the subject from
 * one species to every Cattleya, while the page claims preservation. Nothing
 * errors; the visitor simply ends up studying the wrong thing.
 *
 * These tests run the real chain: the dossier builds the href, Research parses
 * it and renders, and the emitted links are then parsed by the modules that
 * actually receive them. Only the network is absent — no module in the chain is
 * stubbed, because the wiring between them is the thing under test.
 */

const GENUS = 'Cattleya';
const SPECIES = 'Cattleya purpurata';

let container: HTMLDivElement;
let root: Root;

async function renderAt(search: string) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[search]}>
        <ResearchCenter />
      </MemoryRouter>,
    );
  });
}

/** The href behind a link whose visible label matches. */
function hrefFor(label: RegExp): string {
  const anchor = [...container.querySelectorAll('a')].find((a) =>
    label.test(a.textContent ?? ''),
  );
  if (!anchor) throw new Error(`no link matching ${label}`);
  return anchor.getAttribute('href') ?? '';
}

function searchOf(href: string): string {
  const index = href.indexOf('?');
  return index === -1 ? '' : href.slice(index);
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = vi.fn(async () => new Response('{}', { status: 503 })) as typeof globalThis.fetch;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

describe('research center carries the arriving subject onward', () => {
  it('names the species it received from the dossier', async () => {
    await renderAt(speciesDossierResearchHref({ genus: GENUS, taxon: SPECIES })!);
    expect(container.textContent).toContain(SPECIES);
  });

  it('hands Calyx the exact species, not just its genus', async () => {
    await renderAt(speciesDossierResearchHref({ genus: GENUS, taxon: SPECIES })!);

    // Parsed by the module that actually receives this URL.
    const search = searchOf(hrefFor(/ask calyx/i));
    const routeContext = parseCalyxRouteContext(search);
    expect(routeContext.featuredTaxon?.name).toBe(GENUS);

    // And reaches the model's turn context as an exact taxon — which Calyx
    // reads only under the research-station origin.
    const turn = buildCalyxTurnContext({
      projectId: 'p-1',
      uploadedFiles: [],
      routeSearch: search,
    }) as { route_context?: Record<string, unknown> };
    expect(turn.route_context?.taxon).toBe(SPECIES);
    // Navigation context, never promoted to evidence by having travelled.
    expect(turn.route_context?.taxon_is_evidence).toBe(false);
  });

  it('filters the Atlas to the species rather than the whole genus', async () => {
    await renderAt(speciesDossierResearchHref({ genus: GENUS, taxon: SPECIES })!);
    const params = new URLSearchParams(searchOf(hrefFor(/return to atlas/i)));

    expect(params.get('species')).toBe(SPECIES);

    // Applied against real occurrences: the congener must drop out. A genus
    // filter would keep both, which is the silent widening this prevents.
    const point = (canonicalName: string): AtlasOccurrencePoint =>
      ({
        id: canonicalName,
        species: canonicalName,
        canonicalName,
        genus: GENUS,
        countries: [],
        pollinators: [],
      }) as unknown as AtlasOccurrencePoint;
    const points = [point(SPECIES), point('Cattleya labiata')];
    const kept = applyAtlasFilters(points, { species: [params.get('species')!] });
    expect(kept.map((p) => p.canonicalName)).toEqual([SPECIES]);
  });

  it('still filters by genus when only a genus arrived', async () => {
    // Genus-of-the-day and Atlas arrivals carry no species. They must keep
    // working exactly as before rather than degrading to an unfiltered view.
    await renderAt(`?genus=${GENUS}&origin=homepage-featured-taxon`);

    const atlas = new URLSearchParams(searchOf(hrefFor(/return to atlas/i)));
    expect(atlas.get('genera')).toBe(GENUS);
    expect(atlas.get('species')).toBeNull();

    const calyx = parseCalyxRouteContext(searchOf(hrefFor(/ask calyx/i)));
    expect(calyx.featuredTaxon?.name).toBe(GENUS);
  });

  it('never carries locality out of the research context', async () => {
    await renderAt(speciesDossierResearchHref({ genus: GENUS, taxon: SPECIES })!);
    for (const label of [/return to atlas/i, /ask calyx/i]) {
      const keys = [...new URLSearchParams(searchOf(hrefFor(label))).keys()];
      expect(keys).not.toContain('locality');
      expect(keys).not.toContain('lat');
      expect(keys).not.toContain('lon');
      expect(keys).not.toContain('coordinates');
    }
  });
});
