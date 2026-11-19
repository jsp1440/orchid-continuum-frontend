/**
 * ZooReviewWorkflow
 * -----------------
 * Reviewer-facing preview of the workflow for triaging citizen-science image
 * submissions. The PUBLIC frontend is intentionally read-only against the
 * live queue — agree/flag/skip actions here are local-only previews of the
 * reviewer interface that lives at:
 *
 *   POST /api/zoo/queue/{submission_id}/agree
 *   POST /api/zoo/queue/{submission_id}/flag
 *   POST /api/zoo/queue/{submission_id}/skip
 *
 * All real reviewer actions go through authenticated reviewer
 * interfaces (Zooniverse / curator console), never the public frontend.
 *
 * The component shows only what `GET /api/zoo/queue` returns:
 *   • live submissions, exactly as the API sent them;
 *   • "no submissions awaiting review" only for a confirmed empty list;
 *   • "live queue unavailable" for an outage, an unconfigured API or a
 *     malformed payload.
 * It never substitutes stand-in submissions, taxa or images. An earlier
 * version fell back to stock photographs labelled with real taxon names and
 * presented them as review submissions, which bound unverified images to taxa.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Flag,
  SkipForward,
  ShieldAlert,
  Info,
  Loader2,
  ImageIcon,
  ArrowRight,
  CloudOff,
  Inbox,
  RefreshCw,
} from 'lucide-react';
import { loadZooQueue, type ZooQueueItem, type ZooQueueState } from '@/lib/zoo';

type Decision = 'agree' | 'flag' | 'skip' | 'escalate';

type LoadState = { kind: 'loading' } | ZooQueueState;

const ZooReviewWorkflow: React.FC = () => {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [index, setIndex] = useState(0);
  const [confidence, setConfidence] = useState(70);
  const [history, setHistory] = useState<
    { id: string; decision: Decision; confidence: number }[]
  >([]);
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  useEffect(() => {
    const c = new AbortController();
    setState({ kind: 'loading' });
    setIndex(0);
    loadZooQueue(c.signal)
      .then(next => {
        if (!c.signal.aborted) setState(next);
      })
      .catch(() => {
        if (!c.signal.aborted) {
          setState({ kind: 'unavailable', reason: 'The review queue request failed.' });
        }
      });
    return () => c.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt(a => a + 1), []);

  const loading = state.kind === 'loading';
  const queue: ZooQueueItem[] = state.kind === 'present' ? state.items : [];
  const current = queue[index];
  const total = queue.length;
  const progress = useMemo(
    () => (total === 0 ? 0 : Math.round((index / total) * 100)),
    [index, total],
  );

  const decide = (decision: Decision) => {
    if (!current) return;
    setHistory(h => [
      { id: current.submission_id, decision, confidence },
      ...h,
    ]);
    setIndex(i => Math.min(i + 1, total));
    setConfidence(70);
  };

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
        <div>
          <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/80 mb-2">
            Reviewer Workflow · Preview
          </div>
          <h2 className="font-serif text-3xl md:text-4xl">
            Triage the review queue
          </h2>
          <p className="text-sm text-white/60 mt-2 max-w-2xl leading-relaxed">
            This is a public-facing preview of the reviewer interface.
            Decisions made here are local only — real curators authenticate
            into Zooniverse or the Continuum reviewer console, and their
            actions write through the Continuum API, never directly to
            third-party services.
          </p>
        </div>
        <span
          className={
            'text-[10px] tracking-[0.2em] uppercase px-2.5 py-1 rounded-full border ' +
            (state.kind === 'present' || state.kind === 'empty'
              ? 'border-emerald-300/40 text-emerald-200 bg-emerald-300/10'
              : state.kind === 'unavailable'
                ? 'border-amber-300/40 text-amber-100 bg-amber-300/10'
                : 'border-white/15 text-white/55 bg-white/5')
          }
          data-testid="zoo-queue-status"
        >
          {loading
            ? 'Loading queue…'
            : state.kind === 'unavailable'
              ? 'Live queue unavailable'
              : 'Live queue'}
        </span>
      </div>

      {loading && (
        <div className="rounded-2xl border border-white/10 bg-[#142a1f] p-8 flex items-center gap-3 text-white/60 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading review queue…
        </div>
      )}

      {state.kind === 'unavailable' && (
        <div
          role="status"
          data-testid="zoo-queue-unavailable"
          className="rounded-2xl border border-amber-300/30 bg-[#142a1f] p-10 text-center"
        >
          <CloudOff className="h-6 w-6 mx-auto text-amber-200/80 mb-3" />
          <div className="font-serif text-2xl mb-2">Live queue unavailable</div>
          <p className="text-sm text-white/60 max-w-xl mx-auto">
            The review queue could not be loaded from the Orchid Continuum API,
            so no submissions are shown. Nothing is substituted in their place.
          </p>
          <p className="text-xs text-white/45 mt-2">{state.reason}</p>
          <button
            onClick={retry}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 text-sm hover:bg-white/10 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      )}

      {state.kind === 'empty' && (
        <div
          role="status"
          data-testid="zoo-queue-empty"
          className="rounded-2xl border border-white/10 bg-[#142a1f] p-10 text-center"
        >
          <Inbox className="h-6 w-6 mx-auto text-emerald-200/80 mb-3" />
          <div className="font-serif text-2xl mb-2">No submissions awaiting review</div>
          <p className="text-sm text-white/60">
            The live queue responded and is empty right now.
          </p>
        </div>
      )}

      {state.kind === 'present' && current && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Image / submission card */}
          <div className="lg:col-span-7 rounded-2xl overflow-hidden border border-white/10 bg-[#142a1f]">
            <div className="aspect-[4/3] bg-[#0d1f17] flex items-center justify-center">
              {current.thumbnail_url ? (
                <img
                  src={current.thumbnail_url}
                  alt={current.proposed_taxon || 'submission'}
                  className="w-full h-full object-cover"
                  onError={e => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-white/40 text-xs tracking-[0.2em] uppercase">
                  <ImageIcon className="h-5 w-5" />
                  Image pending
                </div>
              )}
            </div>
            <div className="p-5 flex items-center justify-between">
              <div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-emerald-300/70">
                  Proposed taxon
                </div>
                <div className="font-serif text-xl italic mt-1">
                  {current.proposed_taxon || 'Unknown'}
                </div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-white/45 mt-2">
                  ID: {current.submission_id} ·{' '}
                  {current.review_state || 'pending'}
                </div>
              </div>
              <div className="text-xs text-white/50">
                {current.submitted_at &&
                  new Date(current.submitted_at).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Decision panel */}
          <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#142a1f] p-6 flex flex-col">
            <div className="text-xs tracking-[0.2em] uppercase text-emerald-300/80 mb-4">
              Reviewer decision
            </div>

            {/* Confidence */}
            <label className="block text-[10px] tracking-[0.2em] uppercase text-white/55 mb-2">
              Your confidence ({confidence}%)
              <Tooltip text="How sure are you that the submitted image matches the proposed taxon? Used to weight reviewer consensus." />
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={confidence}
              onChange={e => setConfidence(Number(e.target.value))}
              className="w-full accent-emerald-300"
            />

            {/* Notes */}
            <label className="block text-[10px] tracking-[0.2em] uppercase text-white/55 mt-5 mb-2">
              Notes (optional)
            </label>
            <textarea
              rows={3}
              value={notesById[current.submission_id] || ''}
              onChange={e =>
                setNotesById(n => ({
                  ...n,
                  [current.submission_id]: e.target.value,
                }))
              }
              placeholder="e.g. lip morphology consistent; column hood unclear…"
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm placeholder:text-white/35 focus:outline-none focus:border-emerald-300/60"
            />

            {/* Actions */}
            <div className="grid grid-cols-3 gap-2 mt-5">
              <ActionButton
                onClick={() => decide('agree')}
                tone="emerald"
                icon={<Check className="h-4 w-4" />}
                label="Agree"
                tip="Mark as a confirmed identification at your stated confidence."
              />
              <ActionButton
                onClick={() => decide('flag')}
                tone="amber"
                icon={<Flag className="h-4 w-4" />}
                label="Flag"
                tip="Mark as misidentified or low quality. Sends back to the queue."
              />
              <ActionButton
                onClick={() => decide('skip')}
                tone="neutral"
                icon={<SkipForward className="h-4 w-4" />}
                label="Skip"
                tip="Skip without weighing in — passes to another reviewer."
              />
            </div>

            <button
              onClick={() => decide('escalate')}
              className="mt-3 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-rose-300/40 bg-rose-300/10 text-rose-100 text-sm hover:bg-rose-300/20 transition-colors"
            >
              <ShieldAlert className="h-4 w-4" />
              Escalate to expert
              <Tooltip text="Route to a curator-level taxonomist. Placeholder until expert routing API is live." />
            </button>

            <div className="mt-auto pt-5 text-[10px] tracking-[0.2em] uppercase text-white/40">
              Progress: {index} / {total} · {progress}%
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-emerald-300 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {state.kind === 'present' && !current && (
        <div className="rounded-2xl border border-white/10 bg-[#142a1f] p-10 text-center">
          <div className="font-serif text-2xl mb-2">All loaded submissions triaged</div>
          <p className="text-sm text-white/60">
            You have worked through every submission loaded in this session.
            Your decisions stay local to this preview.
          </p>
          <button
            onClick={() => setIndex(0)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 text-sm hover:bg-white/10 transition-colors"
          >
            Start over
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="mt-8 rounded-2xl border border-white/10 bg-[#0a1812] p-5">
          <div className="text-xs tracking-[0.2em] uppercase text-emerald-300/80 mb-3">
            Your decisions this session (local only)
          </div>
          <ul className="divide-y divide-white/5">
            {history.slice(0, 8).map((h, i) => (
              <li
                key={i}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="text-white/70">{h.id}</span>
                <span
                  className={
                    'text-[10px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full ' +
                    decisionToneClass(h.decision)
                  }
                >
                  {h.decision}
                </span>
                <span className="text-white/50 text-xs tabular-nums">
                  {h.confidence}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const ActionButton: React.FC<{
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tip: string;
  tone: 'emerald' | 'amber' | 'neutral';
}> = ({ onClick, icon, label, tip, tone }) => {
  const tones: Record<string, string> = {
    emerald:
      'bg-emerald-300 text-[#0d1f17] hover:bg-emerald-200 border-emerald-300',
    amber:
      'bg-amber-300/15 text-amber-100 border-amber-300/40 hover:bg-amber-300/25',
    neutral:
      'bg-white/5 text-white/80 border-white/15 hover:bg-white/10',
  };
  return (
    <button
      onClick={onClick}
      title={tip}
      className={
        'inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-full border text-sm font-medium transition-colors ' +
        tones[tone]
      }
    >
      {icon}
      {label}
    </button>
  );
};

const Tooltip: React.FC<{ text: string }> = ({ text }) => (
  <span className="inline-flex relative group ml-1 align-middle">
    <Info className="h-3 w-3 text-white/40 group-hover:text-emerald-200 transition-colors" />
    <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+6px)] w-max max-w-[min(15rem,calc(100vw-2rem))] whitespace-normal text-[10px] tracking-normal normal-case px-2 py-1 rounded-md bg-black/85 text-white/85 opacity-0 group-hover:opacity-100 transition-opacity z-10">
      {text}
    </span>
  </span>
);

function decisionToneClass(d: Decision): string {
  switch (d) {
    case 'agree':
      return 'bg-emerald-300/15 border border-emerald-300/40 text-emerald-100';
    case 'flag':
      return 'bg-amber-300/15 border border-amber-300/40 text-amber-100';
    case 'escalate':
      return 'bg-rose-300/15 border border-rose-300/40 text-rose-100';
    default:
      return 'bg-white/5 border border-white/15 text-white/70';
  }
}

export default ZooReviewWorkflow;
