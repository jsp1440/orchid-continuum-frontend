import { describe, expect, it } from 'vitest';
import { parseScientificReadiness } from './missionControlOps';

const payload = {
  contract_version: 'sci-obs-readiness-v1',
  generated_at: '2026-09-12T03:00:00Z',
  overall_state: 'conditional',
  dimensions: {
    engineering_health: {
      key: 'engineering_health',
      state: 'unavailable',
      numerator: null,
      denominator: null,
      score: null,
      missing_requirements: ['canonical engineering measurement unavailable'],
      upstream_blockers: [],
      limitation: 'No canonical measurement was supplied.',
      calculation_version: 'sci-obs-readiness-v1',
      measured_at: '2026-09-12T03:00:00Z',
    },
  },
  component_coverage: {
    taxonomy: { state: 'unavailable', present: null },
  },
  human_approval_required: true,
  publication_authority: false,
};

describe('parseScientificReadiness', () => {
  it('preserves unavailable rather than converting it to zero', () => {
    const result = parseScientificReadiness(payload);
    expect(result?.dimensions.engineering_health.score).toBeNull();
    expect(result?.dimensions.engineering_health.numerator).toBeNull();
    expect(result?.componentCoverage.taxonomy.present).toBeNull();
    expect(result?.publicationAuthority).toBe(false);
  });

  it('fails closed when scientific authority expands', () => {
    expect(parseScientificReadiness({ ...payload, publication_authority: true })).toBeNull();
    expect(parseScientificReadiness({ ...payload, human_approval_required: false })).toBeNull();
  });

  it('fails closed for an unsupported contract', () => {
    expect(parseScientificReadiness({ ...payload, contract_version: 'invented-v2' })).toBeNull();
  });
});
