/**
 * judgeAdmin — the owner's judge-credential, judge-audit and tag re-issue client
 * (Gate 8, orchid-calyx-backend PR #1704, `app/routers/judge_admin.py`).
 *
 * Requests go through the existing owner-session fetch transport
 * (`backendConfig`), which attaches the Mission Control owner bearer to the
 * exact Calyx origin only. This module never reads, sends or stores the owner
 * key (`X-API-Key`) and never touches a judge token from `judgePortalAuth`.
 *
 * An issued judge token is returned to the caller exactly once and is never
 * written to storage, a cache or a log here; the console holds it in component
 * state until the owner dismisses it.
 */

import { CALYX_BACKEND_BASE_URL } from './backendConfig';

type Json = Record<string, unknown>;

export type CredentialState = 'active' | 'expired' | 'revoked' | string;

export interface JudgeCredentialMeta {
  credential_id: string;
  judge_id: string;
  show_id: string;
  label: string | null;
  state: CredentialState;
  created_at: string | null;
  expires_at: string;
  revoked_at: string | null;
  scope: { event_ids: string[] | null; category_ids: string[] | null };
}

export interface IssuedJudgeCredential extends JudgeCredentialMeta {
  token: string;
  token_type: string;
  token_notice: string | null;
  revoked_previous: number;
}

export interface JudgeAuditRow {
  id: string;
  judge_id: string;
  credential_id: string | null;
  action: string;
  judging_event_id: string | null;
  category_id: string | null;
  scorecard_id: string | null;
  plant_id: string | null;
  plant_handle: string | null;
  outcome: string;
  http_status: number | null;
  detail: string | null;
  created_at: string;
}

export interface ReissueResult {
  judging_event_id: string;
  plants: number;
  reissued: number;
}

export interface IssueCredentialInput {
  label?: string | null;
  expires_in_minutes?: number;
  event_ids?: string[] | null;
  category_ids?: string[] | null;
  rotate?: boolean;
}

export type JudgeAdminErrorKind = 'owner_auth' | 'not_found' | 'conflict' | 'invalid' | 'unconfigured' | 'unavailable' | 'invalid_response';

export class JudgeAdminError extends Error {
  readonly status: number;
  readonly kind: JudgeAdminErrorKind;
  readonly detail: string | null;

  constructor(status: number, kind: JudgeAdminErrorKind, detail: string | null = null) {
    super(detail || `Judge admin ${kind} (${status})`);
    this.name = 'JudgeAdminError';
    this.status = status;
    this.kind = kind;
    this.detail = detail;
  }
}

const isObj = (value: unknown): value is Json => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const ids = (value: unknown): string[] | null =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : null;

function invalid(what: string): JudgeAdminError {
  return new JudgeAdminError(200, 'invalid_response', `The backend returned an incomplete ${what}.`);
}

function need(raw: Json, key: string, what: string): string {
  const value = str(raw[key]);
  if (value === null) throw invalid(what);
  return value;
}

export function parseCredentialMeta(raw: unknown): JudgeCredentialMeta {
  if (!isObj(raw)) throw invalid('credential');
  const scope = isObj(raw.scope) ? raw.scope : {};
  return {
    credential_id: need(raw, 'credential_id', 'credential'),
    judge_id: need(raw, 'judge_id', 'credential'),
    show_id: need(raw, 'show_id', 'credential'),
    label: str(raw.label),
    state: need(raw, 'state', 'credential'),
    created_at: str(raw.created_at),
    expires_at: need(raw, 'expires_at', 'credential'),
    revoked_at: str(raw.revoked_at),
    scope: { event_ids: ids(scope.event_ids), category_ids: ids(scope.category_ids) },
  };
}

export function parseIssuedCredential(raw: unknown): IssuedJudgeCredential {
  const meta = parseCredentialMeta(raw);
  const body = raw as Json;
  const token = str(body.token);
  if (!token || !token.startsWith('ocj_')) throw invalid('issued credential');
  return {
    ...meta,
    token,
    token_type: str(body.token_type) ?? 'Bearer',
    token_notice: str(body.token_notice),
    revoked_previous: typeof body.revoked_previous === 'number' ? body.revoked_previous : 0,
  };
}

export function parseAuditRows(raw: unknown): JudgeAuditRow[] {
  if (!Array.isArray(raw)) throw invalid('judge audit');
  return raw.map((row) => {
    if (!isObj(row)) throw invalid('audit row');
    return {
      id: need(row, 'id', 'audit row'),
      judge_id: need(row, 'judge_id', 'audit row'),
      credential_id: str(row.credential_id),
      action: need(row, 'action', 'audit row'),
      judging_event_id: str(row.judging_event_id),
      category_id: str(row.category_id),
      scorecard_id: str(row.scorecard_id),
      plant_id: str(row.plant_id),
      plant_handle: str(row.plant_handle),
      outcome: need(row, 'outcome', 'audit row'),
      http_status: typeof row.http_status === 'number' ? row.http_status : null,
      detail: str(row.detail),
      created_at: need(row, 'created_at', 'audit row'),
    };
  });
}

export function parseReissue(raw: unknown): ReissueResult {
  if (!isObj(raw) || typeof raw.plants !== 'number' || typeof raw.reissued !== 'number') throw invalid('re-issue result');
  return { judging_event_id: need(raw, 'judging_event_id', 're-issue result'), plants: raw.plants, reissued: raw.reissued };
}

