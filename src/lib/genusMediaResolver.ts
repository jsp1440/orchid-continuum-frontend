import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

export type GenusMediaItem = {
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

const resolvedCache = new Map<string, GenusMediaResponse>();
const inFlight = new Map<string, Promise<GenusMediaResponse>>();

async function requestGenusMedia(requested: string): Promise<GenusMediaResponse> {
  try {
    const response = await fetch(
      `${CALYX_BACKEND_BASE_URL}/api/media/genus/${encodeURIComponent(requested)}?limit=12`,
    );
    if (response.status === 400 || response.status === 404) return empty(requested, 'invalid_genus');
    if (!response.ok) return empty(requested, 'service_error');

    const payload = (await response.json()) as Partial<GenusMediaResponse>;
    if (payload.status !== 'ok' && payload.status !== 'no_approved_media' && payload.status !== 'invalid_genus') {
      return empty(requested, 'service_error');
    }

    const seenUrls = new Set<string>();
    return {
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
              if (seenUrls.has(item.image_url)) return false;
              seenUrls.add(item.image_url);
              return true;
            })
        : [],
      summary: payload.summary && typeof payload.summary.returned_count === 'number'
        ? payload.summary
        : { eligible_count: 0, returned_count: 0, exclusion_counts: {} },
    };
  } catch {
    return empty(requested, 'service_error');
  }
}

/**
 * The only Featured Genus media request path. No external fallback is allowed.
 * Calls for the same genus share one in-flight request and one page-lifetime
 * resolved response, so Hero and Featured Genus cannot race separate copies of
 * the same approved-media contract.
 */
export async function fetchCalyxGenusMedia(genus: string, signal?: AbortSignal): Promise<GenusMediaResponse> {
  const requested = genus.trim();
  if (!requested) return empty(genus, 'invalid_genus');
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const key = requested.toLowerCase();
  const cached = resolvedCache.get(key);
  if (cached) return cached;

  let pending = inFlight.get(key);
  if (!pending) {
    pending = requestGenusMedia(requested).then((result) => {
      inFlight.delete(key);
      if (result.status !== 'service_error') resolvedCache.set(key, result);
      return result;
    });
    inFlight.set(key, pending);
  }

  const result = await pending;
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return result;
}
