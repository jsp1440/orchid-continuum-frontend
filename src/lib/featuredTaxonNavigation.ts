const FEATURED_TAXON_ORIGIN = 'homepage-featured-taxon';
export const ATLAS_WORKSPACE_ORIGIN = 'atlas-workspace';

function normalizedGenus(genus: string): string {
  const value = genus.trim();
  if (!value) throw new Error('Featured taxon genus is required for navigation');
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
 * Continue from the mounted Atlas workspace into Research while preserving
 * only the active genus identity. The route deliberately carries none of the
 * Atlas record/locality state and explicitly declares the genus non-evidentiary.
 */
export function atlasWorkspaceResearchHref(genus: string): string {
  return `/research?genus=${encodeURIComponent(normalizedGenus(genus))}&origin=${ATLAS_WORKSPACE_ORIGIN}&context_is_evidence=false`;
}

/**
 * Canonical handoff from the homepage evidence journey into the Research Center.
 * The genus is interaction context only: Research Center may preload it for the
 * visitor, but it must not treat the value as evidence or as the subject of an
 * unrelated persisted research project.
 */
export function featuredTaxonResearchHref(genus: string): string {
  return `/research?genus=${encodeURIComponent(normalizedGenus(genus))}&origin=${FEATURED_TAXON_ORIGIN}`;
}

export { FEATURED_TAXON_ORIGIN };
