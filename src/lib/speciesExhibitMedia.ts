import type { SpeciesExhibitCard, SpeciesExhibitMedia } from '@/lib/speciesExhibit';

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function hasDisplayProvenance(item: SpeciesExhibitMedia): boolean {
  return Boolean(item.source?.trim() && item.license?.trim());
}

/**
 * Build a deterministic, bounded list of server-owned media candidates.
 * The representative image stays first; additional candidates come only from
 * the canonical species-exhibit payload. Candidates fail closed unless they
 * carry a browser-loadable URL plus source and license provenance. No
 * client-side third-party fetch is performed and no image is synthesized or
 * inferred.
 */
export function speciesExhibitMediaCandidates(card: SpeciesExhibitCard): SpeciesExhibitMedia[] {
  const additional = Array.isArray((card as SpeciesExhibitCard & { media?: SpeciesExhibitMedia[] }).media)
    ? (card as SpeciesExhibitCard & { media?: SpeciesExhibitMedia[] }).media ?? []
    : [];
  const ordered = [card.representative_media, ...additional].filter(
    (item): item is SpeciesExhibitMedia =>
      Boolean(item) && isHttpUrl(item?.url) && hasDisplayProvenance(item as SpeciesExhibitMedia),
  );
  const seen = new Set<string>();
  const accepted: SpeciesExhibitMedia[] = [];
  for (const item of ordered) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    accepted.push(item);
    if (accepted.length === 5) break;
  }
  return accepted;
}
