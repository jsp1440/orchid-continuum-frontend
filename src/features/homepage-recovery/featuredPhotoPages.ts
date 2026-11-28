import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import { fetchWithColdStartRetry } from '@/lib/coldStartFetch';
import type { GenusMediaItem } from '@/lib/genusMediaResolver';
import { featuredSpecies } from './featuredSpecies';

export class PhotoPageError extends Error {
  constructor(readonly status: number) { super('The featured photo page could not be read.'); }
}

export async function fetchFeaturedPhotoPage(genus: string, cursor: string | null, signal: AbortSignal) {
  const url = new URL(`${CALYX_BACKEND_BASE_URL}/api/media/genus/${encodeURIComponent(genus)}/species-page`);
  url.searchParams.set('limit', '10');
  if (cursor) url.searchParams.set('cursor', cursor);
  const response = await fetchWithColdStartRetry(url.toString(), {}, signal);
  if (!response?.ok) throw new PhotoPageError(response?.status ?? 0);
  const data = await response.json();
  const next: unknown = data?.page?.next_cursor;
  if (data?.schema !== 'oc.featured-genus.species-photo-page.v1' || data.accepted_genus !== genus ||
      !Array.isArray(data.items) || data.items.length > 10 ||
      !(next === null || (typeof next === 'string' && next.length > 0 && next.length <= 1024 && next !== cursor))) {
    throw new PhotoPageError(502);
  }

  const items: GenusMediaItem[] = [];
  for (const row of data.items) {
    if (!row || row.media_kind !== 'photograph' || typeof row.scientific_name !== 'string' ||
        typeof row.image_url !== 'string' || typeof row.source_name !== 'string' || typeof row.license !== 'string' ||
        typeof row.taxon_id !== 'string' || !/^\d+$/.test(row.taxon_id) ||
        typeof row.backbone_taxon_id !== 'string' || !/^\d+$/.test(row.backbone_taxon_id) ||
        typeof row.media_id !== 'string' || !/^oc-image:\d+$/.test(row.media_id) ||
        !['source_name', 'identified_by_grower'].includes(row.identification?.verification) ||
        typeof row.unmodified_only !== 'boolean' || typeof row.share_alike_notice !== 'boolean') continue;
    items.push({
      genus, scientific_name: row.scientific_name, taxon_id: row.taxon_id, media_id: row.media_id,
      image_url: row.image_url, thumbnail_url: row.image_url, media_kind: 'photograph', quality_score: null,
      source_name: row.source_name, source_record_url: typeof row.source_record_url === 'string' ? row.source_record_url : null,
      attribution: typeof row.attribution === 'string' ? row.attribution : null,
      license: row.license, licence_name: typeof row.licence_name === 'string' ? row.licence_name : null,
      licence_url: typeof row.licence_url === 'string' ? row.licence_url : null,
      unmodified_only: row.unmodified_only, share_alike_notice: row.share_alike_notice,
    });
  }
  return { items: featuredSpecies(items, genus, true), next };
}
