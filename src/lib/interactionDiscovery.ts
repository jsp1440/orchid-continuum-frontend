import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";
import { carriesCoordinate, sanitiseLocality, WITHHELD_COORDINATE } from "@/lib/cognitiveIntegration";

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
  /**
   * Readable records not shown because neither side is the page's exact
   * species (set only by `restrictToExactSpecies`).
   */
  other_taxon_excluded_count?: number;
  /**
   * Records whose raw body carried a locality-like key. The key is never
   * copied out (see the allow-list); this count only lets the page say so.
   */
  place_withheld_count?: number;
  /**
   * Records not shown at all because a taxon name, taxon id, interaction type
   * or evidence state carried locality. They are neither "a different taxon"
   * nor absent: they may include exact-species candidates.
   */
  withheld_for_protection_count?: number;
}

export type InteractionDiscoveryState =
  | { state: "ok"; result: InteractionDiscoveryResult }
  | { state: "empty"; result: InteractionDiscoveryResult }
  | { state: "unprovisioned"; result: InteractionDiscoveryResult }
  /**
   * Set only by `restrictToExactSpecies`: no readable record binds to the
   * exact species, but the result was truncated or carried unreadable records,
   * so exact-species candidates may exist. Never shown as "none".
   */
  | { state: "incomplete"; result: InteractionDiscoveryResult }
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

/**
 * Parse one record, allow-listing fields, then screen every allow-listed text
 * value for locality. Returns null when unreadable, or when the record is
 * withheld for locality protection.
 */
export function parseDiscoveredInteraction(raw: unknown): DiscoveredInteraction | null {
  const screened = parseAndScreenInteraction(raw);
  return screened && screened.kind === "shown" ? screened.record : null;
}

type ScreenedInteraction =
  | { kind: "shown"; record: DiscoveredInteraction; fieldsWithheld: number }
  /** An identity field carried locality: the record cannot be shown honestly. */
  | { kind: "withheld_for_locality" };

function parseAndScreenInteraction(raw: unknown): ScreenedInteraction | null {
  const record = parseAllowListedInteraction(raw);
  if (!record) return null;
  return screenRecordLocality(record);
}

