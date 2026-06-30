import { IMAGES_BACKEND_BASE_URL } from '@/lib/backendConfig';
import type { GenusImage } from '@/lib/genusData';

export type PublicImageSourceResult = {
  images: GenusImage[];
  source: 'live' | 'pending';
  diagnostic?: string;
};

const NON_LIVING_IMAGE_RE =
  /(herbari|preserved[\s_-]*specimen|dried[\s_-]*specimen|pressed[\s_-]*specimen|type[\s_-]*specimen|\bspecimen\b|holotype|isotype|lectotype|syntype|neotype|paratype|voucher|exsiccat|exsiccatae|\bsheet\b|barcode|accession|catalog[\s_-]*number|collection[\s_-]*number|determination[\s_-]*label|specimen[\s_-]*label|herbarium[\s_-]*label|gbif\.org\/occurrence|jstor|plants\.jstor|sweetgum\.nybg|sernecportal|swbiodiversity|biocase|mediaphoto\.mnhn|mnhn\.fr|\/herbarium\/|herbcat|catalogue.*specimen|\/specimen|\/voucher|\/barcode|idigbio|reflora|specieslink|virtualherbarium|biodiversitylibrary\.org|archive\.org\/(stream|page|download)|botanicus\.org|gallica\.bnf\.fr|\/plates?\/|\/figures?\/|\/illustrations?\/|\/drawings?\/|\/lineart\/|recolnat\.org|jacq\.org|cvh\.ac\.cn|nhm\.ac\.uk\/.*image|mobot\.org|tropicos\.org\/.*image|digitarium|ala\.org\.au\/.*occurrence|herbariovirtual|\.pdf(\?|#|$)|\.(tif|tiff|djvu|doc|docx|txt|csv)(\?|#|$))/i;

const URL_FIELDS = [
  'image_url',
  'url',
  'public_url',
  'storage_uri',
  'representative_image_url',
  'thumbnail_url',
  'medium_url',
  'original_url',
  'media_url',
  'photo_url',
  'src',
];

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function scientificNameOf(record: Record<string, unknown>): string | undefined {
  return (
    asText(record.scientific_name) ||
    asText(record.scientificName) ||
    asText(record.binomial) ||
    asText(record.name) ||
    asText(record.species) ||
    asText(record.taxon_name) ||
    asText(record.accepted_name)
  );
}

function cleanUrl(value: unknown, record: Record<string, unknown>): string | undefined {
  const text = asText(value);
  if (!text || !/^https?:\/\//i.test(text)) return undefined;

  const haystack = [
    text,
    record.title,
    record.caption,
    record.description,
    record.image_source,
    record.source,
    record.license,
  ]
    .map(asText)
    .filter(Boolean)
    .join(' ');

  if (NON_LIVING_IMAGE_RE.test(haystack)) return undefined;
  return text;
}

function urlsOf(record: Record<string, unknown>): string[] {
  const candidates: unknown[] = [];
  for (const field of URL_FIELDS) candidates.push(record[field]);
  for (const field of ['image_urls', 'urls', 'images']) {
    const value = record[field];
    if (Array.isArray(value)) candidates.push(...value);
  }

  const out: string[] = [];
  for (const value of candidates) {
    const url = cleanUrl(value, record);
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}

function normalizeImage(raw: unknown): GenusImage | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const scientificName = scientificNameOf(record);
  if (!scientificName) return null;

  const imageUrls = urlsOf(record);
  if (imageUrls.length === 0) return null;

  return {
    ...(record as Partial<GenusImage>),
    scientific_name: scientificName,
    image_url: imageUrls[0],
    image_urls: imageUrls,
    image_source: asText(record.image_source) || asText(record.source) || 'Orchid Continuum image library',
    image_license: asText(record.image_license) || asText(record.license),
  } as GenusImage;
}

function extractImages(payload: unknown): GenusImage[] {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(record.images)
      ? record.images
      : Array.isArray(record.results)
        ? record.results
        : Array.isArray(record.data)
          ? record.data
          : Array.isArray(record.rows)
            ? record.rows
            : [];

  const seen = new Set<string>();
  const out: GenusImage[] = [];
  for (const img of candidates.map(normalizeImage).filter((x): x is GenusImage => Boolean(x))) {
    const key = `${img.scientific_name.toLowerCase()}|${img.image_url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(img);
  }
  return out;
}

/**
 * Orchid Continuum-only image resolver.
 *
 * Calls only the OC image backend. It does not query iNaturalist, Wikipedia,
 * Wikimedia, GBIF, or any other public image API from the browser. If the OC
 * backend/database cannot provide a living image, the UI gets a real pending
 * state instead of a fake outside fallback.
 */
export async function fetchPublicGenusImages(
  genus: string,
  signal?: AbortSignal,
  limit = 24,
): Promise<PublicImageSourceResult> {
  const clean = genus.trim();
  if (!clean) return { images: [], source: 'pending', diagnostic: 'empty genus' };

  const url = `${IMAGES_BACKEND_BASE_URL}/images/genus/${encodeURIComponent(clean)}?limit=${limit}`;

  try {
    const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) {
      return { images: [], source: 'pending', diagnostic: `OC image endpoint HTTP ${response.status}` };
    }
    const payload = await response.json();
    const images = extractImages(payload).slice(0, limit);
    return {
      images,
      source: images.length > 0 ? 'live' : 'pending',
      diagnostic: images.length > 0 ? undefined : 'OC image endpoint returned no usable living-image URLs',
    };
  } catch (error) {
    if (signal?.aborted) return { images: [], source: 'pending', diagnostic: 'request aborted' };
    return {
      images: [],
      source: 'pending',
      diagnostic: error instanceof Error ? error.message : 'OC image endpoint failed',
    };
  }
}
