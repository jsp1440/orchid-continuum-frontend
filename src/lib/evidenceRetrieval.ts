import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";

/**
 * Client for the governed evidence-retrieval surface.
 *
 * Contract read from app/evidence_retrieval/{routes,models,engine}.py rather
 * than inferred. Every field below is one the backend actually returns; nothing
 * here is synthesised, defaulted into existence, or promoted.
 *
 * The whole router sits behind `verify_owner_or_api_key`, so this is an
 * authenticated surface. That makes the error taxonomy part of the scientific
 * contract, not just ergonomics: "you are not authorised to search" and "the
 * index is unavailable" must never render as "no evidence exists". Absence of
 * access is not absence of evidence, and a retrieval surface that blurs the two
 * teaches a false negative.
 */

/** Search modes the backend exposes as distinct routes. */
export type EvidenceRetrievalMode = "lexical" | "semantic" | "hybrid";

/**
 * Object-type-scoped routes. The backend implements each as HYBRID with a fixed
 * `object_types` filter, so they are aliases rather than separate engines.
 */
export type EvidenceRetrievalScope =
  | "claims"
  | "protocols"
  | "results"
  | "taxonomic-treatments"
  | "identification-keys"
  | "strategic-insights"
  | "candidate-events";

export type EvidenceRetrievalRoute = EvidenceRetrievalMode | EvidenceRetrievalScope;

/** Mirrors SearchIn. Only `query` is required; the rest carry backend defaults. */
export type EvidenceRetrievalQuery = {
  query: string;
  collections?: string[];
  objectTypes?: string[];
  documentClasses?: string[];
  language?: string | null;
  historical?: boolean;
  limit?: number;
  offset?: number;
  perSourceLimit?: number;
  parentExpansion?: string;
  internalAccess?: boolean;
};

export type EvidenceCitation = {
  document_id?: string | number | null;
  document_title?: string | null;
  authors?: string[];
  publication_date?: string | null;
  source_type?: string | null;
  document_class?: string | null;
  revision_id?: string | number | null;
  canonical_object_type?: string | null;
  canonical_object_id?: string | number | null;
  source_anchor_ids?: Array<string | number>;
  source_anchors?: unknown;
  locator?: unknown;
  identifier?: string | null;
  model_id?: string | null;
  ranking_version?: string | null;
};

export type EvidenceReliabilitySignals = {
  peer_reviewed?: boolean | null;
  ai_generated?: boolean | null;
  citations_verified?: boolean | null;
  evidence_type?: string | null;
};

export type EvidenceRetrievalResult = {
  rank?: number;
  scores?: Record<string, number>;
  score_explanation?: string[];
  object_type?: string;
  title?: string | null;
  /**
   * Null when the display policy withholds the text. That is a policy outcome,
   * not an empty document, and callers must render it as withheld.
   */
  authorized_excerpt?: string | null;
  source_content_hash?: string | null;
  excerpt_content_hash?: string | null;
  matched_terms?: string[];
  canonical_parent?: { type?: string | null; id?: string | number | null; available?: boolean };
  citation?: EvidenceCitation;
  reliability_signals?: EvidenceReliabilitySignals;
  review_state?: string | null;
  verification_state?: string | null;
  temporal_status?: string | null;
  display_policy?: string | null;
  collections?: string[];
  active?: boolean;
  index_version?: string | number | null;
};

export type EvidenceRetrievalResponse = {
  normalized_query?: string;
  retrieval_mode?: string;
  active_collections?: string[];
  ranking_configuration_version?: string;
  total_candidates?: number;
  total_eligible_results?: number;
  excluded_counts?: Record<string, number>;
  deduplicated_count?: number;
  results: EvidenceRetrievalResult[];
  warnings?: string[];
  elapsed_ms?: number;
};

/**
 * Why a retrieval did not return results.
 *
 * `unauthorized` and `unavailable` exist so a caller can never render either as
 * an empty result set. `rejected` is the backend's own 422 on an invalid query.
 */
export type EvidenceRetrievalFailureKind =
  | "unauthorized"
  | "unavailable"
  | "rejected"
  | "network"
  | "malformed";

export class EvidenceRetrievalError extends Error {
  readonly kind: EvidenceRetrievalFailureKind;
  readonly status: number | null;
  /** Backend error code where one was supplied, e.g. SEMANTIC_INDEX_DATABASE_UNAVAILABLE. */
  readonly code: string | null;
  /** True when a retry could plausibly succeed without any other change. */
  readonly retryable: boolean;

  constructor(
    kind: EvidenceRetrievalFailureKind,
    message: string,
    status: number | null = null,
    code: string | null = null,
  ) {
    super(message);
    this.name = "EvidenceRetrievalError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.retryable = kind === "unavailable" || kind === "network";
  }
}

const MAX_QUERY_CHARACTERS = 500;

/** Collapses whitespace the way RetrievalQuery.__post_init__ does. */
export function normalizeQuery(value: string): string {
  return String(value ?? "").split(/\s+/).filter(Boolean).join(" ");
}

/**
 * Rejects locally what the backend would reject anyway.
 *
 * Not a duplicate of server validation: it keeps an unusable query from being
 * sent at all, so an empty claim renders as "nothing to search" rather than a
 * 422 the user must interpret.
 */
