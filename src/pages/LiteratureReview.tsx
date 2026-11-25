import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import PageShell from "@/components/orchid/PageShell";
import ReviewDisclaimer from "@/components/literature-review/ReviewDisclaimer";
import MyContributions from "@/components/literature-review/MyContributions";
import {
  PURPOSE_TEXT,
  TOPICS,
  TOPIC_LABELS,
  topicLabel,
  LiteratureReviewError,
  clearReviewerToken,
  describeReviewFailure,
  getMe,
  listItems,
  readReviewerToken,
  reviewCardPath,
  reviewPaperPath,
  storeReviewerToken,
  type ReviewItem,
  type ReviewTopic,
} from "@/lib/literatureReviewApi";

type Load = { status: "loading" } | { status: "ok"; items: ReviewItem[] } | { status: "failed"; message: string };

function useItems(filter: { kind: "card" | "paper"; topic?: ReviewTopic }): Load {
  const [state, setState] = useState<Load>({ status: "loading" });
  const { kind, topic } = filter;
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    listItems({ kind, topic }, controller.signal)
      .then((items) => setState({ status: "ok", items }))
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setState({ status: "failed", message: describeReviewFailure(cause) });
      });
    return () => controller.abort();
  }, [kind, topic]);
  return state;
}

function LoadState({ state, empty }: { state: Load; empty: string }) {
  if (state.status === "loading") return <p className="text-sm text-white/60">Loading…</p>;
  if (state.status === "failed")
    return (
      <p role="alert" className="rounded-xl border border-amber-300/30 bg-amber-300/[0.06] p-4 text-sm text-amber-100" data-testid="review-load-error">
        {state.message}
      </p>
    );
  if (state.items.length === 0) return <p className="text-sm text-white/60">{empty}</p>;
  return null;
}

function ByPaper() {
  const state = useItems({ kind: "paper" });
  return (
    <div>
      <LoadState state={state} empty="No papers are open for review right now." />
      {state.status === "ok" ? (
        <ul className="grid gap-3">
          {state.items.map((item) => (
            <li key={item.item_id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <Link to={reviewPaperPath(item.doi)} className="font-serif text-lg text-white hover:text-emerald-200">
                {item.paper_title || item.doi}
              </Link>
              <p className="mt-1 text-xs text-white/55">{item.citation}</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                {topicLabel(item.topic)} · DOI {item.doi}
                {item.kind === "paper" ? ` · ${item.card_item_ids.length} extracted claims` : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ByTopic() {
  const [topic, setTopic] = useState<ReviewTopic>("mycorrhiza");
  const state = useItems({ kind: "card", topic });
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Topic">
        {TOPICS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={t === topic}
            onClick={() => setTopic(t)}
            className={`rounded-full border px-3 py-1 text-xs ${t === topic ? "border-emerald-300 bg-emerald-300/15 text-emerald-100" : "border-white/15 text-white/70"}`}
          >
            {TOPIC_LABELS[t]}
          </button>
        ))}
      </div>
      <LoadState state={state} empty="No claims are open for review in this topic right now." />
      {state.status === "ok" ? (
        <ul className="grid gap-3">
          {state.items.map((item) =>
            item.kind === "card" ? (
              <li key={item.item_id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <Link to={reviewCardPath(item.item_id)} className="text-sm text-white hover:text-emerald-200">
                  {item.claim}
                </Link>
                <p className="mt-1 text-xs text-white/50">{item.citation || item.paper_title}</p>
              </li>
            ) : null,
          )}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * A pasted key is checked with GET /me before it is stored, so a mistyped or
 * revoked key never becomes this browser's identity.
 */
function UseExistingKey({ onUse, check = getMe }: { onUse: (token: string) => void; check?: typeof getMe }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const key = value.trim();
    setValue("");
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      await check(key);
      onUse(key);
    } catch (cause) {
      setError(
        cause instanceof LiteratureReviewError && cause.kind === "unauthorized"
          ? "That reviewer key was not recognised. Nothing was saved."
          : describeReviewFailure(cause),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/70">
      <label htmlFor="existing-reviewer-key">Reviewed before on another device? Enter your reviewer key:</label>
      <input
        id="existing-reviewer-key"
        type="password"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="min-w-[12rem] flex-1 rounded-md border border-white/15 bg-black/20 px-2 py-1 text-white"
      />
      <button type="submit" disabled={busy} className="rounded-full border border-white/20 px-3 py-1 disabled:opacity-50">
        {busy ? "Checking…" : "Use key"}
      </button>
      {error ? (
        <p role="alert" className="w-full text-amber-200" data-testid="use-key-error">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export default function LiteratureReview() {
  const [mode, setMode] = useState<"paper" | "topic">("paper");
  const [token, setToken] = useState<string | null>(() => readReviewerToken());

  return (
    <PageShell
      eyebrow="Calyx literature review"
      title="Review"
      titleAccent="what Calyx read."
      intro={`Reviewers ${PURPOSE_TEXT}. Pick a paper to close-read, or check individual extracted claims by topic.`}
      showDemoBanner={false}
    >
      <section className="py-10">
        <div className="mx-auto grid max-w-4xl gap-8 px-6 lg:px-10">
          <ReviewDisclaimer showPurpose />

          <div className="text-sm text-white/70">
            Each claim and each paper can be submitted on its own; there is no minimum. Your answers are seen only by Orchid Continuum curators.{" "}
            <Link to="/contributors" className="underline">
              See recognised contributors
            </Link>
            .
          </div>

          <div>
            <div className="mb-4 flex gap-2" role="tablist" aria-label="Browse">
              <button type="button" role="tab" aria-selected={mode === "paper"} onClick={() => setMode("paper")} className={`rounded-full px-4 py-1.5 text-sm ${mode === "paper" ? "bg-white/15 text-white" : "text-white/60"}`}>
                By paper
              </button>
              <button type="button" role="tab" aria-selected={mode === "topic"} onClick={() => setMode("topic")} className={`rounded-full px-4 py-1.5 text-sm ${mode === "topic" ? "bg-white/15 text-white" : "text-white/60"}`}>
                By topic
              </button>
            </div>
            {mode === "paper" ? <ByPaper /> : <ByTopic />}
          </div>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="my-contributions-heading">
            <h2 id="my-contributions-heading" className="font-serif text-2xl text-white">
              My contributions
            </h2>
            {token ? (
              <div className="mt-3">
                <MyContributions
                  token={token}
                  onForget={() => {
                    clearReviewerToken();
                    setToken(null);
                  }}
                />
              </div>
            ) : (
              <>
                <p className="mt-2 text-sm text-white/60">
                  Your progress appears here after your first submission. You will be asked for your name and email once, when you first submit.
                </p>
                <UseExistingKey
                  onUse={(key) => {
                    storeReviewerToken(key);
                    setToken(key);
                  }}
                />
              </>
            )}
          </section>
        </div>
      </section>
    </PageShell>
  );
}
