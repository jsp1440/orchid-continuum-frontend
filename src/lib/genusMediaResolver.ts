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

const EMPTY_SUMMARY = {
  eligible_count: 0,
  returned_count: 0,
  exclusion_counts: {},
};

function fallback(genus: string, status: GenusMediaResponse['status']): GenusMediaResponse {
  return {
    status,
    requested_genus: genus,
    accepted_genus: status === 'invalid_genus' ? null : genus,
    generated_at: null,
    items: [],
    summary: EMPTY_SUMMARY,
  };
}

/**
 * The only Featured Genus media client. It calls Calyx exclusively and never
 * falls back to iNaturalist, GBIF, Plantae, Wikimedia, the legacy harvester, or
 * a frontend-selected external source.
 */
export async function fetchCalyxGenusMedia(
  genus: string,
  signal?: AbortSignal,
): Promise<GenusMediaResponse> {
  const normalized = genus.trim();
  if (!normalized) return fallback(genus, 'invalid_genus');

  try {
    const response = await fetch(
      `${CALYX_BACKEND_BASE_URL}/api/media/genus/${encodeURIComponent(normalized)}?limit=12`,
      { signal },
    );

    if (response.status === 400 || response.status === 404) {
      return fallback(normalized, 'invalid_genus');
    }
    if (!response.ok) return fallback(normalized, 'service_error');

    const payload = (await response.json()) as Partial<GenusMediaResponse>;
    const status = payload.status;
    if (status !== 'ok' && status !== 'no_approved_media' && status !== 'invalid_genus') {
      return fallback(normalized, 'service_error');
    }

    return {
      status,
      requested_genus: typeof payload.requested_genus === 'string' ? payload.requested_genus : normalized,
      accepted_genus: typeof payload.accepted_genus === 'string' ? payload.accepted_genus : null,
      generated_at: typeof payload.generated_at === 'string' ? payload.generated_at : null,
      items: Array.isArray(payload.items) ? payload.items.filter((item): item is GenusMediaItem => (
        !!item &&
        typeof item.scientific_name === 'string' &&
        typeof item.image_url === 'string' &&
        /^https?:\/\//i.test(item.image_url)
      )) : [],
      summary: payload.summary && typeof payload.summary.returned_count === 'number'
        ? payload.summary
        : EMPTY_SUMMARY,
    };
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    return fallback(normalized, 'service_error');
  }
}
