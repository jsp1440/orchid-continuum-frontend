import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, BookMarked, CheckCircle2, RotateCcw, Save } from 'lucide-react';
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
    if (error.detail?.code === 'REVISION_CONFLICT') {
      return 'This session changed elsewhere. Reload the session before making another edit.';
    }
    if (error.status === 401) return 'An authenticated Calyx session is required to use the learner notebook.';
    return error.detail?.message ?? error.message;
  }
  return error instanceof Error ? error.message : 'University request failed.';
}

function hasEvent(session: UniversityLabSession, eventType: string, stage = session.current_stage): boolean {
  return session.events.some((event) => event.event_type === eventType && event.stage === stage);
}

function stageReady(session: UniversityLabSession): { ready: boolean; reason?: string } {
  const stage = session.current_stage;
  if (stage === 'contribute') return { ready: false, reason: 'This investigation has been submitted.' };
  const required = PRIMARY_EVENT[stage];
  if (!hasEvent(session, required, stage)) {
    return { ready: false, reason: 'Save substantive work for this stage before advancing.' };
  }
  if (stage === 'investigate' && !hasEvent(session, 'evidence_examined', stage)) {
    return { ready: false, reason: 'Record at least one examined evidence item before analysis.' };
  }
  if (stage === 'communicate' && !hasEvent(session, 'uncertainty_recorded', stage)) {
    return { ready: false, reason: 'Record uncertainty before submitting the investigation.' };
  }
  return { ready: true };
}

export default function UniversityLearnerNotebook({
  chapterId,
  laboratoryId,
}: {
  chapterId: string;
  laboratoryId: string;
}) {
  const [session, setSession] = useState<UniversityLabSession | null>(null);
  const [resumeId, setResumeId] = useState('');
  const [note, setNote] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [uncertainty, setUncertainty] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const updateSession = (next: UniversityLabSession) => {
    setSession(next);
    setMessage(null);
  };

  const create = useMutation({
    mutationFn: () => universityApi.createSession({ laboratory_id: laboratoryId, chapter_id: chapterId }),
    onSuccess: updateSession,
    onError: (error) => setMessage(errorMessage(error)),
  });
  const resume = useMutation({
    mutationFn: () => universityApi.session(resumeId.trim()),
    onSuccess: updateSession,
    onError: (error) => setMessage(errorMessage(error)),
  });
  const append = useMutation({
    mutationFn: (input: {
      event_type: InvestigationEventType;
      stage: UniversityInquiryStage;
      payload: Record<string, unknown>;
      expected_revision: number;
    }) => universityApi.appendEvent(session!.session_id, input),
    onSuccess: updateSession,
    onError: (error) => setMessage(errorMessage(error)),
  });
  const submit = useMutation({
    mutationFn: () => universityApi.submitSession(session!.session_id, session!.revision),
    onSuccess: updateSession,
    onError: (error) => setMessage(errorMessage(error)),
  });

  const busy = create.isPending || resume.isPending || append.isPending || submit.isPending;
  const currentIndex = session ? STAGES.indexOf(session.current_stage) : -1;
  const readiness = useMemo(() => (session ? stageReady(session) : null), [session]);
  const editingLocked = session
    ? ['submitted', 'under_review', 'approved_for_learning', 'archived'].includes(session.status)
    : false;

  const savePrimary = () => {
    if (!session || session.current_stage === 'contribute' || !note.trim()) return;
    append.mutate({
      event_type: PRIMARY_EVENT[session.current_stage],
      stage: session.current_stage,
      payload: { text: note.trim(), authorship: 'learner' },
      expected_revision: session.revision,
    });
    setNote('');
  };

  const saveEvidence = () => {
    if (!session || session.current_stage !== 'investigate' || !evidenceNote.trim()) return;
    append.mutate({
      event_type: 'evidence_examined',
      stage: 'investigate',
      payload: { text: evidenceNote.trim(), authorship: 'learner' },
      expected_revision: session.revision,
    });
    setEvidenceNote('');
  };

  const saveUncertainty = () => {
    if (!session || session.current_stage !== 'communicate' || !uncertainty.trim()) return;
    append.mutate({
      event_type: 'uncertainty_recorded',
      stage: 'communicate',
      payload: { text: uncertainty.trim(), authorship: 'learner' },
      expected_revision: session.revision,
    });
    setUncertainty('');
  };

  const advance = () => {
    if (!session || !readiness?.ready) return;
    if (session.current_stage === 'communicate') {
      submit.mutate();
      return;
    }
    const next = STAGES[currentIndex + 1];
    if (!next || next === 'contribute') return;
    append.mutate({
      event_type: 'stage_advanced',
      stage: next,
      payload: { from_stage: session.current_stage, to_stage: next },
      expected_revision: session.revision,
    });
  };

  if (!session) {
    return (
      <section className="rounded-2xl border border-sky-300/25 bg-sky-300/[0.045] p-7 md:p-9">
        <div className="mb-3 flex items-center gap-3 text-sky-100">
          <BookMarked className="h-5 w-5" />
          <h2 className="font-serif text-2xl">Durable learner notebook</h2>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-white/70">
          This workspace is shown only after the backend reports verified durable persistence. It
          preserves revision history and human-review boundaries; it does not publish conclusions or
          promote Candidate Knowledge.
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
          <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-sky-200/80">Durable learner record</div>
          <h2 className="font-serif text-2xl text-white">Scientific inquiry notebook</h2>
          <p className="mt-2 text-xs text-white/55">Session {session.session_id} · revision {session.revision}</p>
        </div>
        <button
          type="button"
          onClick={() => setSession(null)}
          className="flex items-center gap-2 self-start rounded-lg border border-white/10 px-3 py-2 text-xs text-white/65"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Change session
        </button>
      </div>

      <div className="mt-7 flex flex-wrap gap-2">
        {STAGES.map((stage, index) => {
          const active = stage === session.current_stage;
          const complete = index < currentIndex || session.status === 'approved_for_learning';
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

      {editingLocked || session.current_stage === 'contribute' ? (
        <div className="mt-7 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.05] p-5">
          <div className="flex items-center gap-2 text-emerald-100">
            <CheckCircle2 className="h-4 w-4" />
            <strong className="text-sm">Session status: {session.status}</strong>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-white/65">
            Learner editing is locked while this investigation is submitted or under review. A
            qualified reviewer may request changes, which reopens the communicate stage.
          </p>
        </div>
      ) : (
        <div className="mt-7 space-y-5">
          <div>
            <div className="mb-2 text-xs uppercase tracking-[0.16em] text-sky-100/70">Current stage · {session.current_stage}</div>
            <p className="mb-3 text-sm leading-relaxed text-white/70">{PROMPTS[session.current_stage]}</p>
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

          {session.current_stage === 'investigate' && (
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

          {session.current_stage === 'communicate' && (
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
              {session.current_stage === 'communicate' ? 'Submit for human review' : 'Advance one stage'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
