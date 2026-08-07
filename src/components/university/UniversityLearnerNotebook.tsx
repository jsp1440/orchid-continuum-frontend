import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, BookMarked, CheckCircle2, LockKeyhole, RotateCcw, Save } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  UniversityApiError,
  universityApi,
  type InvestigationEventType,
  type UniversityInquiryStage,
  type UniversityLabSession,
} from '@/lib/universityApi';

const STAGES: UniversityInquiryStage[] = [
  'observe',
  'question',
  'investigate',
  'analyze',
  'interpret',
  'communicate',
  'contribute',
];

const PRIMARY_EVENT: Record<Exclude<UniversityInquiryStage, 'contribute'>, InvestigationEventType> = {
  observe: 'observation_added',
  question: 'question_set',
  investigate: 'hypothesis_added',
  analyze: 'analysis_recorded',
  interpret: 'interpretation_recorded',
  communicate: 'conclusion_drafted',
};

const PROMPTS: Record<Exclude<UniversityInquiryStage, 'contribute'>, string> = {
  observe: 'Record only what is observed or documented. Avoid causal interpretation.',
  question: 'State a testable question that follows from the observations.',
  investigate: 'Record a testable hypothesis and the evidence that could support or contradict it.',
  analyze: 'Describe the pattern in the evidence and any limitations.',
  interpret: 'Explain what the evidence supports, rejects, or leaves unresolved. Include alternatives.',
  communicate: 'Draft a bounded conclusion that does not exceed the evidence.',
};

function errorMessage(error: unknown): string {
  if (error instanceof UniversityApiError) {
    const code = error.detail?.code;
    if (code === 'REVISION_CONFLICT') {
      return 'This session changed elsewhere. Resume the session again before making another edit.';
    }
    if (code === 'STAGE_EXIT_REQUIREMENTS_UNMET') {
      return error.detail?.message ?? 'Required scientific records are still missing for this stage.';
    }
    if (code === 'CHANGES_NOT_ADDRESSED') {
      return 'A reviewer requested changes. Record a revised conclusion and revised uncertainty before resubmitting.';
    }
    if (code === 'INVALID_LEARNER_TOKEN' || code === 'LEARNER_SESSION_REQUIRED' || error.status === 401) {
      return 'Your learner session is missing or expired. Sign in again before continuing this investigation.';
    }
    return error.detail?.message ?? error.message;
  }
  return error instanceof Error ? error.message : 'University request failed.';
}

function latestSubmittedRevision(session: UniversityLabSession): number | null {
  const revisions = session.events
    .filter((event) => event.event_type === 'session_submitted')
    .map((event) => event.session_revision);
  return revisions.length > 0 ? Math.max(...revisions) : null;
}

function eventsForStage(session: UniversityLabSession, stage = session.current_stage) {
  const stageEvents = session.events.filter((event) => event.stage === stage);
  if (session.status !== 'changes_requested' || stage !== 'communicate') return stageEvents;

  const reviewedSubmissionRevision = latestSubmittedRevision(session);
  if (reviewedSubmissionRevision === null) return [];
  return stageEvents.filter((event) => event.session_revision > reviewedSubmissionRevision);
}

function stageReady(session: UniversityLabSession): { ready: boolean; reason?: string } {
  const stage = session.current_stage;
  if (stage === 'contribute') return { ready: false, reason: 'This investigation has been submitted.' };
  const events = eventsForStage(session, stage);
  const required = PRIMARY_EVENT[stage];
  if (!events.some((event) => event.event_type === required)) {
    return {
      ready: false,
      reason:
        session.status === 'changes_requested' && stage === 'communicate'
          ? 'Record a revised conclusion after the reviewed submission.'
          : 'Save substantive work for this stage before advancing.',
    };
  }
  if (stage === 'investigate' && !events.some((event) => event.event_type === 'evidence_examined')) {
    return { ready: false, reason: 'Record at least one examined evidence item before analysis.' };
  }
  if (stage === 'communicate' && !events.some((event) => event.event_type === 'uncertainty_recorded')) {
    return {
      ready: false,
      reason:
        session.status === 'changes_requested'
          ? 'Record revised uncertainty after the reviewed submission.'
          : 'Record uncertainty before submitting the investigation.',
    };
  }
  return { ready: true };
}

type AppendInput = {
  event_type: InvestigationEventType;
  stage: UniversityInquiryStage;
  payload: Record<string, unknown>;
  expected_revision: number;
};

