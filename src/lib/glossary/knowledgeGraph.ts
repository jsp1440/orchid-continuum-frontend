/**
 * Proposed Knowledge Graph publication metadata for accepted glossary terms.
 *
 * IMPORTANT: This module PROPOSES nodes and relationships only. It performs no
 * writes, creates no nodes or edges, alters no schema, and calls no repository.
 * Output is a clean intermediate publication record that a later, separate
 * publish step can consume.
 *
 * Compatibility note (documented gap): the frontend Knowledge Graph model in
 * src/types/knowledgeObject.ts exposes KnowledgeObject.objectType as a fixed
 * enum that has no "glossary term" member. Rather than widen that enum here
 * (which would be an out-of-scope schema change), proposed nodes carry
 * nodeType: 'glossary_term' and knowledgeObjectType: null, and map onto the
 * existing KG domain vocabulary (KNOWLEDGE_GRAPH_DOMAINS) where reasonable.
 */

// Type-only import: erased at runtime, so the CLI (plain Node) never pulls in
// the frontend runtime chain (which reads import.meta.env and the "@/" alias).
import type { KnowledgeGraphDomain } from '@/lib/knowledgeGraph';
import { slugify } from './normalize.ts';
import type {
  NormalizedGlossary,
  ProposedGraphNode,
  ProposedGraphRelationship,
} from './types.ts';

/**
 * Local mirror of KNOWLEDGE_GRAPH_DOMAINS from src/lib/knowledgeGraph.ts. We
 * keep a copy so this module has zero runtime dependency on the frontend
 * bundle; the knowledgeGraph.test.ts drift guard asserts the two stay in sync.
 */
export const GLOSSARY_KG_DOMAINS = [
  'taxonomy',
  'media',
  'occurrences',
  'traits',
  'literature',
  'pollinators',
  'conservation',
] as const satisfies readonly KnowledgeGraphDomain[];

/** Deterministic node id for a glossary term. */
export function glossaryNodeId(slug: string): string {
  return `glossary:${slug}`;
}

/**
 * Map a glossary category onto candidate KG domains. Conservative and
 * deterministic: unknown categories map to the neutral "traits" domain, which
 * best fits descriptive morphology/terminology entries.
 */
export function inferDomains(category: string | null): KnowledgeGraphDomain[] {
  const fallback: KnowledgeGraphDomain = 'traits';
  if (!category) return [fallback];
  const key = category.toLowerCase();
  const map: Array<[RegExp, KnowledgeGraphDomain]> = [
    [/taxonom|classif|genus|species|clade/, 'taxonomy'],
    [/pollinat/, 'pollinators'],
    [/conserv|threat|iucn/, 'conservation'],
    [/literatur|publicat|reference|citation/, 'literature'],
    [/occurrence|distribut|habitat|range/, 'occurrences'],
    [/image|media|photo|illustrat/, 'media'],
    [/morpholog|anatom|structure|trait|physiolog/, 'traits'],
  ];
  for (const [pattern, domain] of map) {
    if (pattern.test(key) && GLOSSARY_KG_DOMAINS.includes(domain)) return [domain];
  }
  return [fallback];
}

/** Build the proposed KG node for an accepted glossary entry. */
export function buildProposedNode(glossary: NormalizedGlossary, slug: string): ProposedGraphNode {
  return {
    id: glossaryNodeId(slug),
    slug,
    nodeType: 'glossary_term',
    knowledgeObjectType: null,
    label: glossary.term,
    summary: glossary.definition,
    category: glossary.category,
    domains: inferDomains(glossary.category),
    publicationStatus: 'proposed',
  };
}

/**
 * Build proposed relationships from a glossary term to its synonyms, related
 * terms, category, and source. All edges are proposals only. Target ids are
 * deterministic slugs so repeated runs are byte-stable.
 */
export function buildProposedRelationships(
  glossary: NormalizedGlossary,
  slug: string,
): ProposedGraphRelationship[] {
  const sourceId = glossaryNodeId(slug);
  const relationships: ProposedGraphRelationship[] = [];

  for (const synonym of glossary.synonyms) {
    const targetSlug = slugify(synonym);
    relationships.push({
      id: `${sourceId}--has_synonym--glossary:${targetSlug}`,
      type: 'has_synonym',
      sourceId,
      targetId: glossaryNodeId(targetSlug),
      targetName: synonym,
      publicationStatus: 'proposed',
    });
  }

  for (const related of glossary.relatedTerms) {
    const targetSlug = slugify(related);
    relationships.push({
      id: `${sourceId}--related_to--glossary:${targetSlug}`,
      type: 'related_to',
      sourceId,
      targetId: glossaryNodeId(targetSlug),
      targetName: related,
      publicationStatus: 'proposed',
    });
  }

  if (glossary.category) {
    const targetSlug = slugify(glossary.category);
    relationships.push({
      id: `${sourceId}--in_category--category:${targetSlug}`,
      type: 'in_category',
      sourceId,
      targetId: `category:${targetSlug}`,
      targetName: glossary.category,
      publicationStatus: 'proposed',
    });
  }

  if (glossary.source) {
    const targetSlug = slugify(glossary.source);
    relationships.push({
      id: `${sourceId}--sourced_from--source:${targetSlug}`,
      type: 'sourced_from',
      sourceId,
      targetId: `source:${targetSlug}`,
      targetName: glossary.source,
      publicationStatus: 'proposed',
    });
  }

  return relationships;
}
