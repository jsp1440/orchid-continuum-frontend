import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";

/**
 * Client for the Cognitive Integration reasoning map.
 *
 * Contract read from app/cognitive_integration/routes.py and executor.py on the
 * backend (#1502), not inferred. Every field below is one the endpoint returns.
 *
 * FIVE STATES THIS SURFACE MUST KEEP APART
 *
 *   evidence       a retrieved claim with a citation. It is what a source says,
 *                  not what is true.
 *   hypothesis     a proposed mechanism. Never promoted by rendering it.
 *   contradiction  two claims that disagree. Shown as both, never averaged and
 *                  never silently resolved in favour of the better-supported one.
 *   uncertainty    qualitative confidence with a written basis. There is no
 *                  number, because nothing retrieved supports one.
 *   unknown        something the evidence does not cover. Absence stated, not
 *                  absence hidden.
 *
 * Collapsing any two of those is the failure mode. A contradiction rendered as a
 * single answer reads as settled science; a gap left unrendered reads as
 * completeness. The backend already keeps them apart; this client carries that
 * through rather than flattening it for display.
 *
 * The map is assembled deterministically. `execution.provider_calls` is zero on
 * that path, and a non-zero value means prose was generated — never that the
 * reasoning was.
 */

export type EvidenceState =
  /** A source supports this. */
  | "SUPPORTED"
  /** Sources disagree. Both are carried. */
  | "CONTESTED"
  /** Reported, with nothing corroborating it. */
  | "REPORTED_UNVERIFIED"
  /** A source contradicts this. */
  | "REFUTED";

export type MechanismKind =
  | "proposed_mechanism"
  | "competing_mechanism"
  /** The explanation in which no relationship exists. Its presence is the point. */
  | "null_explanation";

export type ContradictionResolution =
  /** Left standing, shown as contested. */
  | "unresolved_presented_as_contested"
  /** The claims apply to different places or times, so they do not conflict. */
  | "resolved_by_scope"
  | "resolved_by_evidence";

export interface Provenance {
  source_type: string;
  citation: string;
  identifier: string | null;
}

export interface Relationship {
  subject: string;
  predicate: string;
  object: string;
  evidence_state: EvidenceState;
  geographic_scope: string | null;
  provenance: Provenance[];
}

export interface Mechanism {
  name: string;
  kind: MechanismKind;
  statement: string;
  evidence_state: EvidenceState;
}

export interface Contradiction {
  between: string[];
  description: string;
  resolution: ContradictionResolution;
  scopes: (string | null)[];
}

export interface ReasoningMap {
  schema_version: string;
  question: string;
  intent: { decomposition: string[]; deterministic: boolean };
  capabilities_selected: string[];
  taxonomic_identity: {
    accepted_name: string;
    authorship: string | null;
    rank: string;
    taxonomic_status: string;
    resolved_against: string;
  };
  relationships: Relationship[];
  geographic_context: {
    scope: string;
    environmental_notes: string[];
    coordinates_present: boolean;
  };
  mechanisms: Mechanism[];
  contradictions: Contradiction[];
  evidence_gaps: string[];
  known_unknowns: string[];
  confidence: {
    qualitative: "low" | "moderate" | "high";
    basis: string;
    numeric_precision_claimed: boolean;
  };
  locality_policy: {
    protected_taxon_present: boolean;
    disclosure: string;
    redaction_applied: boolean;
  };
  recommended_next_evidence: string[];
  handoffs: {
    research_station: { available: boolean; carries_evidence_states: boolean };
    education: { available: boolean; audience_adaptation_may_change_meaning: boolean };
  };
  governance: Record<string, boolean>;
  execution?: {
    traversal?: { path_count: number; node_count: number; edge_count: number; engine: string };
    explanation: string | null;
    explanation_available: boolean;
    explanation_capability?: string;
    provider_calls: number;
  };
}

export type ReasoningMapFailureKind =
  /** The question is outside the deterministic set. Not an error in the system. */
  | "question_not_supported"
  /** The backend could not assemble a map. It refused rather than serving a partial one. */
  | "unavailable"
  /** No backend is configured for this deployment. */
  | "unconfigured"
  /** The request did not complete. */
  | "network";

export interface ReasoningMapFailure {
  ok: false;
  kind: ReasoningMapFailureKind;
  message: string;
  /** Present when the question was refused: what answering it would need. */
  requiredCapability?: string;
  supportedQuestions?: string[];
}

