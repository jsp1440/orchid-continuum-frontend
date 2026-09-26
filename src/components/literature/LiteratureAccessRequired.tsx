import React from 'react';
import { KeyRound } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import {
  MEMBER_ACCESS_UNCONFIGURED_MESSAGE,
  MEMBER_FORBIDDEN_MESSAGE,
  MEMBER_SESSION_UNVERIFIED_MESSAGE,
  memberReadRefusal,
  type MemberReadRefusal,
} from '@/lib/memberReadAuth';

/**
 * The literature-extraction service refused this session.
 *
 * Owner decision (2026-09-26): the `/api/literature-extraction/*` reads accept
 * a signed-in member's Supabase session as well as the owner session / API
 * key. So a refusal now means one of three different things, and each is said
 * as what it is:
 *
 * - 401: the member session could not be verified (expired or invalid token)
 *   — signing in again is the remedy.
 * - 403: the account is known and not permitted to read this workspace.
 * - 503 with the backend's member-auth-not-configured code: the server has not
 *   been given its member-auth settings. That is a deployment state, not an
 *   outage and not the reader's fault, and a retry cannot change it.
 *
 * None of these is an empty corpus, and all are kept apart from the outage
 * state (5xx / network) and the empty state.
 */
export default function LiteratureAccessRequired({
  status,
  subject,
  refusal = null,
}: {
  /** HTTP status the service answered with, when there was one. */
  status: number | null;
  /** What the refused request was for. */
  subject: 'corpus' | 'paper';
  /** Set when the client already classified the refusal (e.g. not configured). */
  refusal?: MemberReadRefusal | null;
}) {
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const reason: MemberReadRefusal = refusal ?? memberReadRefusal(status) ?? 'session_unverified';

  const heading =
    reason === 'member_access_unconfigured'
      ? MEMBER_ACCESS_UNCONFIGURED_MESSAGE
      : reason === 'forbidden'
        ? MEMBER_FORBIDDEN_MESSAGE
        : signedIn
          ? MEMBER_SESSION_UNVERIFIED_MESSAGE
          : 'Sign in to read the literature workspace.';

  const explanation =
    reason === 'member_access_unconfigured'
      ? 'The literature service is reachable, but the server has not yet been given the settings it needs to verify member sessions. This is a deployment step, not an outage, and signing in again will not change it.'
      : reason === 'forbidden'
        ? 'The literature service recognised this session and declined to open this workspace to it. Signing in again with the same account will not change this answer.'
        : signedIn
          ? 'You are signed in here, but the literature service could not verify that session — it may have expired. Sign out and sign in again, then reload this page.'
          : 'The literature service reads a signed-in member session, an owner session, or API-key access. This page has no session to send.';

  return (
    <div
      className="rounded-2xl border border-sky-300/30 bg-sky-300/[0.06] p-5"
      data-testid="literature-access-required"
      data-access-status={status ?? ''}
      data-access-reason={reason}
      data-signed-in={signedIn ? 'true' : 'false'}
      role="status"
    >
      <div className="flex items-center gap-2 text-sm text-sky-100">
        <KeyRound className="h-4 w-4" />
        {heading}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-white/65">{explanation}</p>
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
