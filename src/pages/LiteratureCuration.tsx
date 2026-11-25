import { useCallback, useEffect, useState } from "react";
import PageShell from "@/components/orchid/PageShell";
import OwnerAccessCodeForm from "@/components/auth/OwnerAccessCodeForm";
import { validateOwnerSession } from "@/lib/ownerOperationsConsole";
import {
  AWARD_BASES,
  AWARD_BASIS_LABELS,
  CORRECTIONS,
  CORRECTION_LABELS,
  DECISIONS,
  DECISION_LABELS,
  LiteratureReviewError,
  VERDICTS,
  VERDICT_LABELS,
  describeReviewFailure,
  getCurationQueue,
  getCuratorReviewers,
  postAward,
  postCurationDecision,
  postSubmissionVerification,
  setRecognitionApproval,
  type AwardBasis,
  type CurationDecisionKind,
  type CurationQueueEntry,
  type CurationSubmission,
  type CuratorReviewer,
  type CuratorThresholds,
} from "@/lib/literatureReviewApi";

/**
 * /curation/literature — private curator view behind the existing Mission
 * Control owner sign-in (OwnerAccessCodeForm + the shared owner-session
 * transport). Reviewer contact details and individual answers appear here and
 * nowhere else. A curation decision is separate from reviews and writes no
 * knowledge-graph record.
 */

const field = "w-full rounded-md border border-white/15 bg-black/20 px-2 py-1 text-xs text-white";
const smallButton = "rounded-full border border-white/20 px-3 py-1 text-xs text-white/85 disabled:opacity-50";

type Session = "checking" | "signed_out" | "signed_in";

function Answer({ s }: { s: CurationSubmission }) {
  return (
    <dl className="grid gap-1 text-xs text-white/75">
      {s.verdict ? <div><dt className="inline text-white/45">Verdict: </dt><dd className="inline">{VERDICT_LABELS[s.verdict]}</dd></div> : null}
      {s.corrections.length ? (
        <div><dt className="inline text-white/45">Corrections: </dt><dd className="inline">{s.corrections.map((c) => CORRECTION_LABELS[c]).join(", ")}</dd></div>
      ) : null}
      {s.own_key_findings !== null ? (
        <div>
          <dt className="text-white/45">Own key findings {s.own_findings_before_reveal ? "(written before reveal)" : "(not before reveal)"}</dt>
          <dd className="whitespace-pre-wrap">{s.own_key_findings}</dd>
        </div>
      ) : null}
      {s.missed_findings ? <div><dt className="text-white/45">Missed findings</dt><dd className="whitespace-pre-wrap">{s.missed_findings}</dd></div> : null}
      {s.answer_changing_omissions ? (
        <div><dt className="text-white/45">Answer-changing omissions</dt><dd className="whitespace-pre-wrap">{s.answer_changing_omissions}</dd></div>
      ) : null}
      {s.not_sure ? <div className="text-amber-200">Marked not sure overall</div> : null}
      {s.explanation ? <div><dt className="text-white/45">Explanation</dt><dd className="whitespace-pre-wrap">{s.explanation}</dd></div> : null}
      {s.source_citation ? <div><dt className="inline text-white/45">Source: </dt><dd className="inline">{s.source_citation}</dd></div> : null}
    </dl>
  );
}