export interface ReasoningMapSuccess {
  ok: true;
  map: ReasoningMap;
}

export type ReasoningMapResult = ReasoningMapSuccess | ReasoningMapFailure;

/** Explicit guard, so a caller cannot render a failure as if it were a map. */
export function isReasoningMapFailure(
  result: ReasoningMapResult,
): result is ReasoningMapFailure {
  return result.ok === false;
}

export const DEFAULT_QUESTION =
  "What pollinates the bee orchid, and is the answer the same everywhere it grows?";

export async function fetchReasoningMap(
  question: string = DEFAULT_QUESTION,
  fetchImpl: typeof fetch = fetch,
): Promise<ReasoningMapResult> {
  const base = (CALYX_BACKEND_BASE_URL || "").replace(/\/+$/, "");
  if (!base) {
    return {
      ok: false,
      kind: "unconfigured",
      message: "No Calyx backend is configured for this deployment.",
    };
  }

  let response: Response;
  try {
    response = await fetchImpl(
      `${base}/api/cognitive-integration/reasoning-map?question=${encodeURIComponent(question)}`,
      { headers: { Accept: "application/json" } },
    );
  } catch (error) {
    return {
      ok: false,
      kind: "network",
      message: error instanceof Error ? error.message : "The request did not complete.",
    };
  }

  if (response.status === 422) {
    const detail = (await response.json().catch(() => null))?.detail ?? {};
    return {
      ok: false,
      kind: "question_not_supported",
      message:
        detail.message ??
        "This question is not one the stored reasoning covers.",
      requiredCapability: detail.required_capability,
      supportedQuestions: detail.supported_questions,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: "unavailable",
      message: `The reasoning map is unavailable (HTTP ${response.status}).`,
    };
  }

  const map = (await response.json()) as ReasoningMap;
  return { ok: true, map };
}

/** Relationships a source supports, kept apart from those that are merely reported. */
export function supportedRelationships(map: ReasoningMap): Relationship[] {
  return map.relationships.filter((r) => r.evidence_state === "SUPPORTED");
}

/** Relationships where sources disagree. Rendering these as settled would be the lie. */
export function contestedRelationships(map: ReasoningMap): Relationship[] {
  return map.relationships.filter((r) => r.evidence_state === "CONTESTED");
}

/** Relationships a source contradicts. Distinct from merely uncorroborated. */
export function refutedRelationships(map: ReasoningMap): Relationship[] {
  return map.relationships.filter((r) => r.evidence_state === "REFUTED");
}

/** Relationships nothing corroborates and nothing contradicts. */
export function uncorroboratedRelationships(map: ReasoningMap): Relationship[] {
  return map.relationships.filter((r) => r.evidence_state === "REPORTED_UNVERIFIED");
}

export type Settlement =
  /** A disagreement is standing. Nothing here may be read as the answer. */
  | "unsettled"
  /** Both accounts hold, in different places. Neither replaces the other. */
  | "settled_by_scope"
  /** Retrieved evidence settled it, or nothing disagreed in the first place. */
  | "settled";

/**
 * How far the reasoning got, in the only three states it can honestly be in.
 *
 * Reading `contradictions` alone is not enough. A relationship carrying
 * `CONTESTED` is a disagreement whether or not anything wrote it up, and a map
 * that states one while listing no contradiction has described a conflict it
 * has not accounted for — the header must not call that an answer.
 *
 * `settled_by_scope` is deliberately not folded into `settled`. Scope
 * resolution means both accounts survive, partitioned; saying "the evidence
 * points to one account" would discard the half that applies elsewhere.
 */
const KNOWN_RESOLUTIONS: ContradictionResolution[] = [
  "unresolved_presented_as_contested",
  "resolved_by_scope",
  "resolved_by_evidence",
];

const KNOWN_EVIDENCE_STATES: EvidenceState[] = [
  "SUPPORTED",
  "CONTESTED",
  "REPORTED_UNVERIFIED",
  "REFUTED",
];

/**
 * Whether a written-up contradiction is about this relationship.
 *
 * `includes` on its own fails open in two ways a checker demonstrated: an empty
 * `predicate` or `object` makes `claim.includes("")` true, so one blank field
 * lets *any* contradiction account for *every* contested relationship; and a
 * coincidental substring — a contradiction about `"Bees were not recorded in
 * the 1961 survey"` — settles a contested claim whose object is `"Bees"`.
 *
 * Both halves must be present, non-trivial, and matched on a word boundary.
 */
