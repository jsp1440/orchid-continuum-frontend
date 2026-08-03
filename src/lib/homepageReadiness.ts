import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

export type MetricState = 'available' | 'unavailable' | 'error';

export type ReadinessMetric = {
  key: string;
  label: string;
  state: MetricState;
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  unit: string | null;
  source: string;
  measured_at: string | null;
  limitation: string | null;
};

export type DomainCoverage = {
  domain: string;
  species_with_evidence: number | null;
  accepted_species_total: number | null;
  percentage: number | null;
  state: MetricState;
  limitation: string | null;
};

export type HomepageReadiness = {
  contract_version: 'calyx-homepage-readiness-v1';
  generated_at: string;
  homepage_ready: boolean;
  redesign_work_may_proceed: boolean;
  publication_blocked: boolean;
  metrics: ReadinessMetric[];
  domain_coverage: DomainCoverage[];
  blockers: string[];
  unavailable_metrics: string[];
  next_actions: string[];
  scientific_publication_authority: false;
  graph_mutation: false;
};

export type HomepageReadinessResult =
  | { status: 'live'; readiness: HomepageReadiness }
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
    const payload = (await response.json()) as HomepageReadiness;
    if (payload.contract_version !== 'calyx-homepage-readiness-v1') {
      return { status: 'unavailable', reason: 'Readiness contract version could not be verified.' };
    }
    return { status: 'live', readiness: payload };
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    return { status: 'unavailable', reason: 'The live homepage-readiness service could not be reached.' };
  }
}
