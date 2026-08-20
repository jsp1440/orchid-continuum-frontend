const FEATURED_TAXON_ORIGIN = 'homepage-featured-taxon';

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
 * Calyx parses these bounded route fields into its server-authoritative turn context.
 */
export function featuredTaxonCalyxHref(genus: string): string {
  return `/calyx?genus=${encodeURIComponent(normalizedGenus(genus))}&origin=${FEATURED_TAXON_ORIGIN}`;
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
