// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import type { AtlasFeature, AtlasLayer } from '@/lib/atlas';
import {
  AI_DATA_SCIENCE_MODULE_ID,
  atlasFeatureToEducationalRow,
  atlasLayerToEducationalRows,
  clearAiDataScienceProgress,
  loadAiDataScienceProgress,
  researchStationHref,
  saveAiDataScienceProgress,
  type ExecutedLab,
  type ResearchPromotionPacket,
} from '@/lib/appliedAiDataScience';

describe('OC-AI-DS-001 locality-safe Atlas projection', () => {
  it('never forwards Atlas coordinates or locality strings and preserves measured zero', () => {
    const feature: AtlasFeature = {
      id: 'occ-1',
      kind: 'occurrence',
      lat: 35.12345,
      lng: -120.98765,
      properties: {
        scientific_name: 'Cypripedium acaule',
        taxon_id: 'taxon-1',
        country_code: 'US',
        state_province: 'Maine',
        year: 2024,
        month: 6,
        elevation_m: 0,
        source: 'GBIF',
        license: 'CC BY 4.0',
        basis_of_record: 'HUMAN_OBSERVATION',
        locality: 'restricted bog',
        decimal_latitude: 35.12345,
        decimal_longitude: -120.98765,
        geometry: { type: 'Point', coordinates: [-120.98765, 35.12345] },
      },
    };

    const row = atlasFeatureToEducationalRow(feature);
    expect(row.elevation_m).toBe(0);
    expect(row.country_code).toBe('US');
    expect(row.state_province).toBe('Maine');
    expect(row).not.toHaveProperty('lat');
    expect(row).not.toHaveProperty('lng');
    expect(row).not.toHaveProperty('latitude');
    expect(row).not.toHaveProperty('longitude');
    expect(row).not.toHaveProperty('decimal_latitude');
    expect(row).not.toHaveProperty('decimal_longitude');
    expect(row).not.toHaveProperty('geometry');
    expect(row).not.toHaveProperty('locality');
  });

  it('preserves null elevation as missing rather than converting it to zero', () => {
    const layer: AtlasLayer = {
      kind: 'occurrence',
      features: [
        {
          id: 'missing-elevation',
          kind: 'occurrence',
          lat: 1,
          lng: 2,
          properties: {
            scientific_name: 'Platanthera blephariglottis',
            elevation_m: null,
            source: 'iNaturalist',
          },
        },
      ],
    };

    const [row] = atlasLayerToEducationalRows(layer);
    expect(row.elevation_m).toBeNull();
  });
});

describe('OC-AI-DS-001 Research Station handoff', () => {
  it('preserves project, dataset, manifest, promotion and analysis identities in the handoff URL', () => {
    const packet = {
      promotion_id: 'promotion-1',
      promotion_sha256: 'a'.repeat(64),
      project_id: 'project-1',
      handoff: 'by_reference',
      dataset: {
        dataset_id: 'dataset-1',
        rows_sha256: 'b'.repeat(64),
        schema_ref: 'view/v1',
        provenance: {},
      },
      lab_manifest: {
        lab_manifest_id: 'manifest-1',
        manifest_sha256: 'c'.repeat(64),
      },
      analysis_plan: {
        plan_id: 'plan-1',
        method: 'describe.v1',
        method_version: '1',
      },
      analysis_result: {
        analysis_id: 'analysis-1',
        input_sha256: 'd'.repeat(64),
        result_sha256: 'e'.repeat(64),
        receipt_sha256: 'f'.repeat(64),
        diagnostic_id: 'diagnostic-1',
        diagnostics_sha256: '1'.repeat(64),
      },
      review_state: 'unreviewed_educational_analysis',
      human_review_required: true,
      generated_explanation_is_evidence: false,
      scientific_publication_authorized: false,
      candidate_knowledge_promotion_authorized: false,
      knowledge_graph_mutation_authorized: false,
      taxonomy_mutation_authorized: false,
    } satisfies ResearchPromotionPacket;

    const href = researchStationHref(packet);
    const url = new URL(href, 'https://orchid.example');
    expect(url.pathname).toBe('/research');
    expect(url.searchParams.get('project_id')).toBe('project-1');
    expect(url.searchParams.get('promotion_id')).toBe('promotion-1');
    expect(url.searchParams.get('dataset_id')).toBe('dataset-1');
    expect(url.searchParams.get('manifest_id')).toBe('manifest-1');
    expect(url.searchParams.get('analysis_id')).toBe('analysis-1');
  });
});

