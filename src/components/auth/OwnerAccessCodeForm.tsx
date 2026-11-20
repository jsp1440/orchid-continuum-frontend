import { useState, type FormEvent, type ReactNode } from "react";
import { KeyRound } from "lucide-react";
import { createOwnerSession } from "@/lib/ownerOperationsConsole";

/**
 * The one owner access-code form.
 *
 * It signs in through `createOwnerSession`, the login Mission Control already
 * uses; the owner-session fetch transport stores the same-tab bearer. This form
 * adds no credential path of its own. The code is held in component state only:
 * it is never written to storage, the address, the console or an error message,
 * is sent in the one login request, and is cleared after every attempt.
 *
 * Callers choose the words and the look; the behaviour is shared so that two
 * code-entry forms cannot drift apart. Defaults reproduce the Field Journal's
 * form exactly.
 */
export default function OwnerAccessCodeForm({
  onSignedIn,
  signIn = createOwnerSession,
  idPrefix = "field-sync-owner",
  heading = "Owner sign-in needed to sync",
  description = (
    <>
      The field backend rejected this app&apos;s session. Enter the Mission Control owner access code, then sync again. Your observations and originals stay on this iPad either way.
    </>
  ),
  buttonLabel = "Sign in for sync",
  placeholder = "Owner access code",
  autoComplete = "current-password",
  formatFailure,
  className = "mx-auto mt-4 max-w-6xl rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900",
  inputClassName = "min-w-[14rem] flex-1 rounded-md border border-amber-300 bg-white px-3 py-2 text-ink",
  buttonClassName = "rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white disabled:opacity-50",
}: {
  onSignedIn: () => void;
  signIn?: (accessCode: string) => Promise<unknown>;
  idPrefix?: string;
  heading?: string;
  description?: ReactNode;
  buttonLabel?: string;
  placeholder?: string;
  autoComplete?: string;
  /** Turns the thrown message into the sentence shown; default shows it as thrown. */
  formatFailure?: (message: string) => string;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
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
      const message = caught instanceof Error ? caught.message : "Owner sign-in failed.";
      setFailure(formatFailure ? formatFailure(message) : message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      aria-labelledby={`${idPrefix}-sign-in-heading`}
      className={className}
    >
      <h2 id={`${idPrefix}-sign-in-heading`} className="flex items-center gap-2 font-semibold">
        <KeyRound aria-hidden="true" className="h-4 w-4" /> {heading}
      </h2>
      <p className="mt-1">{description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`${idPrefix}-access-code`}>Owner access code</label>
        <input
          id={`${idPrefix}-access-code`}
          type="password"
          autoComplete={autoComplete}
          value={accessCode}
          onChange={(event) => setAccessCode(event.target.value)}
          placeholder={placeholder}
          className={inputClassName}
        />
        <button type="submit" disabled={busy} className={buttonClassName}>
          {busy ? "Signing in…" : buttonLabel}
        </button>
      </div>
      {failure ? <p role="alert" className="mt-2 text-xs text-red-700">{failure}</p> : null}
    </form>
  );
}
