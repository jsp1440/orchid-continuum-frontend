// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import defectKindCapture from '@/lib/__fixtures__/evidenceFeedbackDefectKind.realBackend.json';
import memberCapture from '@/lib/__fixtures__/evidenceFeedbackMember.realBackend.json';
import {
  ALREADY_REPORTED_MESSAGE,
  EvidenceFeedbackApiError,
  FEEDBACK_DISABLED_MESSAGE,
  TRIVIAL_DEFECT_KINDS,
  parseFeedbackSubmission,
  type EvidenceFeedbackCase,
  type EvidenceObjectType,
} from '@/lib/evidenceFeedback';

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
  it('shows a case routed to governed review as unresolved with the displayed content unchanged', async () => {
    mocks.submit.mockResolvedValue({ created: true, duplicate_of: null, case: feedbackCase });
    mocks.status.mockResolvedValue({
      case_id: 'ef_case_1',
      status: 'governed_review_required',
      disposition: 'needs_scientific_review',
      resolution: null,
      resulting_version_hash: null,
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

    expect(container.textContent).toContain('Routed to governed review.');
    expect(container.textContent).toContain('has not been changed');
    expect(container.textContent).not.toContain('resolved');
    expect(container.textContent).not.toContain('triage begins');
  });

  describe('defect kind ("What kind of problem is it?")', () => {
    // REAL submit responses captured from the Calyx backend running LOCALLY
    // (SYNTHETIC inputs; see the fixture's _meta).
    const captured = defectKindCapture as unknown as { responses: Record<string, { body: unknown }> };
    const submitted = (key: string) => captured.responses[key].body;

    function renderFor(objectType: EvidenceObjectType, objectId = 'lexicon:flower'): void {
      act(() => {
        root.render(
          <EvidenceFeedbackControl
            objectId={objectId}
            objectType={objectType}
            objectPayload={{ preferred_term: 'Flower', review_state: 'draft' }}
            pageContext="/lexicon/flower"
            objectLabel="Flower"
          />,
        );
      });
      act(() => (container.querySelector('button') as HTMLButtonElement).click());
    }

    async function choose(select: HTMLSelectElement, value: string): Promise<void> {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
      await act(async () => {
        setter?.call(select, value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    async function fill(id: string, value: string): Promise<void> {
      const element = container.querySelector(`#${CSS.escape(id)}`) as HTMLTextAreaElement;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      await act(async () => {
        setter?.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }

    const feedbackClass = () => container.querySelector('#feedback-class-lexicon\\:flower') as HTMLSelectElement;
    const defectKind = () => container.querySelector('[data-testid="feedback-defect-kind"]') as HTMLSelectElement | null;
    const submit = async () => {
      await act(async () => {
        (container.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
    };

    it('offers exactly the backend trivial kinds plus "other / not sure", only for a lexicon correction', async () => {
      renderFor('lexicon');
      expect(defectKind()).toBeNull();
      await choose(feedbackClass(), 'suggest_correction');
      const select = defectKind()!;
      expect(container.querySelector('label[for="feedback-defect-kind-lexicon:flower"]')?.textContent).toBe('What kind of problem is it? (optional)');
      const options = Array.from(select.options).map((option) => [option.value, option.textContent]);
      expect(options).toEqual([
        ['', 'Other / not sure'],
        ['typo', 'A spelling mistake or typo'],
        ['format', 'Formatting (capital letters, punctuation or spacing)'],
      ]);
      expect(options.slice(1).map(([value]) => value)).toEqual([...TRIVIAL_DEFECT_KINDS]);
      expect(select.value).toBe('');
    });

    it('sends the chosen kind with a lexicon correction and shows the captured pending case', async () => {
      mocks.submit.mockResolvedValue(submitted('submit_lexicon_typo'));
      renderFor('lexicon');
      await choose(feedbackClass(), 'suggest_correction');
      await fill('feedback-statement-lexicon:flower', 'SYNTHETIC: the term is misspelled.');
      await choose(defectKind()!, 'typo');
      expect(container.textContent).toContain('Add the corrected wording above');
      await fill('feedback-replacement-lexicon:flower', 'Column (SYNTHETIC)');
      expect(container.textContent).not.toContain('Add the corrected wording above');
      await submit();

      expect(mocks.submit).toHaveBeenCalledTimes(1);
      expect(mocks.submit.mock.calls[0][0]).toMatchObject({
        objectType: 'lexicon',
        feedbackClass: 'suggest_correction',
        proposedReplacement: 'Column (SYNTHETIC)',
        defectKind: 'typo',
      });
      expect(container.textContent).toContain('Correction pending review. The displayed scientific content has not been changed.');
      expect(container.textContent).toContain('deterministic');
    });

    it('sends no defect kind for "other / not sure"', async () => {
      mocks.submit.mockResolvedValue(submitted('submit_lexicon_not_sure'));
      renderFor('lexicon');
      await choose(feedbackClass(), 'suggest_correction');
      await fill('feedback-statement-lexicon:flower', 'SYNTHETIC: this wording seems off.');
      await choose(defectKind()!, 'format');
      await choose(defectKind()!, '');
      await submit();
      expect(mocks.submit.mock.calls[0][0].defectKind).toBeUndefined();
    });

    it('drops a chosen kind when the feedback is no longer a correction', async () => {
      mocks.submit.mockResolvedValue({ created: true, duplicate_of: null, case: feedbackCase });
      renderFor('lexicon');
      await choose(feedbackClass(), 'suggest_correction');
      await choose(defectKind()!, 'typo');
      await choose(feedbackClass(), 'report_problem');
      expect(defectKind()).toBeNull();
      await fill('feedback-statement-lexicon:flower', 'The definition needs a source.');
      await submit();
      expect(mocks.submit.mock.calls[0][0].defectKind).toBeUndefined();
    });

    it('never asks on a Matrix identification, which always goes to scientific review', async () => {
      mocks.submit.mockResolvedValue(submitted('submit_matrix_typo_label'));
      renderFor('matrix_identification', 'matrix:session');
      const classSelect = container.querySelector('#feedback-class-matrix\\:session') as HTMLSelectElement;
      await choose(classSelect, 'suggest_correction');
      expect(defectKind()).toBeNull();
      const statement = container.querySelector('#feedback-statement-matrix\\:session') as HTMLTextAreaElement;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      await act(async () => {
        setter?.call(statement, 'SYNTHETIC: a candidate name is misspelled.');
        statement.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await submit();
      expect(mocks.submit.mock.calls[0][0]).toMatchObject({ objectType: 'matrix_identification' });
      expect(mocks.submit.mock.calls[0][0].defectKind).toBeUndefined();
      expect(container.textContent).toContain('scientific');
    });
  });
});

/*
 * Member states (Release 1 "Members submit, owner reviews"). Receipts are REAL
 * responses captured from the Calyx backend running LOCALLY
 * (`evidenceFeedbackMember.realBackend.json`, SYNTHETIC inputs), passed through
 * the real `parseFeedbackSubmission`.
 */
describe('EvidenceFeedbackControl for a signed-in member', () => {
  const M = memberCapture as unknown as { responses: Record<string, { status: number; body: Record<string, unknown> }> };
  const receipt = (key: string) => parseFeedbackSubmission(M.responses[key].body);
  const ownCase = String(M.responses.member_submit_created.body.case_id);

  async function submitForm(): Promise<void> {
    act(() => (container.querySelector('button') as HTMLButtonElement).click());
    await enterStatement('SYNTHETIC: petal is misspelled.');
    await act(async () => {
      (container.querySelector('form') as HTMLFormElement).dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
  }
  const checkButton = () => Array.from(container.querySelectorAll('button')).find((button) =>
    button.textContent?.includes('Check status')) as HTMLButtonElement | undefined;

  it('shows a new member submission as recorded and pending review, with their own case', async () => {
    mocks.submit.mockResolvedValue(receipt('member_submit_created'));
    renderControl();
    await submitForm();

    expect(container.textContent).toContain('Feedback recorded');
    expect(container.textContent).toContain('Correction pending review');
    expect(container.textContent).toContain('has not been changed');
    expect(container.textContent).toContain(ownCase);
    // A receipt has no review lane; nothing is invented for it.
    expect(container.textContent).not.toContain('Review route');
    expect(checkButton()).toBeDefined();
  });

  it('refreshes the member\'s own case status', async () => {
    mocks.submit.mockResolvedValue(receipt('member_submit_created'));
    mocks.status.mockResolvedValue({ ...M.responses.member_status_own_case.body, status: 'governed_review_required' });
    renderControl();
    await submitForm();
    await act(async () => checkButton()?.click());

    expect(mocks.status).toHaveBeenCalledWith(ownCase);
    expect(container.textContent).toContain('Routed to governed review.');
  });

  it('a member resubmitting their own report sees it as existing feedback', async () => {
    mocks.submit.mockResolvedValue(receipt('member_submit_own_duplicate'));
    renderControl();
    await submitForm();
    expect(container.textContent).toContain('Existing feedback found');
    expect(container.textContent).toContain(ownCase);
  });

  it('an identical report by someone else shows no case, no status check and nothing about them', async () => {
    mocks.submit.mockResolvedValue(receipt('member_b_submit_duplicate_of_a'));
    renderControl();
    await submitForm();

    expect(container.textContent).toContain('Already reported');
    expect(container.textContent).toContain(ALREADY_REPORTED_MESSAGE);
    expect(container.textContent).not.toContain('efc-');
    expect(container.textContent).not.toContain('Case');
    expect(checkButton()).toBeUndefined();
  });

  it('says plainly when member feedback is switched off, and keeps the text', async () => {
    const refusal = M.responses.member_submit_feature_disabled;
    mocks.submit.mockRejectedValue(new EvidenceFeedbackApiError(refusal.status, String((refusal.body.detail as { code: string }).code)));
    renderControl();
    await submitForm();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(FEEDBACK_DISABLED_MESSAGE);
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('SYNTHETIC: petal is misspelled.');
    expect(container.textContent).not.toContain('Feedback recorded');
  });

  it('says plainly when the member is rate limited, with the backend wait', async () => {
    mocks.submit.mockRejectedValue(new EvidenceFeedbackApiError(429, 'MEMBER_RATE_LIMITED', 600));
    renderControl();
    await submitForm();

    const alert = container.querySelector('[role="alert"]')?.textContent ?? '';
    expect(alert).toContain('several reports in a short time');
    expect(alert).toContain('Nothing more was recorded');
    expect(alert).toContain('about 10 minutes');
  });

  it('explains a format-character refusal without recording anything', async () => {
    mocks.submit.mockRejectedValue(new EvidenceFeedbackApiError(422, 'MEMBER_TEXT_FORMAT_CHARACTERS'));
    renderControl();
    await submitForm();
    const alert = container.querySelector('[role="alert"]')?.textContent ?? '';
    expect(alert).toContain('invisible formatting characters');
    expect(alert).toContain('nothing was recorded');
  });

  it('keeps an owner-only refusal distinct from the switch being off', async () => {
    mocks.submit.mockRejectedValue(new EvidenceFeedbackApiError(403, 'OWNER_ACCESS_REQUIRED'));
    renderControl();
    await submitForm();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Your current session is not permitted to submit this feedback.');
  });
});
