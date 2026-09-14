import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";
import type { DisplayBinding } from "@/lib/literatureDisplayPolicy";

/**
 * One extracted paper, and its canonical source binding.
 *
 * Contract read from `app/literature_extraction/routes.py` (`get_paper`,
 * `get_source_binding`) and `models.py::PaperKnowledge`, not inferred.
 *
 * TWO REQUESTS, AND THE SECOND ONE IS NOT OPTIONAL. The paper carries the
 * text; the binding carries the permission to display it. Fetching the paper
 * alone and rendering what came back would release other people's words on the
 * strength of them being in the payload. A 404 on the binding is a real and
 * common answer — most papers in a young corpus have none — and it means
 * "withheld", not "unrestricted". See `literatureDisplayPolicy.ts`.
 *
 * PROTECTED LOCALITY IS STRIPPED HERE, NOT AT THE VIEW. `Entity.attributes` is
 * an open `dict[str, Any]` and `entity_type` includes `location` and `habitat`,
 * so an extractor that pulled a coordinate out of a methods section puts it in
 * this payload. Removing it in the client means no component can render it, no
 * matter how it iterates — a guard in one view would leave every other reader
 * of this type exposed.
 */

export type LiteraturePaperFailureKind =
  | "unauthorized"
  | "not_found"
  | "unavailable"
  | "network"
  | "malformed";

export class LiteraturePaperError extends Error {
  readonly kind: LiteraturePaperFailureKind;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(kind: LiteraturePaperFailureKind, message: string, status: number | null = null) {
    super(message);
    this.name = "LiteraturePaperError";
    this.kind = kind;
    this.status = status;
    this.retryable = kind === "unavailable" || kind === "network";
  }
}

export interface PaperProvenance {
  method?: string;
  confidence?: number;
  extractor?: string | null;
  extractor_version?: string | null;
  review_status?: string;
}

export interface PaperClaim {
  claim_id: string;
  statement: string;
  claim_type?: string;
  polarity?: string;
  evidence_ids?: string[];
  provenance?: PaperProvenance;
}

export interface PaperEvidence {
  evidence_id: string;
  excerpt?: string;
  evidence_type?: string;
  supports_ids?: string[];
  contradicts_ids?: string[];
}

export interface PaperSection {
  section_id: string;
  heading?: string | null;
  canonical_type?: string;
  text?: string;
  order?: number;
}

export interface PaperEntity {
  entity_id: string;
  entity_type?: string;
  name: string;
  normalized_name?: string | null;
  /** Always empty from this client — see `stripSensitiveAttributes`. */
  attributes?: Record<string, unknown>;
  provenance?: PaperProvenance;
}

export interface LiteraturePaper {
  paper_id: string;
  metadata?: {
    title?: string | null;
    authors?: string[];
    journal?: string | null;
    publication_year?: number | null;
    abstract?: string | null;
    keywords?: string[];
  };
  sections?: PaperSection[];
  entities?: PaperEntity[];
  claims?: PaperClaim[];
  evidence?: PaperEvidence[];
  analysis_manifest?: {
    analysis_id?: string;
    pipeline_version?: string;
    model_provider?: string | null;
    model_name?: string | null;
    status?: string;
    warnings?: string[];
  };
}

export interface PaperSourceBinding extends DisplayBinding {
  paper_id?: string;
  source_object_type?: string;
  source_object_id?: number;
  revision_id?: number;
  extraction_run_id?: number;
  binding_fingerprint?: string;
  evidence_integrity?: boolean;
}

export interface LiteraturePaperView {
  paper: LiteraturePaper;
  /** Null when the backend has no canonical binding for this paper. */
  binding: PaperSourceBinding | null;
  /** Why the binding is null, when it is. Distinguishes absent from unreadable. */
  bindingStatus: "present" | "absent" | "unreadable";
  /**
   * How many protected-locality fields were removed from this payload.
   *
   * Counted here rather than by a caller, because by the time the caller holds
   * the view the fields are gone — counting them downstream can only ever
   * return zero, which would silently report "no site data" for every record.
   */
  localityFieldsWithheld: number;
}

