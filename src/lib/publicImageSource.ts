import { IMAGES_BACKEND_BASE_URL } from '@/lib/backendConfig';
import type { GenusImage, ImageSource } from '@/lib/genusData';

/**
 * Public-safe image resolver for homepage Genus of the Day.
 *
 * Source of truth: Orchid Continuum Brain image policy.
 * - Use the Orchid Continuum approved/public image layer only.
 * - Do not call iNaturalist, GBIF, BHL, or any external image provider directly.
 * - Prefer flower/inflorescence/whole-plant public gallery records.
 * - Exclude labels, specimen sheets, documents, plates, and non-public records.
 */

export type PublicImageResult = {
  images: GenusImage[];
  source: ImageSource;
};

const APPROVED_TYPES = new Set([
  'flower',
  'flower_closeup',
  'inflorescence',
  'whole_plant',
  'mounted_plant',
  'potted_plant',
]);

const BLOCKED_TYPES = new Set([
  'leaves_only',
  'roots',
  'pseudobulb_or_stem',
  'habitat',
  'greenhouse_or_bench',
  'label_or_tag',
  'seedling_or_flask',
  'specimen_or_documentary',
  'event_or_display',
  'unknown',
]);

const BLOCKED_URL_RE =
  /(herbari|specimen|holotype|isotype|lectotype|syntype|neotype|paratype|voucher|exsiccat|barcode|label|gbif\.org|jstor|biodiversitylibrary\.org|archive\.org|botanicus\.org|\.pdf(\?|#|$)|\.(tif|tiff|djvu|doc|docx|txt|csv)(\?|#|$))/i;

function text(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return undefined;
}

function bool(record: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (['true', 'yes', 'y', '1', 'allowed', 'public'].includes(v)) return true;
      if (['false', 'no', 'n', '0', 'restricted', 'private'].includes(v)) return false;
    }
    if (typeof value === 'number') return value > 0;
  }
  return undefined;
}

function arrayFromPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  const obj = payload as Record<string, unknown> | null;
  if (!obj) return [];
  for (const key of ['images', 'records', 'results', 'data', 'items', 'photos']) {
    const value = obj[key];
    if (Array.isArray(value)) return value as Record<string, unknown>[];
  }
  return [];
}

function urls(record: Record<string, unknown>): string[] {
  const out: string[] = [];
  const add = (value: unknown) => {
    if (typeof value !== 'string') return;
    const u = value.trim();
    if (!u || BLOCKED_URL_RE.test(u) || out.includes(u)) return;
    out.push(u);
  };

  const list = record.image_urls;
  if (Array.isArray(list)) list.forEach(add);

  [
    'storage_uri',
    'image_url',
    'representative_image_url',
    'public_url',
    'url',
    'medium_url',
    'thumbnail_url',
    'media_url',
  ].forEach((key) => add(record[key]));

  return out;
}

function isPublicAllowed(record: Record<string, unknown>): boolean {
  const explicit = bool(record, [
    'public_display_allowed',
    'public_gallery_candidate',
    'approved_for_public_display',
    'is_public',
  ]);
  if (explicit === false) return false;

  const status = text(record, ['record_status', 'validation_state', 'permission_status']);
  if (status && /(restricted|private|deprecated|archived|duplicate|rejected|blocked)/i.test(status)) {
    return false;
  }

  // Some older backend rows do not expose public_display_allowed yet. Treat them
  // as usable only if no field explicitly blocks public display.
  return true;
}

function isGalleryImage(record: Record<string, unknown>): boolean {
  const imageType = text(record, ['image_type', 'primary_image_type', 'type']);
  if (imageType) {
    const norm = imageType.trim().toLowerCase();
    if (BLOCKED_TYPES.has(norm)) return false;
    if (APPROVED_TYPES.has(norm)) return true;
  }

  const flowerVisible = bool(record, ['flower_visible', 'flower_present', 'has_flower']);
  const labelVisible = bool(record, ['label_visible', 'tag_or_label_visible']);
  const needsReview = bool(record, ['needs_review', 'ai_review_required']);

  if (labelVisible === true || needsReview === true) return false;
  if (flowerVisible === true) return true;

  // Older trusted-image rows may not expose classification fields yet. They can
  // still be used if they passed the backend trusted-image endpoint and the URL
  // is not obviously documentary/specimen material.
  return !imageType;
}

function toGenusImage(record: Record<string, unknown>, genus: string): GenusImage | null {
  if (!isPublicAllowed(record) || !isGalleryImage(record)) return null;

  const imageUrls = urls(record);
  if (imageUrls.length === 0) return null;

  const scientificName =
    text(record, ['scientific_name', 'accepted_name', 'normalized_display_name', 'species', 'name', 'canonical_name']) ||
    genus;

  if (!scientificName.toLowerCase().startsWith(genus.toLowerCase())) return null;

  return {
    scientific_name: scientificName,
    image_url: imageUrls[0],
    image_urls: imageUrls,
    image_source: text(record, ['credit_line', 'photographer_name', 'photographer', 'contributor_name', 'image_source', 'source']),
    image_license: text(record, ['usage_rights', 'image_license', 'license', 'license_code']),
  };
}

export async function fetchPublicGenusImages(
  genus: string,
  signal?: AbortSignal,
  limit = 200,
): Promise<PublicImageResult> {
  const g = genus.trim();
  if (!g) return { images: [], source: 'pending' };

  const params = new URLSearchParams({
    limit: String(limit),
    public_display_allowed: 'true',
    prefer: 'flower,flower_closeup,inflorescence,whole_plant',
    exclude: 'label_or_tag,specimen_or_documentary,leaves_only,unknown',
  });

  const url = `${IMAGES_BACKEND_BASE_URL}/images/genus/${encodeURIComponent(g)}?${params}`;

  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 30000);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort);

    try {
      const response = await fetch(url, { signal: ctrl.signal });
      if (!response.ok) return { images: [], source: 'pending' };
      const payload = await response.json();
      const seen = new Set<string>();
      const images = arrayFromPayload(payload)
        .map((row) => toGenusImage(row, g))
        .filter((img): img is GenusImage => Boolean(img))
        .filter((img) => {
          const key = `${img.scientific_name}|${img.image_url}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, limit);

      return { images, source: images.length > 0 ? 'live' : 'pending' };
    } finally {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  } catch {
    return { images: [], source: 'pending' };
  }
}
