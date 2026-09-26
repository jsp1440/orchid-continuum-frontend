// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EvidenceFeedbackCase } from '@/lib/evidenceFeedback';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  status: vi.fn(),
}));

vi.mock('@/lib/evidenceFeedback', async () => {
  const actual = await vi.importActual<typeof import('@/lib/evidenceFeedback')>('@/lib/evidenceFeedback');
  return {
    ...actual,
    submitEvidenceFeedback: mocks.submit,
    fetchEvidenceFeedbackStatus: mocks.status,
  };
});

const { EvidenceFeedbackControl } = await import('./EvidenceFeedbackControl');

const feedbackCase: EvidenceFeedbackCase = {
  case_id: 'ef_case_1',
  object_id: 'lexicon:flower',
  object_version_hash: 'a'.repeat(64),
  object_type: 'lexicon',
  page_context: '/lexicon/flower',
  feedback_class: 'report_problem',
  statement: 'The definition needs a source.',
  disposition: 'needs_scientific_review',
  status: 'pending_review',
  review_lane: 'scientific',
  created_at: '2026-09-26T00:00:00Z',
  updated_at: '2026-09-26T00:00:00Z',
  proposed_replacement: null,
  citation: null,
  resolution: null,
  resulting_version_hash: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.submit.mockReset();
  mocks.status.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderControl(initialFeedbackClass?: 'challenge'): void {
  act(() => {
    root.render(
      <EvidenceFeedbackControl
        objectId="lexicon:flower"
        objectType="lexicon"
        objectPayload={{ preferred_term: 'Flower', review_state: 'draft' }}
        pageContext="/lexicon/flower"
        objectLabel="Flower"
        initialFeedbackClass={initialFeedbackClass}
      />,
    );
  });
}

async function enterStatement(value: string): Promise<void> {
  const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('EvidenceFeedbackControl', () => {
  it('records exact displayed context and keeps pending review visibly non-canonical', async () => {
    mocks.submit.mockResolvedValue({ created: true, duplicate_of: null, case: feedbackCase });
    renderControl();

    act(() => (container.querySelector('button') as HTMLButtonElement).click());
    await enterStatement('The definition needs a source.');
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({
      objectId: 'lexicon:flower',
      objectPayload: { preferred_term: 'Flower', review_state: 'draft' },
      statement: 'The definition needs a source.',
    }));
    expect(container.textContent).toContain('Feedback recorded');
    expect(container.textContent).toContain('displayed scientific content has not been changed');
    expect(container.textContent).toContain('scientific');
  });

  it('labels a replayed submission as existing feedback', async () => {
    mocks.submit.mockResolvedValue({ created: false, duplicate_of: 'ef_case_1', case: feedbackCase });
    renderControl();

    act(() => (container.querySelector('button') as HTMLButtonElement).click());
    await enterStatement('The definition needs a source.');
    await act(async () => {
      (container.querySelector('form') as HTMLFormElement).dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });

    expect(container.textContent).toContain('Existing feedback found');
  });

  it('can open with a surface-specific feedback class', () => {
    renderControl('challenge');

    act(() => (container.querySelector('button') as HTMLButtonElement).click());

    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('challenge');
  });

  it('merges limited status updates without losing the durable review route', async () => {
    mocks.submit.mockResolvedValue({ created: true, duplicate_of: null, case: feedbackCase });
    mocks.status.mockResolvedValue({
      case_id: 'ef_case_1',
      status: 'resolved',
      disposition: 'correction_accepted',
      resolution: 'Accepted after governed review.',
      resulting_version_hash: 'b'.repeat(64),
    });
    renderControl();

    act(() => (container.querySelector('button') as HTMLButtonElement).click());
    await enterStatement('The definition needs a source.');
    await act(async () => {
      (container.querySelector('form') as HTMLFormElement).dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    const checkButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Check status')) as HTMLButtonElement;
    await act(async () => checkButton.click());

    expect(container.textContent).toContain('Accepted after governed review.');
    expect(container.textContent).toContain('scientific');
  });
});
