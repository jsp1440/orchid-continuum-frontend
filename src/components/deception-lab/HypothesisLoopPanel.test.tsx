// @vitest-environment jsdom
/**
 * HypothesisLoopPanel render tests — Release-1 journey 6 (DECEPTION-LAB-001).
 *
 * The generate/evidence calls are injected fakes; no backend is reached and no
 * paid model is involved. What is asserted is the epistemic contract the panel
 * must hold on screen: ≥2 competing hypotheses, three separate evidence
 * columns, non-destructive follow-ups, no locality collection, and an explicit
 * in-development state when the API is absent.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FieldHypothesisApiError,
  KNOWLEDGE_GRAPH_PUBLICATION_BLOCKED,
  type FieldHypothesis,
  type FieldHypothesisSet,
} from '@/lib/fieldHypotheses';
import HypothesisLoopPanel from './HypothesisLoopPanel';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function hypothesis(overrides: Partial<FieldHypothesis> = {}): FieldHypothesis {
  return {
    hypothesis_id: 'h-1', set_id: 's-1', observation_id: 'obs-1', template_id: 'sexual-deception',
    hypothesis_class: 'sexual_deception', ko_0038_strategy: 'sexual deception', epistemic_status: 'HYPOTHESIS',
    statement: 'The male bee is responding to Ophrys sp. as a mating signal.',
    predictions: ['Visitors are predominantly males.'],
    would_support: ['Repeated male-only visits with copulatory posture.'],
    would_contradict: ['Visible nectar that visitors consume.'],
    cue_matches: ['behavior:pseudocopulation_like_contact'], question_family_ids: ['signal-chemistry'],
    status: 'PROPOSED', review_state: 'machine_assisted', human_review: null,
    evidence_balance: { supporting: 0, contradicting: 0, unknown: 0 }, evidence_state: 'no_evidence', evidence: [],
    knowledge_graph_publication: KNOWLEDGE_GRAPH_PUBLICATION_BLOCKED,
    ...overrides,
  };
}

const SET: FieldHypothesisSet = {
  set_id: 's-1', observation_id: 'obs-1', observation_fingerprint: 'f'.repeat(64), created: true,
  generated_at: '2026-06-15T10:31:00Z',
  generation: { mode: 'deterministic_rule_library', library_version: 'field-hypothesis-library/2026.09-v1', contract_version: 'field-hypotheses/v1', provider_called: false, basis: 'KO-0038', cue_tokens: ['visitor:observed'] },
  observation: { observer_id: 'obs-subject', observed_at: '2026-06-15T10:30:00Z', taxon_hint: 'Ophrys sp.', epistemic_certainty: 'POSSIBLE', locality_sensitivity: 'RESEARCH_RESTRICTED', media_count: 0 },
  minimum_competing_hypotheses: 2,
  hypotheses: [
    hypothesis(),
    hypothesis({ hypothesis_id: 'h-2', template_id: 'non-pollinating-visit', hypothesis_class: 'non_pollinating_visit', ko_0038_strategy: 'unknown', statement: 'The visitor is not an effective pollinator.', cue_matches: [] }),
  ],
  follow_up_protocol: [
    { step_id: 'record-column-contact', instruction: 'Film or photograph each visit.', purpose: 'Locate the contact site.', non_destructive: true, while_on_site: true, discriminates: ['sexual_deception', 'non_pollinating_visit'] },
    { step_id: 'revisit-for-fruit-set', instruction: 'Revisit after flowering.', purpose: 'Record fruit set.', non_destructive: true, while_on_site: false, discriminates: ['sexual_deception'] },
  ],
  protocol_constraints: ['Do not collect, capture, mark or handle plants, flowers or visitors; observe and record only.'],
  review_state: 'machine_assisted',
  knowledge_graph_publication: KNOWLEDGE_GRAPH_PUBLICATION_BLOCKED,
};

let container: HTMLDivElement;
let root: Root;

function render(props: Partial<React.ComponentProps<typeof HypothesisLoopPanel>> = {}) {
  act(() => {
    root.render(<HypothesisLoopPanel observerId="obs-subject" observationId="obs-1" {...props} />);
  });
}

const click = (selector: string) => act(() => { (container.querySelector(selector) as HTMLElement).click(); });
const submitForm = async (selector: string) =>
  act(async () => {
    (container.querySelector(selector) as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.removeChild(container);
});

describe('HypothesisLoopPanel', () => {
  it('renders the epistemic notice and the cue form without any coordinate or place field', () => {
    render({ generate: vi.fn(), recordEvidence: vi.fn() });
    const notice = container.querySelector('[data-testid="hypothesis-loop-epistemic-notice"]');
    expect(notice?.getAttribute('role')).toBe('note');
    expect(notice?.textContent).toMatch(/not findings/i);
    expect(notice?.textContent).toMatch(/blocked pending human scientific review/i);
    const form = container.querySelector('[data-testid="observation-cue-form"]') as HTMLFormElement;
    const names = Array.from(form.querySelectorAll('input, select, textarea')).map((el) => (el as HTMLElement).dataset.testid ?? '');
    expect(names).toContain('locality-sensitivity');
    expect(names.some((name) => /lat|lon|coord|place|location|gps/i.test(name))).toBe(false);
    expect(container.querySelector('[data-testid="visitor-cues"]')).toBeNull();
  });

  it('sends only cue vocabulary plus a locality class, and renders at least two competing hypotheses', async () => {
    const generate = vi.fn().mockResolvedValue(SET);
    render({ generate, recordEvidence: vi.fn() });
    click('[data-testid="visitor-observed"]');
    click('[data-testid="behavior-pseudocopulation_like_contact"]');
    click('[data-testid="signal-insect_like_labellum"]');
    await submitForm('[data-testid="observation-cue-form"]');

    expect(generate).toHaveBeenCalledTimes(1);
    const [observationId, snapshot] = generate.mock.calls[0];
    expect(observationId).toBe('obs-1');
    expect(snapshot.observer_id).toBe('obs-subject');
    expect(snapshot.locality_sensitivity).toBe('PRIVATE');
    expect(snapshot.interaction.visitor_observed).toBe(true);
    expect(snapshot.interaction.visitor_behaviors).toEqual(['pseudocopulation_like_contact']);
    expect(snapshot.interaction.floral_signal_cues).toEqual(['insect_like_labellum']);
    expect(Object.keys(snapshot)).not.toEqual(expect.arrayContaining(['latitude', 'longitude', 'location_name']));

    const cards = container.querySelectorAll('[data-testid^="hypothesis-card-"]');
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(cards[0].textContent).toMatch(/hypothesis 1 · hypothesis · sexual deception/i);
    expect(cards[1].textContent).toMatch(/not an effective pollinator/i);
    expect(cards[1].textContent).toMatch(/competing alternative/i);
    const setHeader = container.querySelector('[data-testid="hypothesis-set"]')?.textContent ?? '';
    expect(setHeader).toMatch(/provider called: false/i);
  });

  it('shows supporting, contradicting and unknown as three separate columns and never a verdict', async () => {
    render({ generate: vi.fn().mockResolvedValue(SET), recordEvidence: vi.fn() });
    await submitForm('[data-testid="observation-cue-form"]');
    const balance = container.querySelector('[data-testid="evidence-balance-h-1"]');
    expect(balance?.textContent).toMatch(/supporting/i);
    expect(balance?.textContent).toMatch(/contradicting/i);
    expect(balance?.textContent).toMatch(/unknown/i);
    expect(container.querySelector('[data-testid="evidence-state-h-1"]')?.textContent).toMatch(/not a verdict/i);
    expect(container.textContent).not.toMatch(/\bconfirmed hypothesis\b/i);
    expect(container.querySelector('[data-testid="hypothesis-set-footer"]')?.textContent).toMatch(/blocked pending human scientific review/i);
  });

  it('records evidence against one hypothesis and updates only that card', async () => {
    const updated = hypothesis({ status: 'UNDER_EVALUATION', evidence_balance: { supporting: 1, contradicting: 0, unknown: 0 }, evidence_state: 'supporting_only',
      evidence: [{ evidence_id: 'e-1', hypothesis_id: 'h-1', stance: 'SUPPORTING', evidence_type: 'directly_observed_visit', summary: 'Male bee, copulatory posture.', source_kind: 'field_observation', source_reference: 'obs-1', recorder_subject: 'obs-subject', recorded_at: '2026-06-15T10:40:00Z' }] });
    const recordEvidence = vi.fn().mockResolvedValue(updated);
    render({ generate: vi.fn().mockResolvedValue(SET), recordEvidence });
    await submitForm('[data-testid="observation-cue-form"]');

    click('[data-testid="stance-h-1-SUPPORTING"]');
    const summary = container.querySelector('[data-testid="evidence-summary-h-1"]') as HTMLTextAreaElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(summary, 'Male bee, copulatory posture.');
      summary.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await submitForm('[data-testid="evidence-form-h-1"]');

    expect(recordEvidence).toHaveBeenCalledWith('h-1', expect.objectContaining({
      stance: 'SUPPORTING', summary: 'Male bee, copulatory posture.', recorder_subject: 'obs-subject', source_reference: 'obs-1',
    }));
    expect(container.querySelector('[data-testid="balance-h-1-SUPPORTING"]')?.textContent).toBe('1');
    expect(container.querySelector('[data-testid="balance-h-2-SUPPORTING"]')?.textContent).toBe('0');
    expect(container.querySelector('[data-testid="evidence-list-h-1"]')?.textContent).toMatch(/copulatory posture/);
    expect(container.querySelector('[data-testid="hypothesis-card-h-1"]')?.textContent).toMatch(/under evaluation/i);
  });

  it('renders the follow-up protocol as non-destructive, on-site first, with constraints', async () => {
    render({ generate: vi.fn().mockResolvedValue(SET), recordEvidence: vi.fn() });
    await submitForm('[data-testid="observation-cue-form"]');
    const protocol = container.querySelector('[data-testid="follow-up-protocol"]');
    expect(protocol?.textContent).toMatch(/non-destructive/i);
    const steps = protocol?.querySelectorAll('[data-testid^="follow-up-"]') ?? [];
    expect(steps.length).toBe(2);
    expect(steps[0].textContent).toMatch(/on site/i);
    expect(steps[1].textContent).toMatch(/later revisit/i);
    expect(container.querySelector('[data-testid="protocol-constraints"]')?.textContent).toMatch(/do not collect/i);
  });

  it('shows an explicit in-development state when the API route is absent, and stores nothing', async () => {
    const generate = vi.fn().mockRejectedValue(new FieldHypothesisApiError('route_unavailable', 'Not Found', 404));
    render({ generate, recordEvidence: vi.fn() });
    await submitForm('[data-testid="observation-cue-form"]');
    const notice = container.querySelector('[data-testid="hypothesis-loop-unavailable"]');
    expect(notice?.textContent).toMatch(/in development/i);
    expect(notice?.textContent).toMatch(/nothing has been sent or stored/i);
    expect(container.querySelector('[data-testid="hypothesis-set"]')).toBeNull();
  });

  it('surfaces other failures as an alert without fabricating hypotheses', async () => {
    render({ generate: vi.fn().mockRejectedValue(new FieldHypothesisApiError('server_error', 'Field hypothesis request failed (500).', 500)), recordEvidence: vi.fn() });
    await submitForm('[data-testid="observation-cue-form"]');
    const alert = container.querySelector('[data-testid="hypothesis-loop-error"]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toMatch(/failed \(500\)/);
    expect(container.querySelectorAll('[data-testid^="hypothesis-card-"]').length).toBe(0);
  });
});
