import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PageShell from "@/components/orchid/PageShell";
import ReviewDisclaimer from "@/components/literature-review/ReviewDisclaimer";
import { CloseReadGate, PaperReviewForm } from "@/components/literature-review/ReviewForms";
import { EMPTY_PAPER_DRAFT, type PaperDraft } from "@/components/literature-review/reviewDraftModel";
import { useReviewerIdentity } from "@/components/literature-review/useReviewerIdentity";
import { DRAFT_STATUS_LABEL, useReviewDraft } from "@/lib/literatureReviewDrafts";
import {
  TOPIC_LABELS,
  describeReviewFailure,
  listItems,
  reviewCardPath,
  submitPaperReview,
  type CardItem,
  type PaperItem,
} from "@/lib/literatureReviewApi";

type Load<T> = { status: "loading" } | { status: "ok"; value: T } | { status: "failed"; message: string };

/**
 * The extracted claims for a paper. Mounted only after the close-read step is
 * saved or skipped, so nothing is fetched before then.
 */
function RevealedCards({ doi }: { doi: string }) {
  const [state, setState] = useState<Load<CardItem[]>>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    listItems({ kind: "card", doi }, controller.signal)
      .then((items) => setState({ status: "ok", value: items.filter((i): i is CardItem => i.kind === "card") }))
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setState({ status: "failed", message: describeReviewFailure(cause) });
      });
    return () => controller.abort();
  }, [doi]);

  if (state.status === "loading") return <p className="text-sm text-white/60">Loading the extracted claims…</p>;
  if (state.status === "failed") return <p role="alert" className="text-sm text-amber-200">{state.message}</p>;
  return (
    <section className="rounded-2xl border border-white/10 p-5" data-testid="revealed-cards">
      <h2 className="font-serif text-xl text-white">What was extracted from this paper</h2>
      <p className="mt-1 text-xs text-white/55">Each claim can be reviewed on its own page and submitted separately.</p>
      {state.value.length === 0 ? <p className="mt-3 text-sm text-white/60">No extracted claims are open for review for this paper.</p> : null}
      <ul className="mt-3 grid gap-2">
        {state.value.map((card) => (
          <li key={card.item_id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white/85">
            <p>{card.claim}</p>
            <Link to={reviewCardPath(card.item_id)} className="mt-1 inline-block text-xs text-emerald-200 underline">
              Review this claim
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** /review/paper/:doi — close-read: own key findings first, then reveal, then the paper form. */
export default function LiteratureReviewPaper() {
  const { doi = "" } = useParams();
  const [load, setLoad] = useState<Load<PaperItem>>({ status: "loading" });
  const identity = useReviewerIdentity();
  const { draft, setDraft, status, loaded } = useReviewDraft<PaperDraft>(
    load.status === "ok" ? load.value.item_id : null,
    identity.token,
    EMPTY_PAPER_DRAFT,
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ status: "loading" });
    listItems({ kind: "paper", doi }, controller.signal)
      .then((items) => {
        const paper = items.find((i): i is PaperItem => i.kind === "paper");
        setLoad(paper ? { status: "ok", value: paper } : { status: "failed", message: "This paper is not open for review." });
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setLoad({ status: "failed", message: describeReviewFailure(cause) });
      });
    return () => controller.abort();
  }, [doi]);

  return (
    <PageShell eyebrow="Calyx literature review" title="Close-read a paper" showDemoBanner={false}>
      <section className="py-10">
        <div className="mx-auto grid max-w-3xl gap-6 px-6 lg:px-10">
          <ReviewDisclaimer />
          <Link to="/review" className="text-xs text-white/60 underline">
            Back to review home
          </Link>
          {load.status === "loading" ? <p className="text-sm text-white/60">Loading the paper…</p> : null}
          {load.status === "failed" ? (
            <p role="alert" className="rounded-xl border border-amber-300/30 bg-amber-300/[0.06] p-4 text-sm text-amber-100" data-testid="review-load-error">
              {load.message}
            </p>
          ) : null}
          {load.status === "ok" ? (
            <>
              <header className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h2 className="font-serif text-2xl text-white">{load.value.paper_title || load.value.doi}</h2>
                <p className="mt-1 text-sm text-white/65">{load.value.citation}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                  {TOPIC_LABELS[load.value.topic]} · DOI {load.value.doi} · version {load.value.item_version}
                </p>
                {load.value.input_note ? <p className="mt-2 text-xs text-white/55">What the extractor read: {load.value.input_note}</p> : null}
              </header>
              {identity.tokenNotice}
              {loaded ? (
                <CloseReadGate value={draft} onChange={setDraft}>
                  <div className="grid gap-6">
                    <RevealedCards doi={load.value.doi} />
                    <PaperReviewForm
                      value={draft}
                      onChange={setDraft}
                      state={identity.state}
                      onSubmit={(input) => identity.submit((token, website) => submitPaperReview(token, load.value, input, website))}
                    />
                  </div>
                </CloseReadGate>
              ) : (
                <p className="text-sm text-white/60">Loading your draft…</p>
              )}
              {DRAFT_STATUS_LABEL[status] && status !== "loading" ? <p className="text-xs text-white/40">{DRAFT_STATUS_LABEL[status]}</p> : null}
              {identity.dialog}
            </>
          ) : null}
        </div>
      </section>
    </PageShell>
  );
}
