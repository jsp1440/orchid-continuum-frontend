const SAFE_GENUS = /^[A-Z][A-Za-z-]+$/;

export const GENUS_PROFILE_ORIGIN = 'genus-profile';

function boundedGenus(value: string): string {
  const genus = String(value ?? '').trim();
  if (!genus || genus.length > 120 || !SAFE_GENUS.test(genus)) {
    throw new Error('A bounded canonical genus is required for Genus Profile navigation.');
  }
  return genus;
}

/**
 * Preserve the genus being studied when the dedicated Genus Profile continues
 * into Atlas. This is navigation context only: no locality, occurrence,
 * collector/catalogue, evidence, confidence, or conclusion fields have a
 * channel through this contract.
 */
export function genusProfileAtlasHref(genus: string): string {
  const params = new URLSearchParams({
    genera: boundedGenus(genus),
    origin: GENUS_PROFILE_ORIGIN,
    context_is_evidence: 'false',
  });
  return `/atlas?${params.toString()}`;
}

/**
 * Continue directly from a dedicated Genus Profile into Calyx without first
 * detouring through Atlas. Only the canonical genus identity crosses this
 * boundary, explicitly marked as navigation context rather than evidence.
 */
export function genusProfileCalyxHref(genus: string): string {
  const params = new URLSearchParams({
    genus: boundedGenus(genus),
    origin: GENUS_PROFILE_ORIGIN,
    context_is_evidence: 'false',
  });
  return `/calyx?${params.toString()}`;
}

/**
 * Continue from a dedicated Genus Profile into Research Center while carrying
 * only the canonical genus identity. The profile is the provenance source;
 * this must never be re-labelled as Genus of the Day, and the genus remains
 * navigation context rather than scientific evidence.
 */
export function genusProfileResearchHref(genus: string): string {
  const params = new URLSearchParams({
    genus: boundedGenus(genus),
    origin: GENUS_PROFILE_ORIGIN,
    context_is_evidence: 'false',
  });
  return `/research?${params.toString()}`;
}
