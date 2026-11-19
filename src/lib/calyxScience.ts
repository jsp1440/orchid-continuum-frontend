import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

export type ScienceSafety = {
  destructive_actions?: boolean;
  external_mutations?: boolean;
  unsupported_claims_promoted?: boolean;
  provenance_required_for_scientific_claims?: boolean;
};

export type ScienceDepartment = {
  department_id: string;
  display_name: string;
  priority: number;
  enabled: boolean;
  cadence_hint?: string;
  safe_task_types?: string[];
  blocked_task_types?: string[];
  primary_outputs?: string[];
  provenance_required?: boolean;
};

export type ScienceGap = {
  gap_id: string;
  department_id: string;
  priority: number;
  gap_type: string;
  summary: string;
  recommended_mission?: string;
  risk_level?: string;
  claim_type?: string;
  confidence?: string;
  review_status?: string;
  source?: string;
  promoted_claims?: boolean;
};

export type ScienceDataset = {
  dataset_id: string;
  display_name: string;
  department_id: string;
  source_type?: string;
  integration_state?: string;
  freshness_cadence?: string;
  primary_entities?: string[];
  provenance_required?: boolean;
  next_safe_action?: string;
};

export type ScienceMission = {
  mission_type: string;
  department_id: string;
  priority: number;
  status: string;
  risk_level?: string;
  provenance_required?: boolean;
};

export type ScienceHarvester = {
  harvester_id: string;
  department_id: string;
  expected_output?: string;
  status?: string;
  recommended_action?: string;
};

export type DossierCandidate = {
  entity_type: string;
  queue_name: string;
  priority_reason?: string;
  required_sections?: string[];
  status?: string;
};

export type ScienceSummary = {
  status: string;
  mode?: string;
  department_count?: number;
  mission_type_count?: number;
  dataset_count?: number;
  top_priorities?: ScienceDepartment[];
  low_priority_support?: ScienceDepartment[];
  highest_priority_gaps?: ScienceGap[];
  safety?: ScienceSafety;
};

export type ScienceStatus = {
  status: string;
  mode?: string;
  science_departments_enabled?: number;
  dataset_count?: number;
  known_gap_count?: number;
  highest_priority_work?: ScienceGap[];
  next_recommended_actions?: string[];
  safety?: ScienceSafety;
};

export type ScienceSectionKey =
  | 'summary'
  | 'status'
  | 'departments'
  | 'gaps'
  | 'datasets'
  | 'missions'
  | 'harvesters'
  | 'dossiers';

export type CalyxScienceDashboard = {
  fetchedAt: string;
  summary: ScienceSummary | null;
  status: ScienceStatus | null;
  departments: ScienceDepartment[];
  gaps: ScienceGap[];
  datasets: ScienceDataset[];
  missions: ScienceMission[];
  harvesters: ScienceHarvester[];
  dossiers: DossierCandidate[];
  /**
   * Sections whose backend call failed. A section absent from this map and
   * returning an empty array means the backend reported zero records; a
   * section present here means that data point is UNAVAILABLE, not zero --
   * callers must not collapse the two (see docs/AGENT-OPERATING-MEMORY.md).
   */
  sectionErrors: Partial<Record<ScienceSectionKey, string>>;
};

async function readJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${CALYX_BACKEND_BASE_URL}${path}`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${path}`);
  }

  return response.json() as Promise<T>;
}

function sectionErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Unknown Calyx science telemetry error';
}

export async function fetchCalyxScienceDashboard(signal?: AbortSignal): Promise<CalyxScienceDashboard> {
  const [summary, status, departments, gaps, datasets, missions, harvesters, dossiers] = await Promise.allSettled([
    readJson<ScienceSummary>('/api/science/summary', signal),
    readJson<ScienceStatus>('/api/science/status', signal),
    readJson<{ departments?: ScienceDepartment[] }>('/api/science/departments', signal),
    readJson<{ gaps?: ScienceGap[] }>('/api/science/gaps', signal),
    readJson<{ datasets?: ScienceDataset[] }>('/api/science/datasets', signal),
    readJson<{ missions?: ScienceMission[] }>('/api/science/missions', signal),
    readJson<{ harvesters?: ScienceHarvester[] }>('/api/science/harvesters', signal),
    readJson<{ candidates?: DossierCandidate[] }>('/api/science/dossiers', signal),
  ]);

  const settled = { summary, status, departments, gaps, datasets, missions, harvesters, dossiers };
  if (Object.values(settled).every((result) => result.status === 'rejected')) {
    const firstRejection = Object.values(settled).find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    throw new Error(sectionErrorMessage(firstRejection?.reason) || 'Calyx science telemetry is unavailable');
  }

  const sectionErrors: Partial<Record<ScienceSectionKey, string>> = {};
  (Object.keys(settled) as ScienceSectionKey[]).forEach((key) => {
    const result = settled[key];
    if (result.status === 'rejected') sectionErrors[key] = sectionErrorMessage(result.reason);
  });

  return {
    fetchedAt: new Date().toISOString(),
    summary: summary.status === 'fulfilled' ? summary.value : null,
    status: status.status === 'fulfilled' ? status.value : null,
    departments: departments.status === 'fulfilled' ? departments.value.departments ?? [] : [],
    gaps: gaps.status === 'fulfilled' ? gaps.value.gaps ?? [] : [],
    datasets: datasets.status === 'fulfilled' ? datasets.value.datasets ?? [] : [],
    missions: missions.status === 'fulfilled' ? missions.value.missions ?? [] : [],
    harvesters: harvesters.status === 'fulfilled' ? harvesters.value.harvesters ?? [] : [],
    dossiers: dossiers.status === 'fulfilled' ? dossiers.value.candidates ?? [] : [],
    sectionErrors,
  };
}
