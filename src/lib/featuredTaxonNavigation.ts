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
 * unrelated persisted research project.
 */
export function featuredTaxonResearchHref(genus: string): string {
  return `/research?genus=${encodeURIComponent(normalizedGenus(genus))}&origin=${FEATURED_TAXON_ORIGIN}`;
}

export { FEATURED_TAXON_ORIGIN };