/**
 * Field names that carry protected locality.
 *
 * Deliberately the same list the backend enforces in
 * `app/calyx_flywheel/locality.py`, matched on whole keys and case-insensitively
 * for the same reason: matching substrings would catch `localization` while
 * matching values would mean guessing whether a float is a latitude.
 */
export const SENSITIVE_ATTRIBUTE_KEYS: ReadonlySet<string> = new Set([
  "lat", "latitude", "decimal_latitude", "decimallatitude",
  "lon", "lng", "longitude", "decimal_longitude", "decimallongitude",
  "coord", "coords", "coordinate", "coordinates",
  "coordinate_uncertainty", "coordinate_uncertainty_in_meters",
  "locality", "verbatim_locality", "verbatimlocality",
  "location", "site", "place", "grid", "gps",
  "elevation_m", "elevation_meters", "footprint_wkt", "geohash",
  "occurrence_id", "occurrenceid", "catalog_number", "catalogue_number",
  "collector", "recorded_by", "recordedby",
]);

/**
 * Remove protected locality from an open attribute bag, reporting how much was
 * removed.
 *
 * The count is kept because silence would be its own misreport: a reader
 * looking at an entity should be able to tell "this extractor recorded nothing
 * further" from "this entity carries site data that is not shown". The keys
 * themselves are not reported — naming `decimal_latitude` for a rare taxon
 * already discloses that a precise site exists in the record.
 */
export function stripSensitiveAttributes(
  attributes: unknown,
): { attributes: Record<string, unknown>; removed: number } {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    return { attributes: {}, removed: 0 };
  }
  const safe: Record<string, unknown> = {};
  let removed = 0;
  for (const [key, value] of Object.entries(attributes as Record<string, unknown>)) {
    if (SENSITIVE_ATTRIBUTE_KEYS.has(key.trim().toLowerCase())) {
      removed += 1;
      continue;
    }
    if (value && typeof value === "object") {
      // A coordinate nested one level down is disclosed exactly as thoroughly
      // as one at the top, so the walk recurses rather than trusting depth.
      const nested = stripSensitiveAttributes(value);
      removed += nested.removed;
      safe[key] = nested.attributes;
      continue;
    }
    safe[key] = value;
  }
  return { attributes: safe, removed };
}

function scrubEntities(entities: unknown): PaperEntity[] {
  if (!Array.isArray(entities)) return [];
  return entities.map((entity) => {
    const record = (entity ?? {}) as PaperEntity;
    return { ...record, attributes: stripSensitiveAttributes(record.attributes).attributes };
  });
}

/** Whether any entity in the payload carried protected locality that was removed. */
export function countStrippedLocality(entities: unknown): number {
  if (!Array.isArray(entities)) return 0;
  return entities.reduce<number>(
    (total, entity) =>
      total + stripSensitiveAttributes((entity as PaperEntity | null)?.attributes).removed,
    0,
  );
}

async function request(path: string, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetch(`${CALYX_BACKEND_BASE_URL}/api/literature-extraction${path}`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new LiteraturePaperError("network", "The literature service could not be reached.");
  }
}

