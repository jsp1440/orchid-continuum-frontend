import { fetchSpeciesExhibit, type MediaLicenceTerms } from '@/lib/speciesExhibit';
import { speciesExhibitMediaCandidates } from '@/lib/speciesExhibitMedia';
import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import { fetchWithColdStartRetry } from '@/lib/coldStartFetch';
import { isBrowserEmbeddableImageUrl } from '@/lib/embeddableImageUrl';
import { normalizedMediaKey } from '@/lib/genusProfileDataQuality';

export type GenusMediaItem = MediaLicenceTerms & {
  media_id: string;
  taxon_id: string | null;
  scientific_name: string;
  genus: string;
  image_url: string;
  thumbnail_url: string;
  source_name: string;
  source_record_url: string | null;
  license: string | null;
  attribution: string | null;
  media_kind: 'photograph';
  quality_score: number | null;
};

export type GenusMediaResponse = {
  status: 'ok' | 'no_approved_media' | 'invalid_genus' | 'service_error';
  requested_genus: string;
  accepted_genus: string | null;
  generated_at: string | null;
  items: GenusMediaItem[];
  summary: {
    eligible_count: number;
    returned_count: number;
    exclusion_counts: Record<string, number>;
  };
};

const empty = (genus: string, status: GenusMediaResponse['status']): GenusMediaResponse => ({
  status,
  requested_genus: genus,
  accepted_genus: status === 'invalid_genus' ? null : genus,
  generated_at: null,
  items: [],
  summary: { eligible_count: 0, returned_count: 0, exclusion_counts: {} },
});

/**
 * Public publication boundary for canonical genus media.
 *
 * The backend remains authoritative for scientific/media selection, but a
 * public surface may only publish a returned photograph when the record also
 * carries a non-empty source and license. Missing attribution is allowed and
 * is rendered explicitly as unavailable; missing source/license is not.
 */
export function publicGenusMediaItems(items: readonly GenusMediaItem[]): GenusMediaItem[] {
  return items.filter(
    (item) => Boolean(item.source_name?.trim()) && Boolean(item.license?.trim()) && isBrowserEmbeddableImageUrl(item.image_url),
  );
}

export function isInaturalistPhotographUrl(value: string): boolean {
  if (!isBrowserEmbeddableImageUrl(value)) return false;
  const url = new URL(value);
  return ['inaturalist-open-data.s3.amazonaws.com', 'static.inaturalist.org'].includes(url.hostname)
    && /^\/photos\/\d+\//.test(url.pathname);
}

export function isHeroBinomial(scientificName: string): boolean {
  const parts = scientificName.trim().split(/\s+/);
  return parts.length >= 2 && /^[a-z-]+$/.test(parts[1]);
}

/** Keep preflight and the public homepage hero in the same display order. */
export function homepageHeroMedia(items: readonly GenusMediaItem[]): GenusMediaItem[] {
  const credited = (item: GenusMediaItem) => typeof item.attribution === 'string' && Boolean(item.attribution.trim());
  return publicGenusMediaItems(items)
    .filter(item => new URL(item.image_url).hostname !== 'sweetgum.nybg.org')
    .sort((a, b) => Number(credited(b)) - Number(credited(a))
      || Number(isHeroBinomial(b.scientific_name)) - Number(isHeroBinomial(a.scientific_name))
      || Number(isInaturalistPhotographUrl(b.image_url)) - Number(isInaturalistPhotographUrl(a.image_url)));
}

/**
 * Reuse licensed photographs already attached to the canonical species exhibit
 * when the genus media batch contains only unusable embeds. Never query a
 * third-party provider, infer a license, or use a different genus.
 */
async function exhibitPhotographs(genus: string, signal?: AbortSignal): Promise<GenusMediaItem[]> {
  const exhibit = await fetchSpeciesExhibit(genus, signal);
  if (exhibit.status !== 'ok') return [];
  return exhibit.items.flatMap((card) => speciesExhibitMediaCandidates(card)
    .filter((photo) => isInaturalistPhotographUrl(photo.url)).slice(0, 1).map((photo) => ({
      media_id: String(photo.id ?? photo.url), taxon_id: card.taxon_id,
      scientific_name: card.full_scientific_name, genus: card.genus,
      image_url: photo.url, thumbnail_url: photo.url,
      source_name: photo.source as string, source_record_url: null,
      license: photo.license, attribution: photo.rights_holder || photo.observer_name,
      licence_name: photo.licence_name, licence_url: photo.licence_url,
      share_alike_notice: photo.share_alike_notice, unmodified_only: photo.unmodified_only,
      media_kind: 'photograph' as const, quality_score: null,
    })));
}

/** Featured Genus media stays within the two canonical Calyx read contracts. */
export async function fetchCalyxGenusMedia(genus: string, signal?: AbortSignal): Promise<GenusMediaResponse> {
  const requested = genus.trim();
  if (!requested) return empty(genus, 'invalid_genus');

  try {
    // Bounded, with one retry while the backend wakes; previously this request
    // had no timeout and could hold the whole featured-taxon read model (#231).
    const response = await fetchWithColdStartRetry(
      `${CALYX_BACKEND_BASE_URL}/api/media/genus/${encodeURIComponent(requested)}?limit=12`,
      {},
      signal,
    );
    if (!response) return empty(requested, 'service_error');
    if (response.status === 400 || response.status === 404) return empty(requested, 'invalid_genus');
    if (!response.ok) return empty(requested, 'service_error');

    const payload = (await response.json()) as Partial<GenusMediaResponse>;
    if (payload.status !== 'ok' && payload.status !== 'no_approved_media' && payload.status !== 'invalid_genus') {
      return empty(requested, 'service_error');
    }
    // Deduplicate by NORMALISED media identity (host + path) so the same
    // photograph never appears twice on the page — including when a source
    // returns it under differing query strings or trailing slashes.
    const seenUrls = new Set<string>();
    const result: GenusMediaResponse = {
      status: payload.status,
      requested_genus: typeof payload.requested_genus === 'string' ? payload.requested_genus : requested,
      accepted_genus: typeof payload.accepted_genus === 'string' ? payload.accepted_genus : null,
      generated_at: typeof payload.generated_at === 'string' ? payload.generated_at : null,
      items: Array.isArray(payload.items)
        ? payload.items
            .filter((item): item is GenusMediaItem =>
              !!item &&
              typeof item.scientific_name === 'string' &&
              typeof item.image_url === 'string' &&
              /^https?:\/\//i.test(item.image_url),
            )
            .filter((item) => {
              const mediaKey = normalizedMediaKey(item.image_url);
              if (!mediaKey || seenUrls.has(mediaKey)) return false;
              seenUrls.add(mediaKey);
              return true;
            })
        : [],
      summary: payload.summary && typeof payload.summary.returned_count === 'number'
        ? payload.summary
        : { eligible_count: 0, returned_count: 0, exclusion_counts: {} },
    };
    if (result.status === 'ok' && publicGenusMediaItems(result.items).length === 0) {
      const photographs = await exhibitPhotographs(requested, signal);
      if (photographs.length) return {
        ...result, requested_genus: requested, accepted_genus: requested, items: photographs,
        summary: { eligible_count: photographs.length, returned_count: photographs.length, exclusion_counts: {} },
      };
    }
    return result;
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    return empty(requested, 'service_error');
  }
}
