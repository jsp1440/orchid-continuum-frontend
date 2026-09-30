/**
 * judgePortal — the judge-device client for `/api/judge-portal/*` (Gate 8).
 *
 * Contract source: orchid-calyx-backend PR #1704 (`app/routers/judge_portal.py`,
 * `app/judge_auth.py`). The judge is taken from the verified bearer credential;
 * plants and scorecards are named by opaque HMAC handles (`p_…`, `s_…`), never
 * by ids.
 *
 * Blind judging is enforced by the server. This module is defence in depth:
 * every plant is projected through a WHITELIST (`projectJudgePlant`), so an
 * exhibitor field (name, id, email, phone), a plant id or a QR token is never
 * copied into UI state even if a response carried one. In a blind event the
 * free-text notes are dropped too, and a withheld plant name is rendered as
 * withheld even if a name string was present.
 *
 * Status semantics (backend): 401 = no/invalid/revoked/expired credential
 * (token is cleared), 404 = outside this judge's assignments, 409 = locked
 * show / submitted card / closed event / legacy tag that must be re-issued,
 * 422 = invalid score, 503 = judge authentication not configured.
 */

import { judgeFetch, judgePortalUrl, JudgeTransportRefusal } from './judgePortalAuth';

type Json = Record<string, unknown>;

export type JudgeScope = { event_ids: string[] | null; category_ids: string[] | null };

export interface JudgeMe {
  judge_id: string;
  judge_name: string;
  show_id: string;
  credential_id: string;
  expires_at: string;
  scope: JudgeScope;
}

export interface JudgeEvent {
  id: string;
  name: string;
  judging_type: string | null;
  is_blind: boolean;
  status: string;
}

export interface JudgeCategory {
  id: string;
  name: string;
  description: string | null;
  sort_order: number | null;
}

/** The only plant shape the UI holds. No exhibitor fields exist on it. */
export interface JudgePlant {
  plant_handle: string;
  judging_event_id: string;
  category_id: string;
  category_name: string | null;
  blind: boolean;
  /** Null when withheld or unnamed. */
  plant_name: string | null;
  plant_name_withheld: boolean;
  /** Non-blind events only. */
  notes: string | null;
  /** Present on plant lists: this judge's own card for the plant, if any. */
  scorecard_handle: string | null;
  /**
   * True when the response carried fields blind judging withholds (exhibitor,
   * contact, ids, tokens) in a blind event. They were discarded, not shown.
   */
  withheld_fields_discarded: boolean;
}

export interface JudgeScore {
  criterion_id: string;
  value: number | null;
  choice: string | null;
  value_rank: number | null;
}

export interface JudgeScorecard {
  scorecard_handle: string;
  judging_event_id: string;
  status: string;
  total: number | null;
  version: number | null;
  submitted_at: string | null;
  plant: JudgePlant;
  scores: JudgeScore[] | null;
}

export interface JudgeScan {
  plant: JudgePlant;
  judging_event: JudgeEvent;
  scorecard: JudgeScorecard | null;
}

export interface JudgeCriterion {
  criteria_id: string;
  criteria_name: string;
  criteria_description: string | null;
  points_min: number | null;
  points_max: number | null;
  weighting: number | null;
  scoring_type: string | null;
}

export interface JudgeAward {
  award_id: string;
  award_name: string;
  criteria: JudgeCriterion[];
}

export type JudgeErrorKind =
  | 'unauthenticated'
  | 'not_assigned'
  | 'not_found'
  | 'conflict'
  | 'invalid'
  | 'unconfigured'
  | 'unavailable'
  | 'invalid_response'
  | 'refused';

export type JudgeConflictReason = 'reissue_tag' | 'submitted' | 'locked' | 'closed' | 'other';

export class JudgePortalError extends Error {
  readonly status: number;
  readonly kind: JudgeErrorKind;
  readonly detail: string | null;
  readonly conflict: JudgeConflictReason | null;

  constructor(status: number, kind: JudgeErrorKind, detail: string | null = null) {
    super(detail || `Judge portal ${kind} (${status})`);
    this.name = 'JudgePortalError';
    this.status = status;
    this.kind = kind;
    this.detail = detail;
    this.conflict = kind === 'conflict' ? conflictReason(detail) : null;
  }
}

const NOT_ASSIGNED_DETAIL = 'Not found in your judging assignments';

export function conflictReason(detail: string | null): JudgeConflictReason {
  const text = (detail || '').toLowerCase();
  if (text.includes('re-issue') || text.includes('reissue') || text.includes('retired')) return 'reissue_tag';
  if (text.includes('submitted')) return 'submitted';
  if (text.includes('locked')) return 'locked';
  if (text.includes('closed')) return 'closed';
  return 'other';
}

