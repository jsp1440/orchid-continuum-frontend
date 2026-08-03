import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

export type MetricState = 'available' | 'unavailable' | 'error';

export type LiveMetric = {
  state: MetricState;
  value: number | null;
  denominator: number | null;
  percentage: number | null;
  detail: string | null;
};

export type TaxonomyImageReadiness = {
  state: MetricState;
  taxonomy_table?: string | null;
  image_table?: string | null;
  taxonomy_key?: string | null;
  image_taxonomy_key?: string | null;
  total_taxa?: number;
  total_images?: number;
  linked_images?: LiveMetric;
  unlinked_images?: LiveMetric;
  broken_taxonomy_targets?: LiveMetric;
  taxa_with_images?: LiveMetric;
  interpretation?: 'relational_linkage_only';
  detail?: string | null;
};

export type GraphIntegrity = {
  state: MetricState;
  null_endpoint_edges?: number;
  duplicate_edges?: number;
  passed?: boolean;
  detail?: string | null;
};

export type GraphMaterializationReadiness = {
  state: MetricState;
  edge_table: string | null;
  total_edges?: number;
  taxonomy_to_images?: LiveMetric;
  integrity?: GraphIntegrity;
  detail?: string | null;
};

export type LiveGraphAudit = {
  contract: 'calyx-live-graph-audit-v1';
  generated_at: string;
  relational: { taxonomy_to_images: TaxonomyImageReadiness };
  graph: GraphMaterializationReadiness;
  blockers: string[];
  homepage_ready: boolean;
  warning: string;
};

export type HomepageReadinessResult =
  | { status: 'live'; audit: LiveGraphAudit }
  | { status: 'unavailable'; reason: string };

export async function fetchHomepageReadiness(signal?: AbortSignal): Promise<HomepageReadinessResult> {
  try {
    const response = await fetch(`${CALYX_BACKEND_BASE_URL}/api/platform/readiness/homepage`, {
      signal,
      credentials: 'include',
    });
    if (!response.ok) {
      return { status: 'unavailable', reason: `Readiness service returned ${response.status}.` };
    }
    const payload = (await response.json()) as LiveGraphAudit;
    if (payload.contract !== 'calyx-live-graph-audit-v1') {
      return { status: 'unavailable', reason: 'Live graph-audit contract could not be verified.' };
    }
    return { status: 'live', audit: payload };
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    return { status: 'unavailable', reason: 'The live homepage-readiness service could not be reached.' };
  }
}
