import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, FileWarning } from 'lucide-react';

import PageShell from '@/components/orchid/PageShell';
import {
  LITERATURE_PAGE_SIZE,
  LiteratureIndexError,
  fetchLiteratureIndex,
  hasMore,
  type LiteratureIndexResponse,
  type LiteratureSummary,
} from '@/lib/literatureIndex';

/**
 * What the literature corpus actually holds.
 *
 * This route rendered ComingSoon for a long time, and the reason was real: the
 * backend could return a paper by id and nothing could learn which ids
 * existed, so any index would have been invented. The discovery contract now
 * exists, so this shows the corpus rather than a promise.
 *
 * It shows identity and counts, which is all a list response carries. Section
 * text, claims and evidence have their own display policies and are not in
 * this payload — a reader who wants content opens the paper, where that policy
 * already applies.
 *
 * The failure states matter more than the happy path. An empty corpus, an
 * unreachable service, and a session without permission look identical if you
 * render them all as "nothing here", and only one of those means the Continuum
 * holds no literature.
 */

type State =
  | { status: 'loading' }
  | { status: 'loaded'; response: LiteratureIndexResponse }
  | { status: 'failed'; error: LiteratureIndexError };

function PaperRow({ paper }: { paper: LiteratureSummary }) {
  if (!paper.readable) {
    // Reported rather than hidden: an extraction that cannot be read is part
    // of the corpus, and omitting it would make the corpus look smaller.
    return (
      <li className="rounded-xl border border-amber-300/30 bg-amber-300/[0.05] p-4">
        <div className="flex items-center gap-2 text-sm text-amber-100">
          <FileWarning className="h-4 w-4" />
          {paper.paper_id}
        </div>
        <p className="mt-1 text-xs text-white/55">
          This extraction record could not be read
          {paper.reason ? ` (${paper.reason.toLowerCase().replace(/_/g, ' ')})` : ''}. It is shown
          because a damaged record is part of the corpus — leaving it out would misreport what the
          Continuum holds.
        </p>
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="font-serif text-lg text-white">{paper.title ?? 'Untitled extraction'}</h3>
      <p className="mt-1 text-xs text-white/50">
        {paper.authors?.length ? paper.authors.join(', ') : 'Authors not recorded'}
        {paper.journal ? ` · ${paper.journal}` : ''}
        {paper.publication_year ? ` · ${paper.publication_year}` : ''}
      </p>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
        {paper.claim_count ?? 0} claims · {paper.evidence_count ?? 0} evidence ·{' '}
        {paper.review_decision_count ?? 0} review decisions
      </p>
      <p className="mt-1 font-mono text-[10px] text-white/30">{paper.paper_id}</p>
    </li>
  );
}

export default function Literature() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [offset, setOffset] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (nextOffset: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'loading' });
    try {
      const response = await fetchLiteratureIndex({
        limit: LITERATURE_PAGE_SIZE,
        offset: nextOffset,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setState({ status: 'loaded', response });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setState({
        status: 'failed',
        error:
          cause instanceof LiteratureIndexError
            ? cause
            : new LiteratureIndexError('network', 'The literature corpus could not be loaded.'),
      });
    }
  }, []);

  useEffect(() => {
    void load(offset);
    return () => abortRef.current?.abort();
  }, [load, offset]);

  const loaded = state.status === 'loaded' ? state.response : null;

  return (
    <PageShell
      eyebrow="Evidence"
      title="Literature"
      titleAccent="what the corpus holds."
      intro="Extraction results in the Continuum's literature store, with the claims and evidence each one yielded."
      heroAside={
        <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/5 p-5">
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-emerald-300/80">
            <BookOpen className="h-3 w-3" /> Identity and counts
          </div>
          <p className="text-xs leading-relaxed text-white/65">
            This index lists what exists and how much each extraction yielded. Section text, claims
            and evidence carry their own display policies and are not released here — open a paper
            to read its content under that policy.
          </p>
        </div>
      }
    >
      <section className="py-10">
        <div className="mx-auto max-w-4xl px-6 lg:px-10">
          {state.status === 'loading' ? (
            <p className="text-sm text-white/60">Loading the literature index…</p>
          ) : null}

          {state.status === 'failed' ? (
            <div
              className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] p-5"
              data-testid="literature-error"
            >
              <div className="flex items-center gap-2 text-sm text-amber-100">
                <AlertTriangle className="h-4 w-4" />
                {state.error.kind === 'unauthorized'
                  ? 'Not authorised to browse the literature corpus'
                  : state.error.kind === 'unavailable'
                    ? 'The literature corpus is unavailable'
                    : state.error.kind === 'rejected'
                      ? 'The literature service rejected the request'
                      : 'The literature index could not be loaded'}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-white/65">{state.error.message}</p>
              {/* The line that stops an outage reading as an empty corpus. */}
              <p className="mt-1 text-xs leading-relaxed text-white/50">
                This says nothing about how much literature the Continuum holds. It is a statement
                about reaching the index, not about the corpus.
              </p>
              {state.error.retryable ? (
                <button
                  type="button"
                  onClick={() => void load(offset)}
                  className="mt-3 rounded-full border border-white/20 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/70"
                >
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}

          {loaded ? (
            loaded.total === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 p-5" data-testid="literature-empty">
                <p className="text-sm text-white/70">
                  The literature store is reachable and holds no extraction results yet.
                </p>
                <p className="mt-1 text-xs text-white/45">
                  This is an empty corpus, not a failure to read it.
                </p>
              </div>
            ) : (
              <>
                <p className="mb-4 text-xs text-white/50" data-testid="literature-count">
                  Showing {loaded.papers.length} of {loaded.total}
                  {loaded.unreadable_count > 0
                    ? ` · ${loaded.unreadable_count} record${loaded.unreadable_count === 1 ? '' : 's'} on this page could not be read`
                    : ''}
                </p>
                <ul className="space-y-3" data-testid="literature-list">
                  {loaded.papers.map((paper) => (
                    <PaperRow key={paper.paper_id} paper={paper} />
                  ))}
                </ul>

                <div className="mt-6 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={loaded.offset === 0}
                    onClick={() => setOffset(Math.max(0, loaded.offset - LITERATURE_PAGE_SIZE))}
                    className="rounded-full border border-white/15 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/70 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!hasMore(loaded)}
                    onClick={() => setOffset(loaded.offset + LITERATURE_PAGE_SIZE)}
                    className="rounded-full border border-white/15 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/70 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </>
            )
          ) : null}
        </div>
      </section>
    </PageShell>
  );
}
