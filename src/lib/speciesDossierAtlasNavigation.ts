const SAFE_GENUS = /^[A-Z][A-Za-z-]+$/;
const SAFE_BINOMIAL = /^([A-Z][A-Za-z-]+)\s+([a-z][A-Za-z-]+)$/;

function boundedCanonicalSpecies(value: unknown): string | null {
  const species = String(value ?? '').trim();
  if (!species || species.length > 180) return null;

  const match = species.match(SAFE_BINOMIAL);
  if (!match || !SAFE_GENUS.test(match[1])) return null;

  return `${match[1]} ${match[2]}`;
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
