import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";

/**
 * Client for the Calyx backend's public, read-only ecological interaction
 * discovery surface: `GET /api/interactions/discovery`.
 *
 * Contract read from the backend, not inferred:
 *   app/interaction_discovery/routes.py::get_interaction_discovery
 *     query: taxon (<=200 chars), category ("pollinator"|"mycorrhizal"|"all"),
 *            limit (1..500, default 100)
 *   app/interaction_discovery/service.py::discover_interactions
 *     -> { status, count, total_matched, truncated, category, taxon_filter,
 *          index_state, index_note, review_bound, knowledge_graph_mutation,
 *          note, interactions[] }
 *     plus, from a backend follow-up, an optional `unreadable_count`.
 *
 * INDEX STATE
 *
 * Since backend #1639 the response says which index served the read:
 *   "durable"              -- the durable interaction index
 *   "memory_unprovisioned" -- no durable index is configured; the backend
 *                             served an empty-by-default in-process index, so
 *                             an empty result is NOT evidence of absence
 * An older backend omits the field (`index_state: null` here, current
 * behaviour). Any other value is kept as "unrecognized" and never read as
 * durable.
 *
 * WHAT THESE RECORDS ARE
 *
 * Every record is a review-bound, UNVERIFIED candidate interaction sourced
 * from Global Biotic Interactions (GloBI). None is a verified Knowledge Graph
 * edge. This client keeps the verification state, provider, dataset version
 * and study citation on every record so nothing downstream can render a
 * candidate as settled fact.
 *
 * FAIL-CLOSED STATES
 *
 *   ok          -- a readable response with at least one readable record
 *   empty       -- a readable response that matched nothing
 *   unprovisioned -- matched nothing, but no durable index is configured, so
 *                  the emptiness says nothing about what is known
 *   unavailable -- network failure or a non-2xx response (including 422)
 *   malformed   -- a 2xx body this client cannot read, or one that does not
 *                  carry the review-bound / no-graph-mutation guarantees
 *
 * A malformed or unavailable response is never rendered as "no interactions":
 * that would report the Continuum knows of none.
 *
 * WHAT IS DELIBERATELY DROPPED
 *
 * Only an allow-list of fields is copied out of each record. Anything else the
 * backend (or a future backend) attaches -- including any locality or
 * coordinate field -- never reaches the UI. `revision_id` is also dropped: the
 * backend emits it as a 60-bit integer that JavaScript cannot represent
 * exactly, so displaying it would show a wrong identifier.
 */

export type InteractionCategory = "pollinator" | "mycorrhizal";
export type InteractionCategoryFilter = InteractionCategory | "all";
/** Backend-reported index; null when an older backend does not report it. */
export type InteractionIndexState = "durable" | "memory_unprovisioned" | "unrecognized";

export interface DiscoveredInteraction {
  /** GloBI records direction; either side may be the orchid. Rendered verbatim. */
  source_taxon_name: string;
  source_taxon_id: string | null;
  target_taxon_name: string;
  target_taxon_id: string | null;
  /** Raw, unmodified GloBI interaction type text. */
  interaction_type: string;
  /** Backend keyword-heuristic grouping; may be empty. */
  categories: InteractionCategory[];
  study_citation: string | null;
  study_source_citation: string | null;
  study_external_id: string | null;
  provider: string | null;
  provider_stability: string | null;
  dataset_version: string | null;
  /** Backend-reported evidence state (UNVERIFIED for every record today). */
  verification_state: string;
}

export interface InteractionDiscoveryResult {
  records: DiscoveredInteraction[];
  /** Records returned in this response. */
  count: number;
  /** Records the backend matched before applying `limit`. */
  total_matched: number;
  truncated: boolean;
  /**
   * Records that could not be read: those in the response this client could
   * not parse, plus those the backend reports it excluded (`unreadable_count`).
   */
  unreadable_count: number;
  /** The backend's own `unreadable_count`; 0 when the backend does not report one. */
  backend_unreadable_count: number;
  /** Which index served the read; null when the backend does not say. */
  index_state: InteractionIndexState | null;
  /** Backend's index note, verbatim. */
  index_note: string | null;
  category: InteractionCategoryFilter;
  taxon_filter: string | null;
  /** Backend's own disclaimer, verbatim. */
  note: string | null;
}

