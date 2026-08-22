import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';
import type { AtlasFeature, AtlasLayer } from '@/lib/atlas';

export const AI_DATA_SCIENCE_MODULE_ID = 'OC-AI-DS-STAT-EDA-001';

export type AiDataScienceModule = {
  program_id: string;
  module_id: string;
  module_version: string;
  title: string;
  status: string;
  summary: string;
  progression: string[];
  learning_objectives: string[];
  prerequisites: string[];
  scientific_cautions: string[];
  dataset_contract: {
    maximum_rows: number;
    exact_coordinates_in_educational_view: false;
    exact_locality_in_educational_view: false;
    generalized_geography: string[];
    missing_numeric_value: null;
    measured_zero_preserved: true;
    private_snapshot_required_for_execution: true;
  };
  analysis_contract: {
    method: string;
    method_version: string;
    arbitrary_code_execution: false;
    deterministic_replay_required: true;
    scientific_interpretation_generated_by_engine: false;
  };
  calyx_tutor_contract: {
    modes: string[];
    generated_explanation_is_evidence: false;
  };
  research_station_contract: {
    handoff: 'by_reference';
    scientific_publication_authorized: false;
    candidate_knowledge_promotion_authorized: false;
    knowledge_graph_mutation_authorized: false;
    taxonomy_mutation_authorized: false;
  };
};

export type EducationalOccurrenceRow = {
  occurrence_id: string;
  scientific_name?: string;
  taxon_id?: string;
  country_code?: string;
  state_province?: string;
  year?: number | null;
  month?: number | null;
  elevation_m?: number | null;
  source: string;
  license?: string;
  basis_of_record?: string;
};

export type DataQuality = {
  row_count: number;
  elevation: {
    complete: number;
    missing: number;
    missing_fraction: number;
    measured_zero_count: number;
    zero_is_not_used_for_missing: true;
  };
  year: {
    complete: number;
    missing: number;
    minimum: number | null;
    maximum: number | null;
  };
  records_by_country: Record<string, number>;
  records_by_source: Record<string, number>;
  warnings: string[];
  diagnostics_are_descriptive_not_biological_conclusions: true;
  sampling_effort_not_controlled: true;
};

export type LabManifest = {
  program_id: string;
  module_id: string;
  module_version: string;
  lab_manifest_id: string;
  manifest_sha256: string;
  project_id: string;
  question: string;
  rationale: string;
  dataset: {
    dataset_id: string;
    dataset_view_id: string;
    rows_sha256: string;
    row_count: number;
    columns: string[];
    quality: DataQuality;
    exact_coordinates_disclosed: false;
    exact_locality_disclosed: false;
    missing_numeric_values_are_null: true;
  };
  analysis_plan: {
    plan_id: string;
    method: string;
    method_version: string;
    parameters: { columns?: string[]; [key: string]: unknown };
    assumptions: string[];
    transformations: unknown[];
    row_filters: unknown[];
    scientific_publication_authorized: false;
    knowledge_graph_mutation_authorized: false;
  };
  execution: {
    method: string;
    method_version: string;
    arbitrary_code_execution: false;
    deterministic_replay_required: true;
  };
  review_state: string;
  generated_explanation_is_evidence: false;
  scientific_publication_authorized: false;
  candidate_knowledge_promotion_authorized: false;
  knowledge_graph_mutation_authorized: false;
  taxonomy_mutation_authorized: false;
};

export type PreparedLab = {
  created: boolean;
  module: AiDataScienceModule;
  dataset_view: {
    dataset_view_id: string;
    rows_sha256: string;
    row_count: number;
    rows: Array<Record<string, unknown>>;
    quality: DataQuality;
    exact_coordinates_in_view: false;
    exact_locality_in_view: false;
    missing_numeric_values_are_null: true;
    measured_zero_preserved: true;
  };
  lab_manifest: LabManifest;
};

