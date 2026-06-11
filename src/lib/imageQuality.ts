/**
 * imageQuality — homepage image curation.
 *
 * Homepage galleries must show living orchids, habitat, pollinators, or
 * clearly intentional botanical illustrations. Herbarium sheets, specimen
 * scans, vouchers, barcode records, labels, collection documents, type sheets,
 * and archival specimen plates are research assets and should not appear in
 * public homepage hero/gallery slots. When only specimen material exists, the
 * homepage should show the approved placeholder instead.
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
  illustration: 55,
  herbarium: 0,
};

/** Only living plant / habitat / pollinator images pass the homepage gate. */
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

// ─── Specimen / herbarium hard-reject patterns ─────────────────────────────

const HERBARIUM_RE =
  /(herbari|preserved[\s_-]*specimen|dried[\s_-]*specimen|pressed[\s_-]*specimen|type[\s_-]*specimen|\bspecimen\b|holotype|isotype|lectotype|syntype|neotype|paratype|voucher|exsiccat|exsiccatae|\bsheet\b|barcode|accession|catalog[\s_-]*number|collection[\s_-]*number|determination[\s_-]*label|\bherb\.|herbarium[\s_-]*sheet|specimen[\s_-]*sheet|museum[\s_-]*record|digitized[\s_-]*record)/i;

const DOCUMENT_FURNITURE_RE =
  /(specimen[\s_-]*label|herbarium[\s_-]*label|\bruler\b|scale[\s_-]*bar|colou?r[\s_-]*bar|colou?r[\s_-]*chart|measurement[\s_-]*scale|determinavit|determined[\s_-]*by|collector|collected[\s_-]*by|institution[\s_-]*code|barcode|label[\s_-]*data|annotation[\s_-]*label)/i;

const HERBARIUM_URL_RE =
  /(jstor\.org\/?.*plant|plants\.jstor|sweetgum\.nybg|sernecportal|swbiodiversity|biocase|gbif\.org\/occurrence|mediaphoto\.mnhn|mnhn\.fr\/.*\/p\/|\/herbarium\/|herbcat|catalogue.*specimen|\/specimen|\/voucher|\/barcode|harvard.*huh|plants\.usda\.gov.*specimen|plantsystematics|idigbio|reflora|specieslink|virtualherbarium|herbarium.*image)/i;

