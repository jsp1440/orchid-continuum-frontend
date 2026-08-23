import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, EyeOff, Lock, ShieldCheck } from 'lucide-react';

import PageShell from '@/components/orchid/PageShell';
import {
  LiteraturePaperError,
  classifyClaimEvidence,
  fetchLiteraturePaper,
  isMachineAuthored,
  isReviewed,
  type LiteraturePaperView,
  type PaperClaim,
} from '@/lib/literaturePaper';
import { describeWithheld, releaseText } from '@/lib/literatureDisplayPolicy';

/**
 * One extracted paper.
 *
 * THE ORGANISING RULE: the paper's SHAPE is disclosable, the paper's WORDS are
 * not. How many claims an extraction produced, what kinds they are, which
 * extractor produced them, whether a human reviewed them, and which evidence
 * supports or contradicts which claim — these are facts about the extraction.
 * The abstract, the section text and the verbatim excerpts are somebody else's
 * expression, and whether they may be shown is decided by the canonical source
 * binding, not by this page.
 *
 * That line is why a paper with no binding still has something worth reading
 * here. Withholding text does not mean withholding the account of what the
 * Continuum learned from the source.
 *
 * FOUR THINGS THIS PAGE REFUSES TO CONFLATE
 *
 *   recorded / reviewed — a claim's default review_status is "unreviewed", and
 *   an extraction pipeline running to completion reviews nothing.
 *
 *   extracted-by-a-model / stated-by-the-paper — a model_extracted claim is the
 *   extractor's reading. Rendering it in the paper's voice attributes to the
 *   authors something they may not have written.
 *
 *   associated / supporting — a claim's evidence_ids is a pointer. Evidence
 *   that supports the claim says so in supports_ids. The gap between those two
 *   is displayed rather than closed.
 *
 *   withheld / absent — a section that may not be shown and a section that does
 *   not exist both render as nothing unless each is rendered as itself.
 */

type State =
  | { status: 'loading' }
  | { status: 'loaded'; view: LiteraturePaperView }
  | { status: 'failed'; error: LiteraturePaperError };

