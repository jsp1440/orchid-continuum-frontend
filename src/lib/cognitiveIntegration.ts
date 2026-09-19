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
export function settlement(map: ReasoningMap): Settlement {
  // Anything not recognised is unsettled. Falling through to "settled" is how
  // an unknown resolution string ended up printing "The evidence points to one
  // account" above a note reading "Left standing. Nothing retrieved settles
  // it." — the note's lookup failed closed and this failed open, in the same
  // render. A resolution this build does not know about is not one it can
  // claim was resolved.
  const known: ContradictionResolution[] = [
    "unresolved_presented_as_contested",
    "resolved_by_scope",
    "resolved_by_evidence",
  ];
  if (map.contradictions.some((c) => !known.includes(c.resolution))) {
    return "unsettled";
  }
  if (
    map.contradictions.some((c) => c.resolution === "unresolved_presented_as_contested")
  ) {
    return "unsettled";
  }
  // A contested relationship is a disagreement whether or not anything wrote it
  // up, and a contradiction about some *other* pair of claims does not account
  // for it. Keying this on `contradictions.length === 0` meant one unrelated
  // entry — a note about leaf morphology — flipped the header to "one account"
  // while the tally below it still counted a contested claim.
  if (contestedRelationships(map).length > 0) {
    const accounted = map.contradictions.some((c) =>
      contestedRelationships(map).some((r) =>
        c.between.some((claim) => claim.includes(r.object) || claim.includes(r.predicate)),
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
const DEGREE_WORD = "(?:\u00b0|deg\\.?|degrees?)";
const MINUTE_WORD = "(?:['\u2018\u2019\u2032]|min\\.?|minutes?)";
const HEMISPHERE = "(?:[NSEW]\\b|north|south|east|west)";

const COORDINATE_SHAPE = new RegExp(
  [
    // A decimal pair, comma, semicolon or whitespace separated.
    "[-+]?\\d{1,3}\\.\\d+\\s*(?:[,;]\\s*|\\s+)[-+]?\\d{1,3}\\.\\d+",
    // A lat/lon-labelled number, with or without a separator character.
    "\\b(?:lat|latitude|lng|lon|long|longitude)\\b\\s*[=:]?\\s*[-+]?\\d+(?:\\.\\d+)?",
    // Degrees and minutes, symbol or word, straight or typographic apostrophe.
    `\\d{1,3}\\s*${DEGREE_WORD}\\s*\\d{1,2}\\s*${MINUTE_WORD}`,
    // Degrees with a hemisphere, symbol or spelled out. This arm catches
    // "51.7520 degrees north", which carries ~10 m and no decimal pair.
    `\\d{1,3}(?:\\.\\d+)?\\s*${DEGREE_WORD}\\s*${HEMISPHERE}`,
    // European comma decimals, as a pair. Exactly three digits after the comma
    // is a thousands separator ("1,234 records") and is deliberately excluded.
    "\\d{1,3},(?:\\d{1,2}|\\d{4,})\\s*(?:[; ]\\s*)[-+]?\\d{1,3},(?:\\d{1,2}|\\d{4,})",
    // UTM and MGRS grid references, which locate a site with no degrees at all.
    // The digit run is a pair, an easting and a northing. Matching only the
    // first leaves the second sitting next to the marker, which is most of a
    // position and reads as though it had been removed.
    "\\b\\d{1,2}\\s*[C-HJ-NP-X]\\s*[A-Z]{2}\\s*\\d{4,10}(?:\\s+\\d{4,10})?\\b",
    "\\bUTM\\b[^\\n]{0,24}?\\d{5,7}\\s+\\d{5,8}",
    "\\b\\d{1,2}[C-HJ-NP-X]\\s+\\d{5,7}\\s+\\d{5,8}\\b",
    // Open Location Code (plus code).
    "\\b[23456789CFGHJMPQRVWX]{4,8}\\+[23456789CFGHJMPQRVWX]{2,7}\\b",
    // MGRS written without spaces.
    "\\b\\d{1,2}[C-HJ-NP-X][A-Z]{2}\\d{4,10}\\b",
    // what3words.
    "///[a-z]+\\.[a-z]+\\.[a-z]+",
    // A coordinate in a URL path or query: "/@51/-1/15z", "?ll=51,-1".
    "[@=]\\s*[-+]?\\d{1,3}(?:\\.\\d+)?\\s*[/,]\\s*[-+]?\\d{1,3}(?:\\.\\d+)?",
    // Integer degrees with an explicit sign on the second member. Coarse
    // (~111 km) but still a position, and the sign is what separates it from
    // an ordinary list of numbers.
    "(?:^|[^\\d.])[-+]?\\d{1,3}\\s*,\\s*[-+]\\d{1,3}(?!\\d|\\.\\d)",
    // Minutes and seconds with no degree sign at all: 51 45'12\"N.
    "\\d{1,3}\\s+\\d{1,2}['\u2018\u2019\u2032]\\d{1,2}(?:[\"\u201c\u201d\u2033])?\\s*[NSEW]\\b",
  ].join("|"),
  "gi",
);

/**
 * A wider net, used only to decide whether two *sibling* fields together carry
 * a position. It allows prose between the two numbers, which the pattern above
 * deliberately does not — requiring adjacency there keeps ordinary measurements
 * readable, and requiring it here would miss a pair divided between a subject
 * and an object that render on one line.
 */
const COORDINATE_ACROSS_FIELDS = new RegExp(
  // The window is generous because the two halves are separated by whatever
  // other fields the record carries — a predicate and a scope, in practice —
  // not by a separator someone chose. It is bounded to one record's own text.
  "[-+]?(?:1[0-7]\\d|\\d{1,2})\\.\\d+\\D{0,80}[-+]?(?:1[0-7]\\d|\\d{1,2})\\.\\d+",
  "i",
);

/**
 * Detection normalises first, because a coordinate does not have to be typed
 * in ASCII to be a coordinate. NFKC folds full-width digits and punctuation —
 * "５１．７５２３, －１．２５７８" is the same position as "51.7523, -1.2578",
 * and `\d` without the `u` flag does not see it.
 */
function normalised(text: string): string {
  try {
    return text.normalize("NFKC");
  } catch {
    return text;
  }
}

/** What stands in for a coordinate this surface refused to print. */
export const WITHHELD_COORDINATE = "[coordinate withheld]";

/** True when the text carries something shaped like a coordinate. */
export function carriesCoordinate(text: string): boolean {
  COORDINATE_SHAPE.lastIndex = 0;
  return COORDINATE_SHAPE.test(normalised(text));
}

/**
 * Withhold whole fields, not matched spans.
 *
 * Replacing only the match leaks twice. A pair split by prose —
 * "Colony at latitude 51.7523; the longitude is -1.2578." — matches on the
 * labelled latitude alone, so the marker announces *that a position was removed
 * from exactly here* while the unmatched longitude sits verbatim beside it. To
 * a reader who knows the taxon's range that is more than redacting nothing
 * would have given away.
 *
 * So a field that carries a coordinate anywhere is withheld entirely. The
 * marker still appears, because a silent scrub would hide the leak from the one
 * person positioned to report it.
 */
export function withholdField(text: string): string {
  return carriesCoordinate(text) ? WITHHELD_COORDINATE : text;
}

/** How many fields a sanitising pass withheld. */
export interface Sanitised<T> {
  value: T;
  fieldsWithheld: number;
}

/**
 * Sanitise every string in a value, whatever shape the value is.
 *
 * The pass this replaced walked a hand-written list of the fields a panel was
 * believed to render. A checker got coordinates onto the page through eight
 * fields that list did not name — three taxonomic ones, two enum fallbacks, the
 * confidence level, the disclosure string and the whole refusal surface — while
 * the footer, counting the list, reported that none had carried one. A parallel
 * inventory of what gets painted is a thing that drifts, and it had already
 * drifted by the time it was written.
 *
 * This walks the object instead. There is no inventory to fall out of date, so
 * a field added upstream is covered the day it arrives rather than the day
 * someone remembers it.
 *
 * Sibling strings are also tested joined, because a pair can be split across
 * two fields that render on one line — `subject: "Colony 51.7523"`,
 * `object: "north by -1.2578 west"` — where neither half matches alone.
 */
export function sanitiseLocality<T>(input: T): Sanitised<T> {
  let fieldsWithheld = 0;

  const walk = (value: unknown): unknown => {
    if (typeof value === "string") {
      const safe = withholdField(value);
      if (safe !== value) fieldsWithheld += 1;
      return safe;
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      const strings = entries
        .filter(([, v]) => typeof v === "string")
        .map(([, v]) => v as string);
      // A pair divided between two fields of the same object.
      const joined = normalised(strings.join(" "));
      const splitPair =
        strings.length > 1 &&
        (carriesCoordinate(joined) || COORDINATE_ACROSS_FIELDS.test(joined)) &&
        !strings.some(carriesCoordinate);
      const out: Record<string, unknown> = {};
      for (const [key, child] of entries) {
        if (splitPair && typeof child === "string") {
          out[key] = WITHHELD_COORDINATE;
          fieldsWithheld += 1;
        } else {
          out[key] = walk(child);
        }
      }
      return out;
    }
    return value;
  };

  return { value: walk(input) as T, fieldsWithheld };
}

export interface LocalityScan {
  /** True when nothing coordinate-shaped arrived in any field. */
  clean: boolean;
  /** How many fields were withheld. */
  fieldsWithheld: number;
  /** True when the map claimed no coordinates and carried one anyway. */
  contradictsDeclaredPolicy: boolean;
}

/**
 * The map as it is safe to render, and what was done to it.
 *
 * The footer states the result of this pass rather than a fixed sentence, and
 * because the panel renders exactly the value returned here, the count cannot
 * disagree with the page: it is counting the same substitutions the reader is
 * looking at.
 */
export function sanitiseMap(map: ReasoningMap): { map: ReasoningMap; scan: LocalityScan } {
  const { value, fieldsWithheld } = sanitiseLocality(map);
  return {
    map: value,
    scan: {
      clean: fieldsWithheld === 0,
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