export default function UniversityLearnerNotebook({
  chapterId,
  laboratoryId,
}: {
  chapterId: string;
  laboratoryId: string;
}) {
  const { session: authSession, loading: authLoading } = useAuth();
  const accessToken = authSession?.access_token ?? null;
  const [labSession, setLabSession] = useState<UniversityLabSession | null>(null);
  const [resumeId, setResumeId] = useState('');
  const [note, setNote] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [uncertainty, setUncertainty] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const acceptSession = (next: UniversityLabSession) => {
    setLabSession(next);
    setMessage(null);
  };

  const requireToken = (): string => {
    if (!accessToken) throw new Error('A signed-in learner session is required.');
    return accessToken;
  };

  const create = useMutation({
    mutationFn: () =>
      universityApi.createSession(
        { laboratory_id: laboratoryId, chapter_id: chapterId },
        requireToken(),
      ),
    onSuccess: (next) => {
      acceptSession(next);
      setResumeId(next.session_id);
    },
    onError: (error) => setMessage(errorMessage(error)),
  });
  const resume = useMutation({
    mutationFn: () => universityApi.session(resumeId.trim(), requireToken()),
    onSuccess: acceptSession,
    onError: (error) => setMessage(errorMessage(error)),
  });
  const append = useMutation({
    mutationFn: (input: AppendInput) =>
      universityApi.appendEvent(labSession!.session_id, input, requireToken()),
    onSuccess: (next, input) => {
      acceptSession(next);
      if (input.event_type === 'evidence_examined') setEvidenceNote('');
      else if (input.event_type === 'uncertainty_recorded') setUncertainty('');
      else if (input.event_type !== 'stage_advanced') setNote('');
    },
    onError: (error) => setMessage(errorMessage(error)),
  });
  const submit = useMutation({
    mutationFn: () =>
      universityApi.submitSession(labSession!.session_id, labSession!.revision, requireToken()),
    onSuccess: acceptSession,
    onError: (error) => setMessage(errorMessage(error)),
  });

  const busy = create.isPending || resume.isPending || append.isPending || submit.isPending;
  const currentIndex = labSession ? STAGES.indexOf(labSession.current_stage) : -1;
  const readiness = useMemo(() => (labSession ? stageReady(labSession) : null), [labSession]);
  const editingLocked = labSession
    ? ['submitted', 'under_review', 'approved_for_learning', 'archived'].includes(labSession.status)
    : false;

  const savePrimary = () => {
    if (!labSession || labSession.current_stage === 'contribute' || !note.trim() || !accessToken) return;
    append.mutate({
      event_type: PRIMARY_EVENT[labSession.current_stage],
      stage: labSession.current_stage,
      payload: { text: note.trim(), authorship: 'learner' },
      expected_revision: labSession.revision,
    });
  };

  const saveEvidence = () => {
    if (!labSession || labSession.current_stage !== 'investigate' || !evidenceNote.trim() || !accessToken) return;
    append.mutate({
      event_type: 'evidence_examined',
      stage: 'investigate',
      payload: { text: evidenceNote.trim(), authorship: 'learner' },
      expected_revision: labSession.revision,
    });
  };

  const saveUncertainty = () => {
    if (!labSession || labSession.current_stage !== 'communicate' || !uncertainty.trim() || !accessToken) return;
    append.mutate({
      event_type: 'uncertainty_recorded',
      stage: 'communicate',
      payload: { text: uncertainty.trim(), authorship: 'learner' },
      expected_revision: labSession.revision,
    });
  };

  const advance = () => {
    if (!labSession || !readiness?.ready || !accessToken) return;
    if (labSession.current_stage === 'communicate') {
      submit.mutate();
      return;
    }
    const next = STAGES[currentIndex + 1];
    if (!next || next === 'contribute') return;
    append.mutate({
      event_type: 'stage_advanced',
      stage: next,
      payload: { from_stage: labSession.current_stage, to_stage: next },
      expected_revision: labSession.revision,
    });
  };

  if (authLoading) {
    return (
      <section className="rounded-2xl border border-sky-300/25 bg-sky-300/[0.045] p-7 text-sm text-white/70">
        Checking learner identity…
      </section>
    );
  }

  if (!accessToken) {
    return (
      <section className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.045] p-7 md:p-9">
        <div className="mb-3 flex items-center gap-3 text-amber-100">
          <LockKeyhole className="h-5 w-5" />
          <h2 className="font-serif text-2xl">Learner sign-in required</h2>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-white/70">
          Durable investigations are owned by a verified Orchid Continuum account. Sign in before
          creating or resuming a learner record. Signing in does not grant scientific-review authority.
        </p>
        <Link
          to="/account"
          className="mt-5 inline-flex rounded-lg border border-amber-200/25 bg-amber-200/10 px-4 py-2 text-sm text-amber-50"
        >
          Sign in or manage account
        </Link>
      </section>
    );
  }

  if (!labSession) {
    return (
      <section className="rounded-2xl border border-sky-300/25 bg-sky-300/[0.045] p-7 md:p-9">
        <div className="mb-3 flex items-center gap-3 text-sky-100">
          <BookMarked className="h-5 w-5" />
          <h2 className="font-serif text-2xl">Durable learner notebook</h2>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-white/70">
          This workspace uses your verified Orchid Continuum learner identity and preserves revision
          history and human-review boundaries. It does not publish conclusions or promote Candidate Knowledge.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={busy}
            className="rounded-lg border border-sky-200/30 bg-sky-200/10 px-4 py-2 text-sm text-sky-50 disabled:opacity-50"
          >
            Start investigation
          </button>
          <input
            value={resumeId}
            onChange={(event) => setResumeId(event.target.value)}
            placeholder="Existing session ID"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
          />
          <button
            type="button"
            onClick={() => resume.mutate()}
            disabled={busy || !resumeId.trim()}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 disabled:opacity-50"
          >
            Resume
          </button>
        </div>
        {message && <p className="mt-4 text-sm text-red-200">{message}</p>}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-sky-300/25 bg-sky-300/[0.035] p-7 md:p-9">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-sky-200/80">Verified durable learner record</div>
          <h2 className="font-serif text-2xl text-white">Scientific inquiry notebook</h2>
          <p className="mt-2 text-xs text-white/55">Session {labSession.session_id} · revision {labSession.revision}</p>
        </div>
        <button
          type="button"
          onClick={() => setLabSession(null)}
          className="flex items-center gap-2 self-start rounded-lg border border-white/10 px-3 py-2 text-xs text-white/65"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Change session
        </button>
      </div>

      <div className="mt-7 flex flex-wrap gap-2">
        {STAGES.map((stage, index) => {
          const active = stage === labSession.current_stage;
          const complete = index < currentIndex || labSession.status === 'approved_for_learning';
          return (
            <div
              key={stage}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                active
                  ? 'border-sky-200/50 bg-sky-200/15 text-sky-50'
                  : complete
                    ? 'border-emerald-300/20 bg-emerald-300/5 text-emerald-100/70'
                    : 'border-white/10 text-white/45'
              }`}
            >
              {index + 1}. {stage}
            </div>
          );
        })}
      </div>

      {message && (
        <div className="mt-6 flex gap-2 rounded-xl border border-red-300/25 bg-red-300/10 p-4 text-sm text-red-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {message}
        </div>
      )}

      {editingLocked || labSession.current_stage === 'contribute' ? (
        <div className="mt-7 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.05] p-5">
          <div className="flex items-center gap-2 text-emerald-100">
            <CheckCircle2 className="h-4 w-4" />
            <strong className="text-sm">Session status: {labSession.status}</strong>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-white/65">
            Learner editing is locked while this investigation is submitted or under review. A
            qualified reviewer may request changes, which reopens the communicate stage. The server
            then requires a new conclusion and uncertainty record before resubmission.
          </p>
        </div>
      ) : (
        <div className="mt-7 space-y-5">
          <div>
            <div className="mb-2 text-xs uppercase tracking-[0.16em] text-sky-100/70">Current stage · {labSession.current_stage}</div>
            <p className="mb-3 text-sm leading-relaxed text-white/70">{PROMPTS[labSession.current_stage]}</p>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={5}
              placeholder="Write the learner-authored scientific record for this stage…"
              className="w-full rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-relaxed text-white outline-none placeholder:text-white/30"
            />
            <button
              type="button"
              onClick={savePrimary}
              disabled={busy || !note.trim()}
              className="mt-3 flex items-center gap-2 rounded-lg border border-sky-200/25 bg-sky-200/10 px-4 py-2 text-sm text-sky-50 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> Save stage record
            </button>
          </div>

          {labSession.current_stage === 'investigate' && (
            <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-5">
              <label className="text-sm text-amber-50/85">Evidence examined</label>
              <textarea
                value={evidenceNote}
                onChange={(event) => setEvidenceNote(event.target.value)}
                rows={3}
                placeholder="Identify evidence examined and whether it supports, contradicts, or leaves the hypothesis unresolved."
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white outline-none placeholder:text-white/30"
              />
              <button type="button" onClick={saveEvidence} disabled={busy || !evidenceNote.trim()} className="mt-3 rounded-lg border border-amber-200/20 px-4 py-2 text-sm text-amber-50 disabled:opacity-50">
                Record evidence
              </button>
            </div>
          )}

          {labSession.current_stage === 'communicate' && (
            <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-5">
              <label className="text-sm text-amber-50/85">Uncertainty and limitations</label>
              <textarea
                value={uncertainty}
                onChange={(event) => setUncertainty(event.target.value)}
                rows={3}
                placeholder="What remains uncertain, what data are missing, and what should not be inferred?"
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white outline-none placeholder:text-white/30"
              />
              <button type="button" onClick={saveUncertainty} disabled={busy || !uncertainty.trim()} className="mt-3 rounded-lg border border-amber-200/20 px-4 py-2 text-sm text-amber-50 disabled:opacity-50">
                Record uncertainty
              </button>
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-white/55">{readiness?.ready ? 'Stage exit requirements recorded.' : readiness?.reason}</p>
            <button
              type="button"
              onClick={advance}
              disabled={busy || !readiness?.ready}
              className="flex items-center justify-center gap-2 rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-sm text-emerald-50 disabled:opacity-40"
            >
              {labSession.current_stage === 'communicate' ? 'Submit for human review' : 'Advance one stage'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
