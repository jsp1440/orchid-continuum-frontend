/**
 * securityApi — governed frontend consumer for the Security/Trust Center.
 *
 * This client talks ONLY to the authorized backend security contract. It never
 * invents data: every method returns a typed ApiResult and FAILS CLOSED — when
 * the API is unconfigured, unauthorized, or unavailable, the Trust Center shows
 * a safe empty/unauthorized state rather than fabricated incidents.
 *
 * The backend producer contract (routes + shapes) is mirrored here and in the
 * backend repo's contracts/security-event-v1.schema.json. Owner authorization
 * is applied automatically by the Calyx owner-session transport in
 * backendConfig.ts — this client does not handle tokens itself.
 *
 * Routes (see docs/security/ADR-0001-security-control-plane.md):
 *   GET  /api/security/incidents            → list authorized incidents
 *   GET  /api/security/incidents/:id        → one incident + timeline
 *   POST /api/security/incidents/:id/disposition → submit a disposition
 *   GET  /api/security/rules/health         → rule health
 *   GET  /api/security/metrics              → summary metrics
 *   GET  /api/security/domain-posture       → latest read-only posture report
 *   GET  /api/security/agent-decisions      → recent agent-policy decisions
 */

import { CALYX_BACKEND_BASE_URL } from './backendConfig';
import type { Incident, Disposition } from './security/incident';
import type { RuleHealth } from './security/disposition';
import type { SecurityMetrics } from './security/metrics';
import type { DomainPostureReport } from './security/domainPosture';
import type { PolicyDecision } from './security/toolPolicy';

const DEFAULT_TIMEOUT_MS = 12_000;

export const SECURITY_API_CONFIGURED = Boolean(CALYX_BACKEND_BASE_URL);

export class SecurityApiError extends Error {
  status: number;
  endpoint: string;
  constructor(message: string, status: number, endpoint: string) {
    super(message);
    this.name = 'SecurityApiError';
    this.status = status;
    this.endpoint = endpoint;
  }
}

export interface SecurityApiResult<T> {
  data: T | null;
  error: SecurityApiError | null;
  /** True when the security API base URL is not configured. */
  unconfigured: boolean;
  /** True when the caller is not authorized to view security data (401/403). */
  unauthorized: boolean;
}

function fail<T>(
  partial: Partial<SecurityApiResult<T>> & Pick<SecurityApiResult<T>, 'error'>,
): SecurityApiResult<T> {
  return {
    data: null,
    error: partial.error,
    unconfigured: partial.unconfigured ?? false,
    unauthorized: partial.unauthorized ?? false,
  };
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<SecurityApiResult<T>> {
  // Fail closed: no base URL → no data, never a fabricated fallback.
  if (!SECURITY_API_CONFIGURED) {
    return fail<T>({ error: null as never, unconfigured: true });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${CALYX_BACKEND_BASE_URL}${path}`;

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      credentials: 'include',
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
    });

    if (res.status === 401 || res.status === 403) {
      return fail<T>({
        error: new SecurityApiError('Not authorized for security data', res.status, path),
        unauthorized: true,
      });
    }
    if (!res.ok) {
      return fail<T>({
        error: new SecurityApiError(`Request failed (${res.status})`, res.status, path),
      });
    }
    const data = (await res.json()) as T;
    return { data, error: null, unconfigured: false, unauthorized: false };
  } catch (e: unknown) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return fail<T>({
      error: new SecurityApiError(
        aborted ? 'Request timed out' : 'Network error',
        aborted ? 408 : 0,
        path,
      ),
    });
  } finally {
    clearTimeout(timer);
  }
}

export interface IncidentListItem {
  incident_id: string;
  title: string;
  status: Incident['status'];
  severity_band: Incident['risk']['band'];
  created_at: string;
  updated_at: string;
  simulated: boolean;
}

export interface AgentDecisionRecord {
  decided_at: string;
  mission_id: string;
  tool: string;
  decision: PolicyDecision['decision'];
  code: string;
}

export const securityApi = {
  listIncidents: (signal?: AbortSignal) =>
    request<IncidentListItem[]>('/api/security/incidents', { signal }),

  getIncident: (id: string, signal?: AbortSignal) =>
    request<Incident>(`/api/security/incidents/${encodeURIComponent(id)}`, { signal }),

  submitDisposition: (
    id: string,
    body: { disposition: Disposition; reviewer: string; false_positive_reason?: string; resolution_notes?: string },
  ) =>
    request<Incident>(`/api/security/incidents/${encodeURIComponent(id)}/disposition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  ruleHealth: (signal?: AbortSignal) =>
    request<RuleHealth[]>('/api/security/rules/health', { signal }),

  metrics: (signal?: AbortSignal) =>
    request<SecurityMetrics>('/api/security/metrics', { signal }),

  domainPosture: (signal?: AbortSignal) =>
    request<DomainPostureReport>('/api/security/domain-posture', { signal }),

  agentDecisions: (signal?: AbortSignal) =>
    request<AgentDecisionRecord[]>('/api/security/agent-decisions', { signal }),
};