function parseAllowListedInteraction(raw: unknown): DiscoveredInteraction | null {
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
  let localityWithheld = 0;
  let localityWithheldRecords = 0;
  for (const item of payload.interactions) {
    const screened = parseAndScreenInteraction(item);
    if (screened && screened.kind === "withheld_for_locality") {
      localityWithheldRecords += 1;
    } else if (screened && screened.kind === "shown") {
      records.push(screened.record);
      // A record whose raw body carried a locality-like key, or whose text had
      // a field withheld, is counted so the page can say so.
      if (screened.fieldsWithheld > 0 || carriesLocalityLikeKey(item)) localityWithheld += 1;
    } else {
      unreadable += 1;
    }
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
    place_withheld_count: localityWithheld,
    withheld_for_protection_count: localityWithheldRecords,
  };

  if (records.length > 0) return { state: "ok", result };
  // Records were withheld for locality protection: that is not "none".
  if (localityWithheldRecords > 0) return { state: "incomplete", result };
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

// ---------------------------------------------------------------------------
// Species-page binding
// ---------------------------------------------------------------------------

/**
 * Whether a species page names exactly one species, so that interaction
 * candidates may be requested for it.
 *
 * The backend's `taxon` filter is a case-insensitive SUBSTRING match on either
 * side of a record (app/interaction_discovery/service.py::_taxon_matches), so
 * `taxon=Orchis` returns every Orchis species' records. A genus-level,
 * infraspecific, hybrid, open-nomenclature (`sp.`, `cf.`, `aff.`) or otherwise
 * ambiguous page therefore sends NO request: showing those records would bind
 * other taxa's candidates to this page.
 */
export type SpeciesInteractionBinding =
  | { kind: "exact_species"; binomial: string }
  | { kind: "genus_level"; reason: string }
  | { kind: "ambiguous"; reason: string };

const GENUS_TOKEN = /^[A-Z][a-z]+$/;
const EPITHET_TOKEN = /^[a-z][a-z-]*[a-z]$/;
const OPEN_NOMENCLATURE = new Set(["sp", "spp", "ssp", "cf", "aff", "indet", "hybrid", "x", "nothosp"]);

export function speciesInteractionBinding(
  genus: string | null | undefined,
  epithet: string | null | undefined,
): SpeciesInteractionBinding {
  const g = String(genus ?? "").trim();
  const e = String(epithet ?? "").trim().replace(/\s+/g, " ");
  if (!g) {
    return {
      kind: "ambiguous",
      reason: "This page carries no genus name, so it is not bound to one exact species.",
    };
  }
  if (!GENUS_TOKEN.test(g)) {
    return {
      kind: "ambiguous",
      reason: `The genus name "${g}" is not a plain genus name (for example a hybrid or intergeneric name), so this page is not bound to one exact species.`,
    };
  }
  if (!e) {
    return {
      kind: "genus_level",
      reason: `This page is bound to the genus ${g}, not to one species. Candidates for a genus would mix records from every species in it, so none are requested.`,
    };
  }
  const first = e.split(" ")[0].replace(/\.$/, "").toLowerCase();
  if (OPEN_NOMENCLATURE.has(first) || e.startsWith("×")) {
    return {
      kind: "ambiguous",
      reason: `"${g} ${e}" is an open-nomenclature or hybrid name, not one exact species, so no candidates are requested.`,
    };
  }
  if (e.includes(" ")) {
    return {
      kind: "ambiguous",
      reason: `"${g} ${e}" is an infraspecific or compound name. Candidate lookup matches names loosely, so it would not stay bound to this exact taxon; none are requested.`,
    };
  }
  if (!EPITHET_TOKEN.test(e)) {
    return {
      kind: "ambiguous",
      reason: `"${g} ${e}" is not a plain species binomial, so this page is not bound to one exact species.`,
    };
  }
  return { kind: "exact_species", binomial: `${g} ${e}` };
}

/**
 * Tokens that, ANYWHERE after the binomial, make a name something other than
 * the bare species: rank markers, hybrid markers, open nomenclature and
 * sensu / misapplication qualifiers. Compared after stripping surrounding
 * brackets and trailing punctuation, case-insensitively.
 */
const DISQUALIFYING_TOKEN =
  /^(?:subsp|ssp|subspecies|var|variety|subvar|f|fo|forma|subf|subforma|cv|cultivar|convar|nothosubsp|nothossp|nothovar|nothof|nothosp|notho|grex|gx|agg|aggr|aff|cf|sensu|s\.?l|s\.?lat|s\.?str|s\.?s|auct|non|nec|p\.?p|pro|hybrid|hybr|x|group|sect|ser|subsect|nm|morph|race|prol|proles|lusus|monstr)$/i;

/** Lower-case words that may appear inside an authorship ("Rchb. f. ex Lindl."). */
const AUTHOR_PARTICLES = new Set(["de", "del", "della", "di", "du", "da", "van", "von", "der", "den", "ter", "ex", "et", "in", "la", "le", "fil", "y", "e", "d"]);

/** Latin epithet endings. A capitalised, unabbreviated token with one is read as an epithet, not an author. */
const EPITHET_ENDING = /(?:a|um|us|is|ae|ii|oides|ans|ens)$/i;

/**
 * Whether a record's taxon name is the exact species `binomial`.
 *
 * Accepts the bare binomial, or the binomial followed by an authorship only.
 * Every later token is examined, split on whitespace AND on "." (so
 * "subsp.signifera" is two tokens). Any of these anywhere after the binomial
 * means the name is not this exact species:
 *   - a rank marker (subsp., var., f., cv., nothosubsp., ...), hybrid marker
 *     (×, x, hybrid) or sensu / auct. / non qualifier -- except the filius
 *     "f." attached to an abbreviated author ("Rchb.f.", "L.f.");
 *   - a quoted cultivar epithet;
 *   - a bare lower-case word that is not an authorship particle;
 *   - a capitalised or upper-case token that looks like an epithet rather
 *     than an author: the page's own epithet in any case ("L. MASCULA"), an
 *     all-capitals word, or an unabbreviated word with a Latin epithet ending
 *     ("L. Alba").
 * So are names whose epithet merely starts with this one ("masculata").
 *
 * This fails closed: an authorship that happens to look like an epithet (a
 * spaced "L. f.", an unabbreviated surname ending in -a) is not matched, and
 * the record is counted, not shown.
 *
 * Not detected (follow-up): intergeneric hybrids written without the hybrid
 * sign under a nothogenus name ("Brassocattleya binosa"). The repository has
 * no nothogenus list to check against; such a name only binds to a page for
 * that same nothogenus binomial, never to a parent species page.
 */
export function nameBindsToExactSpecies(name: string, binomial: string): boolean {
  const n = name.trim().replace(/\s+/g, " ");
  const b = binomial.trim().replace(/\s+/g, " ");
  if (!n || !b) return false;
  if (n.includes("×") || /['"‘’“”]/.test(n)) return false;
  if (n.toLowerCase() === b.toLowerCase()) return true;
  if (!n.toLowerCase().startsWith(`${b.toLowerCase()} `)) return false;
  const epithet = b.split(" ")[1]?.toLowerCase() ?? "";
  const rest = n.slice(b.length + 1).split(" ");
  // The first token after the binomial must open an authorship.
  if (!/^[A-Z(]/.test(rest[0] ?? "")) return false;
  for (const raw of rest) {
    const word = raw.replace(/^[([]+/, "").replace(/[)\],;:]+$/, "");
    if (!word) continue;
    const abbreviated = word.includes(".");
    const bare = word.replace(/\.+$/, "");
    if (bare.toLowerCase() === epithet) return false;
    if (/^[A-Z]{3,}$/.test(bare)) return false;
    if (!abbreviated && /^[A-Z][a-z-]{2,}$/.test(bare) && EPITHET_ENDING.test(bare)) return false;
    const parts = word.split(".").filter(Boolean);
    for (let i = 0; i < parts.length; i += 1) {
      const token = parts[i];
      if (DISQUALIFYING_TOKEN.test(token)) {
        // "Rchb.f." / "L.f.": filius attached to an abbreviated author.
        const filius = (token === "f" || token === "fil") && i > 0 && /^[A-Z]/.test(parts[0]);
        if (!filius) return false;
        continue;
      }
      if (/^[a-z][a-z-]{2,}$/.test(token) && !AUTHOR_PARTICLES.has(token)) return false;
    }
  }
  return true;
}

/**
 * Keep only records in which one side is exactly `binomial`; count the rest.
 *
 * Records bound to another name are NOT dropped silently: the count is kept on
 * the result so the page can say they exist and are not shown here.
 */
export function restrictToExactSpecies(
  state: InteractionDiscoveryState,
  binomial: string,
): InteractionDiscoveryState {
  if (state.state !== "ok") return state;
  const records = state.result.records.filter(
    (record) =>
      nameBindsToExactSpecies(record.source_taxon_name, binomial) ||
      nameBindsToExactSpecies(record.target_taxon_name, binomial),
  );
  const excluded = state.result.records.length - records.length;
  const result: InteractionDiscoveryResult = { ...state.result, records, other_taxon_excluded_count: excluded };
  if (records.length > 0) return { state: "ok", result };
  // Nothing readable binds to this species. That is "none" only when the
  // backend returned its complete match set and every record was readable.
  if (result.truncated || result.unreadable_count > 0 || (result.withheld_for_protection_count ?? 0) > 0) {
    return { state: "incomplete", result };
  }
  if (result.index_state === "memory_unprovisioned") return { state: "unprovisioned", result };
  return { state: "empty", result };
}

// ---------------------------------------------------------------------------
// Locality guard
// ---------------------------------------------------------------------------

/**
 * Key names that denote a place. No captured backend body carries one today
 * (`locator` is a provenance locator: source, study id, taxon ids, type); the
 * record allow-list above already drops every key not listed, and this
 * pattern pins that none of the allow-listed keys is locality-like.
 */
export const LOCALITY_LIKE_KEY =
  /(^|_)(lat|lng|lon|long|latitude|longitude|coord|coords|coordinates|geo|geometry|geojson|point|wkt|locality|localities|location|locationid|place|site|country|countrycode|stateprovince|province|county|municipality|region|elevation|altitude|depth|footprint)(_|$)|decimal(lat|long)|verbatim(locality|coordinates|latitude|longitude)|state_province|^(decimallatitude|decimallongitude|localityname|locationname|georeference.*)$/i;

export function isLocalityLikeKey(key: string): boolean {
  const normalised = key.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  return LOCALITY_LIKE_KEY.test(normalised) || LOCALITY_LIKE_KEY.test(key.toLowerCase());
}

/** Nodes / depth beyond which a raw value is treated as carrying locality. */
const LOCALITY_SCAN_MAX_NODES = 10_000;
const LOCALITY_SCAN_MAX_DEPTH = 256;

/**
 * Whether a raw value carries a locality-like key at any depth.
 *
 * Iterative and cycle-safe. A value too large or too deep to scan completely
 * FAILS CLOSED: it is reported as carrying locality.
 */
export function carriesLocalityLikeKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const seen = new WeakSet<object>();
  const stack: { node: object; depth: number }[] = [{ node: value as object, depth: 0 }];
  let visited = 0;
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    if (seen.has(node)) continue;
    seen.add(node);
    visited += 1;
    if (visited > LOCALITY_SCAN_MAX_NODES || depth > LOCALITY_SCAN_MAX_DEPTH) return true;
    const entries: [string | null, unknown][] = Array.isArray(node)
      ? node.map((child) => [null, child] as [null, unknown])
      : Object.entries(node as Record<string, unknown>);
    for (const [key, child] of entries) {
      if (key !== null && isLocalityLikeKey(key)) return true;
      if (child && typeof child === "object") stack.push({ node: child, depth: depth + 1 });
    }
  }
  return false;
}

/**
 * URL parameter names that carry a position or a place. Matched as a
 * substring of the (decoded, lower-cased) parameter name, so prefixed forms
 * such as GloBI's `nw_lat` / `se_lng` are caught.
 */
const LOCALITY_PARAM_NAME =
  /lat|lng|lon|coord|geo|bbox|wkt|point|geometry|locality|state_?province|country|county|municipality|location|position|center|centre|^ll$|^sll$|^pos$|^loc$/;

/** Rounds of percent-decoding before a value is treated as unscreenable. */
const MAX_DECODE_ROUNDS = 5;

/**
 * Percent-decode repeatedly (bounded), byte by byte, and fold `+` to a space.
 * Returns null when the value is still changing after the last round: an
 * encoding that deep is not screened, it is withheld.
 */
function decodeForScreening(value: string): string | null {
  let current = value;
  for (let round = 0; round < MAX_DECODE_ROUNDS; round += 1) {
    const next = current.replace(/\+/g, " ").replace(/%([0-9a-f]{2})/gi, (_m, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
    if (next === current) return current;
    current = next;
  }
  return null;
}

/** Whether a (decoded) value carries a position-bearing URL parameter or a geo: URI. */
function carriesLocalityParam(decoded: string): boolean {
  const text = decoded.toLowerCase();
  if (/\bgeo:/.test(text)) return true;
  for (const match of text.matchAll(/(?:^|[?&#;/])([^?&#;/=\s]{1,64})=/g)) {
    if (LOCALITY_PARAM_NAME.test(match[1])) return true;
  }
  return false;
}

const NUMBER_WORD =
  "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety|hundred)";
const NUMBER_PHRASE = `${NUMBER_WORD}(?:[\\s-]+(?:and[\\s-]+)?${NUMBER_WORD}){0,4}`;
const DEGREE = "(?:°|deg\\.?|degrees?)";

/**
 * Coordinate shapes the shared screen does not cover, all bounded (no
 * unbounded repetition next to an overlapping one), so each start position
 * costs a bounded amount of work.
 */
const EXTRA_COORDINATE_SHAPE = new RegExp(
  [
    // Written out: "forty-eight degrees twelve minutes north".
    `\\b${NUMBER_PHRASE}\\s+${DEGREE}(?![a-z])[^\\n]{0,60}?\\b(?:north|south|east|west|minutes?)\\b`,
    // Digits then words: "48 degrees twelve minutes".
    `\\b\\d{1,3}\\s*${DEGREE}\\s+${NUMBER_PHRASE}\\s+minutes?\\b`,
  ].join("|"),
  "i",
);

/** Hemisphere-letter shapes, case-sensitive (lower-case n/s/e/w are ordinary words). */
const EXTRA_COORDINATE_SHAPE_CASED = new RegExp(
  [
    // Spaced DMS: "48 12 30 N", "16 22 23.5 E".
    "\\b\\d{1,3}\\s\\d{1,2}\\s\\d{1,2}(?:\\.\\d+)?\\s?[NSEW]\\b",
    // Degrees and decimal minutes: "48 12.500 N".
    "\\b\\d{1,3}\\s\\d{1,2}\\.\\d+\\s?[NSEW]\\b",
    // Hemisphere first: "N48 12.500", "E016 22.383", "N 48°12'".
    "\\b[NSEW]\\s?\\d{1,3}(?:°\\s?|\\s)\\d{1,2}(?:\\.\\d+|['′])",
  ].join("|"),
);

/**
 * Whether one text value carries locality on its own: the shared coordinate
 * screen, the extra shapes above, and URL position/place parameters after
 * bounded percent-decoding. Values longer than `MAX_SCREENED_TEXT_LENGTH`, or
 * encoded too deeply to decode, are treated as carrying locality.
 */
export function textCarriesLocality(value: string): boolean {
  if (value.length > MAX_SCREENED_TEXT_LENGTH) return true;
  const decoded = decodeForScreening(value);
  if (decoded === null) return true;
  let normalised: string;
  try {
    normalised = decoded.normalize("NFKC");
  } catch {
    normalised = decoded;
  }
  // Collapse whitespace runs: no shape depends on run length, and it keeps
  // the scan's cost proportional to the text.
  const collapsed = normalised.replace(/\s+/g, " ");
  for (const variant of collapsed === value ? [value] : [value.replace(/\s+/g, " "), collapsed]) {
    if (carriesCoordinate(variant) || EXTRA_COORDINATE_SHAPE.test(variant) || EXTRA_COORDINATE_SHAPE_CASED.test(variant)) {
      return true;
    }
  }
  return carriesLocalityParam(collapsed);
}

/** A decimal with position precision (three or more places, magnitude up to 180), standing alone. */
const POSITION_PRECISION_DECIMAL = /(?:^|[^\d.])[-+]?(?:1[0-7]\d|\d{1,2})\.\d{3,}(?![\d.])/;
const DOI_SHAPE = /^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)?10\.\d{4,9}\/\S+$/i;

/** Longest text value screened; anything longer is withheld (fails closed, keeps screening linear). */
export const MAX_SCREENED_TEXT_LENGTH = 2_000;
export const WITHHELD_UNSCREENABLE = "[withheld: too long to screen for locality]";

/**
 * Fields that say WHAT the record is. They are screened one at a time and
 * never rewritten: a record whose identity carries locality is withheld
 * whole (and counted as such), because rewriting a taxon name would make the
 * exact-species filter read the record as a different taxon.
 */
const IDENTITY_FIELDS = [
  "source_taxon_name",
  "source_taxon_id",
  "target_taxon_name",
  "target_taxon_id",
  "interaction_type",
  "verification_state",
] as const;

/** Free-text provenance fields: screened together, withheld field by field. */
const FREE_TEXT_FIELDS = [
  "study_citation",
  "study_source_citation",
  "study_external_id",
  "provider",
  "provider_stability",
  "dataset_version",
] as const;

/**
 * Screen a parsed record for locality.
 *
 * Identity fields (taxon names and ids, interaction type, evidence state) are
 * checked one at a time; if any carries locality the record is withheld
 * whole. Free-text provenance fields go through the shared screen
 * (`sanitiseLocality` in cognitiveIntegration.ts, which also catches pairs
 * split across adjacent fields) plus `textCarriesLocality`; a value that
 * carries locality is replaced whole, never partially redacted. A pair split
 * across non-adjacent fields -- two fields each carrying a position-precision
 * decimal -- withholds those free-text fields, or the whole record when one
 * half is an identity field.
 */
export function screenRecordLocality(record: DiscoveredInteraction): ScreenedInteraction {
  const fields = record as unknown as Record<string, unknown>;
  for (const key of IDENTITY_FIELDS) {
    const value = fields[key];
    if (typeof value === "string" && textCarriesLocality(value)) return { kind: "withheld_for_locality" };
  }

  let fieldsWithheld = 0;
  const scanInput: Record<string, string> = {};
  const preWithheld: Record<string, string> = {};
  for (const key of FREE_TEXT_FIELDS) {
    const value = fields[key];
    if (typeof value !== "string") continue;
    if (value.length > MAX_SCREENED_TEXT_LENGTH) {
      preWithheld[key] = WITHHELD_UNSCREENABLE;
    } else if (textCarriesLocality(value)) {
      preWithheld[key] = WITHHELD_COORDINATE;
    } else {
      scanInput[key] = value.replace(/\s+/g, " ");
    }
  }
  fieldsWithheld += Object.keys(preWithheld).length;
  const { value: scanned, fieldsWithheld: shapeWithheld } = sanitiseLocality(scanInput);
  fieldsWithheld += shapeWithheld;

  const halfOf = (value: unknown) =>
    typeof value === "string" &&
    value !== WITHHELD_COORDINATE &&
    !DOI_SHAPE.test(value.trim()) &&
    POSITION_PRECISION_DECIMAL.test(value);
  const identityHalves = IDENTITY_FIELDS.filter((key) => halfOf(fields[key]));
  const textHalves = Object.keys(scanned).filter((key) => halfOf(scanned[key]));
  if (identityHalves.length + textHalves.length >= 2) {
    if (identityHalves.length > 0) return { kind: "withheld_for_locality" };
    for (const key of textHalves) {
      scanned[key] = WITHHELD_COORDINATE;
      fieldsWithheld += 1;
    }
  }

  const out: Record<string, unknown> = { ...fields };
  for (const key of FREE_TEXT_FIELDS) {
    if (key in preWithheld) out[key] = preWithheld[key];
    else if (key in scanned && scanned[key] !== scanInput[key]) out[key] = scanned[key];
    // Otherwise the value the source wrote is rendered unchanged.
  }
  return { kind: "shown", record: out as unknown as DiscoveredInteraction, fieldsWithheld };
}

// ---------------------------------------------------------------------------
// Study reference links
// ---------------------------------------------------------------------------

/**
 * A DOI, bare, `doi:`-prefixed or as a doi.org URL. The suffix is limited to
 * the characters Crossref recommends, so no query string can ride along.
 */
const DOI_PATTERN = /^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)$/i;

/** Hosts whose study pages may be linked. Exact host match; nothing else becomes a link. */
const LINKABLE_STUDY_HOSTS = new Set([
  "globalbioticinteractions.org",
  "www.globalbioticinteractions.org",
  "gbif.org",
  "www.gbif.org",
]);

/**
 * Where a study reference may link, or null to render it as plain text.
 *
 * Only a valid DOI (resolved through https://doi.org/) or an https URL on an
 * allow-listed provider host is linked. A withheld value, a URL on any other
 * host (including look-alikes such as doi.org.evil.com), a URL with
 * credentials, and a URL carrying position parameters are never links. The
 * reference itself is still shown verbatim unless it was withheld.
 */
export function studyReferenceUrl(value: string | null): string | null {
  if (!value || value === WITHHELD_COORDINATE || value === WITHHELD_UNSCREENABLE) return null;
  const doi = value.trim().match(DOI_PATTERN);
  if (doi) return `https://doi.org/${doi[1]}`;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (!LINKABLE_STUDY_HOSTS.has(url.hostname.toLowerCase())) return null;
  // Query, fragment and path are screened after bounded percent-decoding;
  // any position or place parameter makes the reference plain text.
  if (textCarriesLocality(value) || textCarriesLocality(url.href)) return null;
  return url.toString();
}
