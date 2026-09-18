import { boundedCanonicalTaxon } from './canonicalTaxonName';

/**
 * A binomial, a hybrid with its sign, or one infraspecific rank — the shapes the
 * backend's shared name split presents as `accepted_name`. Anything else is not
 * a canonical species identity and yields no continuation.
 */
function boundedCanonicalSpecies(value: unknown): string | null {
  return boundedCanonicalTaxon(value)?.taxon ?? null;
}

/**
 * Continue from a Species Dossier into Atlas on the dossier's canonical
 * species identity only. Route ids, taxonomy ids, locality material and other
 * fallbacks are intentionally not accepted: if the dossier cannot establish a
 * bounded canonical binomial, the Atlas action must be absent rather than
 * widening an opaque route identity into a search.
 */
export function speciesDossierAtlasHref(species: unknown): string | null {
  const canonical = boundedCanonicalSpecies(species);
  if (!canonical) return null;

  const params = new URLSearchParams({ species: canonical });
  return `/atlas?${params.toString()}`;
}

export interface SpeciesDossierAtlasIdentity {
  acceptedName?: unknown;
  fullScientificName?: unknown;
  canonicalName?: unknown;
  scientificName?: unknown;
}

export interface SpeciesDossierCanonicalSubject {
  genus: string;
  taxon: string;
}

/**
 * Resolve the dossier's canonical downstream subject once, using the same
 * authoritative-field rule for Atlas, Research, and Calyx. The first identity
 * field actually supplied wins; if it is malformed, fail closed rather than
 * skipping to a lower-priority value that may describe another taxon.
 *
 * Route/taxonomy ids are deliberately not part of this interface.
 */
export function resolveSpeciesDossierCanonicalSubject(
  identity: SpeciesDossierAtlasIdentity,
): SpeciesDossierCanonicalSubject | null {
  for (const candidate of [
    identity.acceptedName,
    identity.fullScientificName,
    identity.canonicalName,
    identity.scientificName,
  ]) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    const taxon = boundedCanonicalSpecies(candidate);
    if (!taxon) return null;
    return { genus: taxon.split(' ', 1)[0], taxon };
  }

  return null;
}

/**
 * Resolve the Species Dossier's Atlas subject without ever falling back to the
 * route/taxonomy id. The first identity field actually supplied is treated as
 * authoritative; if that field is malformed, fail closed rather than skipping
 * past it to a lower-priority value that could describe a different taxon.
 */
export function speciesDossierAtlasHrefFromIdentity(
  identity: SpeciesDossierAtlasIdentity,
): string | null {
  const subject = resolveSpeciesDossierCanonicalSubject(identity);
  return subject ? speciesDossierAtlasHref(subject.taxon) : null;
}
