import React from 'react';
import { KeyRound } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import {
  isRetryableRefusal,
  memberReadRefusal,
  REFUSAL_MESSAGE,
  OWNER_ONLY_PAPER_MESSAGE,
  type MemberReadRefusal,
} from '@/lib/memberReadAuth';

/**
 * The literature-extraction service refused this session.
 *
 * Owner decision (2026-09-26): signed-in members may read the literature
 * index (`GET /papers`) and source bindings with their Supabase session. Full
 * paper text (`GET /papers/{id}`) stays owner-only for members, because it can
 * be restricted by the paper's licence; the member token is never sent there.
 * A refusal therefore means one of several different things, each said as
 * what it is (backend #1643 codes):
 *
 * - corpus 401 / `INVALID_MEMBER_TOKEN`: the member session could not be
 *   verified — signing in again is the remedy.
 * - corpus 403: the account is not permitted.
 * - paper 401/403, or 403 `OWNER_ACCESS_REQUIRED`: an owner-only view. Signing
 *   in again will not help, and the copy does not imply it would.
 * - 503 `MEMBER_AUTH_NOT_CONFIGURED`: a deployment state, not an outage.
 * - 503 `MEMBER_AUTH_UNAVAILABLE`: transient; the one refusal offered a retry.
 *
 * None of these is an empty corpus, and all are kept apart from the outage
 * state (5xx / network) and the empty state.
 */
export default function LiteratureAccessRequired({
  status,
  code = null,
  subject,
  onRetry,
}: {
  /** HTTP status the service answered with, when there was one. */
  status: number | null;
  /** The backend's error code, when it sent one. */
  code?: string | null;
  /** What the refused request was for. The paper view is owner-only for members. */
  subject: 'corpus' | 'paper';
  /** Offered only for a transient refusal (member verification unavailable). */
  onRetry?: () => void;
}) {
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const reason: MemberReadRefusal =
    memberReadRefusal(status, code, { memberScoped: subject === 'corpus' }) ?? 'session_unverified';

  const heading =
    reason === 'owner_only'
      ? subject === 'paper'
        ? OWNER_ONLY_PAPER_MESSAGE
        : REFUSAL_MESSAGE.owner_only
      : reason === 'session_unverified' && !signedIn
        ? 'Sign in to read the literature workspace.'
        : REFUSAL_MESSAGE[reason];

  const explanation: Record<MemberReadRefusal, string> = {
    session_unverified: signedIn
      ? 'You are signed in here, but the literature service could not verify that session — it may have expired. Sign out and sign in again, then reload this page.'
      : 'The literature service reads a signed-in member session, an owner session, or API-key access. This page has no session to send.',
    forbidden:
      'The literature service recognised this session and declined to open this workspace to it. Signing in again with the same account will not change this answer.',
    owner_only:
      subject === 'paper'
        ? 'Members can browse the literature index and each paper’s source binding. The full extracted text is kept to owner access because a paper’s licence may not permit showing it; this is not a problem with your session, and signing in again will not change it.'
        : 'This part of the literature workspace is kept to owner access. It is not a problem with your session, and signing in again will not change it.',
    member_access_unconfigured:
      'The literature service is reachable, but the server has not yet been given the settings it needs to verify member sessions. This is a deployment step, not an outage, and signing in again will not change it.',
    member_auth_unavailable:
      'The service that verifies member sessions could not be reached just now. Nothing is wrong with your account; try again in a moment.',
  };

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
      <p className="mt-2 text-xs leading-relaxed text-white/65">{explanation[reason]}</p>
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
      {isRetryableRefusal(reason) && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-full border border-white/20 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/70"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
