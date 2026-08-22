import { describe, expect, it } from 'vitest';

import { readIdentificationSourceContext } from './identificationContext';
import {
  researchStationHref,
  researchStationMatrixHref,
} from '@/lib/researchStationNavigation';
import { speciesDossierMatrixHref } from '@/lib/speciesDossierMatrixNavigation';

/**
 * Matrix is the fourth leg of the Research Station's fan-out and the one that
 * dropped the subject completely.
 *
 * researchStationMatrixHref sends the investigation's taxon here with
 * origin=research-station. Nothing read that origin, so the parser returned an
 * empty context: no subject, no acknowledgement, no route back. The visitor
 * left an investigation and arrived at a blank identification tool.
 *
 * The taxon is inbound navigation context on every leg of this fan-out. Matrix
 * must show it without ever implying Matrix produced it — an identification
 * tool naming a taxon is exactly where a carried name could be mistaken for a
 * determination.
 */

const SPECIES = 'Cattleya purpurata';

function contextFrom(href: string) {
  const index = href.indexOf('?');
  return readIdentificationSourceContext(index === -1 ? '' : href.slice(index));
}

describe('matrix receives the research station subject', () => {
  it('reads the subject the Research Station sent', () => {
    const context = contextFrom(researchStationMatrixHref({ taxon: SPECIES, projectId: 'p-1' }));
    expect(context.source).toBe('research-station');
    expect(context.taxonLabel).toBe(SPECIES);
    expect(context.projectId).toBe('p-1');
  });

  it('never presents the carried subject as an observation or evidence', () => {
    const context = contextFrom(researchStationMatrixHref({ taxon: SPECIES, projectId: 'p-1' }));
    // Asserted false explicitly rather than left absent: an unclaimed boundary
    // is how carried context quietly becomes a determination.
    expect(context.contextIsObservation).toBe(false);
    expect(context.contextIsEvidence).toBe(false);
    // A carried name is not a Matrix taxon identity.
    expect(context.taxonId).toBeUndefined();
  });

  it('keeps the return path to the investigation', () => {
    const context = contextFrom(researchStationMatrixHref({ taxon: SPECIES, projectId: 'p-1' }));
    expect(researchStationHref(context.projectId ?? '')).toBe('/research?project=p-1');
  });

  it('still resolves without a project, rather than failing the whole arrival', () => {
    // A dossier-originated investigation has no project yet. The subject must
    // survive anyway; only the project-scoped return link degrades.
    const context = contextFrom(researchStationMatrixHref({ taxon: SPECIES }));
    expect(context.taxonLabel).toBe(SPECIES);
    expect(context.projectId).toBeNull();
    expect(researchStationHref('')).toBe('/research');
  });

  it('fails closed on a taxon it cannot carry intact', () => {
    // Truncating a binomial would produce a different name and show it as the
    // visitor's subject. Rejecting is the only safe outcome.
    const tooLong = `?origin=research-station&taxon=${'A'.repeat(300)}`;
    expect(readIdentificationSourceContext(tooLong).taxonLabel).toBeUndefined();

    const markup = '?origin=research-station&taxon=%3Cscript%3E';
    expect(readIdentificationSourceContext(markup).taxonLabel).toBeUndefined();
  });

  it('rejects a project id it cannot trust, without losing the subject', () => {
    const context = readIdentificationSourceContext(
      `?origin=research-station&taxon=${encodeURIComponent(SPECIES)}&project=../../etc`,
    );
    expect(context.taxonLabel).toBe(SPECIES);
    expect(context.projectId).toBeNull();
  });

  it('leaves the dossier and lexicon arrivals unchanged', () => {
    const dossier = contextFrom(
      speciesDossierMatrixHref('/orchid-identification', {
        taxonId: 'taxon-9',
        taxonLabel: SPECIES,
      })!,
    );
    expect(dossier.source).toBe('species-dossier');
    expect(dossier.taxonId).toBe('taxon-9');

    const lexicon = readIdentificationSourceContext('?concept=resupination&label=Resupination');
    expect(lexicon.concept).toBe('resupination');
    expect(lexicon.label).toBe('Resupination');
    expect(lexicon.source).toBeUndefined();
  });
});
