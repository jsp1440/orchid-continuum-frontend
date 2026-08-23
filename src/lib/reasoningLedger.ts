import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";

/**
 * Client for governed reasoning-ledger revision retrieval.
 *
 * Contract read from app/reasoning_ledger/routes.py::get_ledger_revision on the
 * backend (#1135 / backend PR #1142), not inferred. Every field below is one
 * the endpoint actually returns.
 *
 * FOUR STATES THIS SURFACE MUST KEEP APART
 *
 *   ledger recorded     a mission carries {ledger_id, version}. That is an
 *                       identity, and it is all the Workbench had before.
 *   ledger inspectable  this retrieval succeeded and the revision is readable.
 *   reasoning reviewed  the returned review contract says a human reviewed it.
 *   claim verified      something else entirely, which no ledger read can
 *                       establish.
 *
 * Collapsing any two of those is the failure mode. A green "reasoning ledger"
 * check that only proves an id exists reads as an audit; a successful retrieval
 * that renders like an endorsement reads as verification. The backend already
 * refuses to blur the last pair — it returns `reasoning_certified: false`
 * explicitly — and this client carries that through rather than dropping it.
 *
 * The endpoint sits behind `verify_owner_or_api_key`, so unauthorised is a real
 * outcome and must never render as "no reasoning was recorded".
 */

export type ReasoningLedgerFailureKind =
  /** 401/403 — you may not read this. Says nothing about the reasoning. */
  | "unauthorized"
  /** The ledger id itself is unknown. */
  | "ledger_not_found"
  /** The ledger exists; this exact revision does not. */
  | "revision_not_found"
  /** 422 — the request was malformed (e.g. a non-positive version). */
  | "rejected"
  /** 503/5xx — persistence is down. Not an empty ledger. */
  | "unavailable"
  /** The request never reached the service. */
  | "network"
  /** A 200 that does not match the contract. */
  | "malformed";

export class ReasoningLedgerError extends Error {
  readonly kind: ReasoningLedgerFailureKind;
  readonly status: number | null;
  readonly code: string | null;
  /** Versions the backend reported as existing, when it told us. */
  readonly availableVersions: number[] | null;
  readonly retryable: boolean;

  constructor(
    kind: ReasoningLedgerFailureKind,
    message: string,
    status: number | null = null,
    code: string | null = null,
    availableVersions: number[] | null = null,
  ) {
    super(message);
    this.name = "ReasoningLedgerError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.availableVersions = availableVersions;
    this.retryable = kind === "unavailable" || kind === "network";
  }
}

/** One entry in the persisted ledger. Shapes mirror serialization.py. */
export type LedgerEntry = {
  entry_id?: string;
  kind?: string;
  statement?: string | null;
  sequence?: number;
  provenance?: {
    source_kind?: string;
    source_id?: string;
    content_hash?: string | null;
    retrieved_at?: string | null;
    collector?: string | null;
  } | null;
  uncertainty?: {
    confidence?: number;
    rationale?: string;
    unresolved_assumptions?: string[];
  } | null;
  supports?: string[];
  contradicts?: string[];
  [key: string]: unknown;
};

export type LedgerRevision = {
  ledger_id?: string;
  project_id?: string | null;
  title?: string | null;
  description?: string | null;
  status?: string;
  version?: number;
  entries?: LedgerEntry[];
  review_decisions?: Array<Record<string, unknown>>;
  conflict_dispositions?: Array<Record<string, unknown>>;
  resolved_conflict_ids?: string[];
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  ledger_fingerprint?: string | null;
  review_content_hash?: string | null;
};

export type LedgerRevisionResponse = {
  ledger_id: string;
  requested_version: number;
  revision: LedgerRevision;
  /** The backend states this rather than leaving it to be inferred. */
  inspectable: boolean;
  reasoning_certified: boolean;
};

function detailOf(payload: unknown): { code: string | null; versions: number[] | null } {
  if (!payload || typeof payload !== "object") return { code: null, versions: null };
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return { code: detail, versions: null };
  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    const versions = Array.isArray(record.available_versions)
      ? record.available_versions.filter((value): value is number => typeof value === "number")
      : null;
    return { code: typeof record.code === "string" ? record.code : null, versions };
  }
  return { code: null, versions: null };
}

