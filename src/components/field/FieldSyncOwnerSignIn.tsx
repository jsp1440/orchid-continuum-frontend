import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { createOwnerSession } from "@/lib/ownerOperationsConsole";

/**
 * Owner sign-in for Field Journal sync, inside the Field Journal itself.
 *
 * Sync needs the Mission Control owner session. Installed on the iPad Home
 * Screen, /field has no address bar and no navigation, so a rejected sync
 * (401/403) left no way to reach the Mission Control sign-in. This reuses the
 * canonical owner login (createOwnerSession), so the same owner-session
 * transport stores the same-tab bearer; no new credential path is introduced.
 * The access code is never stored and the field is cleared after each attempt.
 */
export default function FieldSyncOwnerSignIn({
  onSignedIn,
  signIn = createOwnerSession,
}: {
  onSignedIn: () => void;
  signIn?: (accessCode: string) => Promise<unknown>;
}) {
  const [accessCode, setAccessCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const code = accessCode;
    setAccessCode("");
    if (!code.trim()) return;
    setBusy(true);
    setFailure(null);
    try {
      await signIn(code);
      onSignedIn();
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : "Owner sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      aria-labelledby="field-sync-owner-sign-in-heading"
      className="mx-auto mt-4 max-w-6xl rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <h2 id="field-sync-owner-sign-in-heading" className="flex items-center gap-2 font-semibold">
        <KeyRound aria-hidden="true" className="h-4 w-4" /> Owner sign-in needed to sync
      </h2>
      <p className="mt-1">
        The field backend rejected this app&apos;s session. Enter the Mission Control owner access code, then sync again. Your observations and originals stay on this iPad either way.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="field-sync-owner-access-code">Owner access code</label>
        <input
          id="field-sync-owner-access-code"
          type="password"
          autoComplete="current-password"
          value={accessCode}
          onChange={(event) => setAccessCode(event.target.value)}
          placeholder="Owner access code"
          className="min-w-[14rem] flex-1 rounded-md border border-amber-300 bg-white px-3 py-2 text-ink"
        />
        <button type="submit" disabled={busy} className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in for sync"}
        </button>
      </div>
      {failure ? <p role="alert" className="mt-2 text-xs text-red-700">{failure}</p> : null}
    </form>
  );
}