export type DescriptiveColumn = {
  n: number;
  missing: number;
  mean: number | null;
  median: number | null;
  sample_sd: number | null;
  min: number | null;
  max: number | null;
};

export type ResearchPromotionPacket = {
  promotion_id: string;
  promotion_sha256: string;
  project_id: string;
  handoff: 'by_reference';
  dataset: {
    dataset_id: string;
    rows_sha256: string;
    schema_ref: string | null;
    provenance: Record<string, unknown>;
  };
  lab_manifest: {
    lab_manifest_id: string;
    manifest_sha256: string;
  };
  analysis_plan: {
    plan_id: string;
    method: string;
    method_version: string;
  };
  analysis_result: {
    analysis_id: string;
    input_sha256: string;
    result_sha256: string;
    receipt_sha256: string;
    diagnostic_id: string;
    diagnostics_sha256: string;
  };
  review_state: string;
  human_review_required: true;
  generated_explanation_is_evidence: false;
  scientific_publication_authorized: false;
  candidate_knowledge_promotion_authorized: false;
  knowledge_graph_mutation_authorized: false;
  taxonomy_mutation_authorized: false;
};

export type ExecutedLab = {
  program_id: string;
  module_id: string;
  project_id: string;
  lab_manifest_id: string;
  lab_manifest_sha256: string;
  result_table: { columns: Record<string, DescriptiveColumn> };
  visualization_payload: {
    series?: Record<
      string,
      {
        plot_kind: string;
        complete: number;
        missing: number;
        points: Array<{ row_index: number; value: number }>;
      }
    >;
  };
  quality_diagnostics: DataQuality;
  assumptions: string[];
  warnings: string[];
  provenance: Record<string, unknown>;
  calyx_context: Record<string, unknown> & {
    is_evidence: false;
    generated_explanation_is_evidence: false;
    model_call_performed: false;
  };
  assessment: {
    graded_automatically: false;
    prompts: Array<{ id: string; prompt: string; checks: string[] }>;
  };
  research_promotion_packet: ResearchPromotionPacket;
  replay_proof: {
    verified: true;
    analysis_id: string;
    input_sha256: string;
    result_sha256: string;
    receipt_sha256: string;
    first_execution_created_analysis: boolean;
    second_execution_reused_analysis: boolean;
  };
  scientific_interpretation_generated: false;
  scientific_publication_authorized: false;
  candidate_knowledge_promotion_authorized: false;
  knowledge_graph_mutation_authorized: false;
  taxonomy_mutation_authorized: false;
};

type BackendErrorDetail = { code?: string; message?: string; resource?: string };

export class AiDataScienceApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly detail: BackendErrorDetail | null,
  ) {
    super(detail?.message ?? detail?.code ?? `AI/Data Science request failed (${status})`);
    this.name = 'AiDataScienceApiError';
  }
}

