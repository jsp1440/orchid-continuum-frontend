// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ScientificReadiness } from '@/lib/missionControlOps';
import ScientificReadinessPanel from './ScientificReadinessPanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ScientificReadinessPanel', () => {
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

  it('renders unavailable honestly and preserves the authority boundary', () => {
    const readiness: ScientificReadiness = {
      contractVersion: 'sci-obs-readiness-v1',
      generatedAt: '2026-09-12T03:00:00Z',
      overallState: 'conditional',
      dimensions: {
        data_readiness: {
          key: 'data_readiness',
          state: 'unavailable',
          numerator: null,
          denominator: null,
          score: null,
          missingRequirements: ['canonical data measurement unavailable'],
          upstreamBlockers: [],
          limitation: null,
          calculationVersion: 'sci-obs-readiness-v1',
          measuredAt: '2026-09-12T03:00:00Z',
        },
      },
      componentCoverage: {
        taxonomy: { state: 'unavailable', present: null },
      },
      humanApprovalRequired: true,
      publicationAuthority: false,
    };

    act(() => root.render(<ScientificReadinessPanel readiness={readiness} />));

    expect(container.textContent).toContain('Unavailable');
    expect(container.textContent).toContain('Human review required');
    expect(container.textContent).toContain('cannot publish scientific conclusions');
  });

  it('shows a truthful fallback when telemetry is absent', () => {
    act(() => root.render(<ScientificReadinessPanel readiness={null} />));
    expect(container.textContent).toContain('No missing value has been treated as zero');
  });
});
