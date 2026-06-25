import { classifyImage, type ImageMeta } from './imageQuality';

export type ImageQualityDecision = 'accepted' | 'rejected';

export interface ImageQualityAuditItem {
  url: string;
  category: ReturnType<typeof classifyImage>['category'];
  score: number;
  decision: ImageQualityDecision;
  reason: string;
}

export interface ImageQualityAuditSummary {
  total: number;
  accepted: number;
  rejected: number;
  items: ImageQualityAuditItem[];
}

function reasonFor(category: ImageQualityAuditItem['category'], score: number): string {
  if (score <= 0 || category === 'herbarium') {
    return 'Rejected as herbarium/specimen/document/plate/logo/non-photo asset.';
  }
  if (category === 'flower') return 'Accepted as likely living orchid flower photograph.';
  if (category === 'plant') return 'Accepted as likely living orchid plant photograph.';
  if (category === 'habitat') return 'Accepted as habitat/in-situ orchid context photograph.';
  if (category === 'pollinator') return 'Accepted as pollinator context photograph.';
  return 'Rejected because it is not a release-safe living orchid photograph.';
}

/**
 * Audit a candidate image list using the same central classifier used by
 * homepage rendering. This is intentionally side-effect-free so diagnostics,
 * tests, and release reports can call it without changing UI behavior.
 */
export function auditImageUrls(
  urls: string[],
  shared?: Omit<ImageMeta, 'url' | 'urls'>,
): ImageQualityAuditSummary {
  const seen = new Set<string>();
  const items: ImageQualityAuditItem[] = [];

  for (const raw of urls || []) {
    const url = typeof raw === 'string' ? raw.trim() : '';
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const { category, score } = classifyImage({ ...shared, url });
    const decision: ImageQualityDecision = score >= 70 ? 'accepted' : 'rejected';
    items.push({
      url,
      category,
      score,
      decision,
      reason: reasonFor(category, score),
    });
  }

  return {
    total: items.length,
    accepted: items.filter((i) => i.decision === 'accepted').length,
    rejected: items.filter((i) => i.decision === 'rejected').length,
    items,
  };
}
