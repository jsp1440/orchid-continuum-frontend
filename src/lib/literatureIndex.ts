import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";

/**
 * Client for literature-extraction discovery.
 *
 * Contract read from app/literature_extraction/routes.py::list_papers on the
 * backend, not inferred. `/literature` shipped as a placeholder for a long
 * time because there was no discovery endpoint — papers could be fetched by id
 * and nothing could learn which ids existed. That endpoint now exists, so the
 * page can show what the corpus actually holds.
 *
 * TWO DISTINCTIONS THIS CLIENT CARRIES
 *
 * A page is not the corpus. `total` accompanies every response so "no more
 * results" never renders as "no results".
 *
 * A damaged record is not an absent one. The backend reports an unreadable
 * extraction rather than skipping it, because omitting it would make the
 * corpus look smaller than it is. This client keeps those rows rather than
 * filtering them out for tidiness.
 *
 * Summaries carry identity and counts only. Section text, claims and evidence
 * have their own display policies and are not in a list response — a reader
 * who wants content opens the paper.
 */

export type LiteratureFailureKind =
  | "unauthorized"
  | "unavailable"
  | "rejected"
  | "network"
  | "malformed";

export class LiteratureIndexError extends Error {
  readonly kind: LiteratureFailureKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly retryable: boolean;

  constructor(
    kind: LiteratureFailureKind,
    message: string,
    status: number | null = null,
    code: string | null = null,
  ) {
    super(message);
    this.name = "LiteratureIndexError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.retryable = kind === "unavailable" || kind === "network";
  }
}

/** One row. A row is either readable with identity, or unreadable with a reason. */
export type LiteratureSummary = {
  paper_id: string;
  readable: boolean;
  reason?: string;
  title?: string | null;
  authors?: string[];
  journal?: string | null;
  publication_year?: number | null;
  claim_count?: number;
  evidence_count?: number;
  review_decision_count?: number;
};

export type LiteratureIndexResponse = {
  papers: LiteratureSummary[];
  total: number;
  limit: number;
  offset: number;
  unreadable_count: number;
};

export const LITERATURE_PAGE_SIZE = 25;

function codeOf(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    const code = (detail as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

export async function fetchLiteratureIndex(
  options: { limit?: number; offset?: number; signal?: AbortSignal } = {},
): Promise<LiteratureIndexResponse> {
  const limit = Math.max(1, Math.min(options.limit ?? LITERATURE_PAGE_SIZE, 200));
  const offset = Math.max(0, options.offset ?? 0);

  let response: Response;
  try {
    response = await fetch(
      `${CALYX_BACKEND_BASE_URL}/api/literature-extraction/papers?limit=${limit}&offset=${offset}`,
      { method: "GET", credentials: "include", headers: { Accept: "application/json" }, signal: options.signal },
    );
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new LiteratureIndexError("network", "The literature service could not be reached.");
  }

  const raw = await response.text();
  let payload: unknown = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const code = codeOf(payload);
    if (response.status === 401 || response.status === 403) {
      throw new LiteratureIndexError(
        "unauthorized",
        "This session is not authorised to browse the literature corpus.",
        response.status,
        code,
      );
    }
    if (response.status === 422) {
      throw new LiteratureIndexError("rejected", "The literature service rejected the request.", 422, code);
    }
    throw new LiteratureIndexError(
      "unavailable",
      "The literature corpus is unavailable.",
      response.status,
      code,
    );
  }

  const body = payload as Partial<LiteratureIndexResponse> | null;
  if (!body || typeof body !== "object" || !Array.isArray(body.papers)) {
    // A 200 without a papers array is malformed. Rendering it as an empty
    // corpus would report that the Continuum holds no literature.
    throw new LiteratureIndexError(
      "malformed",
      "The literature service returned a response this client cannot read.",
      response.status,
    );
  }

  return {
    papers: body.papers,
    // A missing total is unknown, not zero — but a count we cannot trust must
    // not shrink the corpus, so fall back to what this page actually holds.
    total: typeof body.total === "number" ? body.total : body.papers.length,
    limit: typeof body.limit === "number" ? body.limit : limit,
    offset: typeof body.offset === "number" ? body.offset : offset,
    unreadable_count:
      typeof body.unreadable_count === "number"
        ? body.unreadable_count
        : body.papers.filter((paper) => paper.readable === false).length,
  };
}

/** Whether more results exist beyond this page. */
export function hasMore(response: LiteratureIndexResponse): boolean {
  return response.offset + response.papers.length < response.total;
}
