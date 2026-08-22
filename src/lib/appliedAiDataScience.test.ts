import { describe, expect, it } from 'vitest';

import type { AtlasFeature, AtlasLayer } from '@/lib/atlas';
import {
  atlasFeatureToEducationalRow,
  atlasLayerToEducationalRows,
  researchStationHref,
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
