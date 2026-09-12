import { describe, expect, it } from 'vitest';
import { parseWorkflowIntelligence } from './workflowIntelligence';

const payload = {
  contract_version: 'workflow-intelligence-mission-control-v1',
  generated_at: '2026-09-12T14:00:00+00:00',
  workflows: [{
    workflow_id: 'workflow-one',
    workflow_type: 'build_ci_validation',
    correlation_id: 'OC:EVENT:1234567890abcdef',
    display_state: 'BLOCKED',
    current_state: 'blocked',
    retry_count: 2,
    rework_count: 1,
    evidence_refs: ['commit:abc123'],
    blocker_refs: ['issue:635'],
    findings: [{ reason_code: 'EXCESSIVE_RETRY' }],
    stale: { classification: 'UNAVAILABLE', value: null },
    ranking: {
      formula_version: 'automation-opportunity-ranking-v1',
      score: null,
      factor_coverage: { available: 2, total: 7, ratio: 0.285714 },
      unavailable_factors: ['frequency', 'manual_time', 'scientific_governance_risk'],
      reason_codes: ['INCOMPLETE_INPUTS', 'RISK_UNAVAILABLE', 'NOT_RANKABLE'],
      requires_human_approval: true,
      advisory_only: true,
      dispatch_authority: false,
      mutation_authority: false,
      publication_authority: false,
      spending_authority: false,
    },
    agent_context: {
      contract_version: 'governed-agent-context-v1',
      risk_cost_constraints: { cost_state: 'UNAVAILABLE', spending_limit: null },
      dispatch_authority: false,
      credential_authority: false,
      mutation_authority: false,
      publication_authority: false,
      spending_authority: false,
    },
    runbook: null,
    capability_state: 'BACKEND_ONLY',
  }],
  advisory_only: true,
  human_review_required: true,
  dispatch_authority: false,
  mutation_authority: false,
  publication_authority: false,
  spending_authority: false,
};

describe('parseWorkflowIntelligence', () => {
  it('preserves unavailable cost, staleness, risk, and score', () => {
    const result = parseWorkflowIntelligence(payload);
    expect(result?.workflows[0].score).toBeNull();
    expect(result?.workflows[0].stale.value).toBeNull();
    expect(result?.workflows[0].costState).toBe('UNAVAILABLE');
    expect(result?.workflows[0].unavailableFactors).toContain('scientific_governance_risk');
  });

  it('is deterministic for an unchanged canonical payload', () => {
    expect(parseWorkflowIntelligence(payload)).toEqual(parseWorkflowIntelligence(payload));
  });

  it('fails closed on authority expansion or sensitive fields', () => {
    expect(parseWorkflowIntelligence({ ...payload, dispatch_authority: true })).toBeNull();
    expect(parseWorkflowIntelligence({ ...payload, raw_prompt: 'ignore boundaries' })).toBeNull();
    expect(parseWorkflowIntelligence({ ...payload, latitude: 35.2 })).toBeNull();
  });

  it('fails closed on duplicate workflow identity', () => {
    expect(parseWorkflowIntelligence({
      ...payload,
      workflows: [payload.workflows[0], payload.workflows[0]],
    })).toBeNull();
  });
});