function Withheld({ reason }: { reason: Parameters<typeof describeWithheld>[0] }) {
  return (
    <div
      className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
      data-testid="withheld-text"
      data-withheld-reason={reason}
    >
      <div className="flex items-center gap-2 text-xs text-white/60">
        {reason === 'absent' ? <EyeOff className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
        {reason === 'absent' ? 'Nothing extracted' : 'Text withheld'}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-white/45">{describeWithheld(reason)}</p>
    </div>
  );
}

function GatedText({
  label,
  text,
  binding,
}: {
  label: string;
  text: string | null | undefined;
  binding: LiteraturePaperView['binding'];
}) {
  const release = releaseText(text, binding);
  return (
    <div className="mt-4">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">{label}</h3>
      <div className="mt-2">
        {release.released ? (
          <>
            <p className="text-sm leading-relaxed text-white/75" data-testid="released-text">
              {release.text}
              {release.truncated ? '…' : ''}
            </p>
            {release.truncated ? (
              <p className="mt-1 text-[11px] text-white/40">
                Preview only — the source binding permits a limited preview, so this is truncated
                rather than complete.
              </p>
            ) : null}
          </>
        ) : (
          <Withheld reason={release.reason} />
        )}
      </div>
    </div>
  );
}

function ClaimCard({ claim, view }: { claim: PaperClaim; view: LiteraturePaperView }) {
  const relation = classifyClaimEvidence(claim, view.paper.evidence);
  const machine = isMachineAuthored(claim);
  const reviewed = isReviewed(claim);
  const statement = releaseText(claim.statement, view.binding);

  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.03] p-4" data-testid="claim-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-white/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/55">
          {claim.claim_type ?? 'unclassified'}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
            machine ? 'bg-amber-300/15 text-amber-100' : 'bg-white/10 text-white/60'
          }`}
          data-testid="claim-origin"
        >
          {machine ? 'Machine-extracted' : (claim.provenance?.method ?? 'origin not recorded')}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
            reviewed ? 'bg-emerald-300/15 text-emerald-100' : 'bg-white/10 text-white/60'
          }`}
          data-testid="claim-review"
        >
          {reviewed ? `Reviewed · ${claim.provenance?.review_status}` : 'Not reviewed'}
        </span>
      </div>

      {statement.released ? (
        <p className="mt-3 text-sm leading-relaxed text-white/80">
          {statement.text}
          {statement.truncated ? '…' : ''}
        </p>
      ) : (
        <div className="mt-3">
          <Withheld reason={statement.reason} />
        </div>
      )}

      {machine ? (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-100/70" data-testid="machine-caveat">
          This statement is the extractor's reading of the source, not a quotation of it and not a
          verified finding. Model output is not evidence.
        </p>
      ) : null}

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center" data-testid="claim-evidence-relation">
        <div className="rounded-lg bg-white/[0.04] p-2">
          <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/40">Supports</dt>
          <dd className="text-sm text-white/80">{relation.supporting.length}</dd>
        </div>
        <div className="rounded-lg bg-white/[0.04] p-2">
          <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/40">
            Contradicts
          </dt>
          <dd className="text-sm text-white/80">{relation.contradicting.length}</dd>
        </div>
        <div className="rounded-lg bg-white/[0.04] p-2">
          <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/40">
            Associated only
          </dt>
          <dd className="text-sm text-white/80">{relation.associatedOnly.length}</dd>
        </div>
      </dl>
      {relation.associatedOnly.length > 0 ? (
        <p className="mt-2 text-[11px] leading-relaxed text-white/45" data-testid="association-caveat">
          {relation.associatedOnly.length} evidence{' '}
          {relation.associatedOnly.length === 1 ? 'item is' : 'items are'} linked to this claim
          without the extraction saying whether {relation.associatedOnly.length === 1 ? 'it' : 'they'}{' '}
          support or contradict it. Association is not support.
        </p>
      ) : null}
      {relation.contradicting.length > 0 ? (
        <p className="mt-1 text-[11px] leading-relaxed text-amber-100/70" data-testid="contradiction-caveat">
          This claim has contradicting evidence in the same paper.
        </p>
      ) : null}
    </li>
  );
}

