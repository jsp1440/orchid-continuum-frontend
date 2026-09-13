// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WorkflowIntelligence } from '@/lib/workflowIntelligence';
import WorkflowIntelligencePanel from './WorkflowIntelligencePanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('WorkflowIntelligencePanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders unavailable values and review boundaries honestly', () => {
    const intelligence: WorkflowIntelligence = {
      contractVersion: 'workflow-intelligence-mission-control-v1',
      generatedAt: null,
      advisoryOnly: true,
      humanReviewRequired: true,
      workflows: [{
        workflowId: 'workflow-one',
        workflowType: 'build_ci_validation',
        correlationId: 'OC:EVENT:1234567890abcdef',
        displayState: 'BLOCKED',
        currentState: 'blocked',
        retryCount: 2,
        reworkCount: 1,
        evidenceRefs: ['commit:abc123'],
        blockerRefs: ['issue:635'],
        findingCodes: ['EXCESSIVE_RETRY'],
        stale: { classification: 'UNAVAILABLE', value: null },
        score: null,
        factorCoverage: { available: 2, total: 7, ratio: 0.285714 },
        unavailableFactors: ['scientific_governance_risk'],
        reasonCodes: ['RISK_UNAVAILABLE'],
        requiresHumanApproval: true,
        costState: 'UNAVAILABLE',
        capabilityState: 'BACKEND_ONLY',
        hasReviewableRunbook: false,
      }],
    };

    act(() => root.render(<WorkflowIntelligencePanel intelligence={intelligence} />));

    expect(container.textContent).toContain('Unavailable');
    expect(container.textContent).toContain('BLOCKED');
    expect(container.textContent).toContain('human review required');
    expect(container.textContent).toContain('cannot dispatch agents');
  });

  it('does not invent workflows when the canonical feed is empty', () => {
    act(() => root.render(<WorkflowIntelligencePanel intelligence={{
      contractVersion: 'workflow-intelligence-mission-control-v1',
      generatedAt: null,
      workflows: [],
      advisoryOnly: true,
      humanReviewRequired: true,
    }} />));
    expect(container.textContent).toContain('No workflow was invented');
  });
});
