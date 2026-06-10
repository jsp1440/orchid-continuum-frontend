/**
 * imageQuality — homepage "Genus of the Day" image curation.
 *
 * The trusted image library (/images/genus) and the legacy photo pool both
 * contain research-grade material that is inappropriate for the homepage
 * experience: herbarium sheets, preserved-specimen scans, type vouchers,
 * barcoded archival records and non-image documents (PDF/TIFF). These belong
 * on the research/atlas pages, not in the public gallery.
 *
 * This module assigns every candidate image a curation score so the gallery can
 *   1. EXCLUDE herbarium / specimen / document material (score 0),
 *   2. RANK the survivors by how "beautiful & story-telling" they are
 *      (flower > whole plant > habitat > pollinator > botanical illustration),
 *   3. only surface images scoring >= 60, highest first, and
 *   4. prefer botanical illustrations over herbarium records when filling slots.
 *
 * Metadata is best-effort: the backend currently exposes only the URL(s),
 * source/credit and licence strings, plus the scientific name. The classifier
 * also accepts optional title/description/width/height so that richer metadata
 * (labels, rulers, document aspect ratios) downranks automatically the moment
 * the backend starts providing it — no UI change required.
 */

export type ImageCategory =
  | 'flower'
  | 'plant'
  | 'habitat'
  | 'pollinator'
  | 'illustration'
  | 'herbarium';

/** Curation score per category (per product spec). */
export const CATEGORY_SCORE: Record<ImageCategory, number> = {
  flower: 100,
  plant: 90,
  habitat: 80,
  pollinator: 75,
  illustration: 60,
  herbarium: 0,
};

/** Minimum score an image must reach to appear in the homepage gallery. */
export const MIN_GALLERY_SCORE = 60;

export interface ImageMeta {
  url?: string;
  urls?: string[];
  title?: string;
  description?: string;
  /** Attribution / credit / institution string. */
  source?: string;
  license?: string;
  /** Scientific / common name context (rarely carries signal, but cheap). */
  name?: string;
  /** Pixel dimensions, if the backend ever supplies them. */
  width?: number;
  height?: number;
  /** Explicit "this is a preserved specimen" flag, if present. */
  isHerbarium?: boolean;
}

// --- Keyword signals --------------------------------------------------------

/** Preserved-specimen / herbarium vocabulary — anything matching scores 0. */
const HERBARIUM_RE =
  /(herbari|preserved[\s_-]*specimen|type[\s_-]*specimen|\bspecimen\b|holotype|isotype|lectotype|syntype|neotype|paratype|voucher|\bsheet\b|barcode|\bherb\.)/i;

/**
 * Document-furniture cues — labels, rulers, colour/scale bars and measurement
 * markings are the tell-tale signs of a scanned specimen sheet rather than a
 * living-plant photograph. Matched against any available metadata text so that
 * detected labels/rulers (requirement #2) downrank to score 0.
 */
const DOCUMENT_FURNITURE_RE =
  /(specimen[\s_-]*label|herbarium[\s_-]*label|\bruler\b|scale[\s_-]*bar|colou?r[\s_-]*bar|colou?r[\s_-]*chart|measurement[\s_-]*scale|\bdeterminavit\b|accession[\s_-]*label)/i;

/**
 * Institution / archive URL fragments that reliably indicate a digitised
 * herbarium or type collection rather than a living-plant photograph. Kept
 * deliberately narrow (institution-specific paths only) to avoid zeroing benign
 * CDN URLs.
 */
const HERBARIUM_URL_RE =
  /(jstor\.org\/?.*plant|plants\.jstor|sweetgum\.nybg|\/herbarium\/|herbcat|catalogue.*specimen|mnhn\.fr\/.*\/p\/)/i;

