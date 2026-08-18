/**
 * heroMedia — choosing the single photograph the homepage opens with.
 *
 * The redesigned homepage follows ONE orchid outward, so the hero shows one
 * photograph, not a carousel. This module decides which one, deterministically,
 * so the same visitor reloading the page and a demonstrator running through the
 * page twice both see the same orchid.
 */

import type { GenusMediaItem, GenusMediaResponse } from '@/lib/genusMediaResolver';

/** How the hero should present itself, derived from the media response. */
export type HeroMediaState =
  | { kind: 'loading' }
  | { kind: 'photograph'; item: GenusMediaItem }
  /** The service answered, and has no approved photograph for this genus. */
  | { kind: 'no_approved_media' }
  /** The service did not answer, or answered with something unusable. */
  | { kind: 'service_error' };

/**
 * Pick the hero photograph from an approved-media list.
 *
 * Highest quality score wins; ties and missing scores fall back to the order
 * the backend returned, which is already curated. Returns null for an empty
 * list so the caller renders an honest state instead of an empty frame.
 */
export function selectHeroMedia(items: readonly GenusMediaItem[]): GenusMediaItem | null {
  if (!items || items.length === 0) return null;

  let best = items[0];
  let bestScore = typeof best.quality_score === 'number' ? best.quality_score : -Infinity;

  for (let i = 1; i < items.length; i += 1) {
    const candidate = items[i];
    const score = typeof candidate.quality_score === 'number' ? candidate.quality_score : -Infinity;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

/** Translate a media response into the state the hero should render. */
export function heroStateFromResponse(response: GenusMediaResponse): HeroMediaState {
  if (response.status === 'service_error') return { kind: 'service_error' };
  // An invalid genus is a fault on our side, not a statement about the orchid.
  if (response.status === 'invalid_genus') return { kind: 'service_error' };

  const item = selectHeroMedia(response.items);
  return item ? { kind: 'photograph', item } : { kind: 'no_approved_media' };
}

/** One readable credit line, or null when the record carries no credit at all. */
export function creditLine(item: GenusMediaItem): string | null {
  const parts = [item.attribution?.trim() || item.source_name?.trim(), item.license?.trim()].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length ? parts.join(' · ') : null;
}
