import { describe, expect, it } from 'vitest';

import { speciesDossierResearchHref } from '@/lib/speciesDossierResearchNavigation';
import { speciesDossierCalyxHref } from '@/lib/speciesDossierCalyxNavigation';
import { speciesDossierMatrixHref } from '@/lib/speciesDossierMatrixNavigation';
import { parseResearchRouteContext } from '@/lib/researchRouteContext';
import {
  researchStationAtlasHref,
  researchStationCalyxHref,
  researchStationLexiconHref,
  researchStationMatrixHref,
  researchStationHref,
  assertNoLocalityLeak,
} from '@/lib/researchStationNavigation';
import { parseRoute as parseLexiconRoute } from '@/features/lexicon/lexiconRoute';
import { readIdentificationSourceContext } from '@/features/calyx-workspace/identificationContext';
import { buildCalyxTurnContext, parseCalyxRouteContext } from '@/lib/calyxConversation';
import { atlasNextResearchHref } from '@/features/atlas-next/researchHandoff';
import { atlasOccurrenceEvidenceCalyxHref } from '@/features/atlas-next/calyxHandoff';
import { applyAtlasFilters, type AtlasOccurrencePoint } from '@/lib/orchidContinuum';

/**
 * The Continuum journey as one contract chain.
 *
 * Every hop has its own tests. Nothing pinned the chain — and the failures this
 * repository actually shipped were all at the joins: a species widening to its
 * genus one hop along, a search term resolving to a front page, a subject
 * arriving nowhere. Each module was correct in isolation.
 *
 * These are continuity properties, not visual assertions. They traverse the
 * real builders and parsers so a change to either half of any join fails here
 * rather than in a user's investigation.
 *
 * The organism is Cattleya purpurata throughout — a taxon whose historical
 * identities span several genera, which is precisely why losing the exact name
 * at a module boundary matters.
 */

const GENUS = 'Cattleya';
const SPECIES = 'Cattleya purpurata';
const PROJECT = 'proj-77';

const searchOf = (href: string) => {
  const index = href.indexOf('?');
  return index === -1 ? '' : href.slice(index);
};
const pathOf = (href: string) => {
  const index = href.indexOf('?');
  return index === -1 ? href : href.slice(0, index);
};

/** Every query key a governed route emits on this journey. */
function journeyHrefs(): Array<{ leg: string; href: string }> {
  const research = speciesDossierResearchHref({ genus: GENUS, taxon: SPECIES })!;
  const station = { taxon: SPECIES, projectId: PROJECT };
  return [
    { leg: 'dossier→research', href: research },
    { leg: 'dossier→calyx', href: speciesDossierCalyxHref({ genus: GENUS, taxon: SPECIES })! },
    {
      leg: 'dossier→matrix',
      href: speciesDossierMatrixHref('/orchid-identification', {
        taxonId: 'taxon-9',
        taxonLabel: SPECIES,
      })!,
    },
    { leg: 'research→atlas', href: researchStationAtlasHref(station) },
    { leg: 'research→calyx', href: researchStationCalyxHref(station) },
    { leg: 'research→lexicon', href: researchStationLexiconHref(station) },
    { leg: 'research→matrix', href: researchStationMatrixHref(station) },
    { leg: 'atlas→research', href: atlasNextResearchHref({ genus: GENUS, projectId: PROJECT })! },
    { leg: 'atlas→calyx', href: atlasOccurrenceEvidenceCalyxHref(GENUS, 'Why is it montane?')! },
  ];
}