const DOC_EXT_RE = /\.(pdf|tif|tiff|djvu|doc|docx|txt|csv)(\?|#|$)/i;

/**
 * Botanical plates, archive scans, BHL pages, and line-art illustrations.
 * These are checked against the full URL (and haystack) before scoring.
 * An image matching any of these patterns scores 0 — same as herbarium.
 */
const PLATE_URL_RE =
  /(biodiversitylibrary\.org|archive\.org\/(stream|page|download)|botanicus\.org|gallica\.bnf\.fr|\/plates?\/|\/figures?\/|\/illustrations?\/|\/drawings?\/|\/lineart\/|recolnat\.org|jacq\.org|cvh\.ac\.cn|rbge\.org\.uk\/.*image|nhm\.ac\.uk\/.*image|mobot\.org|tropicos\.org\/.*image|mnhn\.fr|digitarium|ala\.org\.au\/.*occurrence|herbariovirtual|col\.pl\/.*image|smns-bw\.org)/i;

/**
 * Titles / descriptions that indicate line art or plates even without
 * URL-level evidence. Combined with ILLUSTRATION_RE below.
 */
const PLATE_TITLE_RE =
  /(\bplate\s+\d|\bfig(ure)?\.?\s*\d|line\s+(art|drawing)|botanical\s+(plate|drawing|illustration)|scale\s+bar|\blineart\b|engraving|lithograph|woodcut|watercolou?r\s+illustration)/i;

// ─── Positive-signal patterns ──────────────────────────────────────────────

const ILLUSTRATION_RE =
  /(illustration|botanical[\s_-]*art|\bplate\b|lithograph|engraving|lindenia|reichenbachia|curtis|botanical[\s_-]*magazine|watercolou?r|drawing|sketch|\bfig\.)/i;
const ILLUSTRATION_URL_RE = /(biodiversitylibrary|archive\.org\/.*\/page|\/plates?\/)/i;

const POLLINATOR_RE =
  /(pollinat|\bbee\b|\bwasp\b|\bmoth\b|hawkmoth|butterfl|\bfly\b|\binsect\b|euglossin|\bant\b|hummingbird|bird)/i;
const HABITAT_RE =
  /(habitat|in[\s_-]*situ|in[\s_-]*the[\s_-]*wild|\bwild\b|epiphyt|lithophyt|forest|montane|cloud[\s_-]*forest|rainforest|grassland|wetland|bog|swamp|savanna|canopy|cliff|landscape|trunk|on[\s_-]*tree|rock|limestone|karst)/i;
const PLANT_RE =
  /(whole[\s_-]*plant|\bplant\b|cultivat|\bpot\b|potted|growing|foliage|leaves|pseudobulb|\bhabit\b|inflorescence[\s_-]*plant)/i;
const FLOWER_RE =
  /(flower|\bbloom\b|blossom|inflorescen|\blip\b|labellum|close[\s_-]*up|floral|petal|sepal|column)/i;

// ─── URL patterns that confirm a living-plant photograph ──────────────────
// iNaturalist observation photos and Flickr are reliable living-plant sources.
const LIVING_PHOTO_URL_RE =
  /(inaturalist\.org\/(photos|observations)|static\.inaturalist|flickr\.com\/photos|live\.staticflickr|farm\d+\.staticflickr)/i;

const MIN_PHOTO_RATIO = 0.42;
const MAX_PHOTO_RATIO = 2.6;

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
    if (ratio > 0 && (ratio < MIN_PHOTO_RATIO || ratio > MAX_PHOTO_RATIO)) return true;
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

  // ── Hard reject: specimen / herbarium material ──────────────────────────
  if (
    meta.isHerbarium ||
    DOC_EXT_RE.test(primaryUrl) ||
    HERBARIUM_RE.test(hay) ||
    HERBARIUM_URL_RE.test(hay) ||
    DOCUMENT_FURNITURE_RE.test(hay) ||
    looksLikeDocument(meta)
  ) {
    return { category: 'herbarium', score: CATEGORY_SCORE.herbarium };
  }

  // ── Hard reject: botanical plates, BHL/archive scans, line art ─────────
  // Check URL first (fast), then haystack (covers title/description too).
  if (
    PLATE_URL_RE.test(primaryUrl) ||
    (meta.urls ?? []).some((u) => PLATE_URL_RE.test(u)) ||
    PLATE_TITLE_RE.test(hay)
  ) {
    return { category: 'herbarium', score: CATEGORY_SCORE.herbarium };
  }

  // ── Confirmed living-plant photograph ────────────────────────────────────
  // iNaturalist / Flickr observation photos are always safe; promote to flower
  // score immediately without needing keyword evidence.
  if (LIVING_PHOTO_URL_RE.test(primaryUrl)) {
    // Still check for the more specific positive categories.
    if (FLOWER_RE.test(hay)) return { category: 'flower', score: CATEGORY_SCORE.flower };
    if (PLANT_RE.test(hay)) return { category: 'plant', score: CATEGORY_SCORE.plant };
    if (HABITAT_RE.test(hay)) return { category: 'habitat', score: CATEGORY_SCORE.habitat };
    if (POLLINATOR_RE.test(hay)) return { category: 'pollinator', score: CATEGORY_SCORE.pollinator };
    // Default living-photo score: treat as whole plant (safe for homepage).
    return { category: 'plant', score: CATEGORY_SCORE.plant };
  }

  // ── Positive keyword signals (non-iNat/Flickr sources) ──────────────────
  if (FLOWER_RE.test(hay)) return { category: 'flower', score: CATEGORY_SCORE.flower };
  if (PLANT_RE.test(hay)) return { category: 'plant', score: CATEGORY_SCORE.plant };
  if (HABITAT_RE.test(hay)) return { category: 'habitat', score: CATEGORY_SCORE.habitat };
  if (POLLINATOR_RE.test(hay)) return { category: 'pollinator', score: CATEGORY_SCORE.pollinator };

  // Illustration: named pattern but not already hard-rejected above.
  if (ILLUSTRATION_RE.test(hay) || ILLUSTRATION_URL_RE.test(hay)) {
    return { category: 'illustration', score: CATEGORY_SCORE.illustration };
  }

  // ── Unknown: no positive signal and no rejection signal ─────────────────
  // Previous code returned flower/100 here, which let plates and archive
  // images through whenever their URLs and titles had no keywords.
  // Now we return score 0 so unknown images are treated as unsafe for the
  // homepage. A "Photo pending" placeholder is always better than a
  // mis-identified specimen scan.
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
  return urls
    .map((u, i) => ({ u, i, s: scoreImage(u, shared) }))
    .filter((x) => x.s >= MIN_GALLERY_SCORE)
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
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

/**
 * Homepage safety gate for a single URL.
 * Returns the URL if it passes the homepage filter, null if it should be
 * replaced by the "Photo/Image pending" placeholder.
 */
export function homepageSafeUrl(
  url: string | null | undefined,
  shared?: Omit<ImageMeta, 'url'>,
): string | null {
  if (!url) return null;
  return scoreImage(url, shared) >= MIN_GALLERY_SCORE ? url : null;
}
