import { useState, type FormEvent } from 'react';
import {
  EvidenceFeedbackApiError,
  fetchEvidenceFeedbackStatus,
  submitEvidenceFeedback,
  type EvidenceFeedbackCase,
  type EvidenceObjectType,
  type FeedbackClass,
} from '@/lib/evidenceFeedback';

interface Props {
  objectId: string;
  objectType: EvidenceObjectType;
  objectPayload: Record<string, unknown>;
  pageContext: string;
  objectLabel: string;
}

const FEEDBACK_OPTIONS: Array<{ value: FeedbackClass; label: string }> = [
  { value: 'report_problem', label: 'Report a problem' },
  { value: 'suggest_correction', label: 'Suggest a correction' },
  { value: 'challenge', label: 'Disagree or challenge' },
  { value: 'add_evidence', label: 'Add evidence' },
  { value: 'confirm', label: 'Confirm this' },
  { value: 'source_problem', label: 'Report a source problem' },
  { value: 'image_identification_problem', label: 'Report an image identification problem' },
];

function errorMessage(error: unknown): string {
  if (!(error instanceof EvidenceFeedbackApiError)) return 'Feedback could not be submitted. Please try again.';
  if (error.status === 401) return 'Sign in is required before feedback can be recorded.';
  if (error.status === 403) return 'Your current session is not permitted to submit this feedback.';
  if (error.code === 'NETWORK_UNAVAILABLE') return 'The feedback service is currently unreachable.';
  return `Feedback was not accepted (${error.code.replaceAll('_', ' ').toLowerCase()}).`;
}

function statusText(feedbackCase: EvidenceFeedbackCase): string {
  if (feedbackCase.status === 'resolved') {
    return feedbackCase.resolution || 'This case has been resolved.';
  }
  if (feedbackCase.status === 'pending_review') {
    return 'Correction pending review. The displayed scientific content has not been changed.';
  }
  return 'Feedback submitted. The displayed scientific content remains unchanged while triage begins.';
}

export function EvidenceFeedbackControl({ objectId, objectType, objectPayload, pageContext, objectLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [feedbackClass, setFeedbackClass] = useState<FeedbackClass>('report_problem');
  const [statement, setStatement] = useState('');
  const [proposedReplacement, setProposedReplacement] = useState('');
  const [citation, setCitation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [feedbackCase, setFeedbackCase] = useState<EvidenceFeedbackCase | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!statement.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitEvidenceFeedback({
        objectId,
        objectType,
        objectPayload,
        pageContext,
        feedbackClass,
        statement: statement.trim(),
        proposedReplacement,
        citation,
      });
      setFeedbackCase(result.case);
      setDuplicate(!result.created || Boolean(result.duplicate_of));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  }

  async function refreshStatus() {
    if (!feedbackCase || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const status = await fetchEvidenceFeedbackStatus(feedbackCase.case_id);
      setFeedbackCase((current) => current ? { ...current, ...status } : current);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-sm border border-[#4A7C59]/40 bg-[#F2F8F3] p-5" aria-labelledby={`feedback-${objectId}`}>
      <h2 id={`feedback-${objectId}`} className="font-serif text-xl text-stone-950" style={{ fontFamily: 'Georgia, serif' }}>
        Is something wrong with this record?
      </h2>
      <p className="mt-2 text-[15px] leading-6 text-stone-800">
        Your feedback is attached to the exact displayed version of <strong>{objectLabel}</strong>. Scientific, taxonomic, image and source changes remain pending until governed review.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 min-h-11 rounded-sm bg-[#245C38] px-4 py-2.5 text-base font-semibold text-white hover:bg-[#19482A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3FA0] focus-visible:ring-offset-2"
        >
          Report, correct, or add evidence
        </button>
      ) : feedbackCase ? (
        <div className="mt-4 rounded-sm border border-[#245C38]/30 bg-white p-4" role="status" aria-live="polite">
          <p className="font-semibold text-stone-950">{duplicate ? 'Existing feedback found' : 'Feedback recorded'}</p>
          <p className="mt-2 text-[15px] leading-6 text-stone-800">{statusText(feedbackCase)}</p>
          <dl className="mt-3 grid gap-2 text-sm text-stone-700 sm:grid-cols-2">
            <div><dt className="font-semibold text-stone-900">Case</dt><dd className="break-all">{feedbackCase.case_id}</dd></div>
            <div><dt className="font-semibold text-stone-900">Review route</dt><dd>{feedbackCase.review_lane.replaceAll('_', ' ')}</dd></div>
          </dl>
          <button type="button" onClick={refreshStatus} disabled={submitting} className="mt-4 rounded-sm border border-[#245C38] px-3 py-2 text-sm font-semibold text-[#19482A] disabled:opacity-60">
            {submitting ? 'Checking…' : 'Check status'}
          </button>
        </div>
      ) : (
        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <div>
            <label htmlFor={`feedback-class-${objectId}`} className="block text-sm font-semibold text-stone-950">What would you like to do?</label>
            <select
              id={`feedback-class-${objectId}`}
              value={feedbackClass}
              onChange={(event) => setFeedbackClass(event.target.value as FeedbackClass)}
              className="mt-1 min-h-11 w-full rounded-sm border border-stone-500 bg-white px-3 py-2 text-base text-stone-950"
            >
              {FEEDBACK_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`feedback-statement-${objectId}`} className="block text-sm font-semibold text-stone-950">What did you notice?</label>
            <textarea
              id={`feedback-statement-${objectId}`}
              required
              minLength={1}
              maxLength={20000}
              rows={4}
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              className="mt-1 w-full rounded-sm border border-stone-500 bg-white px-3 py-2 text-base leading-6 text-stone-950"
            />
          </div>
          {feedbackClass === 'suggest_correction' ? (
            <div>
              <label htmlFor={`feedback-replacement-${objectId}`} className="block text-sm font-semibold text-stone-950">Proposed wording (optional)</label>
              <textarea id={`feedback-replacement-${objectId}`} rows={3} value={proposedReplacement} onChange={(event) => setProposedReplacement(event.target.value)} className="mt-1 w-full rounded-sm border border-stone-500 bg-white px-3 py-2 text-base leading-6 text-stone-950" />
            </div>
          ) : null}
          <div>
            <label htmlFor={`feedback-citation-${objectId}`} className="block text-sm font-semibold text-stone-950">Source or citation (optional)</label>
            <input id={`feedback-citation-${objectId}`} type="text" maxLength={4000} value={citation} onChange={(event) => setCitation(event.target.value)} className="mt-1 min-h-11 w-full rounded-sm border border-stone-500 bg-white px-3 py-2 text-base text-stone-950" />
          </div>
          {error ? <p role="alert" className="rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">{error}</p> : null}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={submitting || !statement.trim()} className="min-h-11 rounded-sm bg-[#245C38] px-4 py-2.5 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? 'Recording…' : 'Submit feedback'}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={submitting} className="min-h-11 rounded-sm border border-stone-500 bg-white px-4 py-2.5 text-base font-semibold text-stone-900">
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