export type InteractionDiscoveryState =
  | { state: "ok"; result: InteractionDiscoveryResult }
  | { state: "empty"; result: InteractionDiscoveryResult }
  | { state: "unprovisioned"; result: InteractionDiscoveryResult }
  | { state: "unavailable"; reason: string; httpStatus: number | null }
  | { state: "malformed"; reason: string };

export const INTERACTION_DISCOVERY_PATH = "/api/interactions/discovery";
export const INTERACTION_DISCOVERY_DEFAULT_LIMIT = 100;
const MAX_TAXON_LENGTH = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function optionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return nonEmptyString(value);
}

function parseCategories(value: unknown): InteractionCategory[] {
  if (!Array.isArray(value)) return [];
  const out: InteractionCategory[] = [];
  for (const item of value) {
    if ((item === "pollinator" || item === "mycorrhizal") && !out.includes(item)) out.push(item);
  }
  return out;
}

function parseIndexState(payload: Record<string, unknown>): InteractionIndexState | null {
  if (!("index_state" in payload) || payload.index_state === undefined) return null;
  const value = payload.index_state;
  return value === "durable" || value === "memory_unprovisioned" ? value : "unrecognized";
}

function parseBackendUnreadableCount(value: unknown): number | "invalid" {
  if (value === undefined) return 0;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  return "invalid";
}

/** Parse one record, allow-listing fields. Returns null when unreadable. */
export function parseDiscoveredInteraction(raw: unknown): DiscoveredInteraction | null {
  if (!isRecord(raw)) return null;
  const source = nonEmptyString(raw.source_taxon_name);
  const target = nonEmptyString(raw.target_taxon_name);
  const interactionType = nonEmptyString(raw.interaction_type);
  const verification = nonEmptyString(raw.verification_state);
  // A record without both taxa and a type is not an interaction; one without
  // an evidence state cannot be labelled honestly. Neither is rendered.
  if (!source || !target || !interactionType || !verification) return null;
  // The backend guarantees no record claims a graph write. A record that does
  // contradicts the surface's contract and is not shown as a candidate.
  if (raw.knowledge_graph_mutation !== false) return null;
  return {
    source_taxon_name: source,
    source_taxon_id: optionalString(raw.source_taxon_id),
    target_taxon_name: target,
    target_taxon_id: optionalString(raw.target_taxon_id),
    interaction_type: interactionType,
    categories: parseCategories(raw.categories),
    study_citation: optionalString(raw.study_citation),
    study_source_citation: optionalString(raw.study_source_citation),
    study_external_id: optionalString(raw.study_external_id),
    provider: optionalString(raw.provider),
    provider_stability: optionalString(raw.provider_stability),
    dataset_version: optionalString(raw.dataset_version),
    verification_state: verification,
  };
}