/**
 * Retrieve one exact ledger revision.
 *
 * The version is not optional and there is no "latest" convenience. The
 * backend refuses to fall back, and offering a fallback here would defeat that
 * on the client side: a claim inspected against a revision other than the one
 * it was verified at is worse than an unreadable ledger.
 */
export async function fetchLedgerRevision(
  ledgerId: string,
  version: number,
  init?: { signal?: AbortSignal },
): Promise<LedgerRevisionResponse> {
  const id = String(ledgerId ?? "").trim();
  if (!id) {
    throw new ReasoningLedgerError("rejected", "A ledger id is required.", null, "LEDGER_ID_REQUIRED");
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new ReasoningLedgerError(
      "rejected",
      "A ledger revision is identified by a positive whole version.",
      null,
      "LEDGER_REVISION_INVALID",
    );
  }

  let response: Response;
  try {
    response = await fetch(
      `${CALYX_BACKEND_BASE_URL}/api/reasoning-ledgers/${encodeURIComponent(id)}/revisions/${version}`,
      {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
        signal: init?.signal,
      },
    );
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ReasoningLedgerError(
      "network",
      "The reasoning ledger service could not be reached.",
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
    const { code, versions } = detailOf(payload);

    if (response.status === 401 || response.status === 403) {
      throw new ReasoningLedgerError(
        "unauthorized",
        "This session is not authorised to read the reasoning ledger.",
        response.status,
        code,
      );
    }
    if (response.status === 404) {
      // The backend distinguishes these, and so must the reader: a missing
      // revision means the ledger exists and this version does not.
      if (code === "LEDGER_REVISION_NOT_FOUND") {
        throw new ReasoningLedgerError(
          "revision_not_found",
          "That exact revision is not in the ledger.",
          404,
          code,
          versions,
        );
      }
      throw new ReasoningLedgerError(
        "ledger_not_found",
        "No ledger exists under that identifier.",
        404,
        code,
      );
    }
    if (response.status === 422) {
      throw new ReasoningLedgerError("rejected", "The ledger service rejected the request.", 422, code);
    }
    throw new ReasoningLedgerError(
      "unavailable",
      "The reasoning ledger is unavailable.",
      response.status,
      code,
    );
  }

  const body = payload as Partial<LedgerRevisionResponse> | null;
  if (!body || typeof body !== "object" || !body.revision || typeof body.revision !== "object") {
    // A 200 that does not carry a revision is malformed, not an empty ledger.
    throw new ReasoningLedgerError(
      "malformed",
      "The ledger service returned a response this client cannot read.",
      response.status,
    );
  }

  return {
    ledger_id: typeof body.ledger_id === "string" ? body.ledger_id : id,
    requested_version:
      typeof body.requested_version === "number" ? body.requested_version : version,
    revision: body.revision,
    // Absent flags are read as the cautious value, never the reassuring one.
    inspectable: body.inspectable === true,
    reasoning_certified: body.reasoning_certified === true,
  };
}

/**
 * Whether the returned review contract actually establishes human review.
 *
 * A ledger being readable says nothing about whether anyone read it. This is
 * the only thing that may render as "reviewed".
 */
export function hasRecordedReview(revision: LedgerRevision): boolean {
  return Array.isArray(revision.review_decisions) && revision.review_decisions.length > 0;
}

/** Entries the ledger itself records as counterevidence or conflict. */
export function contradictingEntries(revision: LedgerRevision): LedgerEntry[] {
  return (revision.entries ?? []).filter(
    (entry) => Array.isArray(entry.contradicts) && entry.contradicts.length > 0,
  );
}

/** Assumptions the ledger recorded as unresolved. Surfaced, never summarised away. */
export function unresolvedAssumptions(revision: LedgerRevision): string[] {
  return (revision.entries ?? []).flatMap(
    (entry) => entry.uncertainty?.unresolved_assumptions ?? [],
  );
}
