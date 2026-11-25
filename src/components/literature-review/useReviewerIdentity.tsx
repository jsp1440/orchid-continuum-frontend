import { useCallback, useRef, useState } from "react";
import IdentityDialog from "./IdentityDialog";
import {
  describeReviewFailure,
  readReviewerToken,
  registerReviewer,
  storeReviewerToken,
  type SubmissionReceipt,
} from "@/lib/literatureReviewApi";

export type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "submitted"; receipt: SubmissionReceipt }
  | { status: "failed"; message: string };

type Action = (token: string, website: string) => Promise<SubmissionReceipt>;

/**
 * Identity-gated submission. The identity dialog opens only when this browser
 * holds no reviewer token; once one exists, every later submission goes
 * straight to the server with it.
 */
export function useReviewerIdentity(register: typeof registerReviewer = registerReviewer) {
  const [token, setToken] = useState<string | null>(() => readReviewerToken());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [state, setState] = useState<SubmitState>({ status: "idle" });
  const pending = useRef<Action | null>(null);

  const run = useCallback(async (action: Action, withToken: string, website: string) => {
    setState({ status: "submitting" });
    try {
      const receipt = await action(withToken, website);
      setState({ status: "submitted", receipt });
    } catch (cause) {
      setState({ status: "failed", message: describeReviewFailure(cause) });
    }
  }, []);

  const submit = useCallback(
    (action: Action) => {
      const current = token ?? readReviewerToken();
      if (current) {
        void run(action, current, "");
        return;
      }
      pending.current = action;
      setDialogOpen(true);
    },
    [token, run],
  );

  const onRegistered = useCallback(
    (fresh: string, website: string) => {
      storeReviewerToken(fresh);
      setToken(fresh);
      setNewToken(fresh);
      setDialogOpen(false);
      const action = pending.current;
      pending.current = null;
      if (action) void run(action, fresh, website);
    },
    [run],
  );

  const dialog = (
    <IdentityDialog
      open={dialogOpen}
      register={register}
      onCancel={() => {
        pending.current = null;
        setDialogOpen(false);
      }}
      onRegistered={onRegistered}
    />
  );

  const tokenNotice = newToken ? (
    <div className="rounded-xl border border-emerald-300/30 bg-emerald-300/[0.06] p-4 text-xs text-emerald-50" data-testid="new-token-notice">
      <p className="font-semibold">Your reviewer key was saved in this browser.</p>
      <p className="mt-1 text-white/70">
        It is shown only now. Keep a private copy if you want to continue on another device; anyone with it can submit as you.
      </p>
      <code className="mt-2 block break-all rounded bg-black/30 p-2 font-mono text-[11px]">{newToken}</code>
      <button type="button" className="mt-2 underline" onClick={() => setNewToken(null)}>
        Hide
      </button>
    </div>
  ) : null;

  return { token, submit, state, resetState: () => setState({ status: "idle" }), dialog, tokenNotice };
}
