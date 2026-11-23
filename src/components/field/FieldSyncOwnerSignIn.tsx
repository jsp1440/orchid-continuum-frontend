import OwnerAccessCodeForm from "@/components/auth/OwnerAccessCodeForm";
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
 *
 * The form itself is the shared OwnerAccessCodeForm; its defaults are this
 * form's words and look.
 */
export default function FieldSyncOwnerSignIn({
  onSignedIn,
  signIn = createOwnerSession,
}: {
  onSignedIn: () => void;
  signIn?: (accessCode: string) => Promise<unknown>;
}) {
  return <OwnerAccessCodeForm onSignedIn={onSignedIn} signIn={signIn} />;
}
