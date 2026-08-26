// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ScientificSynthesis from '@/components/calyx/ScientificSynthesis';
import type { BrainMission } from '@/lib/calyxWorkspace';

/**
 * Regression coverage for the Calyx Scientific Synthesis slice.
 *
 * The mission contract already carried conclusions, claim IDs, confidence and
 * the partial flag; none of it was rendered. These tests prove the synthesis is
 * shown, is shown only from what the mission supplied, and never displaces or
 * absorbs the evidence sections around it.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mission(overrides: Partial<BrainMission> = {}): BrainMission {
  return {
    mission_id: 'mission-1',
    project_id: 'proj-1',
    question: 'Why do epiphytic orchids benefit from velamen?',
    state: 'COMPLETED',
    current_stage: 'SYNTHESIS',
    steps_executed: 4,
    sources: [],
    supporting_evidence: [],
    contradicting_evidence: [],
    missing_evidence: [],
    confidence: null,
    conclusions: [],
    reasoning_ledger: null,
    validation: { valid: true, blockers: [] },
    review_status: 'HUMAN_REVIEW_REQUIRED',
    publication_eligibility: { eligible: false, automatic_publication: false, blockers: [] },
    blockers: [],
    partial: false,
    created_at: '2026-08-20T00:00:00Z',
    updated_at: '2026-08-20T00:00:00Z',
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

function render(value: BrainMission) {
  act(() => {
    root.render(<ScientificSynthesis mission={value} />);
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('conclusions render from mission.conclusions', () => {
  it('renders every conclusion the mission returned, verbatim', () => {
    render(
      mission({
        conclusions: [
          { text: 'Velamen buffers intermittent water availability.', type: 'inference' },
          { text: 'Thickness alone does not predict drought tolerance.' },
        ],
      }),
    );
    const rendered = container.querySelectorAll('[data-testid="conclusion"]');
    expect(rendered).toHaveLength(2);
    expect(container.textContent).toContain('Velamen buffers intermittent water availability.');
    expect(container.textContent).toContain('Thickness alone does not predict drought tolerance.');
  });

  it('renders the conclusion type only when the mission supplied one', () => {
    render(mission({ conclusions: [{ text: 'A conclusion.', type: 'inference' }] }));
    expect(container.textContent).toContain('inference');

    render(mission({ conclusions: [{ text: 'A conclusion.' }] }));
    expect(container.textContent).not.toContain('inference');
  });

  it('does not compose a conclusion the mission did not return', () => {
    render(
      mission({
        conclusions: [],
        supporting_evidence: [{ subject: 'velamen', predicate: 'absorbs', value: 'water' }],
        missing_evidence: ['direct conductance measurements'],
      }),
    );
    // Neither the evidence nor the gap may be promoted into the conclusion slot.
    expect(container.querySelectorAll('[data-testid="conclusion"]')).toHaveLength(0);
    expect(container.querySelector('[data-testid="no-conclusions"]')).not.toBeNull();
  });
});

describe('claim IDs render only when supplied', () => {
  it('lists claim IDs when the conclusion carries them', () => {
    render(
      mission({ conclusions: [{ text: 'A conclusion.', claim_ids: [17, 'claim-42'] }] }),
    );
    const claims = container.querySelector('[data-testid="claim-ids"]');
    expect(claims?.textContent).toContain('17');
    expect(claims?.textContent).toContain('claim-42');
  });

  it('renders no claim line when claim_ids is absent or empty', () => {
    render(mission({ conclusions: [{ text: 'A conclusion.' }] }));
    expect(container.querySelector('[data-testid="claim-ids"]')).toBeNull();

    render(mission({ conclusions: [{ text: 'A conclusion.', claim_ids: [] }] }));
    expect(container.querySelector('[data-testid="claim-ids"]')).toBeNull();
  });

  it('never invents a claim identifier for an unlinked conclusion', () => {
    render(mission({ conclusions: [{ text: 'Unlinked conclusion.' }] }));
    expect(container.textContent).not.toContain('Claims:');
  });
});

describe('confidence renders correctly and handles null', () => {
  it('reports the confidence the mission supplied', () => {
    render(mission({ confidence: 0.62 }));
    expect(container.querySelector('[data-testid="mission-confidence"]')?.textContent).toContain(
      '0.62',
    );
  });

  it('states plainly when no confidence was supplied', () => {
    render(mission({ confidence: null }));
    const text = container.querySelector('[data-testid="mission-confidence"]')?.textContent ?? '';
    expect(text).toContain('not supplied');
    // A missing confidence must never be shown as zero.
    expect(text).not.toContain('0.00');
  });

  it('treats a zero confidence as a real reported value, not as absent', () => {
    render(mission({ confidence: 0 }));
    const text = container.querySelector('[data-testid="mission-confidence"]')?.textContent ?? '';
    expect(text).toContain('0.00');
    expect(text).not.toContain('not supplied');
  });

  it('never infers a confidence from a non-numeric value', () => {
    for (const unusable of [Number.NaN, Number.POSITIVE_INFINITY, undefined, 'high']) {
      render(mission({ confidence: unusable as unknown as number }));
      const text = container.querySelector('[data-testid="mission-confidence"]')?.textContent ?? '';
      expect(text, `confidence ${String(unusable)} must not be rendered as a value`).toContain(
        'not supplied',
      );
      expect(text).not.toMatch(/\d\.\d\d/);
    }
  });

  it('formats a supplied confidence to two decimals without rescaling it', () => {
    render(mission({ confidence: 0.5 }));
    const text = container.querySelector('[data-testid="mission-confidence"]')?.textContent ?? '';
    expect(text).toContain('0.50');
    // Never converted to a percentage or otherwise reinterpreted.
    expect(text).not.toContain('50%');
  });
});

describe('partial warning appears only for partial missions', () => {
  it('warns when the mission reported a partial result', () => {
    render(mission({ partial: true }));
    const warning = container.querySelector('[data-testid="partial-warning"]');
    expect(warning).not.toBeNull();
    expect(warning?.textContent).toContain('partial result');
  });

  it('does not warn for a complete mission', () => {
    render(mission({ partial: false }));
    expect(container.querySelector('[data-testid="partial-warning"]')).toBeNull();
  });

  it('does not warn on a truthy value that is not the boolean true', () => {
    // A loose `Boolean(mission.partial)` check would pass an `undefined` case
    // too, so it proves nothing. These values are truthy but are NOT a reported
    // partial result, and only a strict `=== true` rejects them.
    for (const notPartial of ['false', 1, {}]) {
      render(mission({ partial: notPartial as unknown as boolean }));
      expect(container.querySelector('[data-testid="partial-warning"]')).toBeNull();
    }
  });

  it('does not warn when the flag is absent', () => {
    render(mission({ partial: undefined as unknown as boolean }));
    expect(container.querySelector('[data-testid="partial-warning"]')).toBeNull();
  });

  it('still shows the partial warning alongside real conclusions', () => {
    render(mission({ partial: true, conclusions: [{ text: 'A provisional conclusion.' }] }));
    expect(container.querySelector('[data-testid="partial-warning"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="conclusion"]')).toHaveLength(1);
  });
});

describe('the no-conclusion state is honest', () => {
  it('says the mission produced no conclusion and refuses to substitute one', () => {
    render(mission({ conclusions: [], missing_evidence: ['a missing study'] }));
    const empty = container.querySelector('[data-testid="no-conclusions"]');
    expect(empty?.textContent).toContain('did not produce a conclusion');
    expect(empty?.textContent).toContain('An evidence gap is not a');
  });
});

describe('synthesis is not conflated with evidence', () => {
  it('labels the section as interpretation rather than evidence', () => {
    render(mission({ conclusions: [{ text: 'A conclusion.' }] }));
    expect(container.textContent).toContain('Scientific synthesis');
    expect(container.textContent).toContain('not evidence itself');
  });

  it('renders no evidence records of its own', () => {
    render(
      mission({
        conclusions: [{ text: 'A conclusion.' }],
        supporting_evidence: [{ subject: 'velamen', predicate: 'absorbs', value: 'water rapidly' }],
        contradicting_evidence: [{ subject: 'thickness', predicate: 'does not predict', value: 'tolerance' }],
        sources: [{ title: 'A canonical source' }],
      }),
    );
    // Evidence and provenance belong to their own sections, not to synthesis.
    expect(container.textContent).not.toContain('water rapidly');
    expect(container.textContent).not.toContain('does not predict');
    expect(container.textContent).not.toContain('A canonical source');
  });
});

describe('MissionResult keeps every section separate', () => {
  const workspace = readFileSync(
    resolve(process.cwd(), 'src/pages/CalyxWorkspace.tsx'),
    'utf8',
  );
  const missionResult = workspace.slice(
    workspace.indexOf('function MissionResult'),
    workspace.indexOf('function CitationList'),
  );

  it('mounts the synthesis into the live MissionResult path', () => {
    expect(missionResult).toContain('<ScientificSynthesis mission={mission} />');
    expect(workspace).toContain('import ScientificSynthesis from "@/components/calyx/ScientificSynthesis"');
  });

  it('keeps supporting and contradicting evidence in separate lists', () => {
    expect(missionResult).toContain('title="Supporting evidence" items={mission.supporting_evidence}');
    expect(missionResult).toContain('title="Contradicting evidence" items={mission.contradicting_evidence}');
  });

  it('keeps retrieved canonical sources and provenance separately visible', () => {
    expect(missionResult).toContain('<SourceList items={mission.sources} />');
  });

  it('keeps evidence gaps and governance as their own sections', () => {
    expect(missionResult).toContain('Evidence gaps');
    expect(missionResult).toContain('mission.missing_evidence');
    expect(missionResult).toContain('Governance');
    expect(missionResult).toContain('mission.review_status');
  });

  it('places the synthesis ahead of the evidence it interprets', () => {
    expect(missionResult.indexOf('<ScientificSynthesis')).toBeLessThan(
      missionResult.indexOf('<SourceList'),
    );
  });
});