describe('continuum journey — subject continuity', () => {
  it('carries the exact species from the dossier into Research', () => {
    const context = parseResearchRouteContext(
      new URLSearchParams(searchOf(speciesDossierResearchHref({ genus: GENUS, taxon: SPECIES })!)),
    );
    expect(context).not.toBeNull();
    expect('taxon' in context! ? context!.taxon : null).toBe(SPECIES);
  });

  it('does not widen the species to its genus on any onward leg that can carry it', () => {
    const station = { taxon: SPECIES, projectId: PROJECT };

    // Atlas filters on the canonical binomial.
    expect(new URLSearchParams(searchOf(researchStationAtlasHref(station))).get('species')).toBe(
      SPECIES,
    );
    // Calyx receives the exact taxon alongside the derived genus.
    expect(new URLSearchParams(searchOf(researchStationCalyxHref(station))).get('taxon')).toBe(
      SPECIES,
    );
    // Lexicon searches the exact name.
    expect(new URLSearchParams(searchOf(researchStationLexiconHref(station))).get('q')).toBe(
      SPECIES,
    );
    // Matrix receives it as inbound context.
    expect(new URLSearchParams(searchOf(researchStationMatrixHref(station))).get('taxon')).toBe(
      SPECIES,
    );
  });

  it('lands the species on a receiving surface that acts on it, not merely records it', () => {
    const station = { taxon: SPECIES, projectId: PROJECT };

    // Atlas: the congener must actually drop out.
    const point = (canonicalName: string) =>
      ({ id: canonicalName, species: canonicalName, canonicalName, genus: GENUS, countries: [], pollinators: [] }) as unknown as AtlasOccurrencePoint;
    const species = new URLSearchParams(searchOf(researchStationAtlasHref(station))).get('species')!;
    expect(
      applyAtlasFilters([point(SPECIES), point('Cattleya labiata')], { species: [species] }).map(
        (p) => p.canonicalName,
      ),
    ).toEqual([SPECIES]);

    // Lexicon: the browser opens on the term, not the front page.
    const lexicon = researchStationLexiconHref(station);
    expect(parseLexiconRoute(pathOf(lexicon), searchOf(lexicon))).toEqual({
      view: 'lexicon',
      query: SPECIES,
    });

    // Matrix: the subject is read, not discarded.
    expect(readIdentificationSourceContext(searchOf(researchStationMatrixHref(station))).taxonLabel).toBe(
      SPECIES,
    );

    // Calyx: the exact species reaches the model's turn context.
    const turn = buildCalyxTurnContext({
      projectId: PROJECT,
      uploadedFiles: [],
      routeSearch: searchOf(researchStationCalyxHref(station)),
    }) as { route_context?: Record<string, unknown> };
    expect(turn.route_context?.taxon).toBe(SPECIES);
  });
});

describe('continuum journey — project and question continuity', () => {
  it('keeps the project across every leg that accepts one, and a route back', () => {
    const station = { taxon: SPECIES, projectId: PROJECT };
    for (const href of [
      researchStationAtlasHref(station),
      researchStationCalyxHref(station),
      researchStationLexiconHref(station),
      researchStationMatrixHref(station),
    ]) {
      expect(new URLSearchParams(searchOf(href)).get('project')).toBe(PROJECT);
    }
    expect(researchStationHref(PROJECT)).toBe(`/research?project=${PROJECT}`);
    expect(readIdentificationSourceContext(searchOf(researchStationMatrixHref(station))).projectId).toBe(
      PROJECT,
    );
  });

  it('does not manufacture a project when the investigation has none', () => {
    // A dossier-originated journey has no persisted project. Inventing one
    // would attach an unrelated investigation to this subject.
    const dossierCalyx = searchOf(speciesDossierCalyxHref({ genus: GENUS, taxon: SPECIES })!);
    expect(new URLSearchParams(dossierCalyx).get('project')).toBeNull();

    const noProject = readIdentificationSourceContext(
      searchOf(researchStationMatrixHref({ taxon: SPECIES })),
    );
    expect(noProject.taxonLabel).toBe(SPECIES);
    expect(noProject.projectId).toBeNull();
    expect(researchStationHref('')).toBe('/research');
  });

  it('preserves a user question into Calyx without promoting it to evidence', () => {
    const question = 'Why is this taxon restricted to montane sites?';
    const turn = buildCalyxTurnContext({
      projectId: PROJECT,
      uploadedFiles: [],
      routeSearch: searchOf(atlasOccurrenceEvidenceCalyxHref(GENUS, question)!),
    }) as { route_context?: Record<string, unknown> };

    expect(turn.route_context?.question).toBe(question);
    expect(turn.route_context?.question_source).toBe('user');
    expect(turn.route_context?.question_is_evidence).toBe(false);
  });
});