function claimMentions(claim: string, term: string): boolean {
  const trimmed = term.trim();
  if (trimmed.length < 3) return false;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\W)${escaped}(?:\\W|$)`, "i").test(claim);
}

export function settlement(map: ReasoningMap): Settlement {
  // Anything not recognised is unsettled. Falling through to "settled" is how
  // an unknown resolution string printed "The evidence points to one account"
  // above a note reading "Left standing. Nothing retrieved settles it."
  if (map.contradictions.some((c) => !KNOWN_RESOLUTIONS.includes(c.resolution))) {
    return "unsettled";
  }
  // An evidence state outside the union is unknown, not "not contested". A
  // relationship whose state has been damaged — by upstream corruption, or by
  // this surface's own redaction overwriting it — must not be read as
  // agreement. That is how withholding a coordinate in a relationship turned a
  // contested question into "one account".
  if (map.relationships.some((r) => !KNOWN_EVIDENCE_STATES.includes(r.evidence_state))) {
    return "unsettled";
  }
  if (
    map.contradictions.some((c) => c.resolution === "unresolved_presented_as_contested")
  ) {
    return "unsettled";
  }
  // A contested relationship is a disagreement whether or not anything wrote it
  // up, and a contradiction about some *other* pair of claims does not account
  // for it.
  const contested = contestedRelationships(map);
  if (contested.length > 0) {
    const accounted = contested.every((relationship) =>
      map.contradictions.some((c) =>
        c.between.some(
          (claim) =>
            claimMentions(claim, relationship.object) &&
            claimMentions(claim, relationship.predicate),
        ),
      ),
    );
    if (!accounted) return "unsettled";
  }
  if (map.contradictions.some((c) => c.resolution === "resolved_by_scope")) {
    return "settled_by_scope";
  }
  return "settled";
}

/**
 * Whether anything here may be read as an answer.
 *
 * False when a disagreement is left standing: the honest surface for that is
 * "sources disagree", not a conclusion.
 */
export function hasSettledAnswer(map: ReasoningMap): boolean {
  return settlement(map) !== "unsettled";
}

/**
 * Coordinate shapes, so this surface does not print one.
 *
 * The backend redacts and fails closed, and the map arrives carrying
 * `coordinates_present: false`. This does not take that on trust. A protected
 * locality leaked by a bug upstream is disclosed the moment it is painted, and
 * the reader has no way to know the field they are looking at was supposed to
 * have been cleaned. So the text is checked here too, immediately before it is
 * rendered, in whatever field it arrives in.
 *
 * The shapes, widened after a backend checker walked five more past an
 * equivalent pattern: a decimal pair however separated; a lat/lon-labelled
 * number; degrees and minutes written with symbols or with words; degrees with
 * a spelled-out hemisphere ("51.7520 degrees north" carries ~10 m and contains
 * no decimal pair at all); European comma decimals; UTM and MGRS grid
 * references; and Open Location Codes. Four of those five never write a
 * digits-and-dot pair, which is what a first pass assumes a coordinate is.
 *
 * This is a list of shapes someone thought of, not a proof. It is why the
 * footer reports what the scan found rather than asserting the page is clean.
 */
const DEGREE_WORD = "(?:°|deg\\.?|degrees?)";
const MINUTE_WORD = "(?:['‘’′]|min\\.?|minutes?)";
const HEMISPHERE = "(?:[NSEW]\\b|north|south|east|west)";
//: `_` is a separator here because the panel rewrites `_` to a space before
//: painting. Without it, `51.7523_-1.2578` passes the scan and the *render*
//: then synthesises a valid decimal pair on screen — the page manufacturing
//: the coordinate it just certified as absent.
const SEP = "(?:[,;_]\\s*|\\s+)";

const COORDINATE_SHAPE = new RegExp(
  [
    `[-+]?\\d{1,3}\\.\\d+\\s*${SEP}[-+]?\\d{1,3}\\.\\d+`,
    "\\b(?:lat|latitude|lng|lon|long|longitude)\\b\\s*[=:]?\\s*[-+]?\\d+(?:\\.\\d+)?",
    `\\d{1,3}\\s*${DEGREE_WORD}\\s*\\d{1,2}\\s*${MINUTE_WORD}`,
    `\\d{1,3}(?:\\.\\d+)?\\s*${DEGREE_WORD}\\s*${HEMISPHERE}`,
    // Hemisphere *before* the number, which the arm above cannot see.
    "\\b[NSEW]\\s*[-+]?\\d{1,3}\\.\\d+",
    "\\d{1,3},(?:\\d{1,2}|\\d{4,})\\s*(?:[; ]\\s*)[-+]?\\d{1,3},(?:\\d{1,2}|\\d{4,})",
    // UTM / MGRS, spaced and unspaced. The digit run is a pair.
    "\\b\\d{1,2}\\s*[C-HJ-NP-X]\\s*[A-Z]{2}\\s*\\d{4,10}(?:\\s+\\d{4,10})?\\b",
    "\\bUTM\\b[^\\n]{0,24}?\\d{5,7}\\s+\\d{5,8}",
    "\\b\\d{1,2}[C-HJ-NP-X]\\s+\\d{5,7}\\s+\\d{5,8}\\b",
    // Two long digit runs side by side: a projected coordinate, including the
    // Swiss and other national grids.
    "\\b\\d{5,8}\\s+\\d{5,8}\\b",
    // Ordnance Survey national grid, spaced or not.
    "\\b[HNOST][A-Z]\\s?\\d{2,5}\\s?\\d{2,5}\\b",
    // Open Location Code.
    "\\b[23456789CFGHJMPQRVWX]{4,8}\\+[23456789CFGHJMPQRVWX]{2,7}\\b",
    // Geohash: base-32 without a, i, l or o, and containing a digit. The
    // excluded letters are what stop this matching ordinary words.
    "\\b(?=[0-9bcdefghjkmnpqrstuvwxyz]*\\d)[0-9bcdefghjkmnpqrstuvwxyz]{7,12}\\b",
    "///[a-z]+\\.[a-z]+\\.[a-z]+",
    // what3words with the `///` left off, which is how people usually write it:
    // three lowercase words resolving a 3m square, finer than any decimal pair
    // above. Anchored to the whole field rather than matched inside prose,
    // because unanchored it also redacts ordinary dotted identifiers -- it ate
    // `app.brain.reasoning_map.ReasoningMapEngine`, the traversal engine this
    // panel is supposed to display, which is defending the page by breaking
    // what it exists to show. A bare address as an entire field value is caught;
    // one buried mid-sentence is not, and that gap is stated rather than hidden.
    "^\\s*[a-z]{3,}\\.[a-z]{3,}\\.[a-z]{3,}\\s*$",
    // Degrees and decimal minutes with no symbol: `5145.20N 0115.47W`. This is
    // what a GPS receiver emits (NMEA), carries ~10m, and writes no pair the
    // decimal arm can see.
    "\\b\\d{3,5}\\.\\d{1,4}\\s*[NSEW]\\b",
    // Integer degrees with hemispheres, `51N 1W`. Coarse at ~100km, but it is
    // the whole-number form of a shape already covered for decimals.
    "\\b\\d{1,3}\\s*[NS]\\s*[,;]?\\s*\\d{1,3}\\s*[EW]\\b",
    "[@=]\\s*[-+]?\\d{1,3}(?:\\.\\d+)?\\s*[/,]\\s*[-+]?\\d{1,3}(?:\\.\\d+)?",
    "(?:^|[^\\d.])[-+]?\\d{1,3}\\s*,\\s*[-+]\\d{1,3}(?!\\d|\\.\\d)",
    "\\d{1,3}\\s+\\d{1,2}['‘’′]\\d{1,2}(?:[\"“”″])?\\s*[NSEW]\\b",
  ].join("|"),
  "gi",
);

