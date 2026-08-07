import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, ClipboardCheck, LockKeyhole, RefreshCw, XCircle } from 'lucide-react';
import { UniversityApiError } from '@/lib/universityApi';
import {
  universityReviewerApi,
  type UniversityReviewDecision,
  type UniversityReviewerContext,
} from '@/lib/universityReviewerApi';

export function allowedReviewerDecisions(
  context: UniversityReviewerContext,
): UniversityReviewDecision[] {
  if (!context.science_review_allowed) return [];
  const decisions: UniversityReviewDecision[] = [
    'changes_requested',
    'approved_for_learning',
  ];
  if (context.expert_review_allowed) {
    decisions.push('approved_for_candidate_knowledge_consideration');
  }
  return decisions;
}

function errorText(error: unknown): string {
  if (error instanceof UniversityApiError) {
    if (error.status === 401) return 'Mission Control reviewer sign-in is required.';
    if (error.status === 403) return 'Your current principal does not have the required scientific-review authority.';
    if (error.detail?.code === 'REVISION_CONFLICT') return 'This investigation changed. Reload it before reviewing.';
    return error.detail?.message ?? error.message;
  }
  return error instanceof Error ? error.message : 'Reviewer workspace request failed.';
}

function eventText(payload: Record<string, unknown>): string {
  if (typeof payload.text === 'string' && payload.text.trim()) return payload.text;
  try {
    return JSON.stringify(payload);
  } catch {
    return '[unavailable structured record]';
  }
}

function decisionLabel(decision: UniversityReviewDecision): string {
  if (decision === 'changes_requested') return 'Request changes';
  if (decision === 'approved_for_learning') return 'Approve for learning';
  return 'Approve for Candidate Knowledge consideration';
}

