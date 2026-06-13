/**
 * imageQuality — homepage image curation.
 *
 * Homepage galleries must show living orchid photographs only.
 * Herbarium sheets, specimen scans, vouchers, barcode records, labels,
 * collection documents, type sheets, botanical plates, archive scans,
 * diagrams, illustrations, and broken/blank-looking image records are blocked.
 */

export type ImageCategory =
  | 'flower'
  | 'plant'
  | 'habitat'
  | 'pollinator'
  | 'illustration'
  | 'herbarium';

export const CATEGORY_SCORE: Record<ImageCategory, number> = {
  flower: 100,
  plant: 90,
  habitat: 82,
  pollinator: 78,
  illustration: 0,
  herbarium: 0,
};

export const MIN_GALLERY_SCORE = 70;

export interface ImageMeta {
  url?: string;
  urls?: string[];
  title?: string;
  description?: string;
  source?: string;
  license?: string;
  name?: string;
  width?: number;
  height?: number;
  isHerbarium?: boolean;
}

const HARD_REJECT_RE =
  /(herbari|specimen|voucher|barcode|holotype|isotype|lectotype|syntype|neotype|paratype|exsiccat|sheet|accession|catalog|collection[\s_-]*number|determination|label|jstor|plants\.jstor|sweetgum\.nybg|sernecportal|swbiodiversity|biocase|idigbio|reflora|specieslink|virtualherbarium|mediaphoto\.mnhn|mnhn\.fr|gbif\.org\/occurrence|biodiversitylibrary|archive\.org|botanicus|gallica|recolnat|jacq\.org|cvh\.ac\.cn|mobot|tropicos|digitarium|herbariovirtual|\/plate|\/plates|\/figure|\/figures|\/illustration|\/illustrations|\/drawing|\/drawings|\/lineart|line[\s_-]*art|botanical[\s_-]*(plate|illustration|drawing)|engraving|lithograph|watercolou?r|\.pdf|\.tif|\.tiff|\.djvu|\.doc|\.docx|\.txt|\.csv)/i;

const DOCUMENT_RE =
  /(ruler|scale[\s_-]*bar|color[\s_-]*bar|colour[\s_-]*bar|measurement|determinavit|determined[\s_-]*by|collector|collected[\s_-]*by|institution[\s_-]*code|annotation)/i;

const LIVING_PHOTO_URL_RE =
  /(static\.inaturalist|inaturalist\.org\/photos|inaturalist\.org\/observations|flickr\.com\/photos|live\.staticflickr|farm\d+\.staticflickr|upload\.wikimedia\.org|commons\.wikimedia\.org)/i;

const FLOWER_RE =
  /(flower|bloom|blossom|inflorescen|lip|labellum|floral|petal|sepal|column|orchid)/i;

const PLANT_RE =
  /(plant|whole[\s_-]*plant|cultivat|potted|foliage|leaves|pseudobulb|habit|cane|epiphyte|orchid)/i;

const HABITAT_RE =
  /(habitat|in[\s_-]*situ|wild|forest|montane|cloud[\s_-]*forest|rainforest|canopy|tree|trunk|rock|limestone|karst)/i;

const POLLINATOR_RE =
  /(pollinat|bee|wasp|moth|hawkmoth|butterfl|fly|insect|euglossin|hummingbird|bird)/i;

const MIN_PHOTO_RATIO = 0.35;
const MAX_PHOTO_RATIO = 3.0;

function haystack(meta: ImageMeta): string {
  return [
    meta.url,
    ...(meta.urls ?? []),
    meta.title,
    meta.description,
    meta.source,
    meta.license,
    meta.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function looksLikeDocument(meta: ImageMeta): boolean {
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w > 0 && h > 0) {
    const ratio = w / h;
    if (ratio < MIN_PHOTO_RATIO || ratio > MAX_PHOTO_RATIO) return true;
    if (w > 2200 && h > 3000) return true;
  }
  return false;
}

export function classifyImage(meta: ImageMeta): {
  category: ImageCategory;
  score: number;
} {
  const hay = haystack(meta);
  const primaryUrl = meta.url ?? meta.urls?.[0] ?? '';

  if (!primaryUrl.trim()) {
    return { category: 'herbarium', score: 0 };
  }

  if (
    meta.isHerbarium ||
    HARD_REJECT_RE.test(hay) ||
    DOCUMENT_RE.test(hay) ||
    looksLikeDocument(meta)
  ) {
    return { category: 'herbarium', score: 0 };
  }

  if (LIVING_PHOTO_URL_RE.test(primaryUrl)) {
    if (FLOWER_RE.test(hay)) return { category: 'flower', score: 100 };
    if (PLANT_RE.test(hay)) return { category: 'plant', score: 90 };
    if (HABITAT_RE.test(hay)) return { category: 'habitat', score: 82 };
    if (POLLINATOR_RE.test(hay)) return { category: 'pollinator', score: 78 };
    return { category: 'plant', score: 90 };
  }

  if (FLOWER_RE.test(hay)) return { category: 'flower', score: 100 };
  if (PLANT_RE.test(hay)) return { category: 'plant', score: 90 };
  if (HABITAT_RE.test(hay)) return { category: 'habitat', score: 82 };
  if (POLLINATOR_RE.test(hay)) return { category: 'pollinator', score: 78 };

  return { category: 'herbarium', score: 0 };
}

export function scoreImage(url: string, shared?: Omit<ImageMeta, 'url'>): number {
  return classifyImage({ ...shared, url }).score;
}

export function isExcludedImage(
  url: string,
  shared?: Omit<ImageMeta, 'url'>,
): boolean {
  return scoreImage(url, shared) < MIN_GALLERY_SCORE;
}

export function filterRankUrls(
  urls: string[],
  shared?: Omit<ImageMeta, 'url' | 'urls'>,
): string[] {
  const seen = new Set<string>();

  return urls
    .filter((u) => {
      const clean = typeof u === 'string' ? u.trim() : '';
      if (!clean || seen.has(clean)) return false;
      seen.add(clean);
      return true;
    })
    .map((u, i) => ({ u, i, s: scoreImage(u, shared) }))
    .filter((x) => x.s >= MIN_GALLERY_SCORE)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.u);
}

export function bestUrlScore(
  urls: string[],
  shared?: Omit<ImageMeta, 'url' | 'urls'>,
): number {
  let best = 0;
  for (const u of urls) {
    const s = scoreImage(u, shared);
    if (s > best) best = s;
  }
  return best;
}

export function homepageSafeUrl(
  url: string | null | undefined,
  shared?: Omit<ImageMeta, 'url'>,
): string | null {
  if (!url) return null;
  return scoreImage(url, shared) >= MIN_GALLERY_SCORE ? url : null;
}
