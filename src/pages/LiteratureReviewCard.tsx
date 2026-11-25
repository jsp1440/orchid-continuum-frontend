import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PageShell from "@/components/orchid/PageShell";
import ReviewDisclaimer from "@/components/literature-review/ReviewDisclaimer";
import { CardItemView, CardReviewForm } from "@/components/literature-review/ReviewForms";
import { EMPTY_CARD_DRAFT, type CardDraft } from "@/components/literature-review/reviewDraftModel";
import { useReviewerIdentity } from "@/components/literature-review/useReviewerIdentity";
import { DRAFT_STATUS_LABEL, useReviewDraft } from "@/lib/literatureReviewDrafts";
import { describeReviewFailure, getItem, submitCardReview, type CardItem } from "@/lib/literatureReviewApi";

type Load = { status: "loading" } | { status: "ok"; item: CardItem } | { status: "failed"; message: string };

/** /review/card/:itemId — one extracted claim, independently submittable. */
export default function LiteratureReviewCard() {
  const { itemId = "" } = useParams();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const identity = useReviewerIdentity();
  const { draft, setDraft, status } = useReviewDraft<CardDraft>(load.status === "ok" ? load.item.item_id : null, identity.token, EMPTY_CARD_DRAFT);

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ status: "loading" });
    getItem(itemId, controller.signal)
      .then((item) => {
        if (item.kind !== "card") setLoad({ status: "failed", message: "That address is not a claim card." });
        else setLoad({ status: "ok", item });
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setLoad({ status: "failed", message: describeReviewFailure(cause) });
      });
    return () => controller.abort();
  }, [itemId]);

  return (
    <PageShell eyebrow="Calyx literature review" title="Review a claim" showDemoBanner={false}>
      <section className="py-10">
        <div className="mx-auto grid max-w-3xl gap-6 px-6 lg:px-10">
          <ReviewDisclaimer />
          <Link to="/review" className="text-xs text-white/60 underline">
            Back to review home
          </Link>
          {load.status === "loading" ? <p className="text-sm text-white/60">Loading the claim…</p> : null}
          {load.status === "failed" ? (
            <p role="alert" className="rounded-xl border border-amber-300/30 bg-amber-300/[0.06] p-4 text-sm text-amber-100" data-testid="review-load-error">
              {load.message}
            </p>
          ) : null}
          {load.status === "ok" ? (
            <>
              <CardItemView item={load.item} />
              {identity.tokenNotice}
              <CardReviewForm
                value={draft}
                onChange={setDraft}
                state={identity.state}
                onSubmit={(input) => identity.submit((token, website) => submitCardReview(token, load.item, input, website))}
              />
              {DRAFT_STATUS_LABEL[status] ? <p className="text-xs text-white/40">{DRAFT_STATUS_LABEL[status]}</p> : null}
              {identity.dialog}
            </>
          ) : null}
        </div>
      </section>
    </PageShell>
  );
}