function Verification({ s, onDone }: { s: CurationSubmission; onDone: () => void }) {
  const [note, setNote] = useState(s.verification?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = async (counts: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await postSubmissionVerification(s.submission_id, { counts_toward_recognition: counts, note });
      onDone();
    } catch (cause) {
      setError(describeReviewFailure(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 grid gap-1 border-t border-white/10 pt-2" data-testid="verification">
      <p className="text-[11px] text-white/55">
        Counts toward recognition:{" "}
        {s.verification ? (s.verification.counts_toward_recognition ? "yes" : "no") : "not verified"}
        {s.verification?.verified_by ? ` · by ${s.verification.verified_by}` : ""}
      </p>
      <input className={field} placeholder="Verification note" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <button type="button" className={smallButton} disabled={busy} onClick={() => void set(true)}>Counts</button>
        <button type="button" className={smallButton} disabled={busy} onClick={() => void set(false)}>Does not count</button>
      </div>
      {error ? <p role="alert" className="text-[11px] text-amber-200">{error}</p> : null}
    </div>
  );
}

function DecisionForm({ entry, onDone }: { entry: CurationQueueEntry; onDone: () => void }) {
  const [decision, setDecision] = useState<CurationDecisionKind | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = entry.current_item_version ?? entry.item.item_version;
  const considered = entry.submissions.filter((s) => s.item_version === version).map((s) => s.submission_id);
  return (
    <form
      className="mt-3 grid gap-2 rounded-lg border border-white/10 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!decision) return;
        setBusy(true);
        setError(null);
        try {
          await postCurationDecision({ item_id: entry.item.item_id, item_version: version, decision, note, submission_ids: considered });
          setNote("");
          setDecision("");
          onDone();
        } catch (cause) {
          setError(describeReviewFailure(cause));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-xs font-semibold text-white">Curation decision for version {version}</p>
      <div className="flex flex-wrap gap-2">
        {DECISIONS.map((d) => (
          <label key={d} className="flex items-center gap-1 text-xs text-white/80">
            <input type="radio" name={`decision-${entry.item.item_id}`} checked={decision === d} onChange={() => setDecision(d)} />
            {DECISION_LABELS[d]}
          </label>
        ))}
      </div>
      <textarea className={field} rows={2} placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="text-[11px] text-white/45">Considers {considered.length} submission(s) on this version. No knowledge-graph record is written.</p>
      <button type="submit" className={smallButton} disabled={!decision || busy}>Record decision</button>
      {error ? <p role="alert" className="text-[11px] text-amber-200">{error}</p> : null}
    </form>
  );
}

function QueueEntry({ entry, onChanged }: { entry: CurationQueueEntry; onChanged: () => void }) {
  const { item } = entry;
  return (
    <li className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" data-testid="queue-entry">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
        {item.kind} · {item.item_id} · current version {entry.current_item_version ?? item.item_version}
        {entry.withdrawn ? " · withdrawn" : ""}
      </p>
      <p className="mt-1 text-sm text-white">{item.kind === "card" ? item.claim : item.paper_title}</p>
      <p className="text-xs text-white/50">{item.citation} · DOI {item.doi}</p>

      <div className="mt-3 grid gap-1 text-xs text-white/70" data-testid="agreement">
        {entry.agreement.map((v) => (
          <p key={v.item_version}>
            Version {v.item_version}: {v.submissions} submission(s) · <strong>{v.status.replace("_", " ")}</strong>
            {v.verdict_counts
              ? ` · ${VERDICTS.filter((k) => v.verdict_counts?.[k]).map((k) => `${VERDICT_LABELS[k]} ${v.verdict_counts?.[k]}`).join(", ")}`
              : ""}
            {CORRECTIONS.some((c) => v.corrections[c])
              ? ` · corrections: ${CORRECTIONS.filter((c) => v.corrections[c]).map((c) => `${CORRECTION_LABELS[c]} ${v.corrections[c]}`).join(", ")}`
              : ""}
          </p>
        ))}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {entry.submissions.map((s) => (
          <div key={s.submission_id} className="rounded-lg border border-white/10 p-3" data-testid="curation-submission">
            <p className="text-xs text-white">
              <strong>{s.reviewer_name}</strong> · {s.reviewer_email}
            </p>
            {s.reviewer_education_training ? <p className="text-[11px] text-white/50">{s.reviewer_education_training}</p> : null}
            <p className="text-[11px] text-white/45">
              {s.submitted_at} · version {s.item_version}
              {s.item_version_was_current === false ? " (not current when submitted)" : ""}
              {s.superseded_by_submission_id ? " · superseded by a later submission" : ""}
            </p>
            <div className="mt-2">
              <Answer s={s} />
            </div>
            <Verification s={s} onDone={onChanged} />
          </div>
        ))}
      </div>

      {entry.latest_decision ? (
        <p className="mt-3 text-xs text-emerald-100">
          Latest decision: {DECISION_LABELS[entry.latest_decision.decision]} by {entry.latest_decision.curator_principal} · {entry.latest_decision.decided_at}
          {entry.latest_decision.note ? ` — ${entry.latest_decision.note}` : ""}
        </p>
      ) : null}
      <DecisionForm entry={entry} onDone={onChanged} />
    </li>
  );
}

function ReviewerRow({ r, onChanged }: { r: CuratorReviewer; onChanged: () => void }) {
  const [basis, setBasis] = useState<AwardBasis>("paper_reviews");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (cause) {
      setError(describeReviewFailure(cause));
    } finally {
      setBusy(false);
    }
  };
  const p = r.progress;
  return (
    <li className="rounded-xl border border-white/10 p-4" data-testid="reviewer-row">
      <p className="text-sm text-white">
        <strong>{r.name}</strong> · {r.email}
      </p>
      {r.education_training ? <p className="text-xs text-white/50">{r.education_training}</p> : null}
      <p className="text-xs text-white/55">Future invitations: {r.future_invitations_opt_in ? "opted in" : "not opted in"}</p>
      <p className="mt-1 text-xs text-white/75">
        Verified paper reviews {p.paper_reviews.verified}/{p.paper_reviews.required}
        {p.paper_reviews.met ? " ✓" : ""} · verified claim reviews {p.claim_reviews.verified}/{p.claim_reviews.required}
        {p.claim_reviews.met ? " ✓" : ""}
        {p.pending_verification ? ` · ${p.pending_verification} awaiting verification` : ""}
      </p>
      {r.award ? (
        <p className="mt-1 text-xs text-emerald-100">
          Awarded {r.award.title} ({AWARD_BASIS_LABELS[r.award.basis]}) · {r.award.awarded_at}
        </p>
      ) : (
        <div className="mt-2 grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${field} w-auto`} value={basis} onChange={(e) => setBasis(e.target.value as AwardBasis)} aria-label="Award basis">
              {AWARD_BASES.map((b) => (
                <option key={b} value={b}>
                  {AWARD_BASIS_LABELS[b]}
                </option>
              ))}
            </select>
            <input className={`${field} w-auto flex-1`} placeholder={basis === "curator_equivalent" ? "Note (required)" : "Note"} value={note} onChange={(e) => setNote(e.target.value)} />
            <button
              type="button"
              className={smallButton}
              disabled={busy || (basis === "curator_equivalent" && !note.trim())}
              onClick={() => void act(() => postAward({ reviewer_id: r.reviewer_id, basis, note }))}
            >
              Award title
            </button>
          </div>
          <p className="text-[11px] text-white/45">Never automatic: this records your award and its basis.</p>
        </div>
      )}
      {r.recognition ? (
        <div className="mt-2 rounded-lg border border-white/10 p-2 text-xs text-white/75" data-testid="recognition-approval">
          <p>
            Public recognition: {r.recognition.consent ? "consented" : "not consented / withdrawn"} · {r.recognition.curator_approved ? "approved" : "not approved"}
          </p>
          {r.recognition.consent ? (
            <p className="mt-1">
              {r.recognition.display_name}
              {r.recognition.affiliation ? ` · ${r.recognition.affiliation}` : ""}
              {r.recognition.link ? ` · ${r.recognition.link}` : ""} — {r.recognition.description}
            </p>
          ) : null}
          <div className="mt-2 flex gap-2">
            <button type="button" className={smallButton} disabled={busy || !r.recognition.consent || r.recognition.curator_approved} onClick={() => void act(() => setRecognitionApproval(r.reviewer_id, "approve"))}>
              Approve public entry
            </button>
            <button type="button" className={smallButton} disabled={busy || !r.recognition.curator_approved} onClick={() => void act(() => setRecognitionApproval(r.reviewer_id, "revoke"))}>
              Revoke
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-1 text-xs text-amber-200">{error}</p> : null}
    </li>
  );
}

type Data =
  | { status: "loading" }
  | { status: "ok"; queue: CurationQueueEntry[]; reviewers: CuratorReviewer[]; thresholds: CuratorThresholds | null }
  | { status: "failed"; message: string };

function CurationConsole({ onSignedOut }: { onSignedOut: () => void }) {
  const [data, setData] = useState<Data>({ status: "loading" });
  const [tab, setTab] = useState<"queue" | "reviewers">("queue");

  const load = useCallback(() => {
    Promise.all([getCurationQueue(), getCuratorReviewers()])
      .then(([queue, rev]) => setData({ status: "ok", queue, reviewers: rev.reviewers, thresholds: rev.thresholds }))
      .catch((cause) => {
        if (cause instanceof LiteratureReviewError && cause.kind === "unauthorized") {
          onSignedOut();
          return;
        }
        setData({ status: "failed", message: describeReviewFailure(cause) });
      });
  }, [onSignedOut]);

  useEffect(() => load(), [load]);

  if (data.status === "loading") return <p className="text-sm text-white/60">Loading the curation queue…</p>;
  if (data.status === "failed")
    return (
      <p role="alert" className="rounded-xl border border-amber-300/30 bg-amber-300/[0.06] p-4 text-sm text-amber-100" data-testid="curation-error">
        {data.message}
      </p>
    );

  return (
    <div className="grid gap-4">
      <div className="flex gap-2" role="tablist" aria-label="Curation">
        <button type="button" role="tab" aria-selected={tab === "queue"} onClick={() => setTab("queue")} className={`rounded-full px-4 py-1.5 text-sm ${tab === "queue" ? "bg-white/15 text-white" : "text-white/60"}`}>
          Queue ({data.queue.length})
        </button>
        <button type="button" role="tab" aria-selected={tab === "reviewers"} onClick={() => setTab("reviewers")} className={`rounded-full px-4 py-1.5 text-sm ${tab === "reviewers" ? "bg-white/15 text-white" : "text-white/60"}`}>
          Reviewers ({data.reviewers.length})
        </button>
      </div>
      {tab === "queue" ? (
        data.queue.length === 0 ? (
          <p className="text-sm text-white/60">No items have submissions yet.</p>
        ) : (
          <ul className="grid gap-4">
            {data.queue.map((entry) => (
              <QueueEntry key={entry.item.item_id} entry={entry} onChanged={load} />
            ))}
          </ul>
        )
      ) : (
        <>
          {data.thresholds ? (
            <p className="text-xs text-white/55">
              Threshold: {data.thresholds.paper_reviews} verified substantive paper reviews, or {data.thresholds.claim_reviews} verified claim reviews with a
              source-based explanation, or an equivalent contribution you approve.
            </p>
          ) : null}
          <ul className="grid gap-3">
            {data.reviewers.map((r) => (
              <ReviewerRow key={r.reviewer_id} r={r} onChanged={load} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function LiteratureCuration({ checkSession = validateOwnerSession }: { checkSession?: typeof validateOwnerSession }) {
  const [session, setSession] = useState<Session>("checking");

  const verify = useCallback(() => {
    setSession("checking");
    checkSession()
      .then((s) => setSession(s.authenticated && s.token ? "signed_in" : "signed_out"))
      .catch(() => setSession("signed_out"));
  }, [checkSession]);

  useEffect(() => verify(), [verify]);
  const signedOut = useCallback(() => setSession("signed_out"), []);

  return (
    <PageShell eyebrow="Curators only" title="Literature review" titleAccent="curation." showDemoBanner={false}>
      <section className="py-10">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 lg:px-10">
          <p className="text-xs text-white/55">
            Reviewer contact details and individual answers are visible here only. Do not copy them elsewhere.
          </p>
          {session === "checking" ? <p className="text-sm text-white/60">Checking owner session…</p> : null}
          {session === "signed_out" ? (
            <OwnerAccessCodeForm
              idPrefix="literature-curation-owner"
              heading="Owner sign-in required"
              description="Curation uses the existing Mission Control owner session. Enter the owner access code."
              buttonLabel="Sign in"
              onSignedIn={verify}
            />
          ) : null}
          {session === "signed_in" ? <CurationConsole onSignedOut={signedOut} /> : null}
        </div>
      </section>
    </PageShell>
  );
}