/** Non-image documents that should never render as a gallery photo. */
const DOC_EXT_RE = /\.(pdf|tif|tiff|djvu|doc|docx)(\?|#|$)/i;

const ILLUSTRATION_RE =
  /(illustration|botanical[\s_-]*art|\bplate\b|lithograph|engraving|lindenia|reichenbachia|curtis|botanical[\s_-]*magazine|watercolou?r|\bdrawing\b|\bsketch\b|\bfig\.)/i;
const ILLUSTRATION_URL_RE = /(biodiversitylibrary|archive\.org\/.*\/page|\/plates?\/)/i;

const POLLINATOR_RE =
  /(pollinat|\bbee\b|\bwasp\b|\bmoth\b|hawkmoth|butterfl|\bfly\b|\binsect\b|euglossin|\bant\b)/i;
const HABITAT_RE =
  /(habitat|in[\s_-]*situ|in[\s_-]*the[\s_-]*wild|\bwild\b|epiphyt|lithophyt|\bforest\b|montane|\bcliff\b|landscape|\btrunk\b|on[\s_-]*tree|\brock\b)/i;
const PLANT_RE =
  /(whole[\s_-]*plant|\bplant\b|cultivat|\bpot\b|potted|growing|foliage|\bleaves\b|pseudobulb|\bhabit\b)/i;
const FLOWER_RE =
  /(flower|\bbloom\b|blossom|inflorescen|\blip\b|labellum|close[\s_-]*up|\bfloral\b|\bpetal)/i;

/** Aspect ratios outside this band look like document scans, not photos. */
const MIN_PHOTO_RATIO = 0.42; // taller/narrower than this ≈ a scanned sheet

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
    if (ratio > 0 && ratio < MIN_PHOTO_RATIO) return true; // very tall scan
  }
  return false;
}

/**
 * Classify a single image into a category + curation score using whatever
 * metadata is available. Order matters: disqualifying signals (herbarium,
 * documents) are checked before any positive category.
 */
export function classifyImage(meta: ImageMeta): {
  category: ImageCategory;
  score: number;
} {
  const hay = haystack(meta);
  const primaryUrl = meta.url ?? meta.urls?.[0] ?? '';

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

  if (ILLUSTRATION_RE.test(hay) || ILLUSTRATION_URL_RE.test(hay)) {
    return { category: 'illustration', score: CATEGORY_SCORE.illustration };
  }
  if (POLLINATOR_RE.test(hay)) {
    return { category: 'pollinator', score: CATEGORY_SCORE.pollinator };
  }
  if (HABITAT_RE.test(hay)) {
    return { category: 'habitat', score: CATEGORY_SCORE.habitat };
  }
  if (PLANT_RE.test(hay)) {
    return { category: 'plant', score: CATEGORY_SCORE.plant };
  }
  if (FLOWER_RE.test(hay)) {
    return { category: 'flower', score: CATEGORY_SCORE.flower };
  }

  // No disqualifying or descriptive signal: a plain orchid photograph from a
  // trusted source (iNaturalist, Wikimedia, etc.) — treat as a flower photo,
  // the kind of image the homepage gallery is meant to celebrate.
  return { category: 'flower', score: CATEGORY_SCORE.flower };
}

/** Curation score (0–100) for one image URL with optional shared metadata. */
export function scoreImage(url: string, shared?: Omit<ImageMeta, 'url'>): number {
  return classifyImage({ ...shared, url }).score;
}

/** True when an image must be hidden from the homepage gallery. */
export function isExcludedImage(
  url: string,
  shared?: Omit<ImageMeta, 'url'>,
): boolean {
  return scoreImage(url, shared) < MIN_GALLERY_SCORE;
}

/**
 * Filter a candidate-URL list down to gallery-eligible images (score >= 60)
 * and return them highest-scoring first (flowers before illustrations). Order
 * is otherwise stable. Herbarium / specimen / document URLs are dropped, so
 * botanical illustrations naturally fill remaining slots before any herbarium
 * record ever could.
 */
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

/** Best (highest) curation score across a list of URLs; 0 if the list is empty. */
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