async function requestJson<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; accessToken?: string } = {},
): Promise<T> {
  const response = await fetch(`${CALYX_BACKEND_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    let detail: BackendErrorDetail | null = null;
    try {
      const payload = (await response.json()) as { detail?: BackendErrorDetail | string };
      if (typeof payload.detail === 'string') detail = { message: payload.detail };
      else detail = payload.detail ?? null;
    } catch {
      detail = null;
    }
    throw new AiDataScienceApiError(response.status, path, detail);
  }
  return response.json() as Promise<T>;
}

export const appliedAiDataScienceApi = {
  module: () =>
    requestJson<AiDataScienceModule>(
      `/api/learning/ai-data-science/modules/${encodeURIComponent(AI_DATA_SCIENCE_MODULE_ID)}`,
    ),
  prepare: (
    input: {
      rows: EducationalOccurrenceRow[];
      provenance: Record<string, unknown>;
      selection?: Record<string, unknown>;
      question?: string;
      rationale?: string;
      recorded_at: string;
      project_id?: string;
    },
    accessToken: string,
  ) =>
    requestJson<PreparedLab>(
      `/api/learning/ai-data-science/modules/${encodeURIComponent(AI_DATA_SCIENCE_MODULE_ID)}/prepare`,
      { method: 'POST', body: input, accessToken },
    ),
  manifest: (projectId: string, manifestId: string, accessToken: string) =>
    requestJson<LabManifest>(
      `/api/learning/ai-data-science/projects/${encodeURIComponent(projectId)}/manifests/${encodeURIComponent(manifestId)}`,
      { accessToken },
    ),
  execute: (
    projectId: string,
    manifestId: string,
    recordedAt: string,
    accessToken: string,
  ) =>
    requestJson<ExecutedLab>(
      `/api/learning/ai-data-science/projects/${encodeURIComponent(projectId)}/manifests/${encodeURIComponent(manifestId)}/execute`,
      {
        method: 'POST',
        body: { recorded_at: recordedAt },
        accessToken,
      },
    ),
};

function property(
  properties: Record<string, unknown> | undefined,
  ...names: string[]
): unknown {
  if (!properties) return undefined;
  const normalized = new Map(
    Object.entries(properties).map(([key, value]) => [key.toLowerCase(), value]),
  );
  for (const name of names) {
    if (normalized.has(name.toLowerCase())) return normalized.get(name.toLowerCase());
  }
  return undefined;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return value === null ? null : undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/**
 * Project a public/masked Atlas feature into the educational tabular contract.
 *
 * Coordinates are intentionally never copied. Even if the Atlas renderer has a
 * masked/generalized `lat`/`lng` for drawing, the statistics lab receives only
 * taxon identity, generalized geography, time, elevation and source metadata.
 */
export function atlasFeatureToEducationalRow(
  feature: AtlasFeature,
): EducationalOccurrenceRow {
  const properties = feature.properties ?? {};
  return {
    occurrence_id: feature.id,
    scientific_name: optionalText(
      property(properties, 'scientific_name', 'scientificName', 'species', 'name'),
    ),
    taxon_id: optionalText(
      property(properties, 'taxon_id', 'taxonId', 'taxonomy_id', 'taxonomyId'),
    ),
    country_code: optionalText(property(properties, 'country_code', 'countryCode', 'country')),
    state_province: optionalText(
      property(properties, 'state_province', 'stateProvince', 'state', 'province', 'region'),
    ),
    year: optionalNumber(property(properties, 'year', 'event_year', 'eventYear')) ?? null,
    month: optionalNumber(property(properties, 'month', 'event_month', 'eventMonth')) ?? null,
    elevation_m:
      optionalNumber(
        property(
          properties,
          'elevation_m',
          'elevation',
          'elevation_in_meters',
          'elevationInMeters',
          'minimum_elevation_in_meters',
        ),
      ) ?? null,
    source:
      optionalText(property(properties, 'source', 'provider', 'dataset', 'source_name')) ??
      'Orchid Continuum Atlas',
    license: optionalText(property(properties, 'license', 'rights')),
    basis_of_record: optionalText(
      property(properties, 'basis_of_record', 'basisOfRecord'),
    ),
  };
}

export function atlasLayerToEducationalRows(
  layer: AtlasLayer,
  limit = 1000,
): EducationalOccurrenceRow[] {
  return layer.features
    .slice(0, Math.max(0, limit))
    .map(atlasFeatureToEducationalRow)
    .filter((row) => Boolean(row.scientific_name));
}

export function researchStationHref(packet: ResearchPromotionPacket): string {
  const params = new URLSearchParams({
    source: 'university-ai-data-science',
    project_id: packet.project_id,
    promotion_id: packet.promotion_id,
    dataset_id: packet.dataset.dataset_id,
    manifest_id: packet.lab_manifest.lab_manifest_id,
    analysis_id: packet.analysis_result.analysis_id,
  });
  return `/research?${params.toString()}`;
}
