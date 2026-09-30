import { useState, type FormEvent } from 'react';
import {
  ALREADY_REPORTED_MESSAGE,
  EVIDENCE_FEEDBACK_CODES,
  EvidenceFeedbackApiError,
  FEEDBACK_DISABLED_MESSAGE,
  MEMBER_ALREADY_REPORTED,
  defectKindApplies,
  fetchEvidenceFeedbackStatus,
  submitEvidenceFeedback,
  type EvidenceObjectType,
  type FeedbackCaseStatus,
  type FeedbackClass,
  type FeedbackSubmissionResult,
  type TrivialDefectKind,
} from '@/lib/evidenceFeedback';

interface Props {
  objectId: string;
  objectType: EvidenceObjectType;
  objectPayload: Record<string, unknown>;
  pageContext: string;
  objectLabel: string;
  initialFeedbackClass?: FeedbackClass;
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

// Exactly the backend's trivial defect kinds (TRIVIAL_DEFECT_KINDS), in plain
// language. The empty value is "other / not sure" and sends no defect kind.
const DEFECT_KIND_OPTIONS: Array<{ value: TrivialDefectKind | ''; label: string }> = [
  { value: '', label: 'Other / not sure' },
  { value: 'typo', label: 'A spelling mistake or typo' },
  { value: 'format', label: 'Formatting (capital letters, punctuation or spacing)' },
];

function waitText(seconds: number | null): string {
  if (!seconds) return 'a few minutes';
  const minutes = Math.ceil(seconds / 60);
  return minutes <= 1 ? 'about a minute' : `about ${minutes} minutes`;
}

function errorMessage(error: unknown): string {
  if (!(error instanceof EvidenceFeedbackApiError)) return 'Feedback could not be submitted. Please try again.';
  if (error.status === 401) return 'Sign in is required before feedback can be recorded.';
  if (error.status === 403 && error.code === EVIDENCE_FEEDBACK_CODES.memberFeedbackDisabled) return FEEDBACK_DISABLED_MESSAGE;
  if (error.status === 403) return 'Your current session is not permitted to submit this feedback.';
  if (error.status === 429) {
    return `You have sent several reports in a short time. Nothing more was recorded; please wait ${waitText(error.retryAfterSeconds)} and try again.`;
  }
  if (error.status === 404 && error.code === 'CASE_NOT_FOUND') return 'That case could not be found for your account.';
  if (error.code === 'NETWORK_UNAVAILABLE') return 'The feedback service is currently unreachable.';
  return `Feedback was not accepted (${error.code.replaceAll('_', ' ').toLowerCase()}).`;
}

/**
 * What the panel shows after a submission. Built only from the caller's own
 * submission: a member receipt carries no other person's data, and an owner
 * case keeps the fields the panel showed before.
 */
interface SubmittedView {
  /** The caller's own case, or null when someone else's identical report exists. */
  caseId: string | null;
  status: FeedbackCaseStatus | typeof MEMBER_ALREADY_REPORTED;
  resolution: string | null;
  /** Owner responses only. */
  reviewLane: string | null;
  duplicate: boolean;
}

function submittedView(result: FeedbackSubmissionResult): SubmittedView {
  if (result.kind === 'receipt') {
    return {
      caseId: result.case_id,
      status: result.status,
      resolution: null,
      reviewLane: null,
      duplicate: !result.created,
    };
  }
  return {
    caseId: result.case.case_id,
    status: result.case.status,
    resolution: result.case.resolution,
    reviewLane: result.case.review_lane,
    duplicate: !result.created || Boolean(result.duplicate_of),
  };
}

function statusText(view: Pick<SubmittedView, 'status' | 'resolution'>): string {
  if (view.status === MEMBER_ALREADY_REPORTED) return ALREADY_REPORTED_MESSAGE;
  if (view.status === 'resolved') {
    return view.resolution || 'This case has been resolved.';
  }
  if (view.status === 'governed_review_required') {
    return 'Routed to governed review. The displayed scientific content has not been changed while that review is pending.';
  }
  if (view.status === 'pending_review') {
    return 'Correction pending review. The displayed scientific content has not been changed.';
  }
  return 'Feedback submitted. The displayed scientific content remains unchanged while triage begins.';
}

function headingText(view: SubmittedView): string {
  if (view.status === MEMBER_ALREADY_REPORTED) return 'Already reported';
  return view.duplicate ? 'Existing feedback found' : 'Feedback recorded';
}

export function EvidenceFeedbackControl({
  objectId,
  objectType,
  objectPayload,
  pageContext,
  objectLabel,
  initialFeedbackClass = 'report_problem',
}: Props) {
  const [open, setOpen] = useState(false);
  const [feedbackClass, setFeedbackClass] = useState<FeedbackClass>(initialFeedbackClass);
  const [statement, setStatement] = useState('');
  const [proposedReplacement, setProposedReplacement] = useState('');
  const [citation, setCitation] = useState('');
  const [defectKind, setDefectKind] = useState<TrivialDefectKind | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<SubmittedView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const askDefectKind = defectKindApplies(objectType, feedbackClass);

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
        // Only where the backend can use it; otherwise no defect kind is sent.
        defectKind: askDefectKind && defectKind ? defectKind : undefined,
      });
      setSubmitted(submittedView(result));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  }

  async function refreshStatus() {
    const caseId = submitted?.caseId;
    if (!caseId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const status = await fetchEvidenceFeedbackStatus(caseId);
      setSubmitted((current) => current && current.caseId === caseId
        ? { ...current, status: status.status, resolution: status.resolution }
        : current);
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
      ) : submitted ? (
        <div className="mt-4 rounded-sm border border-[#245C38]/30 bg-white p-4" role="status" aria-live="polite">
          <p className="font-semibold text-stone-950">{headingText(submitted)}</p>
          <p className="mt-2 text-[15px] leading-6 text-stone-800">{statusText(submitted)}</p>
          {submitted.caseId ? (
            <dl className="mt-3 grid gap-2 text-sm text-stone-700 sm:grid-cols-2">
              <div><dt className="font-semibold text-stone-900">Case</dt><dd className="break-all">{submitted.caseId}</dd></div>
              {submitted.reviewLane ? (
                <div><dt className="font-semibold text-stone-900">Review route</dt><dd>{submitted.reviewLane.replaceAll('_', ' ')}</dd></div>
              ) : null}
            </dl>
          ) : null}
          {error ? <p role="alert" className="mt-3 rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">{error}</p> : null}
          {submitted.caseId ? (
            <button type="button" onClick={refreshStatus} disabled={submitting} className="mt-4 rounded-sm border border-[#245C38] px-3 py-2 text-sm font-semibold text-[#19482A] disabled:opacity-60">
              {submitting ? 'Checking…' : 'Check status'}
            </button>
          ) : null}
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
          {askDefectKind ? (
            <div>
              <label htmlFor={`feedback-defect-kind-${objectId}`} className="block text-sm font-semibold text-stone-950">What kind of problem is it? (optional)</label>
              <select
                id={`feedback-defect-kind-${objectId}`}
                data-testid="feedback-defect-kind"
                value={defectKind}
                onChange={(event) => setDefectKind(event.target.value as TrivialDefectKind | '')}
                aria-describedby={`feedback-defect-kind-help-${objectId}`}
                className="mt-1 min-h-11 w-full rounded-sm border border-stone-500 bg-white px-3 py-2 text-base text-stone-950"
              >
                {DEFECT_KIND_OPTIONS.map((option) => <option key={option.value || 'not-sure'} value={option.value}>{option.label}</option>)}
              </select>
              <p id={`feedback-defect-kind-help-${objectId}`} className="mt-1 text-sm leading-5 text-stone-700">
                {defectKind && !proposedReplacement.trim()
                  ? 'Add the corrected wording above so a reviewer can apply a small fix quickly.'
                  : 'A reviewer still checks every correction before anything changes.'}
              </p>
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