export function isSearchableQuery(value: string): boolean {
  const normalized = normalizeQuery(value);
  return normalized.length > 0 && normalized.length <= MAX_QUERY_CHARACTERS;
}

function detailCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    const code = (detail as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return null;
}

/**
 * Runs one governed retrieval.
 *
 * Truncates the query to the backend's documented 500-character bound rather
 * than sending something certain to 422 — the claim text this is usually called
 * with can legitimately be longer than the search surface accepts.
 */
export async function retrieveEvidence(
  route: EvidenceRetrievalRoute,
  query: EvidenceRetrievalQuery,
  init?: { signal?: AbortSignal },
): Promise<EvidenceRetrievalResponse> {
  const text = normalizeQuery(query.query).slice(0, MAX_QUERY_CHARACTERS);
  if (!text) {
    throw new EvidenceRetrievalError("rejected", "A non-empty query is required.", null, "INVALID_QUERY_LENGTH");
  }

  const body: Record<string, unknown> = { query: text };
  if (query.collections?.length) body.collections = query.collections;
  if (query.objectTypes?.length) body.object_types = query.objectTypes;
  if (query.documentClasses?.length) body.document_classes = query.documentClasses;
  if (query.language != null) body.language = query.language;
  if (query.historical != null) body.historical = query.historical;
  if (query.limit != null) body.limit = query.limit;
  if (query.offset != null) body.offset = query.offset;
  if (query.perSourceLimit != null) body.per_source_limit = query.perSourceLimit;
  if (query.parentExpansion != null) body.parent_expansion = query.parentExpansion;
  if (query.internalAccess != null) body.internal_access = query.internalAccess;

  let response: Response;
  try {
    response = await fetch(`${CALYX_BACKEND_BASE_URL}/api/evidence-retrieval/${route}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: init?.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new EvidenceRetrievalError(
      "network",
      "The evidence service could not be reached.",
      null,
      null,
    );
  }

  const raw = await response.text();
  let payload: unknown = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const code = detailCode(payload);
    if (response.status === 401 || response.status === 403) {
      throw new EvidenceRetrievalError(
        "unauthorized",
        "Governed evidence retrieval requires an authorised session.",
        response.status,
        code,
      );
    }
    if (response.status === 422) {
      throw new EvidenceRetrievalError(
        "rejected",
        "The evidence service rejected this query.",
        response.status,
        code,
      );
    }
    if (response.status === 503 || response.status >= 500) {
      throw new EvidenceRetrievalError(
        "unavailable",
        "The evidence index is currently unavailable.",
        response.status,
        code,
      );
    }
    throw new EvidenceRetrievalError(
      "unavailable",
      `The evidence service returned ${response.status}.`,
      response.status,
      code,
    );
  }

  // A 200 whose body is not a result envelope is malformed, not empty. Coercing
  // it to zero results would report "no evidence" for a broken response.
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { results?: unknown }).results)) {
    throw new EvidenceRetrievalError(
      "malformed",
      "The evidence service returned an unrecognised response.",
      response.status,
      null,
    );
  }

  return payload as EvidenceRetrievalResponse;
}

/**
 * True when the backend withheld the excerpt for this result.
 *
 * Distinguished from an absent field so the UI can say "excerpt withheld by
 * display policy" instead of showing nothing and implying the source is empty.
 */
/**
 * A trust signal the corpus supplied, rendered as a tri-state.
 *
 * `unknown` is not a middle value between yes and no — it means the corpus
 * said nothing. That distinction is the whole point: a source with no
 * `ai_generated` flag has not been established as human-authored, and a source
 * with no `peer_reviewed` flag has not been established as either reviewed or
 * unreviewed. Collapsing unknown into "no" would manufacture assurance the
 * backend never gave.
 */
export type TrustSignalState = "yes" | "no" | "unknown";

export function trustSignal(value: boolean | null | undefined): TrustSignalState {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

/**
 * Whether a result carries any statement at all about its currency.
 *
 * A result with no temporal status has not been checked for supersession. It
 * must not be presented as current — "we do not know" and "still valid" are
 * different claims, and only one of them is safe to imply.
 */
export function hasTemporalStatus(result: EvidenceRetrievalResult): boolean {
  return Boolean(String(result.temporal_status ?? "").trim());
}

/**
 * Whether the corpus explicitly marked this record inactive.
 *
 * Undefined is not inactive — it is unstated. Only an explicit `false` means
 * the record has been retired.
 */
export function isExplicitlyInactive(result: EvidenceRetrievalResult): boolean {
  return result.active === false;
}

export function isExcerptWithheld(result: EvidenceRetrievalResult): boolean {
  return result.authorized_excerpt == null;
}

/**
 * Whether a result carries enough provenance to be traced back to a source.
 *
 * Deliberately strict: a revision id or document id, plus at least one anchor or
 * locator. A result that cannot be traced is still shown, but must not be
 * presented as verifiable.
 */
export function isTraceable(result: EvidenceRetrievalResult): boolean {
  const citation = result.citation;
  if (!citation) return false;
  const hasDocument = citation.revision_id != null || citation.document_id != null;
  const hasAnchor = Boolean(citation.source_anchor_ids?.length) || citation.locator != null;
  return hasDocument && hasAnchor;
}
