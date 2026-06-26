import { IMAGES_BACKEND_BASE_URL } from '@/lib/backendConfig';

export type PublicImageSource = 'orchid-continuum-image-library' | 'pending';

export interface PublicOrchidImage {
  scientific_name: string;
  image_url: string;
  image_urls: string[];
  image_source?: string;
  image_license?: string;
  credit_line?: string;
  photographer_name?: string;
  storage_uri?: string;
  image_type?: string;
  flower_visible?: boolean;
  public_display_allowed?: boolean;
  public_gallery_candidate?: boolean;
}

export interface PublicImageResult {
  images: PublicOrchidImage[];
  source: PublicImageSource;
}

const PUBLIC_IMAGE_TYPES = new Set([
  'flower_closeup',
  'inflorescence',
  'whole_plant',
  'mounted_plant',
  'potted_plant',
]);

const BLOCKED_IMAGE_TYPES = new Set([
  'label_or_tag',
  'specimen_or_documentary',
  'leaves_only',
  'roots',
  'pseudobulb_or_stem',
  'seedling_or_flask',
  'event_or_display',
  'unknown',
  'other',
]);

const BLOCKED_URL_RE =
  /(herbari|preserved[\s_-]*specimen|dried[\s_-]*specimen|pressed[\s_-]*specimen|type[\s_-]*specimen|\bspecimen\b|holotype|isotype|lectotype|syntype|neotype|paratype|voucher|exsiccat|exsiccatae|\bsheet\b|barcode|accession|catalog[\s_-]*number|determination[\s_-]*label|specimen[\s_-]*label|herbarium[\s_-]*label|gbif\.org\/occurrence|jstor|plants\.jstor|biodiversitylibrary\.org|archive\.org\/(stream|page|download)|botanicus\.org|gallica\.bnf\.fr|\/plates?\/|\/figures?\/|\/illustrations?\/|\/drawings?\/|\/lineart\/|\.pdf(\?|#|$)|\.(tif|tiff|djvu|doc|docx|txt|csv)(\?|#|$))/i;

function extractArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  const p = payload as Record<string, unknown> | null;
  if (!p) return [];
  for (const key of ['images', 'records', 'results', 'data', 'items', 'photos']) {
    const value = p[key];
    if (Array.isArray(value)) return value as Record<string, unknown>[];
  }
  return [];
}

function pickString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return undefined;
}

function pickBoolean(row: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (['true', 'yes', 'y', '1'].includes(v)) return true;
      if (['false', 'no', 'n', '0'].includes(v)) return false;
    }
    if (typeof value === 'number') return value !== 0;
  }
  return undefined;
}

function collectUrls(row: Record<string, unknown>): string[] {
  const nested = Array.isArray(row.image_urls)
    ? row.image_urls.filter((u): u is string => typeof u === 'string')
    : [];
  const candidates = [
    ...nested,
    pickString(row, [
      'image_url',
      'storage_uri',
      'public_url',
      'representative_image_url',
      'thumbnail_url',
      'medium_url',
      'original_url',
      'media_url',
      'url',
    ]),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const url = typeof raw === 'string' ? raw.trim() : '';
    if (!url || seen.has(url) || BLOCKED_URL_RE.test(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function publicSafe(row: Record<string, unknown>): boolean {
  const imageType = (pickString(row, ['image_type', 'type', 'primary_image_type']) || '').toLowerCase();
  const publicAllowed = pickBoolean(row, ['public_display_allowed', 'public_allowed', 'display_allowed']);
  const galleryCandidate = pickBoolean(row, ['public_gallery_candidate', 'gallery_candidate']);
  const flowerVisible = pickBoolean(row, ['flower_visible', 'has_flower', 'flower_present']);

  if (publicAllowed === false) return false;
  if (BLOCKED_IMAGE_TYPES.has(imageType)) return false;
  if (imageType && !PUBLIC_IMAGE_TYPES.has(imageType) && flowerVisible !== true && galleryCandidate !== true) return false;
  if (flowerVisible === false && galleryCandidate !== true) return false;

  return true;
}

function toPublicImage(row: Record<string, unknown>, genus: string): PublicOrchidImage | null {
  if (!publicSafe(row)) return null;
  const urls = collectUrls(row);
  if (!urls.length) return null;

  const scientificName =
    pickString(row, ['scientific_name', 'accepted_name', 'normalized_display_name', 'canonical_name', 'species', 'name']) ||
    genus;

  const lowerGenus = genus.trim().toLowerCase();
  if (scientificName && !scientificName.toLowerCase().startsWith(lowerGenus)) return null;

  return {
    scientific_name: scientificName,
    image_url: urls[0],
    image_urls: urls,
    image_source: pickString(row, ['image_source', 'source', 'source_name', 'dataset_source']),
    image_license: pickString(row, ['image_license', 'license', 'usage_rights']),
    credit_line: pickString(row, ['credit_line', 'credit', 'attribution']),
    photographer_name: pickString(row, ['photographer_name', 'photographer']),
    storage_uri: pickString(row, ['storage_uri']),
    image_type: pickString(row, ['image_type', 'type', 'primary_image_type']),
    flower_visible: pickBoolean(row, ['flower_visible', 'has_flower', 'flower_present']),
    public_display_allowed: pickBoolean(row, ['public_display_allowed', 'public_allowed', 'display_allowed']),
    public_gallery_candidate: pickBoolean(row, ['public_gallery_candidate', 'gallery_candidate']),
  };
}

export async function fetchPublicGenusImages(
  genus: string,
  signal?: AbortSignal,
  limit = 24,
): Promise<PublicImageResult> {
  const g = genus.trim();
  if (!g) return { images: [], source: 'pending' };

  const urls = [
    `${IMAGES_BACKEND_BASE_URL}/images/genus/${encodeURIComponent(g)}?limit=${limit}&public=true&flower_visible=true`,
    `${IMAGES_BACKEND_BASE_URL}/images/genus/${encodeURIComponent(g)}?limit=${limit}`,
  ];

  const seen = new Set<string>();
  const images: PublicOrchidImage[] = [];

  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 20000);
      const onAbort = () => ctrl.abort();
      signal?.addEventListener('abort', onAbort);
      const response = await fetch(url, { signal: ctrl.signal });
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (!response.ok) continue;
      const payload = await response.json();
      for (const row of extractArray(payload)) {
        const image = toPublicImage(row, g);
        if (!image) continue;
        const key = `${image.scientific_name}|${image.image_url}`;
        if (seen.has(key)) continue;
        seen.add(key);
        images.push(image);
        if (images.length >= limit) break;
      }
      if (images.length > 0) break;
    } catch {
      // Try the next public-safe endpoint variant.
    }
  }

  return images.length
    ? { images, source: 'orchid-continuum-image-library' }
    : { images: [], source: 'pending' };
}
