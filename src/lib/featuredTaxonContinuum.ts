import { fetchCalyxGenusMedia, type GenusMediaResponse } from '@/lib/genusMediaResolver';
import { fetchGenusGraphEvidence, type GenusGraphResult, type KnowledgeGraphDomain } from '@/lib/knowledgeGraph';
import { fetchContinuumGraph, type ContinuumGraphData } from '@/lib/ocBackend';
import { fetchFungalEvidence, type FungalEvidence } from '@/lib/fungalPartner';

export type ContinuumEvidenceState = 'known' | 'unknown' | 'unavailable';

export type ContinuumDomainState = {
  domain: KnowledgeGraphDomain;
  state: ContinuumEvidenceState;
  nodes: number | null;
  edges: number | null;
};

export type FeaturedTaxonConservationEvidence = {
  /** Graph-domain coverage only; `unknown` is not biological absence. */
  state: ContinuumEvidenceState;
  nodes: number | null;
  edges: number | null;
  /** Canonical relationship summary when the Continuum relationship service supplies one. */
  relationship: ContinuumGraphData['conservation'] | null;
};

export type FeaturedTaxonContinuum = {
  genus: string;
  media: GenusMediaResponse;
  graph: GenusGraphResult;
  /** Rich relationship summaries from the canonical Continuum graph endpoint. */
  relationships: ContinuumGraphData | null;
  domains: ContinuumDomainState[];
  /** Canonical conservation evidence for downstream public consumers. */
  conservation: FeaturedTaxonConservationEvidence;
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

const SAFE_FEATURED_GENUS = /^[A-Z][A-Za-z-]+$/;
const MAX_FEATURED_GENUS_LENGTH = 120;

/**
 * Featured-genus reads cross the same trust boundary as featured-genus route
 * handoffs. Keep the accepted shape aligned: one bounded canonical genus token,
 * never a binomial, route fragment, locality string, or arbitrary prompt text.
 */
export function normalizeFeaturedTaxonGenus(value: unknown): string {
  const genus = String(value ?? '').trim();
  if (
    !genus ||
    genus.length > MAX_FEATURED_GENUS_LENGTH ||
    !SAFE_FEATURED_GENUS.test(genus)
  ) {
    throw new Error('A bounded canonical featured-taxon genus is required');
  }
  return genus;
}

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

function conservationEvidence(
  domains: ContinuumDomainState[],
  relationships: ContinuumGraphData | null,
): FeaturedTaxonConservationEvidence {
  const conservation = domains.find((item) => item.domain === 'conservation');
  return {
    state: conservation?.state ?? 'unavailable',
    nodes: conservation?.nodes ?? null,
    edges: conservation?.edges ?? null,
    relationship: relationships?.conservation ?? null,
  };
}

/**
 * Canonical species-aware fungal evidence resolver for featured-taxon consumers.
 *
 * The underlying Orchid Continuum evidence source preserves exact species,
 * congeneric, and unrecorded states. Public components call this adapter rather
 * than reaching into a scientific table/service directly, so the semantic
 * boundary remains centralized while the hero's resolved species can still be
 * used to distinguish species-level evidence from genus-level evidence.
 */
export async function fetchFeaturedTaxonFungalEvidence(
  genus: string,
  displayedSpecies: string | null,
): Promise<FungalEvidence> {
  const requested = normalizeFeaturedTaxonGenus(genus);
  return fetchFungalEvidence(requested, displayedSpecies);
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
  const requested = normalizeFeaturedTaxonGenus(genus);

  const [media, graph, relationships] = await Promise.all([
    fetchCalyxGenusMedia(requested, signal),
    fetchGenusGraphEvidence(requested, signal),
    fetchContinuumGraph(requested, signal).catch(() => null),
  ]);

  const domains = domainStates(graph);
  return {
    genus: graph.status === 'ok'
      ? graph.evidence.genus
      : (media.accepted_genus || relationships?.genus || requested),
    media,
    graph,
    relationships,
    domains,
    conservation: conservationEvidence(domains, relationships),
    gaps: domains.filter((item) => item.state === 'unknown').map((item) => item.domain),
  };
}