describe('continuum journey — the evidence boundary', () => {
  it('declares every carried subject non-evidentiary at the boundary that carries it', () => {
    // Dossier legs assert it outbound in the URL.
    for (const leg of ['dossier→research', 'dossier→calyx']) {
      const href = journeyHrefs().find((entry) => entry.leg === leg)!.href;
      expect(new URLSearchParams(searchOf(href)).get('context_is_evidence')).toBe('false');
    }
    expect(
      new URLSearchParams(
        searchOf(journeyHrefs().find((e) => e.leg === 'atlas→research')!.href),
      ).get('context_is_evidence'),
    ).toBe('false');

    // Calyx legs assert it in the turn payload, where the model actually reads.
    for (const href of [
      speciesDossierCalyxHref({ genus: GENUS, taxon: SPECIES })!,
      researchStationCalyxHref({ taxon: SPECIES, projectId: PROJECT }),
    ]) {
      const turn = buildCalyxTurnContext({
        projectId: PROJECT,
        uploadedFiles: [],
        routeSearch: searchOf(href),
      }) as { route_context?: Record<string, unknown> };
      expect(turn.route_context?.taxon_is_evidence).toBe(false);
    }

    // Matrix asserts it is neither an observation nor evidence.
    const matrix = readIdentificationSourceContext(
      searchOf(researchStationMatrixHref({ taxon: SPECIES, projectId: PROJECT })),
    );
    expect(matrix.contextIsObservation).toBe(false);
    expect(matrix.contextIsEvidence).toBe(false);
  });

  it('never turns a carried name into a Matrix taxon identity', () => {
    // A determination requires a governed process. Arriving with a name is not
    // one, so no taxonId may be synthesised from it.
    const carried = readIdentificationSourceContext(
      searchOf(researchStationMatrixHref({ taxon: SPECIES, projectId: PROJECT })),
    );
    expect(carried.taxonId).toBeUndefined();

    // The dossier leg does carry a real canonical id, and that one is kept.
    const dossier = readIdentificationSourceContext(
      searchOf(
        speciesDossierMatrixHref('/orchid-identification', {
          taxonId: 'taxon-9',
          taxonLabel: SPECIES,
        })!,
      ),
    );
    expect(dossier.taxonId).toBe('taxon-9');
  });

  it('fails closed when a boundary declaration is missing or altered', () => {
    const href = speciesDossierCalyxHref({ genus: GENUS, taxon: SPECIES })!;
    const tampered = searchOf(href).replace('context_is_evidence=false', 'context_is_evidence=true');
    const turn = buildCalyxTurnContext({
      projectId: PROJECT,
      uploadedFiles: [],
      routeSearch: tampered,
    }) as { route_context?: Record<string, unknown> };
    // The dossier adapter rejects it, so the exact taxon does not travel.
    expect(turn.route_context?.taxon).toBeUndefined();

    const dropped = searchOf(href).replace('&context_is_evidence=false', '');
    expect(
      parseResearchRouteContext(new URLSearchParams(dropped.replace('species-dossier-calyx', 'species-dossier-research'))),
    ).toBeNull();
  });
});

