import { useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TEXT_FIELD_MAX, describeReviewFailure, registerReviewer } from "@/lib/literatureReviewApi";

/**
 * First-submission identity dialog.
 *
 * Name and email are required; education/training is optional. The
 * future-invitations opt-in is its own checkbox, unchecked by default, and is
 * not a condition of submitting. Public recognition is a different consent,
 * asked only after a curator awards the contributor title.
 *
 * `website` is a honeypot: visually hidden, out of the tab order, and sent as
 * typed. A person never fills it.
 */
export default function IdentityDialog({
  open,
  onCancel,
  onRegistered,
  register = registerReviewer,
}: {
  open: boolean;
  onCancel: () => void;
  onRegistered: (token: string, website: string) => void;
  register?: typeof registerReviewer;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [education, setEducation] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [privacyAck, setPrivacyAck] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && privacyAck;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const token = await register({
        name: name.trim(),
        email: email.trim(),
        ...(education.trim() ? { education_training: education.trim() } : {}),
        future_invitations_opt_in: optIn,
        privacy_ack: true,
        website,
      });
      onRegistered(token, website);
    } catch (cause) {
      setError(describeReviewFailure(cause));
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-white text-slate-900">
        <DialogHeader>
          <DialogTitle>Before your first review</DialogTitle>
          <DialogDescription className="text-slate-600">
            Tell us who you are so curators can weigh and credit your review. You only do this once in this browser.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="grid gap-3" data-testid="identity-form">
          <label className="grid gap-1 text-sm">
            <span>Name (required)</span>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} autoComplete="name" />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Email (required)</span>
            <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={320} autoComplete="email" />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Education or training (optional)</span>
            <textarea className={field} rows={2} value={education} onChange={(e) => setEducation(e.target.value)} maxLength={TEXT_FIELD_MAX} />
          </label>

          {/* Honeypot: hidden from people and assistive technology. */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
            <label>
              Website
              <input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} data-testid="honeypot-website" />
            </label>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700" data-testid="privacy-notice">
            <p className="font-semibold">Privacy</p>
            <p className="mt-1">
              Your contact details are seen only by authorised Orchid Continuum curators. They are never published and never sold.
              Your answers are stored with your name so curators can review them.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={privacyAck} onChange={(e) => setPrivacyAck(e.target.checked)} data-testid="privacy-ack" />
            <span>I have read the privacy notice.</span>
          </label>

          <fieldset className="rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-600">Optional</legend>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} data-testid="future-invitations-opt-in" />
              <span>Invite me to future Calyx projects</span>
            </label>
            <p className="mt-1 text-xs text-slate-500">Not required to review. You can change this later.</p>
          </fieldset>

          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="rounded-full border border-slate-300 px-4 py-2 text-sm">
              Cancel
            </button>
            <button type="submit" disabled={!valid || busy} className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">
              {busy ? "Saving…" : "Continue and submit"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
