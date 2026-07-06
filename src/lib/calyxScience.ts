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

export type CalyxScienceDashboard = {
  fetchedAt: string;
  summary: ScienceSummary;
  status: ScienceStatus;
  departments: ScienceDepartment[];
  gaps: ScienceGap[];
  datasets: ScienceDataset[];
  missions: ScienceMission[];
  harvesters: ScienceHarvester[];
  dossiers: DossierCandidate[];
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

export async function fetchCalyxScienceDashboard(signal?: AbortSignal): Promise<CalyxScienceDashboard> {
  const [summary, status, departments, gaps, datasets, missions, harvesters, dossiers] = await Promise.all([
    readJson<ScienceSummary>('/api/science/summary', signal),
    readJson<ScienceStatus>('/api/science/status', signal),
    readJson<{ departments?: ScienceDepartment[] }>('/api/science/departments', signal),
    readJson<{ gaps?: ScienceGap[] }>('/api/science/gaps', signal),
    readJson<{ datasets?: ScienceDataset[] }>('/api/science/datasets', signal),
    readJson<{ missions?: ScienceMission[] }>('/api/science/missions', signal),
    readJson<{ harvesters?: ScienceHarvester[] }>('/api/science/harvesters', signal),
    readJson<{ candidates?: DossierCandidate[] }>('/api/science/dossiers', signal),
  ]);

  return {
    fetchedAt: new Date().toISOString(),
    summary,
    status,
    departments: departments.departments ?? [],
    gaps: gaps.gaps ?? [],
    datasets: datasets.datasets ?? [],
    missions: missions.missions ?? [],
    harvesters: harvesters.harvesters ?? [],
    dossiers: dossiers.candidates ?? [],
  };
}