/**
 * A pair divided between fields that render together.
 *
 * Deliberately far stricter than the earlier version, which took any two
 * decimals within 80 characters. That withheld `"Labellum 10.5 mm long and
 * 8.25 mm wide"`, `"pp. 63.4 and 71.2"` and — worst — the top-level pair
 * `{schema_version: "1.0.0", question: "…above 2.5 m elevation?"}`, redacting
 * the reader's own question at the top of the page. Mangling the provenance
 * this panel exists to display is not a safe failure; it is the page defending
 * itself by becoming useless.
 *
 * Three decimal places is the discriminator. A position recorded to locate a
 * site carries four or more; a measurement, a page range and a version string
 * carry one or two.
 */
const COORDINATE_ACROSS_FIELDS = new RegExp(
  "[-+]?(?:1[0-7]\\d|\\d{1,2})\\.\\d{3,}\\D{0,80}[-+]?(?:1[0-7]\\d|\\d{1,2})\\.\\d{3,}",
  "i",
);

/**
 * Fold every Unicode decimal digit to ASCII, then normalise.
 *
 * NFKC handles full-width digits, because they are compatibility-equivalent to
 * ASCII. Devanagari and Arabic-Indic digits are not, so NFKC leaves them alone
 * and `\d` without the `u` flag cannot see them: `५१.७५२३, -१.२५७८` is the same
 * position as `51.7523, -1.2578` and walked through untouched.
 */