export default function UniversityReviewerPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const context = useQuery({
    queryKey: ['university-reviewer-context'],
    queryFn: universityReviewerApi.context,
    retry: false,
  });

  const authorized = Boolean(
    context.data?.science_review_allowed && context.data?.durable_sessions_enabled,
  );

  const queue = useQuery({
    queryKey: ['university-reviewer-queue'],
    queryFn: () => universityReviewerApi.queue(null, 20),
    enabled: authorized,
    retry: false,
  });

  const detail = useQuery({
    queryKey: ['university-reviewer-session', selectedId],
    queryFn: () => universityReviewerApi.session(selectedId!),
    enabled: authorized && Boolean(selectedId),
    retry: false,
  });

  const decisions = useMemo(
    () => (context.data ? allowedReviewerDecisions(context.data) : []),
    [context.data],
  );

  const decide = useMutation({
    mutationFn: (decision: UniversityReviewDecision) => {
      if (!detail.data) throw new Error('Select a submitted investigation first.');
      return universityReviewerApi.decide(detail.data.session_id, {
        reviewed_revision: detail.data.revision,
        decision,
        notes: notes.trim() || null,
      });
    },
    onSuccess: async (result) => {
      setMessage(
        result.decision === 'approved_for_candidate_knowledge_consideration'
          ? 'Review recorded for Candidate Knowledge consideration. No Candidate Knowledge promotion or publication was performed.'
          : 'Human review decision recorded.',
      );
      setNotes('');
      setSelectedId(null);
      await queue.refetch();
    },
    onError: (error) => setMessage(errorText(error)),
  });

  if (context.isLoading) return null;
  if (context.isError) {
    if (context.error instanceof UniversityApiError && context.error.status === 401) return null;
    return (
      <section className="rounded-2xl border border-red-300/25 bg-red-300/[0.05] p-6 text-sm text-red-100">
        Reviewer authority could not be verified. {errorText(context.error)}
      </section>
    );
  }
  if (!context.data) return null;

  if (!context.data.science_review_allowed) {
    return (
      <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.035] p-6 md:p-8">
        <div className="flex items-center gap-2 text-amber-100">
          <LockKeyhole className="h-4 w-4" />
          <h2 className="font-serif text-xl">Scientific reviewer workspace locked</h2>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/65">
          This Mission Control session is authenticated, but administrator status alone does not grant
          scientific-review authority. An explicit current scientific reviewer qualification is required.
        </p>
      </section>
    );
  }

  if (!context.data.durable_sessions_enabled) {
    return (
      <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.035] p-6 md:p-8">
        <div className="flex items-center gap-2 text-amber-100">
          <LockKeyhole className="h-4 w-4" />
          <h2 className="font-serif text-xl">Reviewer identity verified; durable review inactive</h2>
        </div>
        <p className="mt-3 text-sm text-white/65">
          Your scientific-review qualification is recognized, but the production durable University gate is not active.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-violet-300/25 bg-violet-300/[0.035] p-7 md:p-9">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-violet-100">
            <ClipboardCheck className="h-5 w-5" />
            <h2 className="font-serif text-2xl">Scientific reviewer workspace</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/65">
            Human review is governed by Mission Control qualifications. Learner identity does not confer reviewer authority.
          </p>
        </div>
        <div className="text-xs text-white/45">
          {context.data.qualifications.join(', ')}
        </div>
      </div>

      {queue.isLoading && <p className="mt-6 text-sm text-white/55">Loading submitted investigations…</p>}
      {queue.isError && <p className="mt-6 text-sm text-red-200">{errorText(queue.error)}</p>}

      {queue.data && queue.data.sessions.length === 0 && (
        <p className="mt-6 rounded-xl border border-white/10 p-5 text-sm text-white/55">
          No submitted investigations are awaiting review.
        </p>
      )}

      {queue.data && queue.data.sessions.length > 0 && (
        <div className="mt-6 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-2">
            {queue.data.sessions.map((item) => (
              <button
                key={item.session_id}
                type="button"
                onClick={() => {
                  setSelectedId(item.session_id);
                  setNotes('');
                  setMessage(null);
                }}
                className={`w-full rounded-xl border p-4 text-left ${
                  selectedId === item.session_id
                    ? 'border-violet-200/40 bg-violet-200/10'
                    : 'border-white/10 bg-black/10'
                }`}
              >
                <div className="text-sm text-white/85">Submitted investigation · revision {item.revision}</div>
                <div className="mt-1 text-xs text-white/45">{new Date(item.updated_at).toLocaleString()}</div>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/10 p-5">
            {!selectedId && <p className="text-sm text-white/55">Select an investigation to inspect its scientific record.</p>}
            {detail.isLoading && <p className="text-sm text-white/55">Loading scientific record…</p>}
            {detail.isError && <p className="text-sm text-red-200">{errorText(detail.error)}</p>}
            {detail.data && (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-xl text-white">Review revision {detail.data.revision}</h3>
                    <p className="mt-1 text-xs text-white/45">Actors are intentionally omitted from this reviewer view.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => detail.refetch()}
                    className="rounded-lg border border-white/10 p-2 text-white/60"
                    aria-label="Reload investigation"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>

                <div className="max-h-[28rem] space-y-3 overflow-auto pr-1">
                  {detail.data.events.map((event) => (
                    <article key={event.event_id} className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-violet-100/70">
                        {event.stage} · {event.event_type.replaceAll('_', ' ')} · rev {event.session_revision}
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/72">
                        {eventText(event.payload)}
                      </p>
                    </article>
                  ))}
                </div>

                {detail.data.review_history.length > 0 && (
                  <div className="border-t border-white/10 pt-4">
                    <h4 className="text-sm font-medium text-white/80">Prior review history</h4>
                    <div className="mt-2 space-y-2 text-xs text-white/55">
                      {detail.data.review_history.map((review, index) => (
                        <div key={`${review.created_at}-${index}`}>
                          {review.decision.replaceAll('_', ' ')} at revision {review.reviewed_revision}
                          {review.notes ? ` — ${review.notes}` : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t border-white/10 pt-4">
                  <label className="text-sm text-white/75">Reviewer notes</label>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={4}
                    placeholder="Record the scientific basis for the review decision…"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white outline-none placeholder:text-white/30"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {decisions.map((decision) => (
                      <button
                        key={decision}
                        type="button"
                        onClick={() => decide.mutate(decision)}
                        disabled={decide.isPending}
                        className="flex items-center gap-2 rounded-lg border border-violet-200/25 bg-violet-200/10 px-3 py-2 text-sm text-violet-50 disabled:opacity-50"
                      >
                        {decision === 'changes_requested' ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        {decisionLabel(decision)}
                      </button>
                    ))}
                  </div>
                  {message && <p className="mt-3 text-sm text-violet-100/80">{message}</p>}
                  <p className="mt-3 text-xs leading-relaxed text-white/45">
                    Candidate Knowledge consideration is not promotion. No review action in this workspace performs publication.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