export function errorFromStatus(status: number, detail: string | null): JudgePortalError {
  if (status === 401) return new JudgePortalError(status, 'unauthenticated', detail);
  if (status === 404) {
    return new JudgePortalError(status, detail === NOT_ASSIGNED_DETAIL ? 'not_assigned' : 'not_found', detail);
  }
  if (status === 409) return new JudgePortalError(status, 'conflict', detail);
  if (status === 422) return new JudgePortalError(status, 'invalid', detail);
  if (status === 503) return new JudgePortalError(status, 'unconfigured', detail);
  return new JudgePortalError(status, 'unavailable', detail);
}

function invalid(what: string): JudgePortalError {
  return new JudgePortalError(200, 'invalid_response', `The backend returned an incomplete ${what}.`);
}

/* ------------------------------------------------------------------------ */
/* Parsers (fail closed)                                                     */
/* ------------------------------------------------------------------------ */

const isObj = (value: unknown): value is Json => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const optStr = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function reqStr(raw: Json, key: string, what: string): string {
  const value = str(raw[key]);
  if (value === null) throw invalid(what);
  return value;
}

/** Keys that identify an exhibitor, a plant or a tag — never held by the judge UI. */
const WITHHELD_KEY = /exhibitor|email|phone|contact|owner|grower|^plant_id$|^id$|qr|token|created_at|updated_at/i;

/** The keys the judge plant projection may copy. Everything else is discarded. */
const PLANT_KEYS = new Set([
  'plant_handle',
  'judging_event_id',
  'category_id',
  'category_name',
  'blind',
  'plant_name',
  'plant_name_withheld',
  'notes',
  'scorecard_handle',
]);

/**
 * Whitelist projection of one plant as a judge may see it. `eventBlind` is the
 * enclosing event's flag when known; either flag being true makes the plant
 * blind here.
 */
export function projectJudgePlant(raw: unknown, eventBlind = false): JudgePlant {
  if (!isObj(raw)) throw invalid('plant');
  const handle = reqStr(raw, 'plant_handle', 'plant');
  if (!handle.startsWith('p_')) throw invalid('plant handle');
  // Fail closed: a plant is blind unless the server explicitly says it is not.
  const blind = eventBlind || raw.blind !== false;
  // A blind name is shown only when the server explicitly said it is not withheld.
  const withheld = blind ? raw.plant_name_withheld !== false : raw.plant_name_withheld === true;
  const name = withheld ? null : str(raw.plant_name);
  const discarded = blind && Object.keys(raw).some((key) => !PLANT_KEYS.has(key) && WITHHELD_KEY.test(key));
  const scorecardHandle = str(raw.scorecard_handle);
  return {
    plant_handle: handle,
    judging_event_id: reqStr(raw, 'judging_event_id', 'plant'),
    category_id: reqStr(raw, 'category_id', 'plant'),
    category_name: str(raw.category_name),
    blind,
    plant_name: name,
    plant_name_withheld: withheld,
    notes: blind ? null : optStr(raw.notes),
    scorecard_handle: scorecardHandle && scorecardHandle.startsWith('s_') ? scorecardHandle : null,
    withheld_fields_discarded: discarded,
  };
}

export function parseJudgeMe(raw: unknown): JudgeMe {
  if (!isObj(raw)) throw invalid('judge profile');
  const scope = isObj(raw.scope) ? raw.scope : {};
  const ids = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : null);
  return {
    judge_id: reqStr(raw, 'judge_id', 'judge profile'),
    judge_name: reqStr(raw, 'judge_name', 'judge profile'),
    show_id: reqStr(raw, 'show_id', 'judge profile'),
    credential_id: reqStr(raw, 'credential_id', 'judge profile'),
    expires_at: reqStr(raw, 'expires_at', 'judge profile'),
    scope: { event_ids: ids(scope.event_ids), category_ids: ids(scope.category_ids) },
  };
}

export function parseJudgeEvent(raw: unknown): JudgeEvent {
  if (!isObj(raw)) throw invalid('judging event');
  if (typeof raw.is_blind !== 'boolean') throw invalid('judging event');
  return {
    id: reqStr(raw, 'id', 'judging event'),
    name: str(raw.name) ?? 'Unnamed judging event',
    judging_type: str(raw.judging_type),
    is_blind: raw.is_blind,
    status: reqStr(raw, 'status', 'judging event'),
  };
}