function digitValue(ch: string): number | null {
  if (!/\p{Nd}/u.test(ch)) return null;
  const code = ch.codePointAt(0);
  if (code === undefined) return null;
  // Unicode lays every decimal-digit block out as ten consecutive code points
  // starting at that script's zero, so the value is the distance back to the
  // first code point whose predecessor is not itself a digit.
  for (let offset = 0; offset < 10; offset += 1) {
    const candidate = code - offset;
    if (candidate <= 0) break;
    if (!/\p{Nd}/u.test(String.fromCodePoint(candidate - 1))) return offset;
  }
  return null;
}

function foldDigits(text: string): string {
  let out = "";
  for (const ch of text) {
    const value = digitValue(ch);
    out += value === null ? ch : String(value);
  }
  return out;
}

function normalised(text: string): string {
  // `_` becomes a space before this text is painted, so the scan has to see the
  // string the reader will see. Doing it here covers every arm; `SEP` covered
  // only the decimal-pair one, which is why `632540_5712345` passed the scan
  // and the render then synthesised `632540 5712345` in the locality footer --
  // the page manufacturing the coordinate it had just certified absent.
  const painted = (value: string) => value.replace(/_/g, " ");
  try {
    return painted(foldDigits(text.normalize("NFKC")));
  } catch {
    return painted(foldDigits(text));
  }
}

/** True when the text carries something shaped like a coordinate. */
export function carriesCoordinate(text: string): boolean {
  COORDINATE_SHAPE.lastIndex = 0;
  return COORDINATE_SHAPE.test(normalised(text));
}

/** What stands in for a coordinate this surface refused to print. */
export const WITHHELD_COORDINATE = "[coordinate withheld]";

/**
 * Withhold whole fields, not matched spans.
 *
 * Replacing only the match leaks twice: the marker announces *where* a position
 * was removed, and an unmatched half of the pair stays verbatim beside it.
 */
export function withholdField(text: string): string {
  return carriesCoordinate(text) ? WITHHELD_COORDINATE : text;
}

/**
 * Fields whose value is drawn from a fixed vocabulary, not written by anyone.
 *
 * These must never be rewritten. `evidence_state` is the reason: overwriting a
 * `CONTESTED` relationship with the withheld marker took it out of
 * `contestedRelationships()`, and the headline then read "The evidence points
 * to one account" for a question whose sources disagree — the exact failure
 * this panel exists to prevent, caused by the privacy defence meant to protect
 * it.
 *
 * A coordinate arriving in one of these is a corrupt map, not a locality leak.
 * It is left in place, it fails its own union check downstream, and every
 * consumer of that union fails closed.
 */
const VOCABULARY_FIELDS = new Set([
  "evidence_state",
  "kind",
  "resolution",
  "qualitative",
  "schema_version",
]);

/**
 * Whether a vocabulary field holds a value this build recognises.
 *
 * Exempting these from redaction only stays safe because the panel never
 * paints one raw: an unrecognised value renders as a named unknown, so a
 * coordinate arriving in `evidence_state` neither reaches the reader nor
 * silently becomes "not contested".
 */
export function isKnownVocabulary(field: string, value: unknown): boolean {
  const unions: Record<string, readonly string[]> = {
    evidence_state: KNOWN_EVIDENCE_STATES,
    resolution: KNOWN_RESOLUTIONS,
    kind: ["proposed_mechanism", "competing_mechanism", "null_explanation"],
    qualitative: ["low", "moderate", "high"],
  };
  const union = unions[field];
  return union ? union.includes(String(value)) : true;
}

/** How many fields a sanitising pass withheld. */
export interface Sanitised<T> {
  value: T;
  fieldsWithheld: number;
}

