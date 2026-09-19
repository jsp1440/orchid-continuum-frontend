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
  if (
    map.contradictions.some((c) => c.resolution === "unresolved_presented_as_contested")
  ) {
    return "unsettled";
  }
  if (contestedRelationships(map).length > 0 && map.contradictions.length === 0) {
    return "unsettled";
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
 * The shapes: a decimal pair (comma, semicolon or space separated), a
 * lat/lon-labelled number, and degrees-minutes with either apostrophe, with or
 * without a hemisphere letter.
 */
const COORDINATE_SHAPE = new RegExp(
  [
    "[-+]?\\d{1,3}\\.\\d+\\s*(?:[,;]\\s*|\\s+)[-+]?\\d{1,3}\\.\\d+",
    "\\b(?:lat|latitude|lon|lng|long|longitude)\\b\\s*[=:]?\\s*[-+]?\\d+(?:\\.\\d+)?",
    "\\d{1,3}\\s*\u00b0\\s*\\d{1,2}\\s*['\u2018\u2019\u2032]?" +
      "(?:\\s*\\d{1,2}(?:\\.\\d+)?\\s*[\"\u201c\u201d\u2033]?)?\\s*[NSEW]?",
    "\\d{1,3}(?:\\.\\d+)?\\s*\u00b0\\s*[NSEW]\\b",
  ].join("|"),
  "gi",
);

/** What stands in for a coordinate this surface refused to print. */
export const WITHHELD_COORDINATE = "[coordinate withheld]";

/** True when the text carries something shaped like a coordinate. */
export function carriesCoordinate(text: string): boolean {
  COORDINATE_SHAPE.lastIndex = 0;
  return COORDINATE_SHAPE.test(text);
}

/**
 * The text with any coordinate shape replaced, and never the original.
 *
 * Replacing rather than dropping the whole field keeps the surrounding claim
 * readable, and leaves a visible mark where something was removed — a silent
 * scrub would let a leak pass unnoticed by the person best placed to report it.
 */
export function withholdCoordinates(text: string): string {
  return text.replace(COORDINATE_SHAPE, WITHHELD_COORDINATE);
}

/** Every rendered string in the map, so the scan below cannot miss a field. */
function renderedStrings(map: ReasoningMap): string[] {
  const strings: string[] = [map.question, map.taxonomic_identity.accepted_name];
  for (const relationship of map.relationships) {
    strings.push(relationship.subject, relationship.predicate, relationship.object);
    if (relationship.geographic_scope) strings.push(relationship.geographic_scope);
    for (const source of relationship.provenance) strings.push(source.citation);
  }
  for (const mechanism of map.mechanisms) strings.push(mechanism.statement);
  for (const contradiction of map.contradictions) {
    strings.push(contradiction.description, ...contradiction.between);
    for (const scope of contradiction.scopes) if (scope) strings.push(scope);
  }
  strings.push(
    map.geographic_context.scope,
    ...map.geographic_context.environmental_notes,
    ...map.evidence_gaps,
    ...map.known_unknowns,
    ...map.recommended_next_evidence,
    map.confidence.basis,
  );
  return strings;
}

export interface LocalityScan {
  /** True when nothing coordinate-shaped arrived in any rendered field. */
  clean: boolean;
  /** How many rendered fields had something withheld. */
  fieldsWithheld: number;
  /** True when the map claimed no coordinates and carried one anyway. */
  contradictsDeclaredPolicy: boolean;
}

/**
 * What this surface found when it checked the map it was handed.
 *
 * The footer states the result of this scan rather than a fixed sentence. A
 * printed guarantee the code does not enforce reads to a reviewer as
 * enforcement, which is worse than printing nothing.
 */
export function scanLocality(map: ReasoningMap): LocalityScan {
  const fieldsWithheld = renderedStrings(map).filter(carriesCoordinate).length;
  return {
    clean: fieldsWithheld === 0,
    fieldsWithheld,
    contradictsDeclaredPolicy:
      fieldsWithheld > 0 && map.geographic_context.coordinates_present === false,
  };
}

/** True when the reasoning was assembled without any provider call. */
export function wasAssembledDeterministically(map: ReasoningMap): boolean {
  return (map.execution?.provider_calls ?? 0) === 0;
}