export function parseJudgeCategory(raw: unknown): JudgeCategory {
  if (!isObj(raw)) throw invalid('category');
  return {
    id: reqStr(raw, 'id', 'category'),
    name: reqStr(raw, 'name', 'category'),
    description: str(raw.description),
    sort_order: num(raw.sort_order),
  };
}

function parseScore(raw: unknown): JudgeScore {
  if (!isObj(raw)) throw invalid('score');
  return {
    criterion_id: reqStr(raw, 'criterion_id', 'score'),
    value: num(raw.value),
    choice: str(raw.choice),
    value_rank: num(raw.value_rank),
  };
}

export function parseJudgeScorecard(raw: unknown, eventBlind = false): JudgeScorecard {
  if (!isObj(raw)) throw invalid('scorecard');
  const handle = reqStr(raw, 'scorecard_handle', 'scorecard');
  if (!handle.startsWith('s_')) throw invalid('scorecard handle');
  return {
    scorecard_handle: handle,
    judging_event_id: reqStr(raw, 'judging_event_id', 'scorecard'),
    status: reqStr(raw, 'status', 'scorecard'),
    total: num(raw.total),
    version: num(raw.version),
    submitted_at: str(raw.submitted_at),
    plant: projectJudgePlant(raw.plant, eventBlind),
    scores: Array.isArray(raw.scores) ? raw.scores.map(parseScore) : null,
  };
}

export function parseJudgeScan(raw: unknown): JudgeScan {
  if (!isObj(raw)) throw invalid('scan result');
  const event = parseJudgeEvent(raw.judging_event);
  return {
    judging_event: event,
    plant: projectJudgePlant(raw.plant, event.is_blind),
    scorecard: raw.scorecard == null ? null : parseJudgeScorecard(raw.scorecard, event.is_blind),
  };
}

export function parseJudgeAwards(raw: unknown): JudgeAward[] {
  if (!Array.isArray(raw)) throw invalid('criteria list');
  return raw.map((award) => {
    if (!isObj(award) || !Array.isArray(award.criteria)) throw invalid('award');
    return {
      award_id: reqStr(award, 'award_id', 'award'),
      award_name: str(award.award_name) ?? reqStr(award, 'award_id', 'award'),
      criteria: award.criteria.map((c) => {
        if (!isObj(c)) throw invalid('criterion');
        return {
          criteria_id: reqStr(c, 'criteria_id', 'criterion'),
          criteria_name: reqStr(c, 'criteria_name', 'criterion'),
          criteria_description: str(c.criteria_description),
          points_min: num(c.points_min),
          points_max: num(c.points_max),
          weighting: num(c.weighting),
          scoring_type: str(c.scoring_type),
        };
      }),
    };
  });
}

function listOf<T>(raw: unknown, parse: (item: unknown) => T, what: string): T[] {
  if (!Array.isArray(raw)) throw invalid(what);
  return raw.map(parse);
}

/* ------------------------------------------------------------------------ */
/* Client                                                                    */
/* ------------------------------------------------------------------------ */

export interface JudgePortalClient {
  me(): Promise<JudgeMe>;
  events(): Promise<JudgeEvent[]>;
  categories(eventId: string): Promise<JudgeCategory[]>;
  plants(eventId: string, eventBlind: boolean, categoryId?: string | null): Promise<JudgePlant[]>;
  scorecards(eventId: string, eventBlind: boolean): Promise<JudgeScorecard[]>;
  scorecard(handle: string): Promise<JudgeScorecard>;
  autosave(handle: string, scores: Array<{ criterion_id: string; value: number | null }>, notes?: string | null): Promise<JudgeScorecard>;
  submit(handle: string, finalComment?: string | null): Promise<JudgeScorecard>;
  scan(qrToken: string): Promise<JudgeScan>;
  criteria(): Promise<JudgeAward[]>;
}

export type JudgePortalClientOptions = { fetchImpl?: typeof fetch; calyxBase?: string };