export interface JudgeAdminClient {
  listCredentials(judgeId: string): Promise<JudgeCredentialMeta[]>;
  issueCredential(judgeId: string, input: IssueCredentialInput): Promise<IssuedJudgeCredential>;
  revokeCredential(credentialId: string): Promise<JudgeCredentialMeta>;
  audit(filters: { judgingEventId?: string; judgeId?: string; limit?: number }): Promise<JudgeAuditRow[]>;
  reissueQrTokens(eventId: string, includeRandom: boolean): Promise<ReissueResult>;
  /** The owner's printable tag sheet (HTML). Never stored. */
  tagSheetHtml(eventId: string): Promise<string>;
}

export function createJudgeAdminClient(options: { fetchImpl?: typeof fetch; calyxBase?: string } = {}): JudgeAdminClient {
  const base = (options.calyxBase ?? CALYX_BACKEND_BASE_URL).replace(/\/$/, '');
  const raw = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const doFetch = options.fetchImpl ?? fetch;
    const headers = new Headers({ Accept: init.body ? 'application/json' : 'application/json, text/html' });
    if (init.body) headers.set('Content-Type', 'application/json');
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, { ...init, headers, credentials: 'include', cache: 'no-store' });
    } catch {
      throw new JudgeAdminError(0, 'unavailable', 'The Calyx backend could not be reached.');
    }
    if (!response.ok) {
      let detail: string | null = null;
      try {
        const payload = await response.json();
        detail = isObj(payload) && typeof payload.detail === 'string' ? payload.detail : null;
      } catch {
        detail = null;
      }
      const kind: JudgeAdminErrorKind =
        response.status === 401 || response.status === 403
          ? 'owner_auth'
          : response.status === 404
            ? 'not_found'
            : response.status === 409
              ? 'conflict'
              : response.status === 422
                ? 'invalid'
                : response.status === 503
                  ? 'unconfigured'
                  : 'unavailable';
      throw new JudgeAdminError(response.status, kind, detail);
    }
    return response;
  };
  const json = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    const response = await raw(path, init);
    try {
      return await response.json();
    } catch {
      throw invalid('response');
    }
  };
  const seg = encodeURIComponent;

  return {
    async listCredentials(judgeId) {
      const body = await json(`/api/judges/${seg(judgeId)}/credentials`);
      if (!Array.isArray(body)) throw invalid('credential list');
      return body.map(parseCredentialMeta);
    },
    async issueCredential(judgeId, input) {
      const payload: Json = { rotate: input.rotate ?? true };
      if (input.label) payload.label = input.label;
      if (input.expires_in_minutes) payload.expires_in_minutes = input.expires_in_minutes;
      if (input.event_ids && input.event_ids.length) payload.event_ids = input.event_ids;
      if (input.category_ids && input.category_ids.length) payload.category_ids = input.category_ids;
      return parseIssuedCredential(
        await json(`/api/judges/${seg(judgeId)}/credentials`, { method: 'POST', body: JSON.stringify(payload) }),
      );
    },
    async revokeCredential(credentialId) {
      return parseCredentialMeta(await json(`/api/judge-credentials/${seg(credentialId)}/revoke`, { method: 'POST' }));
    },
    async audit(filters) {
      const query = new URLSearchParams();
      if (filters.judgingEventId) query.set('judging_event_id', filters.judgingEventId);
      if (filters.judgeId) query.set('judge_id', filters.judgeId);
      query.set('limit', String(filters.limit ?? 200));
      return parseAuditRows(await json(`/api/judging/judge-audit?${query.toString()}`));
    },
    async reissueQrTokens(eventId, includeRandom) {
      const query = includeRandom ? '?include_random=true' : '';
      return parseReissue(await json(`/api/judging/events/${seg(eventId)}/reissue-qr-tokens${query}`, { method: 'POST' }));
    },
    async tagSheetHtml(eventId) {
      const response = await raw(`/api/judging/events/${seg(eventId)}/tags`);
      return response.text();
    },
  };
}

export function judgeAdminErrorMessage(error: unknown): string {
  if (!(error instanceof JudgeAdminError)) return 'Something went wrong. Nothing was changed.';
  const detail = error.detail ? ` (backend: “${error.detail}”)` : '';
  switch (error.kind) {
    case 'owner_auth':
      return `The backend did not accept this owner session for show management${detail}. Sign in at Mission Control; if you are signed in, this backend route still requires the service owner key, which this console never sends from a browser. Nothing was changed.`;
    case 'not_found':
      return `Not found${detail}. Check the id. Nothing was changed.`;
    case 'conflict':
      return `Refused${detail}. Judging may be locked for this show. Nothing was changed.`;
    case 'invalid':
      return `The backend rejected the input${detail}. Nothing was changed.`;
    case 'unconfigured':
      return `Judge credentials are not configured on this backend${detail}. The owner must set CALYX_JUDGE_TOKEN_SECRET in deployment. Nothing was changed.`;
    case 'invalid_response':
      return 'The backend returned an incomplete response; nothing is shown rather than a partial one.';
    default:
      return `The Calyx backend is unavailable right now${detail}. Try again shortly; nothing was changed.`;
  }
}