/**
 * Sanitise every string in a value, whatever shape the value is.
 *
 * Two passes, because a pair can be divided between fields that render
 * together and neither half matches alone.
 *
 * Pass one withholds any string that carries a position by itself. Pass two
 * walks bottom-up and, for each node, joins the strings that *survived* pass
 * one; if that joined text carries a pair, every surviving string under that
 * node is withheld. Running pass two on the remainder is what stops a single
 * decoy match disabling the check for its siblings, and doing it per node —
 * rather than per object's own properties — is what covers arrays, arrays of
 * arrays, single-property objects, and a pair split between a parent and a
 * child.
 *
 * What this does NOT cover, stated because the previous framing over-claimed:
 * it walks strings and numbers, not object keys, and its reach is exactly the
 * reach of `COORDINATE_SHAPE`. It is a list of shapes someone thought of. That
 * is why the footer reports what it withheld rather than certifying absence.
 */
export function sanitiseLocality<T>(input: T): Sanitised<T> {
  let fieldsWithheld = 0;

  const walk = (value: unknown, key?: string): unknown => {
    if (typeof value === "string") {
      if (key !== undefined && VOCABULARY_FIELDS.has(key)) return value;
      const safe = withholdField(value);
      if (safe !== value) fieldsWithheld += 1;
      return safe;
    }
    // A number can be a position too. `geographic_context.latitude = 51.7523`
    // was walked straight past while the footer reported a clean page.
    if (typeof value === "number") {
      if (key !== undefined && VOCABULARY_FIELDS.has(key)) return value;
      if (carriesCoordinate(`${value} ${value}`) || /^-?\d{1,3}\.\d{3,}$/.test(String(value))) {
        fieldsWithheld += 1;
        return WITHHELD_COORDINATE;
      }
      return value;
    }
    if (Array.isArray(value)) return value.map((child) => walk(child, key));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
        out[childKey] = walk(child, childKey);
      }
      return out;
    }
    return value;
  };

  /** Strings still present under a node, with a setter for each. */
  const survivors = (
    node: unknown,
    assign: (next: unknown) => void,
    key?: string,
  ): { text: string; clear: () => void }[] => {
    if (typeof node === "string") {
      if (node === WITHHELD_COORDINATE) return [];
      if (key !== undefined && VOCABULARY_FIELDS.has(key)) return [];
      return [{ text: node, clear: () => assign(WITHHELD_COORDINATE) }];
    }
    if (Array.isArray(node)) {
      return node.flatMap((child, index) =>
        survivors(child, (next) => {
          node[index] = next;
        }, key),
      );
    }
    if (node && typeof node === "object") {
      const record = node as Record<string, unknown>;
      return Object.keys(record).flatMap((childKey) =>
        survivors(record[childKey], (next) => {
          record[childKey] = next;
        }, childKey),
      );
    }
    return [];
  };

  const joinPass = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    for (const child of Array.isArray(node)
      ? node
      : Object.values(node as Record<string, unknown>)) {
      joinPass(child);
    }
    const remaining = survivors(node, () => {});
    if (remaining.length < 2) return;
    if (!COORDINATE_ACROSS_FIELDS.test(normalised(remaining.map((r) => r.text).join(" ")))) {
      return;
    }
    // Re-collect with live setters, because the recursion above may have
    // already cleared some of them at a deeper node.
    for (const survivor of survivors(node, () => {})) {
      survivor.clear();
      fieldsWithheld += 1;
    }
  };

  const value = walk(input) as T;
  joinPass(value);
  return { value, fieldsWithheld };
}

export interface LocalityScan {
  /** How many fields this pass withheld. */
  fieldsWithheld: number;
  /** True when the map claimed no coordinates and this pass withheld one anyway. */
  contradictsDeclaredPolicy: boolean;
}

/**
 * The map as it is safe to render, and what was done to it.
 *
 * Note what this deliberately no longer reports: whether the map was *clean*.
 * A pattern list finding nothing is not the same as nothing being there, and
 * the previous footer turned the first into the second. A checker put 146
 * positions onto the page under the sentence "none carried a coordinate".
 */
export function sanitiseMap(map: ReasoningMap): { map: ReasoningMap; scan: LocalityScan } {
  const { value, fieldsWithheld } = sanitiseLocality(map);
  return {
    map: value,
    scan: {
      fieldsWithheld,
      contradictsDeclaredPolicy:
        fieldsWithheld > 0 && map.geographic_context.coordinates_present === false,
    },
  };
}

/** The refusal surface is text from the backend too, and is sanitised the same way. */
export function sanitiseFailure(failure: ReasoningMapFailure): ReasoningMapFailure {
  return sanitiseLocality(failure).value;
}

/** True when the reasoning was assembled without any provider call. */
export function wasAssembledDeterministically(map: ReasoningMap): boolean {
  return (map.execution?.provider_calls ?? 0) === 0;
}