export function createJudgePortalClient(options: JudgePortalClientOptions = {}): JudgePortalClient {
  const request = async (path: string, init: { method?: 'GET' | 'PUT' | 'POST'; body?: unknown } = {}): Promise<unknown> => {
    let response: Response;
    try {
      response = await judgeFetch(judgePortalUrl(path, options.calyxBase), { ...init, ...options });
    } catch (error) {
      if (error instanceof JudgeTransportRefusal) throw new JudgePortalError(0, 'refused', error.message);
      throw new JudgePortalError(0, 'unavailable', 'The Calyx backend could not be reached.');
    }
    let payload: unknown = null;
    try {
      const text = await response.text();
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const detail = isObj(payload) && typeof payload.detail === 'string' ? payload.detail : null;
      throw errorFromStatus(response.status, detail);
    }
    return payload;
  };
  const seg = encodeURIComponent;

  return {
    async me() {
      return parseJudgeMe(await request('me'));
    },
    async events() {
      return listOf(await request('events'), parseJudgeEvent, 'event list');
    },
    async categories(eventId) {
      return listOf(await request(`events/${seg(eventId)}/categories`), parseJudgeCategory, 'category list');
    },
    async plants(eventId, eventBlind, categoryId) {
      const query = categoryId ? `?category_id=${seg(categoryId)}` : '';
      return listOf(await request(`events/${seg(eventId)}/plants${query}`), (p) => projectJudgePlant(p, eventBlind), 'plant list');
    },
    async scorecards(eventId, eventBlind) {
      return listOf(await request(`events/${seg(eventId)}/scorecards`), (c) => parseJudgeScorecard(c, eventBlind), 'scorecard list');
    },
    async scorecard(handle) {
      return parseJudgeScorecard(await request(`scorecards/${seg(handle)}`));
    },
    async autosave(handle, scores, notes) {
      const body: Json = { scores };
      if (notes !== undefined) body.notes = notes;
      return parseJudgeScorecard(await request(`scorecards/${seg(handle)}`, { method: 'PUT', body }));
    },
    async submit(handle, finalComment) {
      const body: Json = finalComment ? { final_comment: finalComment } : {};
      return parseJudgeScorecard(await request(`scorecards/${seg(handle)}/submit`, { method: 'POST', body }));
    },
    async scan(qrToken) {
      return parseJudgeScan(await request(`scan/${seg(qrToken)}`));
    },
    async criteria() {
      return parseJudgeAwards(await request('criteria'));
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Plain-language copy                                                       */
/* ------------------------------------------------------------------------ */

export const WITHHELD_NAME_LABEL = 'Name withheld (blind judging)';

export function plantDisplayName(plant: JudgePlant): string {
  if (plant.plant_name_withheld) return WITHHELD_NAME_LABEL;
  return plant.plant_name ?? 'Unnamed plant';
}

/** A scanned tag may be a bare token or a link ending in the token. */
export function qrTokenFromScan(raw: string): string | null {
  const value = (raw || "").trim();
  if (!value) return null;
  let candidate = value;
  if (/^https?:\/\//i.test(value)) {
    try {
      const segments = new URL(value).pathname.split("/").filter(Boolean);
      candidate = decodeURIComponent(segments[segments.length - 1] ?? "");
    } catch {
      return null;
    }
  }
  return /^[A-Za-z0-9_-]{4,128}$/.test(candidate) ? candidate : null;
}

/** Short reference for a handle, for display; the full handle is used in requests. */
export function shortHandle(handle: string): string {
  return handle.length > 10 ? `${handle.slice(0, 10)}…` : handle;
}

export function judgeErrorMessage(error: unknown): string {
  if (!(error instanceof JudgePortalError)) return 'Something went wrong. Nothing was changed.';
  switch (error.kind) {
    case 'unauthenticated':
      return 'Your judge credential was not accepted (it may have been revoked, rotated or expired). You have been signed out on this device; ask the show owner for a new credential.';
    case 'not_assigned':
      return 'Not assigned to you. This plant, class or event is outside your judging assignments.';
    case 'not_found':
      return error.detail ? `Not found: ${error.detail}` : 'Not found.';
    case 'conflict':
      switch (error.conflict) {
        case 'reissue_tag':
          return 'This tag must be re-issued. It carries a retired tag code that blind judging refuses; ask the show owner to re-issue and reprint the tags for this event.';
        case 'submitted':
          return 'This scorecard is already submitted and can no longer be edited.';
        case 'locked':
          return 'Judging is locked for this show. Scores are frozen; nothing was changed.';
        case 'closed':
          return 'This judging event is closed. Scores are frozen; nothing was changed.';
        default:
          return `The backend refused the change (${error.detail ?? 'conflict'}). Nothing was changed.`;
      }
    case 'invalid':
      return error.detail ? `Score not accepted: ${error.detail}` : 'Score not accepted.';
    case 'unconfigured':
      return 'Judge sign-in is not configured on this Calyx backend yet. Ask the show owner; nothing is shown rather than guessing.';
    case 'invalid_response':
      return 'The backend returned an incomplete response, so nothing is shown rather than a partial view. Try again.';
    case 'refused':
      return error.detail ?? 'The request was refused on this device.';
    default:
      return 'The Calyx backend is unavailable right now. Try again shortly; nothing was changed.';
  }
}
