import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

/**
 * Client of GET /api/knowledge-graph/taxon/{taxon_id}/images (backend app/taxon_image_gallery.py,
 * schema oc.taxon-image-gallery.v1).
 *
 * `taxon_id` is a World Plants BACKBONE id (public.taxonomy_species.id, the `<id>` of a graph key
 * `taxon:<id>`, or an implied species concept `implied:<genus>_<epithet>`). It is NOT the
 * public.orchid_taxonomy id in a /species/:slug route; the two id spaces overlap and name different taxa.
 *
 * Only the fields below are read from an image. Anything else the payload might carry (an observer,
 * a place, a date) is never copied into what the page renders.
 */

export type GalleryVerification =
  | 'source_name'
  | 'identified_by_grower'
  | 'unverified_needs_expert_verification';

export interface GalleryImage {
  image_id: number;
  url: string | null;
  source_label: string | null;
  licence: string | null;
  licence_class: string | null;
  licence_name: string | null;
  licence_url: string | null;
  commercial_use: boolean;
  download: boolean;
  export: boolean;
  attribution: string | null;
  attribution_required: boolean;
  share_alike_notice: boolean;
  unmodified_only: boolean;
  identification: {
    verification: GalleryVerification | string | null;
    verification_label: string | null;
    link_reason?: string | null;
    expert_verified: boolean;
  } | null;
}

export interface GalleryCounts {
  linked: number;
  by_verification: Record<string, number>;
  cleared: number;
  cleared_by_verification: Record<string, number>;
  displayable: number;
  unverified_hidden: number;
  withheld_by_reason: Record<string, number> | null;
}

export type GalleryState =
  | 'OK'
  | 'NONE_LINKED'
  | 'ALL_WITHHELD'
  | 'COUNTS_UNAVAILABLE'
  | 'NO_IMAGE_SUMMARY_BUILD'
  | 'NO_ANSWERING_LINK_RUN';

export interface GalleryResponse {
  schema: string;
  taxon_key: string;
  backbone_taxon_id: string;
  state: GalleryState | string;
  unverified_shown: boolean;
  counts: GalleryCounts | null;
  counts_unavailable_reason: string | null;
  primary: GalleryImage | null;
  images: GalleryImage[];
  page: { limit: number; next_cursor: string | null };
  is_evidence_of_absence: false;
}

/**
 * `off`: the route answered 404 (OC_TAXON_IMAGE_GALLERY_ENABLED is off) — the gallery is not shown at all.
 * `unavailable`: network failure, 5xx/503, 422 or an unreadable body — a gap, not an absence.
 */
export type GalleryResult =
  | { status: 'ok'; body: GalleryResponse }
  | { status: 'off' }
  | { status: 'unavailable' };

export const GALLERY_PAGE_SIZE = 24;

const BACKBONE_ID = /^(?:[0-9]{1,12}|implied:[a-z][a-z0-9_-]{0,160})$/;

/** `123` / `taxon:123` / `implied:x_y` / `taxon:implied:x_y` -> the id the route takes, else null. */
export function backboneTaxonId(value: string | null | undefined): string | null {
  const text = (value ?? '').trim().replace(/^taxon:/, '');
  return BACKBONE_ID.test(text) ? text : null;
}

export function taxonImagesUrl(taxonId: string, cursor?: string | null, limit = GALLERY_PAGE_SIZE): string {
  const url = new URL(
    `${CALYX_BACKEND_BASE_URL}/api/knowledge-graph/taxon/${encodeURIComponent(taxonId)}/images`,
  );
  url.searchParams.set('limit', String(limit));
  if (cursor) url.searchParams.set('cursor', cursor);
  return url.toString();
}

export async function fetchTaxonImages(
  taxonId: string,
  cursor?: string | null,
  signal?: AbortSignal,
  limit = GALLERY_PAGE_SIZE,
): Promise<GalleryResult> {
  try {
    const response = await fetch(taxonImagesUrl(taxonId, cursor, limit), {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (response.status === 404) return { status: 'off' };
    if (!response.ok) return { status: 'unavailable' };
    const body = (await response.json()) as GalleryResponse;
    if (!body || typeof body !== 'object' || !Array.isArray(body.images)) return { status: 'unavailable' };
    return { status: 'ok', body };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { status: 'unavailable' };
  }
}
