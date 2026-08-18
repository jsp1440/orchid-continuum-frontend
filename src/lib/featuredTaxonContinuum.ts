import { fetchCalyxGenusMedia, type GenusMediaResponse } from '@/lib/genusMediaResolver';
import { fetchGenusGraphEvidence, type GenusGraphResult, type KnowledgeGraphDomain } from '@/lib/knowledgeGraph';

export type ContinuumEvidenceState = 'known' | 'unknown' | 'unavailable';

export type ContinuumDomainState = {
  domain: KnowledgeGraphDomain;
  state: ContinuumEvidenceState;
  nodes: number | null;
  edges: number | null;
};

export type FeaturedTaxonContinuum = {
  genus: string;
  media: GenusMediaResponse;
  graph: GenusGraphResult;
  domains: ContinuumDomainState[];
  gaps: KnowledgeGraphDomain[];
};

const DOMAIN_ORDER: readonly KnowledgeGraphDomain[] = [
  'taxonomy',
  'media',
  'occurrences',
  'traits',
  'literature',
  'pollinators',
  'conservation',
];

function domainStates(graph: GenusGraphResult): ContinuumDomainState[] {
  if (graph.status !== 'ok') {
    return DOMAIN_ORDER.map((domain) => ({ domain, state: 'unavailable', nodes: null, edges: null }));
  }

  return graph.evidence.domains.map(({ domain, nodes, edges }) => ({
    domain,
    state: nodes > 0 || edges > 0 ? 'known' : 'unknown',
    nodes,
    edges,
  }));
}

/**
 * Canonical read model for public featured-taxon experiences.
 *
 * It deliberately composes only Orchid Continuum/Calyx backend contracts.
 * Consumers must not infer biological absence from `unknown`, and must not
 * replace `unavailable` with local scientific claims or direct third-party
 * requests. Media uses the approved Continuum media resolver, whose contract
 * explicitly forbids an external client-side fallback.
 */
export async function fetchFeaturedTaxonContinuum(
  genus: string,
  signal?: AbortSignal,
): Promise<FeaturedTaxonContinuum> {
  const requested = genus.trim();
  if (!requested) throw new Error('Featured taxon genus is required');

  const [media, graph] = await Promise.all([
    fetchCalyxGenusMedia(requested, signal),
    fetchGenusGraphEvidence(requested, signal),
  ]);

  const domains = domainStates(graph);
  return {
    genus: graph.status === 'ok' ? graph.evidence.genus : (media.accepted_genus || requested),
    media,
    graph,
    domains,
    gaps: domains.filter((item) => item.state === 'unknown').map((item) => item.domain),
  };
}
