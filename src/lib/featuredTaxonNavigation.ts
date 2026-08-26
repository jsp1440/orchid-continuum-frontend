const FEATURED_TAXON_ORIGIN = 'homepage-featured-taxon';
export const ATLAS_WORKSPACE_ORIGIN = 'atlas-workspace';

const SAFE_CANONICAL_GENUS = /^[A-Z][A-Za-z-]+$/;
const MAX_CANONICAL_GENUS_LENGTH = 120;

function normalizedGenus(genus: string): string {
  const value = String(genus ?? '').trim();
  if (
    !value ||
    value.length > MAX_CANONICAL_GENUS_LENGTH ||
    !SAFE_CANONICAL_GENUS.test(value)
  ) {
    throw new Error(
      'Featured taxon genus is required and must be a bounded canonical genus for navigation',
    );
  }
  return value;
}

/**
 * Canonical handoff from a featured-taxon surface into the full Atlas.
 * AtlasFilterContext owns `genera` as the URL-synchronized genus filter.
 */
export function featuredTaxonAtlasHref(genus: string): string {
  return `/atlas?genera=${encodeURIComponent(normalizedGenus(genus))}`;
}

/**
 * Bounded handoff from the homepage featured genus into Atlas Next.
 * Atlas Next consumes the same shared AtlasFilterContext contract as the
 * canonical Atlas, so only the canonical genus filter crosses this boundary.
 */
export function featuredTaxonAtlasNextHref(genus: string): string {
  return `/atlas-next?genera=${encodeURIComponent(normalizedGenus(genus))}`;
}

/**
 * Canonical handoff from a featured-taxon surface into Calyx.
 *
 * The route carries only bounded navigation context. The explicit
 * `context_is_evidence=false` marker prevents the homepage-selected genus from
 * ever being interpreted as scientific evidence merely because it initiated a
 * Calyx conversation.
 */
export function featuredTaxonCalyxHref(genus: string): string {
  return `/calyx?genus=${encodeURIComponent(normalizedGenus(genus))}&origin=${FEATURED_TAXON_ORIGIN}&context_is_evidence=false`;
}

/**
 * Canonical handoff from the homepage featured genus into the Species browser.
 * Species already owns `genus` as its receiving filter, so this route carries
 * exactly the bounded genus identity and nothing that could be mistaken for
 * evidence, locality, occurrence, collector, confidence, or conclusion state.
 */
export function featuredTaxonSpeciesHref(genus: string): string {
  return `/species?genus=${encodeURIComponent(normalizedGenus(genus))}`;
}

/**
 * Continue from the mounted Atlas workspace into Calyx while preserving only
 * the active genus identity. Atlas coordinates, locality text, occurrence IDs,
 * collector fields, and other record-level details remain in Atlas. The genus
 * itself is navigation context, not scientific evidence, so that boundary is
 * declared explicitly on the handoff just as it is for the homepage path.
 */
export function atlasWorkspaceCalyxHref(genus: string): string {
  return `/calyx?genus=${encodeURIComponent(normalizedGenus(genus))}&origin=${ATLAS_WORKSPACE_ORIGIN}&context_is_evidence=false`;
}

/**
 * Continue from the canonical Atlas workspace into Research Center while
 * preserving only the active genus. The handoff shares the Atlas workspace
 * origin with Calyx and explicitly marks the subject as navigation context,
 * not evidence. Atlas locality, coordinates, occurrence identifiers, and
 * record-level material never gain a parameter here.
 */
export function atlasWorkspaceResearchHref(genus: string): string {
  return `/research?genus=${encodeURIComponent(normalizedGenus(genus))}&origin=${ATLAS_WORKSPACE_ORIGIN}&context_is_evidence=false`;
}

/**
 * Continue from canonical Atlas into the Species dossiers while preserving
 * only the active genus filter. Species already owns `genus` as its receiving
 * query key, so no Atlas locality, record, origin, or evidence fields travel.
 */
export function atlasWorkspaceSpeciesHref(genus: string): string {
  return `/species?genus=${encodeURIComponent(normalizedGenus(genus))}`;
}

/**
 * Canonical handoff from the homepage evidence journey into the Research Center.
 * The genus is interaction context only: Research Center may preload it for the
 * visitor, but it must not treat the value as evidence or as the subject of an
 * unrelated persisted research project. The non-evidence boundary is explicit
 * on the URL so the receiver can fail closed if that declaration is removed.
 */
export function featuredTaxonResearchHref(genus: string): string {
  return `/research?genus=${encodeURIComponent(normalizedGenus(genus))}&origin=${FEATURED_TAXON_ORIGIN}&context_is_evidence=false`;
}

export { FEATURED_TAXON_ORIGIN };