/** Parse a 2xx response body into ok / empty / malformed. */
export function parseInteractionDiscoveryBody(payload: unknown): InteractionDiscoveryState {
  if (!isRecord(payload)) {
    return { state: "malformed", reason: "The interaction discovery response was not a JSON object." };
  }
  if (payload.status !== "ok") {
    return { state: "malformed", reason: "The interaction discovery response did not report status ok." };
  }
  if (!Array.isArray(payload.interactions)) {
    return { state: "malformed", reason: "The interaction discovery response carried no interactions list." };
  }
  if (payload.review_bound !== true || payload.knowledge_graph_mutation !== false) {
    // Without these guarantees the records cannot be labelled as unverified
    // candidates, so they are not shown at all.
    return {
      state: "malformed",
      reason: "The interaction discovery response did not carry its review-bound, no-graph-mutation guarantees.",
    };
  }

  const backendUnreadable = parseBackendUnreadableCount(payload.unreadable_count);
  if (backendUnreadable === "invalid") {
    // A count of excluded records we cannot read would make any total shown
    // here unverifiable, so the body is not presented as complete or empty.
    return { state: "malformed", reason: "The interaction discovery response carried an invalid unreadable_count." };
  }

  const records: DiscoveredInteraction[] = [];
  let unreadable = 0;
  for (const item of payload.interactions) {
    const record = parseDiscoveredInteraction(item);
    if (record) records.push(record);
    else unreadable += 1;
  }

  const category =
    payload.category === "pollinator" || payload.category === "mycorrhizal" ? payload.category : "all";
  const totalMatched =
    typeof payload.total_matched === "number" && Number.isFinite(payload.total_matched)
      ? Math.max(payload.total_matched, payload.interactions.length)
      : payload.interactions.length;

  const result: InteractionDiscoveryResult = {
    records,
    count: payload.interactions.length,
    total_matched: totalMatched,
    truncated: payload.truncated === true || totalMatched > payload.interactions.length,
    unreadable_count: unreadable + backendUnreadable,
    backend_unreadable_count: backendUnreadable,
    index_state: parseIndexState(payload),
    index_note: optionalString(payload.index_note),
    category,
    taxon_filter: optionalString(payload.taxon_filter),
    note: optionalString(payload.note),
  };

  if (records.length > 0) return { state: "ok", result };
  if (payload.interactions.length > 0) {
    // Records came back and none were readable: that is not "no interactions".
    return { state: "malformed", reason: "No interaction record in the response could be read." };
  }
  if (backendUnreadable > 0) {
    // The backend matched records it could not read and returned none: that
    // is not "no interactions" either.
    return {
      state: "malformed",
      reason: `The backend matched ${backendUnreadable} interaction record${
        backendUnreadable === 1 ? "" : "s"
      } it could not read, and returned none.`,
    };
  }
  if (result.index_state === "memory_unprovisioned") return { state: "unprovisioned", result };
  return { state: "empty", result };
}

export function buildInteractionDiscoveryUrl(
  taxon: string,
  options: { category?: InteractionCategoryFilter; limit?: number } = {},
): string {
  const params = new URLSearchParams();
  params.set("taxon", taxon.trim().slice(0, MAX_TAXON_LENGTH));
  params.set("category", options.category ?? "all");
  const limit = Math.max(1, Math.min(Math.trunc(options.limit ?? INTERACTION_DISCOVERY_DEFAULT_LIMIT), 500));
  params.set("limit", String(limit));
  return `${CALYX_BACKEND_BASE_URL}${INTERACTION_DISCOVERY_PATH}?${params.toString()}`;
}

/**
 * Fetch interaction candidates for one taxon.
 *
 * An empty taxon is refused locally: the backend treats a missing filter as
 * "every record", which would present other species' interactions on this
 * species' page.
 */
export async function fetchInteractionDiscovery(
  taxon: string,
  options: { category?: InteractionCategoryFilter; limit?: number; signal?: AbortSignal } = {},
): Promise<InteractionDiscoveryState> {
  if (!taxon || !taxon.trim()) {
    return { state: "unavailable", reason: "No species was given to look up interactions for.", httpStatus: null };
  }

  let response: Response;
  try {
    response = await fetch(buildInteractionDiscoveryUrl(taxon, options), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    return { state: "unavailable", reason: "The interaction discovery service could not be reached.", httpStatus: null };
  }

  if (!response.ok) {
    return {
      state: "unavailable",
      reason:
        response.status === 422
          ? "The interaction discovery service rejected the request."
          : "The interaction discovery service is unavailable.",
      httpStatus: response.status,
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { state: "malformed", reason: "The interaction discovery response was not valid JSON." };
  }
  return parseInteractionDiscoveryBody(payload);
}