async function parse(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function fetchLiteraturePaper(
  paperId: string,
  options: { signal?: AbortSignal } = {},
): Promise<LiteraturePaperView> {
  const encoded = encodeURIComponent(paperId);

  const paperResponse = await request(`/papers/${encoded}`, options.signal);
  if (!paperResponse.ok) {
    if (paperResponse.status === 401 || paperResponse.status === 403) {
      throw new LiteraturePaperError(
        "unauthorized",
        "This session is not authorised to read this extraction.",
        paperResponse.status,
      );
    }
    if (paperResponse.status === 404) {
      throw new LiteraturePaperError(
        "not_found",
        "No extraction result is stored under this identifier.",
        404,
      );
    }
    throw new LiteraturePaperError(
      "unavailable",
      "The literature service is unavailable.",
      paperResponse.status,
    );
  }

  const payload = await parse(paperResponse);
  if (!payload || typeof payload !== "object" || typeof (payload as LiteraturePaper).paper_id !== "string") {
    throw new LiteraturePaperError(
      "malformed",
      "The literature service returned a response this client cannot read.",
      paperResponse.status,
    );
  }

  const raw = payload as LiteraturePaper;
  const localityFieldsWithheld = countStrippedLocality(raw.entities);
  const paper: LiteraturePaper = { ...raw, entities: scrubEntities(raw.entities) };

  // The binding is fetched second and its failure is never fatal: a paper with
  // no binding is a real state, and it resolves to "withhold the text", not to
  // "the paper could not be loaded".
  let binding: PaperSourceBinding | null = null;
  let bindingStatus: LiteraturePaperView["bindingStatus"] = "absent";
  try {
    const bindingResponse = await request(`/papers/${encoded}/source-binding`, options.signal);
    if (bindingResponse.ok) {
      const bindingPayload = await parse(bindingResponse);
      if (bindingPayload && typeof bindingPayload === "object") {
        binding = bindingPayload as PaperSourceBinding;
        bindingStatus = "present";
      } else {
        // A 200 we cannot read is not an absent binding. Treating it as absent
        // would be safe for display but would misreport why text is withheld.
        bindingStatus = "unreadable";
      }
    } else if (bindingResponse.status === 404) {
      bindingStatus = "absent";
    } else {
      bindingStatus = "unreadable";
    }
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    bindingStatus = "unreadable";
  }

  return { paper, binding, bindingStatus, localityFieldsWithheld };
}

export interface ClaimEvidenceRelation {
  /** Evidence that names this claim in `supports_ids`. */
  supporting: PaperEvidence[];
  /** Evidence that names this claim in `contradicts_ids`. */
  contradicting: PaperEvidence[];
  /**
   * Evidence the claim points at which claims neither relation.
   *
   * This bucket is the point of the function. A claim listing five evidence ids
   * looks well-supported, and the extraction may never have said that any of
   * them support it — `evidence_ids` is an association, and association is not
   * support. Collapsing this into `supporting` would manufacture backing the
   * source never provided.
   */
  associatedOnly: PaperEvidence[];
}

export function classifyClaimEvidence(
  claim: PaperClaim,
  evidence: PaperEvidence[] | undefined,
): ClaimEvidenceRelation {
  const all = Array.isArray(evidence) ? evidence : [];
  const supporting = all.filter((item) => item.supports_ids?.includes(claim.claim_id));
  const contradicting = all.filter((item) => item.contradicts_ids?.includes(claim.claim_id));
  const classified = new Set([
    ...supporting.map((item) => item.evidence_id),
    ...contradicting.map((item) => item.evidence_id),
  ]);
  const linked = new Set(claim.evidence_ids ?? []);
  const associatedOnly = all.filter(
    (item) => linked.has(item.evidence_id) && !classified.has(item.evidence_id),
  );
  return { supporting, contradicting, associatedOnly };
}

/** Provenance methods that mean a machine produced the statement. */
const MACHINE_METHODS = new Set(["model_extracted", "inferred"]);

/**
 * Whether this claim's statement came from a model rather than from the source
 * or a human.
 *
 * Kept as a predicate rather than a rendered string because the distinction
 * governs more than a label: a model-extracted claim is the extractor's reading
 * of the paper, and a reader who takes it for the paper's own assertion has
 * been misled about who said it.
 */
export function isMachineAuthored(claim: PaperClaim): boolean {
  const method = claim.provenance?.method;
  return typeof method === "string" && MACHINE_METHODS.has(method);
}

/** Whether a human has adjudicated this claim. Absent status reads as unreviewed. */
export function isReviewed(claim: PaperClaim): boolean {
  const status = claim.provenance?.review_status;
  return status === "accepted" || status === "corrected";
}