describe('continuum journey — the locality boundary', () => {
  const LOCALITY_KEYS = [
    'lat', 'latitude', 'lon', 'lng', 'longitude', 'coord', 'coordinates',
    'locality', 'location', 'site', 'place', 'grid', 'gps', 'elevation_m',
    'occurrence_id', 'occurrenceid', 'collector', 'catalogue_number', 'catalog_number',
    'recorded_by', 'record_id',
  ];

  it('emits no locality key on any leg of the journey', () => {
    for (const { leg, href } of journeyHrefs()) {
      const keys = [...new URLSearchParams(searchOf(href)).keys()].map((k) => k.toLowerCase());
      for (const forbidden of LOCALITY_KEYS) {
        expect(keys, `${leg} leaked ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('does not let appended locality reach the Calyx turn payload', () => {
    // Protection has to survive a URL nobody sanitised — a shared link, a
    // pasted address, an appended parameter.
    const hostile =
      `${searchOf(speciesDossierCalyxHref({ genus: GENUS, taxon: SPECIES })!)}` +
      '&lat=-23.5&lon=-45.1&locality=Serra+do+Mar&occurrence_id=urn:cat:1&collector=Smith&elevation_m=900';
    const turn = buildCalyxTurnContext({
      projectId: PROJECT,
      uploadedFiles: [],
      routeSearch: hostile,
    }) as { route_context?: Record<string, unknown> };

    const serialized = JSON.stringify(turn.route_context);
    for (const leak of ['-23.5', '-45.1', 'Serra', 'urn:cat', 'Smith', '900', 'locality', 'elevation']) {
      expect(serialized).not.toContain(leak);
    }
  });

  it('emits exactly the keys the contract allows, so a new one must be deliberate', () => {
    // Enumerated rather than sampled: adding a parameter to a builder has to be
    // considered here, which is the only way a locality field gets caught
    // before it ships rather than after.
    expect(
      [...new URLSearchParams(searchOf(researchStationMatrixHref({ taxon: SPECIES }))).keys()].sort(),
    ).toEqual(['origin', 'taxon']);
    expect(
      [...new URLSearchParams(
        searchOf(speciesDossierCalyxHref({ genus: GENUS, taxon: SPECIES })!),
      ).keys()].sort(),
    ).toEqual(['context_is_evidence', 'genus', 'origin', 'taxon']);
  });

  it('fails closed rather than emitting a link when locality is forced through', () => {
    // assertNoLocalityLeak is the last guard: a caller that manages to put a
    // locality key into the query must get an exception, not a URL.
    expect(() => assertNoLocalityLeak({ taxon: SPECIES, locality: 'Serra do Mar' })).toThrow(
      /must not carry locality/i,
    );
    expect(() => assertNoLocalityLeak({ taxon: SPECIES, lat: '-23.5' })).toThrow();
    expect(() => assertNoLocalityLeak({ taxon: SPECIES, project: PROJECT })).not.toThrow();
  });
});

describe('continuum journey — failure honesty', () => {
  it('drops a subject it cannot carry intact rather than carrying a mangled one', () => {
    // A truncated binomial is a different organism. Every producer on this
    // journey refuses rather than approximating.
    const tooLong = 'C'.repeat(300);
    expect(speciesDossierCalyxHref({ genus: GENUS, taxon: tooLong })).toBeNull();
    expect(speciesDossierResearchHref({ genus: '<script>', taxon: SPECIES })).toBeNull();
    expect(
      readIdentificationSourceContext(`?origin=research-station&taxon=${tooLong}`).taxonLabel,
    ).toBeUndefined();
  });

  it('rejects a genus and species that disagree', () => {
    // Genus Cattleya with a Laelia binomial is a contradiction, not a subject.
    expect(speciesDossierCalyxHref({ genus: GENUS, taxon: 'Laelia purpurata' })).toBeNull();
  });

  it('treats an unrecognised origin as no context at all', () => {
    const foreign = '?genus=Cattleya&taxon=Cattleya+purpurata&origin=somewhere-else';
    expect(readIdentificationSourceContext(foreign).taxonLabel).toBeUndefined();
    expect(parseResearchRouteContext(new URLSearchParams(foreign))).toBeNull();
    // Calyx keeps only what its generic parser can bound — never the exact taxon.
    expect(parseCalyxRouteContext(foreign).featuredTaxon?.name).toBe(GENUS);
    const turn = buildCalyxTurnContext({
      projectId: PROJECT,
      uploadedFiles: [],
      routeSearch: foreign,
    }) as { route_context?: Record<string, unknown> };
    expect(turn.route_context?.taxon).toBeUndefined();
  });
});
