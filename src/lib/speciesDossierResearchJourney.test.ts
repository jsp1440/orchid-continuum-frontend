import { describe, expect, it } from 'vitest';

import {
  SPECIES_DOSSIER_RESEARCH_ORIGIN,
  parseSpeciesDossierResearchContext,
  speciesDossierResearchHref,
} from '@/lib/speciesDossierResearchNavigation';
import { parseResearchRouteContext } from '@/lib/researchRouteContext';
import { researchStationCalyxHref, RESEARCH_STATION_ORIGIN } from '@/lib/researchStationNavigation';
import { buildCalyxTurnContext } from '@/lib/calyxConversation';

/**
 * Species Dossier → Research → Calyx, walked as one chain.
 *
 * The dossier previously offered Atlas and Matrix and nothing else, so a
 * visitor reading about an organism had to retype it to research it. That is
 * where subject identity was being lost.
 *
 * The subject used here is the one the repository's own Research Station
 * fixtures use, so the chain is exercised on a taxon the product actually
 * carries rather than an invented one.
 */

const TAXON = 'Phalaenopsis amabilis';
const GENUS = 'Phalaenopsis';

/** Query portion of a builder's href, as the router would hand it over. */
function searchOf(href: string | null): string {
  if (!href) throw new Error('handoff builder refused to produce an href');
  const index = href.indexOf('?');
  return index === -1 ? '' : href.slice(index);
}

describe('species dossier → research → calyx', () => {
  it('carries the dossier subject into Research without it being retyped', () => {
    const href = speciesDossierResearchHref({ genus: GENUS, taxon: TAXON });
    const context = parseResearchRouteContext(searchOf(href));

    expect(context).toEqual({
      origin: SPECIES_DOSSIER_RESEARCH_ORIGIN,
      genus: GENUS,
      taxon: TAXON,
      projectId: null,
      contextIsEvidence: false,
    });
  });

  it('keeps the accepted binomial, not just the genus', () => {
    // The whole point of the dossier handoff: Research can name the organism
    // the visitor was reading about, rather than degrading it to its genus.
    const context = parseResearchRouteContext(
      searchOf(speciesDossierResearchHref({ genus: GENUS, taxon: TAXON })),
    );
    expect(context && 'taxon' in context ? context.taxon : null).toBe(TAXON);
  });

  it('continues from Research into Calyx with the subject still attached', () => {
    const calyxHref = researchStationCalyxHref({
      taxon: TAXON,
      projectId: 'naocc-phalaenopsis',
      conversationId: 'conv-1',
    });
    const turn = buildCalyxTurnContext({
      projectId: 'naocc-phalaenopsis',
      uploadedFiles: [],
      routeSearch: searchOf(calyxHref),
    });
    const routeContext = (turn as { route_context: Record<string, unknown> }).route_context;

    expect(routeContext.taxon).toBe(TAXON);
    expect(routeContext.origin).toBe(RESEARCH_STATION_ORIGIN);
    // Still context at the far end of the chain, three handoffs later.
    expect(routeContext.taxon_is_evidence).toBe(false);
  });

  it('never lets a dossier subject arrive as evidence', () => {
    // Both directions: the builder always asserts false, and the parser refuses
    // anything that claims otherwise or omits the claim entirely.
    expect(speciesDossierResearchHref({ genus: GENUS, taxon: TAXON })).toContain(
      'context_is_evidence=false',
    );
    expect(
      parseSpeciesDossierResearchContext(
        `?genus=${GENUS}&origin=${SPECIES_DOSSIER_RESEARCH_ORIGIN}&context_is_evidence=true`,
      ),
    ).toBeNull();
    expect(
      parseSpeciesDossierResearchContext(`?genus=${GENUS}&origin=${SPECIES_DOSSIER_RESEARCH_ORIGIN}`),
    ).toBeNull();
  });

  it('offers no handoff when the dossier has no usable genus', () => {
    // The affordance must be absent rather than producing a link Research
    // would refuse on arrival.
    expect(speciesDossierResearchHref({ genus: null })).toBeNull();
    expect(speciesDossierResearchHref({ genus: '' })).toBeNull();
    expect(speciesDossierResearchHref({ genus: 'not a genus' })).toBeNull();
    expect(speciesDossierResearchHref({ genus: '<script>' })).toBeNull();
  });

  it('drops an unusable binomial without losing the usable genus', () => {
    const href = speciesDossierResearchHref({ genus: GENUS, taxon: 'x'.repeat(400) });
    const context = parseResearchRouteContext(searchOf(href));
    expect(context?.genus).toBe(GENUS);
    expect(context && 'taxon' in context ? context.taxon : null).toBeNull();
  });

  it('opens no route for locality, occurrence or collector material', () => {
    // Asserted on the built href itself: a parser that ignores a field is a
    // weaker guarantee than a contract that never offers one.
    const href = speciesDossierResearchHref({ genus: GENUS, taxon: TAXON })!;
    const keys = [...new URLSearchParams(searchOf(href)).keys()].sort();
    expect(keys).toEqual(['context_is_evidence', 'genus', 'origin', 'taxon']);
  });

  it('ignores protected material appended to the route by hand', () => {
    const hostile = new URLSearchParams({
      genus: GENUS,
      origin: SPECIES_DOSSIER_RESEARCH_ORIGIN,
      taxon: TAXON,
      context_is_evidence: 'false',
      decimalLatitude: '14.5995',
      locality: 'Sitio Malabon ridge',
      occurrenceID: 'GBIF:2401991234',
      recordedBy: 'M. Dela Cruz',
      catalogNumber: 'PH-AMAB-0091',
      elevation: '400',
    }).toString();

    const context = parseResearchRouteContext(`?${hostile}`);
    expect(Object.keys(context ?? {}).sort()).toEqual([
      'contextIsEvidence',
      'genus',
      'origin',
      'projectId',
      'taxon',
    ]);
    const serialized = JSON.stringify(context);
    for (const leak of ['14.5995', 'Sitio Malabon', 'GBIF:2401991234', 'Dela Cruz', 'PH-AMAB-0091', '400']) {
      expect(serialized).not.toContain(leak);
    }
  });

  it('leaves the other governed origins working', () => {
    // A new origin must not shadow the existing ones through the shared parser.
    const featured = parseResearchRouteContext(
      '?genus=Phalaenopsis&origin=homepage-featured-taxon&context_is_evidence=false',
    );
    expect(featured?.origin).toBe('homepage-featured-taxon');
    const atlas = parseResearchRouteContext(
      '?genus=Phalaenopsis&origin=atlas-next&context_is_evidence=false',
    );
    expect(atlas?.origin).toBe('atlas-next');
  });
});