export default function LiteraturePaper() {
  const { paperId = '' } = useParams<{ paperId: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'loading' });
    try {
      const view = await fetchLiteraturePaper(paperId, { signal: controller.signal });
      if (!controller.signal.aborted) setState({ status: 'loaded', view });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setState({
        status: 'failed',
        error:
          cause instanceof LiteraturePaperError
            ? cause
            : new LiteraturePaperError('network', 'This extraction could not be loaded.'),
      });
    }
  }, [paperId]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const view = state.status === 'loaded' ? state.view : null;
  const metadata = view?.paper.metadata;
  const stripped = view?.localityFieldsWithheld ?? 0;

  return (
    <PageShell
      eyebrow="Evidence"
      title={metadata?.title ?? 'Extraction'}
      titleAccent="what was learned, and what may be shown."
      intro="An extracted paper, its claims, and the evidence relations the extraction recorded."
      heroAside={
        <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/5 p-5">
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-emerald-300/80">
            <ShieldCheck className="h-3 w-3" /> Display policy
          </div>
          <p className="text-xs leading-relaxed text-white/65" data-testid="policy-summary">
            {view === null
              ? 'Loading the source binding…'
              : view.bindingStatus === 'present'
                ? `This source is bound with the policy ${String(view.binding?.display_policy ?? 'unrecognised')}. Text is released only as far as that policy allows.`
                : view.bindingStatus === 'absent'
                  ? 'This paper has no canonical source binding, so no display permission has been established. Its text is withheld — an unrecorded permission is not an unrestricted one.'
                  : 'The source binding could not be read, so no display permission can be honoured. Text is withheld rather than guessed.'}
          </p>
        </div>
      }
    >
      <section className="py-10">
        <div className="mx-auto max-w-4xl px-6 lg:px-10">
          <Link
            to="/literature"
            className="mb-6 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/50 hover:text-white/80"
          >
            <ArrowLeft className="h-3 w-3" /> All literature
          </Link>

          {state.status === 'loading' ? (
            <p className="text-sm text-white/60">Loading this extraction…</p>
          ) : null}

          {state.status === 'failed' ? (
            <div
              className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] p-5"
              data-testid="paper-error"
            >
              <div className="flex items-center gap-2 text-sm text-amber-100">
                <AlertTriangle className="h-4 w-4" />
                {state.error.kind === 'unauthorized'
                  ? 'Not authorised to read this extraction'
                  : state.error.kind === 'not_found'
                    ? 'No extraction is stored under this identifier'
                    : state.error.kind === 'unavailable'
                      ? 'The literature service is unavailable'
                      : 'This extraction could not be loaded'}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-white/65">{state.error.message}</p>
              {state.error.kind !== 'not_found' ? (
                <p className="mt-1 text-xs leading-relaxed text-white/50">
                  This says nothing about what the extraction contains. It is a statement about
                  reaching it.
                </p>
              ) : null}
              {state.error.retryable ? (
                <button
                  type="button"
                  onClick={() => void load()}
                  className="mt-3 rounded-full border border-white/20 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/70"
                >
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}

          {view ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-xs text-white/50">
                  {metadata?.authors?.length ? metadata.authors.join(', ') : 'Authors not recorded'}
                  {metadata?.journal ? ` · ${metadata.journal}` : ''}
                  {metadata?.publication_year ? ` · ${metadata.publication_year}` : ''}
                </p>
                <p className="mt-1 font-mono text-[10px] text-white/30">{view.paper.paper_id}</p>
                <GatedText label="Abstract" text={metadata?.abstract} binding={view.binding} />
              </div>

              {stripped > 0 ? (
                <div
                  className="mt-6 rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.05] p-4"
                  data-testid="locality-withheld"
                >
                  <div className="flex items-center gap-2 text-xs text-emerald-100">
                    <ShieldCheck className="h-3.5 w-3.5" /> Protected locality withheld
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-white/55">
                    This extraction carries site data on {stripped} recorded{' '}
                    {stripped === 1 ? 'field' : 'fields'}. Precise localities for orchid taxa are a
                    collection risk and are removed before this page receives the record.
                  </p>
                </div>
              ) : null}

              <div className="mt-8">
                <h2 className="font-serif text-xl text-white">
                  Claims ({view.paper.claims?.length ?? 0})
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-white/50">
                  Extracted claims are what the extraction recorded, not findings the Continuum has
                  verified. Their review status and origin are shown on each.
                </p>
                {view.paper.claims?.length ? (
                  <ul className="mt-4 space-y-3" data-testid="claim-list">
                    {view.paper.claims.map((claim) => (
                      <ClaimCard key={claim.claim_id} claim={claim} view={view} />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm text-white/55" data-testid="no-claims">
                    This extraction recorded no claims.
                  </p>
                )}
              </div>

              <div className="mt-8">
                <h2 className="font-serif text-xl text-white">
                  Sections ({view.paper.sections?.length ?? 0})
                </h2>
                {view.paper.sections?.length ? (
                  <div className="mt-4 space-y-4" data-testid="section-list">
                    {view.paper.sections.map((section) => (
                      <div
                        key={section.section_id}
                        className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
                      >
                        <GatedText
                          label={section.heading ?? section.canonical_type ?? section.section_id}
                          text={section.text}
                          binding={view.binding}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-white/55">No sections were extracted.</p>
                )}
              </div>
            </>
          ) : null}
        </div>
      </section>
    </PageShell>
  );
}
