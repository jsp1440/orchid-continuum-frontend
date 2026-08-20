import type { SpeciesExhibitCard, SpeciesExhibitMedia } from '@/lib/speciesExhibit';

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

/**
 * Build a deterministic, bounded list of server-owned media candidates.
 * The representative image stays first; additional candidates come only from
 * the canonical species-exhibit payload. No client-side third-party fetch is
 * performed and no image is synthesized or inferred.
 */
export function speciesExhibitMediaCandidates(card: SpeciesExhibitCard): SpeciesExhibitMedia[] {
  const additional = Array.isArray((card as SpeciesExhibitCard & { media?: SpeciesExhibitMedia[] }).media)
    ? (card as SpeciesExhibitCard & { media?: SpeciesExhibitMedia[] }).media ?? []
    : [];
  const ordered = [card.representative_media, ...additional].filter(
    (item): item is SpeciesExhibitMedia => Boolean(item) && isHttpUrl(item?.url),
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
