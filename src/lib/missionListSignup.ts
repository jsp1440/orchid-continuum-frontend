/**
 * Mission-list signup delivery.
 *
 * The signup forms used to POST to a relative `/api/crm/.../subscribe`. Orchid
 * Continuum is served from Render, whose `public/_redirects` rewrites every
 * unmatched path to `/index.html` with status 200, and there is no `api/`
 * directory in this repo, so that request resolved with **200 and a page of
 * HTML**. `fetch` only rejects on a network
 * failure, so the `catch` never ran, and `/get-involved` showed the visitor
 * "You're on the list" while their address went nowhere.
 *
 * Two rules follow from that, and this module exists to hold them in one place:
 *
 * 1. A 200 is not delivery. The response has to be JSON from the backend
 *    origin before we are entitled to tell someone they are subscribed. An
 *    HTML body means we hit the SPA shell, which is a failure wearing a
 *    success code.
 * 2. When we cannot deliver, we must not claim we did. The caller gets an
 *    explicit outcome and can fall back to a channel that really reaches the
 *    team, rather than rendering a green tick over a discarded email.
 */

import { CALYX_BACKEND_BASE_URL } from '@/lib/backendConfig';

const env = import.meta.env as Record<string, string | undefined>;

/** The CRM workspace the subscribe endpoint is scoped to. */
export const CRM_WORKSPACE_ID = '69fa6c8ae577acf1894f7208';

export const CRM_SUBSCRIBE_PATH = `/api/crm/${CRM_WORKSPACE_ID}/subscribe`;

/**
 * Where signups are delivered.
 *
 * `VITE_CRM_SUBSCRIBE_URL` overrides completely, for deployments whose CRM is
 * not behind the Calyx origin. Otherwise the path is resolved against the
 * Calyx backend, never left relative.
 */
export function crmSubscribeUrl(): string {
  const override = (env.VITE_CRM_SUBSCRIBE_URL || '').trim();
  if (override) return override.replace(/\/$/, '');
  return `${CALYX_BACKEND_BASE_URL}${CRM_SUBSCRIBE_PATH}`;
}

export type SignupOutcome =
  /** The backend accepted it. Only this may be shown as success. */
  | { kind: 'delivered' }
  /** Reached something, but not a backend that accepted the signup. */
  | { kind: 'rejected'; reason: string }
  /** Could not reach the backend at all. */
  | { kind: 'unreachable'; reason: string };

export type SignupRequest = {
  email: string;
  source: string;
  role?: string;
};

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type') || '';
  return contentType.toLowerCase().includes('application/json');
}

/**
 * Deliver one mission-list signup.
 *
 * Never throws for an ordinary failure; an abort propagates so callers can
 * cancel. The returned outcome is the only thing a caller may use to decide
 * whether to tell the visitor they are subscribed.
 */
export async function submitMissionListSignup(
  request: SignupRequest,
  signal?: AbortSignal,
): Promise<SignupOutcome> {
  let response: Response;
  try {
    response = await fetch(crmSubscribeUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return { kind: 'unreachable', reason: 'The signup service could not be reached.' };
  }

  if (!response.ok) {
    return {
      kind: 'rejected',
      reason: `The signup service returned ${response.status}.`,
    };
  }

  // A 200 carrying HTML is the SPA shell, not the backend. Treating it as
  // success is precisely the bug this module exists to prevent.
  if (!isJsonResponse(response)) {
    return {
      kind: 'rejected',
      reason: 'The signup service is not configured for this deployment.',
    };
  }

  return { kind: 'delivered' };
}

/**
 * Build the mailto that carries a signup to the team when delivery failed.
 *
 * Losing the address is the worst outcome, so an undeliverable signup falls
 * back to a channel a person actually reads rather than a silent drop.
 */
export function missionListMailto(request: SignupRequest): string {
  const subject = encodeURIComponent(
    `Orchid Continuum — mission list signup${request.role ? ` (${request.role})` : ''}`,
  );
  const body = encodeURIComponent(
    [
      'Please add me to the Orchid Continuum mission list.',
      '',
      `Email: ${request.email}`,
      request.role ? `Role: ${request.role}` : '',
      `Source: ${request.source}`,
    ]
      .filter(Boolean)
      .join('\n'),
  );
  return `mailto:info@orchidcontinuum.org?subject=${subject}&body=${body}`;
}
