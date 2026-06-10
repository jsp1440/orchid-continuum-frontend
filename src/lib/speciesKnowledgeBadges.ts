import type { FeaturedSpecies } from './speciesFeature';

export interface SpeciesKnowledgeBadges {
  literatureCount: number;
  videoCount: number;
  storyCount: number;
  relationshipCount: number;
}

function numeric(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === 'string' && Number.isFinite(Number(v))) return Math.max(0, Math.floor(Number(v)));
  return undefined;
}

function firstNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const n = numeric(obj[key]);
    if (n !== undefined) return n;
  }
  return undefined;
}

/**
 * Derive homepage knowledge-graph badges from whatever the backend currently
 * provides. As OREP/video/media endpoints mature, they can send explicit count
 * fields and this helper will display them without another component rewrite.
 */
export function speciesKnowledgeBadges(species: FeaturedSpecies): SpeciesKnowledgeBadges {
  const raw = species as FeaturedSpecies & Record<string, unknown>;

  const literatureCount =
    firstNumber(raw, [
      'literatureCount',
      'literature_count',
      'articleCount',
      'article_count',
      'paperCount',
      'paper_count',
      'referenceCount',
      'reference_count',
      'sourceCount',
      'source_count',
    ]) ?? (species.literatureNote || species.sourceCitation ? 1 : 0);

  const videoCount =
    firstNumber(raw, [
      'videoCount',
      'video_count',
      'videos',
      'youtube_count',
      'media_video_count',
    ]) ?? 0;

  const storyCount =
    firstNumber(raw, ['storyCount', 'story_count', 'caption_count']) ??
    [species.literatureNote, species.discoveryNote].filter(Boolean).length;

  const relationshipCount =
    firstNumber(raw, ['relationshipCount', 'relationship_count', 'edge_count', 'knowledge_edges']) ??
    [species.pollinator, species.mycorrhizal, species.habitat, species.climate, species.relationship].filter(Boolean).length;

  return {
    literatureCount,
    videoCount,
    storyCount,
    relationshipCount,
  };
}
