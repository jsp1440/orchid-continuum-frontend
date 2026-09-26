import React from 'react';
import { KeyRound } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';

/**
 * The literature-extraction service refused this session (401/403).
 *
 * The backend mounts every `/api/literature-extraction/*` route behind
 * `verify_owner_or_api_key`: an owner session or an API key, nothing else.
 * There is no member path yet. So a signed-in member who reaches this page is
 * refused, and the honest thing to say is exactly that — not a generic
 * "unauthorised" that reads like a broken login, not "try again" (a retry
 * cannot change the answer), and never an empty corpus.
 *
 * This state is kept apart from the outage state (5xx / network) and the
 * empty state: all three can put nothing on screen, and each means something
 * different about what the Continuum holds.
 */
export default function LiteratureAccessRequired({
  status,
  subject,
}: {
  /** HTTP status the service answered with, when there was one. */
  status: number | null;
  /** What the refused request was for. */
  subject: 'corpus' | 'paper';
}) {
  const { user } = useAuth();
  const signedIn = Boolean(user);

  return (
    <div
      className="rounded-2xl border border-sky-300/30 bg-sky-300/[0.06] p-5"
      data-testid="literature-access-required"
      data-access-status={status ?? ''}
      data-signed-in={signedIn ? 'true' : 'false'}
      role="status"
    >
      <div className="flex items-center gap-2 text-sm text-sky-100">
        <KeyRound className="h-4 w-4" />
        Owner or API access required — this literature workspace is not yet open to members
      </div>
      <p className="mt-2 text-xs leading-relaxed text-white/65">
        {signedIn
          ? 'You are signed in, but the literature-extraction service currently answers only an owner session or API-key access. Member access has not been opened, so signing in again will not change this answer.'
          : 'The literature-extraction service currently answers only an owner session or API-key access. Member access has not been opened, so a member sign-in will not change this answer either.'}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-white/50">
        {subject === 'corpus'
          ? 'This says nothing about how much literature the Continuum holds. It is a statement about who may read the index, not about the corpus.'
          : 'This says nothing about what the extraction contains. It is a statement about who may read it, not about the paper.'}
      </p>
      {status !== null ? (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
          Service answered {status}
        </p>
      ) : null}
    </div>
  );
}
