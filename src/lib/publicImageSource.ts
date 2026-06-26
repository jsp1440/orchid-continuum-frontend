import { IMAGES_BACKEND_BASE_URL } from '@/lib/backendConfig';
import type { GenusImage } from '@/lib/genusData';

export type PublicImageSourceResult = {
  images: GenusImage[];
  source: 'live' | 'pending';
};

function normalizeImage(raw: unknown): GenusImage | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const scientificName =
    record.scientific_name ||
    record.scientificName ||
    record.binomial ||
    record.name ||
    record.species;

  if (typeof scientificName !== 'string' || !scientificName.trim()) return null;

  return {
    ...(record as Partial<GenusImage>),
    scientific_name: scientificName.trim(),
  } as GenusImage;
}

function extractImages(payload: unknown): GenusImage[] {
  const record = payload as Record<string, unknown>;
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.images)
      ? record.images
      : Array.isArray(record?.results)
        ? record.results
        : Array.isArray(record?.data)
          ? record.data
          : [];

  return candidates.map(normalizeImage).filter((img): img is GenusImage => Boolean(img));
}

export async function fetchPublicGenusImages(
  genus: string,
  signal?: AbortSignal,
  limit = 24,
): Promise<PublicImageSourceResult> {
  const cleanGenus = encodeURIComponent(genus.trim());
  const url = `${IMAGES_BACKEND_BASE_URL}/images/genus/${cleanGenus}?limit=${limit}`;

  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return { images: [], source: 'pending' };
    const payload = await response.json();
    const images = extractImages(payload);
    return { images, source: images.length > 0 ? 'live' : 'pending' };
  } catch {
    return { images: [], source: 'pending' };
  }
}