function buildExecutedLabFixture(): ExecutedLab {
  const promotionPacket = {
    promotion_id: 'promotion-1',
    promotion_sha256: 'a'.repeat(64),
    project_id: 'project-1',
    handoff: 'by_reference',
    dataset: { dataset_id: 'dataset-1', rows_sha256: 'b'.repeat(64), schema_ref: null, provenance: {} },
    lab_manifest: { lab_manifest_id: 'manifest-1', manifest_sha256: 'c'.repeat(64) },
    analysis_plan: { plan_id: 'plan-1', method: 'describe.v1', method_version: '1' },
    analysis_result: {
      analysis_id: 'analysis-1',
      input_sha256: 'd'.repeat(64),
      result_sha256: 'e'.repeat(64),
      receipt_sha256: 'f'.repeat(64),
      diagnostic_id: 'diagnostic-1',
      diagnostics_sha256: '1'.repeat(64),
    },
    review_state: 'unreviewed_educational_analysis',
    human_review_required: true,
    generated_explanation_is_evidence: false,
    scientific_publication_authorized: false,
    candidate_knowledge_promotion_authorized: false,
    knowledge_graph_mutation_authorized: false,
    taxonomy_mutation_authorized: false,
  } satisfies ResearchPromotionPacket;

  return {
    program_id: 'program-1',
    module_id: AI_DATA_SCIENCE_MODULE_ID,
    project_id: 'project-1',
    lab_manifest_id: 'manifest-1',
    lab_manifest_sha256: 'c'.repeat(64),
    result_table: { columns: {} },
    visualization_payload: {},
    quality_diagnostics: {
      row_count: 0,
      elevation: {
        complete: 0,
        missing: 0,
        missing_fraction: 0,
        measured_zero_count: 0,
        zero_is_not_used_for_missing: true,
      },
      year: { complete: 0, missing: 0, minimum: null, maximum: null },
      records_by_country: {},
      records_by_source: {},
      warnings: [],
      diagnostics_are_descriptive_not_biological_conclusions: true,
      sampling_effort_not_controlled: true,
    },
    assumptions: [],
    warnings: [],
    provenance: {},
    calyx_context: {
      is_evidence: false,
      generated_explanation_is_evidence: false,
      model_call_performed: false,
    },
    assessment: {
      graded_automatically: false,
      prompts: [{ id: 'prompt-1', prompt: 'What does the missingness suggest?', checks: [] }],
    },
    research_promotion_packet: promotionPacket,
    replay_proof: {
      verified: true,
      analysis_id: 'analysis-1',
      input_sha256: 'd'.repeat(64),
      result_sha256: 'e'.repeat(64),
      receipt_sha256: 'f'.repeat(64),
      first_execution_created_analysis: true,
      second_execution_reused_analysis: false,
    },
    scientific_interpretation_generated: false,
    scientific_publication_authorized: false,
    candidate_knowledge_promotion_authorized: false,
    knowledge_graph_mutation_authorized: false,
    taxonomy_mutation_authorized: false,
  };
}

describe('OC-AI-DS Applied AI & Data Science Lab assessment continuity', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('persists in-progress assessment state and resumes it as if reloaded', () => {
    const executed = buildExecutedLabFixture();
    saveAiDataScienceProgress(
      {
        prepared: null,
        executed,
        assessment_responses: { 'prompt-1': 'Missing elevations cluster in one country.' },
        calyx_answer: { depth: 'beginner', answer: 'A plain-language explanation.' },
      },
      '2026-08-20T00:00:00Z',
    );

    // Simulate a full reload by reading back through the load path only.
    const restored = loadAiDataScienceProgress();
    expect(restored).not.toBeNull();
    expect(restored?.executed?.project_id).toBe('project-1');
    expect(restored?.assessment_responses['prompt-1']).toBe(
      'Missing elevations cluster in one country.',
    );
    expect(restored?.calyx_answer?.answer).toBe('A plain-language explanation.');
  });

  it('fails closed to a fresh session instead of crashing on corrupt persisted state', () => {
    window.localStorage.setItem('oc_ai_ds_lab_progress_v1', '{not valid json');
    expect(() => loadAiDataScienceProgress()).not.toThrow();
    expect(loadAiDataScienceProgress()).toBeNull();
    // The corrupt entry should be cleared rather than repeatedly failing to parse.
    expect(window.localStorage.getItem('oc_ai_ds_lab_progress_v1')).toBeNull();
  });

  it('fails closed on a structurally invalid persisted payload', () => {
    window.localStorage.setItem(
      'oc_ai_ds_lab_progress_v1',
      JSON.stringify({ version: 1, module_id: AI_DATA_SCIENCE_MODULE_ID, executed: { not: 'an executed lab' } }),
    );
    expect(loadAiDataScienceProgress()).toBeNull();
  });

  it('fails closed when the persisted module id does not match the current module', () => {
    const executed = buildExecutedLabFixture();
    saveAiDataScienceProgress(
      { prepared: null, executed, assessment_responses: {}, calyx_answer: null },
      '2026-08-20T00:00:00Z',
    );
    const raw = JSON.parse(window.localStorage.getItem('oc_ai_ds_lab_progress_v1')!);
    raw.module_id = 'some-other-module';
    window.localStorage.setItem('oc_ai_ds_lab_progress_v1', JSON.stringify(raw));

    expect(loadAiDataScienceProgress()).toBeNull();
  });

  it('clears persisted progress without throwing when storage is already empty', () => {
    expect(() => clearAiDataScienceProgress()).not.toThrow();
    expect(loadAiDataScienceProgress()).toBeNull();
  });
});
