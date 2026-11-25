import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  AUTHORSHIP_NOTE,
  AWARD_BASIS_LABELS,
  CONTRIBUTOR_TITLE,
  RECOGNITION_DESCRIPTION_MAX,
  RESUME_WORDING,
  contributorPath,
  describeReviewFailure,
  getMe,
  isHttpsUrl,
  updatePreferences,
  updateRecognition,
  type MyProfile,
  type RecognitionInput,
  type RecognitionState,
} from "@/lib/literatureReviewApi";

const fieldClass =
  "w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-emerald-300/50 focus:outline-none";

function ProgressBar({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-white/70">
        <span>{label}</span>
        <span>
          {value} of {target}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-white/10" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={target} aria-label={label}>
        <div className="h-2 rounded-full bg-emerald-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * Public recognition consent — offered only after a curator awards the title.
 * Separate from (and never bundled with) the future-invitations opt-in.
 */
export function RecognitionConsentForm({
  existing,
  onSave,
}: {
  existing: RecognitionState | null;
  onSave: (input: RecognitionInput) => Promise<void>;
}) {
  const [consent, setConsent] = useState(existing?.consent ?? false);
  const [displayName, setDisplayName] = useState(existing?.display_name ?? "");
  const [affiliation, setAffiliation] = useState(existing?.affiliation ?? "");
  const [link, setLink] = useState(existing?.link ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const linkInvalid = link.trim() !== "" && !isHttpsUrl(link.trim());
  const valid = !consent || (displayName.trim() !== "" && description.trim() !== "" && description.length <= RECOGNITION_DESCRIPTION_MAX && !linkInvalid);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await onSave({
        consent,
        display_name: displayName.trim(),
        ...(affiliation.trim() ? { affiliation: affiliation.trim() } : {}),
        ...(link.trim() ? { link: link.trim() } : {}),
        description: description.trim(),
      });
      setMessage(consent ? "Saved. A curator approves public entries before they are listed." : "Saved. You will not be listed publicly.");
    } catch (cause) {
      setMessage(describeReviewFailure(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-4 grid gap-3 rounded-xl border border-white/10 p-4" data-testid="recognition-form">
      <h4 className="text-sm font-semibold text-white">Public recognition (optional)</h4>
      <p className="text-xs text-white/60">
        Would you like to be listed on the public Contributors page? Your email and individual answers always stay private. {AUTHORSHIP_NOTE}
      </p>
      <label className="flex items-start gap-2 text-sm text-white/85">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="recognition-consent" />
        <span>Yes, list me publicly as a {CONTRIBUTOR_TITLE}</span>
      </label>
      {consent ? (
        <>
          <label className="grid gap-1 text-sm text-white">
            Display name
            <input className={fieldClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={200} />
          </label>
          <label className="grid gap-1 text-sm text-white">
            Affiliation (optional)
            <input className={fieldClass} value={affiliation} onChange={(e) => setAffiliation(e.target.value)} maxLength={300} />
          </label>
          <label className="grid gap-1 text-sm text-white">
            Professional link (optional, https only)
            <input className={fieldClass} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" maxLength={500} />
          </label>
          {linkInvalid ? <p role="alert" className="text-xs text-amber-200">The link must start with https://</p> : null}
          <label className="grid gap-1 text-sm text-white">
            Short description of your contribution ({description.length}/{RECOGNITION_DESCRIPTION_MAX})
            <textarea className={fieldClass} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={RECOGNITION_DESCRIPTION_MAX} />
          </label>
          <p className="text-xs text-white/45">Please do not include collection sites or other locality details.</p>
        </>
      ) : null}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={!valid || busy} className="rounded-full bg-emerald-300 px-4 py-2 text-xs font-semibold text-[#0d1f17] disabled:opacity-50">
          {consent ? "Save recognition" : existing?.consent ? "Withdraw public recognition" : "Save choice"}
        </button>
        {message ? <p role="status" className="text-xs text-white/70">{message}</p> : null}
      </div>
    </form>
  );
}

function InvitationPreference({ profile, token, onChanged }: { profile: MyProfile; token: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="rounded-xl border border-white/10 p-4" data-testid="invitation-preference">
      <h4 className="text-sm font-semibold text-white">Contact preference</h4>
      <label className="mt-2 flex items-start gap-2 text-sm text-white/85">
        <input
          type="checkbox"
          checked={profile.future_invitations_opt_in}
          disabled={busy}
          data-testid="me-future-invitations-opt-in"
          onChange={async (e) => {
            setBusy(true);
            setError(null);
            try {
              await updatePreferences(token, e.target.checked);
              onChanged();
            } catch (cause) {
              setError(describeReviewFailure(cause));
            } finally {
              setBusy(false);
            }
          }}
        />
        <span>Invite me to future Calyx projects</span>
      </label>
      <p className="mt-1 text-xs text-white/45">This is about being contacted. It has nothing to do with public recognition.</p>
      {error ? <p role="alert" className="mt-1 text-xs text-amber-200">{error}</p> : null}
    </section>
  );
}

export default function MyContributions({ token, load = getMe }: { token: string; load?: typeof getMe }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "ok"; me: MyProfile } | { status: "failed"; message: string }>({
    status: "loading",
  });

  const refresh = useCallback(() => {
    const controller = new AbortController();
    load(token, controller.signal)
      .then((me) => setState({ status: "ok", me }))
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setState({ status: "failed", message: describeReviewFailure(cause) });
      });
    return controller;
  }, [token, load]);

  useEffect(() => {
    const controller = refresh();
    return () => controller.abort();
  }, [refresh]);

  if (state.status === "loading") return <p className="text-sm text-white/60">Loading your contributions…</p>;
  if (state.status === "failed")
    return (
      <p role="alert" className="text-sm text-amber-200" data-testid="my-contributions-error">
        {state.message}
      </p>
    );

  const { me } = state;
  const p = me.progress;
  const rec = me.recognition;
  const citable = rec?.listed ? (rec.citable_path ?? (rec.slug ? contributorPath(rec.slug) : null)) : null;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="grid gap-4" data-testid="my-contributions">
      <p className="text-sm text-white/75">
        Signed in on this browser as <strong>{me.name}</strong> ({me.email}). {me.submissions.length} submission
        {me.submissions.length === 1 ? "" : "s"} recorded.
      </p>

      <section className="rounded-xl border border-white/10 p-4">
        <h4 className="text-sm font-semibold text-white">Progress toward {CONTRIBUTOR_TITLE}</h4>
        <p className="mt-1 text-xs text-white/55">
          Only reviews a curator has verified count. Confirming a finding counts the same as finding an error. Either path qualifies, or a curator may
          approve an equivalent contribution. The title is never awarded automatically.
        </p>
        <div className="mt-3 grid gap-3">
          <ProgressBar label="Verified substantive paper reviews" value={p.paper_reviews.verified} target={p.paper_reviews.required} />
          <ProgressBar label="Verified claim reviews with a source-based explanation" value={p.claim_reviews.verified} target={p.claim_reviews.required} />
          {p.pending_verification ? (
            <p className="text-xs text-white/50">{p.pending_verification} of your submissions are waiting for curator verification.</p>
          ) : null}
        </div>
      </section>

      {me.award ? (
        <section className="rounded-xl border border-emerald-300/30 bg-emerald-300/[0.05] p-4" data-testid="award">
          <h4 className="text-sm font-semibold text-emerald-100">Awarded: {me.award.title}</h4>
          <p className="mt-1 text-xs text-white/60">
            Basis: {AWARD_BASIS_LABELS[me.award.basis]} · {me.award.awarded_at.slice(0, 10)}
          </p>
          <p className="mt-3 text-xs text-white/60">Suggested résumé wording:</p>
          <blockquote className="mt-1 border-l-2 border-emerald-300/40 pl-3 text-sm text-white/85" data-testid="resume-wording">
            {me.resume_wording ?? RESUME_WORDING}
          </blockquote>
          {citable ? (
            <p className="mt-3 text-xs text-white/70" data-testid="citable-link">
              Citable link:{" "}
              <Link to={citable} className="underline">
                {origin}
                {citable}
              </Link>
            </p>
          ) : rec?.consent ? (
            <p className="mt-3 text-xs text-white/55">Your public entry is waiting for curator approval.</p>
          ) : null}
          <RecognitionConsentForm
            existing={me.recognition}
            onSave={async (input) => {
              await updateRecognition(token, input);
              refresh();
            }}
          />
        </section>
      ) : null}

      <InvitationPreference profile={me} token={token} onChanged={() => refresh()} />
    </div>
  );
}
