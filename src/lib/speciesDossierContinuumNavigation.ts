import {
  resolveSpeciesDossierCanonicalSubject,
  speciesDossierAtlasHref,
  type SpeciesDossierAtlasIdentity,
} from './speciesDossierAtlasNavigation';
import { speciesDossierResearchHref } from './speciesDossierResearchNavigation';
import { speciesDossierCalyxHref } from './speciesDossierCalyxNavigation';

export interface SpeciesDossierContinuumActions {
  atlas: string;
  research: string;
  calyx: string;
}

/**
 * Resolve one canonical Species Dossier subject and use it for every public
 * downstream continuation. This prevents Atlas, Research, and Calyx from
 * independently choosing different identity fallbacks when one backing source
 * is unavailable or malformed.
 *
 * The first supplied identity field is authoritative. If it is malformed the
 * whole fan-out fails closed; route/taxonomy ids are never candidates.
 */
export function speciesDossierContinuumActions(
  identity: SpeciesDossierAtlasIdentity,
): SpeciesDossierContinuumActions | null {
  const subject = resolveSpeciesDossierCanonicalSubject(identity);
  if (!subject) return null;

  const atlas = speciesDossierAtlasHref(subject.taxon);
  const research = speciesDossierResearchHref({
    genus: subject.genus,
    taxon: subject.taxon,
  });
  const calyx = speciesDossierCalyxHref({
    genus: subject.genus,
    taxon: subject.taxon,
  });

  if (!atlas || !research || !calyx) return null;
  return { atlas, research, calyx };
}
