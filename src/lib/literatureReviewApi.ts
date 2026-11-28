import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";

/**
 * The one typed client for the Calyx literature-review API
 * (backend router prefix `/api/literature-review`).
 *
 * Every request the review, contributors and curation pages make goes through
 * this module, so if the backend's response shapes settle differently the
 * adjustment happens here and nowhere else. The normalisers below accept only
 * the fields the pages render; anything else the server sends is dropped, so a
 * model name, run id, model confidence or another reviewer's answers can never
 * reach a reviewer page through an over-broad response.
 *
 * Two identities, never mixed:
 * - Reviewers carry a random reviewer token as `Authorization: Bearer`. It is
 *   kept in localStorage under a namespaced key and is never logged.
 * - Curators use the existing Mission Control owner session. The shared
 *   owner-session transport in `backendConfig` attaches that bearer/cookie to
 *   Calyx requests that carry no Authorization header of their own, so curator
 *   requests deliberately set none — and never the reviewer token.
 *
 * Fail closed: any network failure, refusal or malformed payload throws a
 * typed `LiteratureReviewError`. No function returns placeholder items,
 * counts or contributors.
 */

export const LITERATURE_REVIEW_API_PREFIX = "/api/literature-review";
export const REVIEWER_TOKEN_STORAGE_KEY = "oc.literatureReview.reviewerToken.v1";

export const CONTRIBUTOR_TITLE = "Calyx Scientific Review Contributor";
export const RESUME_WORDING =
  "Calyx Scientific Review Contributor, Orchid Continuum. Reviewed published orchid research and evaluated the accuracy, coverage, and source evidence of AI-extracted scientific findings.";
export const PURPOSE_TEXT =
  "help evaluate and improve Calyx, Orchid Continuum's AI-assisted scientific reasoning system";
export const UNREVIEWED_DISCLAIMER =
  "Every item here is an unreviewed machine extraction from a published paper. It is not Orchid Continuum knowledge.";
export const AUTHORSHIP_NOTE =
  "Authorship of any eventual publication is handled separately; reviewing does not confer authorship.";

/** Client-side mirrors of the server limits; the server remains authoritative. */
export const TEXT_FIELD_MAX = 8000;
export const RECOGNITION_DESCRIPTION_MAX = 500;

export const TOPICS = ["mycorrhiza", "pollination", "propagation", "molecular_phytochemical", "other"] as const;
export type ReviewTopic = (typeof TOPICS)[number];
export const TOPIC_LABELS: Record<ReviewTopic, string> = {
  mycorrhiza: "Mycorrhiza",
  pollination: "Pollination",
  propagation: "Propagation",
  molecular_phytochemical: "Molecular & phytochemical",
  other: "Other",
};

export const VERDICTS = ["supported", "partly_supported", "unsupported", "not_sure"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const VERDICT_LABELS: Record<Verdict, string> = {
  supported: "Supported",
  partly_supported: "Partly supported",
  unsupported: "Unsupported",
  not_sure: "Not sure",
};

export const CORRECTIONS = ["taxon", "scope", "method", "measurement", "attribution"] as const;
export type Correction = (typeof CORRECTIONS)[number];
export const CORRECTION_LABELS: Record<Correction, string> = {
  taxon: "Taxon",
  scope: "Scope",
  method: "Method",
  measurement: "Measurement",
  attribution: "Attribution",
};

export const DECISIONS = ["accept", "modify", "reject", "defer", "needs_expert"] as const;
export type CurationDecisionKind = (typeof DECISIONS)[number];
export const DECISION_LABELS: Record<CurationDecisionKind, string> = {
  accept: "Accept",
  modify: "Modify",
  reject: "Reject",
  defer: "Defer",
  needs_expert: "Needs expert",
};

export const AWARD_BASES = ["paper_reviews", "claim_reviews", "curator_equivalent"] as const;
export type AwardBasis = (typeof AWARD_BASES)[number];
export const AWARD_BASIS_LABELS: Record<AwardBasis, string> = {
  paper_reviews: "Substantive paper reviews",
  claim_reviews: "Claim reviews with source-based explanations",
  curator_equivalent: "Equivalent contribution approved by a curator",
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type LiteratureReviewFailureKind =
  | "network"
  | "unauthorized" // 401: missing/invalid reviewer token or owner session
  | "forbidden" // 403: capability missing
  | "not_found"
  | "rejected" // 409/413/422 or other 4xx refusal
  | "rate_limited"
  | "unavailable" // 5xx incl. typed 503 store fault
  | "malformed";

export class LiteratureReviewError extends Error {
  readonly kind: LiteratureReviewFailureKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly retryAfterSeconds: number | null;
  /** Field-level detail, e.g. LOCALITY_IN_PUBLIC_TEXT's {field: kind}. The offending text is never echoed. */
  readonly fields: Record<string, string> | null;

  constructor(
    kind: LiteratureReviewFailureKind,
    message: string,
    status: number | null = null,
    code: string | null = null,
    retryAfterSeconds: number | null = null,
    fields: Record<string, string> | null = null,
  ) {
    super(message);
    this.name = "LiteratureReviewError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.fields = fields;
  }
}

/** Backend error codes that deserve a specific sentence for the person who hit them. */
const CODE_MESSAGES: Record<string, string> = {
  VERDICT_REQUIRED: "Choose a verdict. \u201cNot sure\u201d is a valid answer.",
  PAPER_REVIEW_EMPTY: "Add at least one answer (or mark it \u201cNot sure\u201d) before submitting.",
  ITEM_VERSION_UNKNOWN: "This item changed and the version you reviewed is not known to the service. Reload the page.",
  LITERATURE_REVIEW_PAYLOAD_TOO_LARGE: "That submission is too long. Each text field may hold up to 8,000 characters.",
  LITERATURE_REVIEW_REJECTED: "The service could not accept this form.",
  REVIEWER_TOKEN_REQUIRED: "This browser has no reviewer key. Submit again to register.",
  REVIEWER_TOKEN_INVALID: "This browser's reviewer key was not recognised. Clear it and register again.",
  RECOGNITION_REQUIRES_AWARD: "Public recognition becomes available after a curator awards the contributor title.",
  LOCALITY_IN_PUBLIC_TEXT:
    "Your public text appears to contain a locality (for example a collection site or coordinates). Please remove it; public entries never include localities.",
  LINK_NOT_HTTPS: "The professional link must be an https:// address.",
  THRESHOLD_NOT_MET: "This reviewer has not met the verified threshold for that basis.",
  ALREADY_AWARDED: "This reviewer already holds the title.",
  CAPABILITY_REQUIRED: "This owner session does not hold the literature-review curation capability.",
  ITEM_NOT_FOUND: "That item was not found. It may have been withdrawn.",
  CONTRIBUTOR_NOT_FOUND: "No public contributor entry exists at this address.",
  LITERATURE_REVIEW_STORE_NOT_PROVISIONED: "The review service is not set up yet. Nothing is shown in its place.",
  LITERATURE_REVIEW_STORE_UNAVAILABLE: "The review service's store is unavailable right now. Nothing is shown in its place.",
  LITERATURE_REVIEW_STORE_SCHEMA_MISMATCH: "The review service's store is out of step with this page. Nothing is shown in its place.",
};

export function describeReviewFailure(error: unknown): string {
  if (!(error instanceof LiteratureReviewError)) return "The review service could not be reached. Nothing is shown in its place.";
  if (error.code && CODE_MESSAGES[error.code]) {
    const base = CODE_MESSAGES[error.code];
    return error.kind === "rate_limited" && error.retryAfterSeconds ? `${base} Try again in about ${error.retryAfterSeconds} seconds.` : base;
  }
  switch (error.kind) {
    case "network":
      return "The review service could not be reached. Nothing is shown in its place.";
    case "unauthorized":
      return "The service did not accept this session.";
    case "forbidden":
      return "This session is not permitted to do that.";
    case "not_found":
      return "That item was not found.";
    case "rate_limited":
      return `Too many submissions in a short time. Please wait${
        error.retryAfterSeconds ? ` about ${error.retryAfterSeconds} seconds` : " a few minutes"
      } and try again; your draft is kept.`;
    case "rejected":
      return error.message || "The service rejected the request.";
    case "malformed":
      return "The review service answered with something this page cannot read. Nothing is shown in its place.";
    default:
      return "The review service is unavailable right now. Nothing is shown in its place.";
  }
}

// ---------------------------------------------------------------------------
// Reviewer token storage (never logged)
// ---------------------------------------------------------------------------

export function readReviewerToken(): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const value = localStorage.getItem(REVIEWER_TOKEN_STORAGE_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

export function storeReviewerToken(token: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(REVIEWER_TOKEN_STORAGE_KEY, token);
  } catch {
    // Storage blocked: the token still works for this page view via state.
  }
}

export function clearReviewerToken(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(REVIEWER_TOKEN_STORAGE_KEY);
  } catch {
    // Non-fatal.
  }
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type CardItem = {
  kind: "card";
  item_id: string;
  item_version: number;
  doi: string;
  paper_title: string;
  citation: string;
  /** Raw server value; display through topicLabel(). */
  topic: string;
  paper_item_id: string | null;
  claim: string;
  orchid_name: string | null;
  evidence_quote: string | null;
  source_locator: string | null;
  evidence_type: string | null;
  input_note: string | null;
};

export type PaperItem = {
  kind: "paper";
  item_id: string;
  item_version: number;
  doi: string;
  paper_title: string;
  citation: string;
  /** Raw server value; display through topicLabel(). */
  topic: string;
  input_note: string | null;
  card_item_ids: string[];
};

export type ReviewItem = CardItem | PaperItem;

export type CardSubmissionInput = {
  verdict: Verdict;
  corrections: Correction[];
  explanation: string;
  source_citation: string;
};

export type PaperSubmissionInput = {
  own_key_findings: string;
  own_findings_before_reveal: boolean;
  missed_findings: string;
  answer_changing_omissions: string;
  source_citation: string;
  not_sure: boolean;
};

export type SubmissionReceipt = {
  submission_id: string;
  item_id: string;
  item_version: number;
  doi: string;
  submitted_at: string;
  item_version_was_current: boolean | null;
  /** Computed by the server (the reviewer's own previous submission); never sent by the client. */
  supersedes_submission_id: string | null;
};

export type ReviewerRegistration = {
  name: string;
  email: string;
  education_training?: string;
  future_invitations_opt_in: boolean;
  privacy_ack: true;
  /** Honeypot. Humans never see it; it must stay empty. */
  website: string;
};

export type ThresholdProgress = { verified: number; required: number; met: boolean };

/** GET /me `progress` and each curator reviewer row's `progress`. */
export type RecognitionProgress = {
  paper_reviews: ThresholdProgress;
  claim_reviews: ThresholdProgress;
  eligible_bases: AwardBasis[];
  submissions_total: number | null;
  pending_verification: number | null;
};

export type ContributorAward = {
  title: string;
  basis: AwardBasis;
  awarded_at: string;
};

/** Reviewer-facing recognition state (GET /me, PUT /me/recognition, curator rows). */
export type RecognitionState = {
  consent: boolean;
  consent_updated_at: string | null;
  display_name: string;
  affiliation: string | null;
  link: string | null;
  description: string;
  curator_approved: boolean;
  /** true only when awarded, consented and curator-approved. Curator rows do not carry it; derived there. */
  listed: boolean;
  slug: string | null;
  citable_path: string | null;
};

/** One own submission as GET /me returns it. Another reviewer's answers never appear here. */
export type OwnSubmission = {
  submission_id: string;
  item_id: string;
  item_version: number;
  item_version_was_current: boolean | null;
  /** Raw server values. */
  kind: string | null;
  doi: string;
  verdict: string | null;
  submitted_at: string;
  supersedes_submission_id: string | null;
  /** null = not yet verified by a curator */
  counts_toward_recognition: boolean | null;
};

export type MyProfile = {
  reviewer_id: string | null;
  name: string;
  email: string;
  education_training: string | null;
  future_invitations_opt_in: boolean;
  future_invitations_updated_at: string | null;
  submissions: OwnSubmission[];
  progress: RecognitionProgress;
  award: ContributorAward | null;
  recognition: RecognitionState | null;
  /** Server-provided; null until awarded. */
  resume_wording: string | null;
  authorship_note: string;
  privacy_notice: string | null;
};

export type RecognitionInput = {
  consent: boolean;
  display_name: string;
  affiliation?: string;
  link?: string;
  description: string;
};

export type PublicContributor = {
  slug: string;
  display_name: string;
  affiliation: string | null;
  link: string | null;
  description: string;
  title: string;
  awarded_on: string | null;
  citable_path: string;
  resume_wording: string;
};

export type ContributorsPage = {
  title: string;
  purpose: string | null;
  authorship_note: string;
  resume_wording: string;
  contributors: PublicContributor[];
};

export type CurationVerification = {
  /** null when the server sent something other than a boolean; see counts_raw. */
  counts_toward_recognition: boolean | null;
  counts_raw: string;
  note: string;
  verified_by: string | null;
  verified_at: string | null;
};

export type CurationSubmission = {
  submission_id: string;
  reviewer_id: string;
  reviewer_name: string;
  reviewer_email: string;
  reviewer_education_training: string | null;
  kind: string | null;
  item_version: number;
  item_version_was_current: boolean | null;
  submitted_at: string;
  supersedes_submission_id: string | null;
  superseded_by_submission_id: string | null;
  /** Raw server values; display through enumLabel(). */
  verdict: string | null;
  corrections: string[];
  explanation: string | null;
  source_citation: string | null;
  own_key_findings: string | null;
  own_findings_before_reveal: boolean | null;
  missed_findings: string | null;
  answer_changing_omissions: string | null;
  not_sure: boolean | null;
  verification: CurationVerification | null;
};

/** One row of `agreement.versions`: reviews of the same item version compared. */
export type AgreementVersion = {
  item_version: number;
  submissions: number;
  /** Raw server value: "agree" | "differ" | "not_applicable" expected. */
  status: string;
  verdict_counts: Record<string, number> | null;
  corrections: Record<string, number>;
  not_sure: number | null;
};

export type CurationDecision = {
  decision_id: string | null;
  item_version: number | null;
  /** Raw server value; display through enumLabel(DECISION_LABELS, …). */
  decision: string;
  note: string;
  curator_principal: string;
  decided_at: string;
  submission_ids: string[];
};

export type CurationQueueEntry = {
  item: ReviewItem;
  is_current: boolean | null;
  withdrawn: boolean;
  current_item_version: number | null;
  submissions: CurationSubmission[];
  agreement: AgreementVersion[];
  decisions: CurationDecision[];
  latest_decision: CurationDecision | null;
};

export type CuratorReviewer = {
  reviewer_id: string;
  name: string;
  email: string;
  education_training: string | null;
  future_invitations_opt_in: boolean;
  created_at: string | null;
  progress: RecognitionProgress;
  award: ContributorAward | null;
  recognition: RecognitionState | null;
};

export type CuratorThresholds = { paper_reviews: number; claim_reviews: number };

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

type Auth = { kind: "reviewer"; token: string } | { kind: "curator" } | { kind: "public" };

function fieldsOf(payload: unknown): Record<string, string> | null {
  const detail = payload && typeof payload === "object" ? (payload as { detail?: unknown }).detail : null;
  const fields = detail && typeof detail === "object" && !Array.isArray(detail) ? (detail as { fields?: unknown }).fields : null;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields as Record<string, unknown>)) out[k] = typeof v === "string" ? v : String(v);
  return Object.keys(out).length ? out : null;
}

function codeOf(payload: unknown): { code: string | null; message: string | null } {
  if (!payload || typeof payload !== "object") return { code: null, message: null };
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return { code: null, message: detail };
  if (Array.isArray(detail)) {
    // FastAPI's default validation list: [{loc, msg, type}, ...].
    const msgs = detail
      .map((d) => (d && typeof d === "object" && typeof (d as { msg?: unknown }).msg === "string" ? (d as { msg: string }).msg : null))
      .filter((m): m is string => Boolean(m));
    return { code: null, message: msgs.length ? `The form was not accepted: ${msgs.join("; ")}` : null };
  }
  if (detail && typeof detail === "object") {
    const code = (detail as { code?: unknown }).code;
    const message = (detail as { message?: unknown }).message;
    return {
      code: typeof code === "string" ? code : null,
      message: typeof message === "string" ? message : null,
    };
  }
  return { code: null, message: null };
}

async function request<T>(
  path: string,
  auth: Auth,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
  options: { allowNotFound?: boolean } = {},
): Promise<T | null> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (auth.kind === "reviewer") headers.Authorization = `Bearer ${auth.token}`;

  let response: Response;
  try {
    response = await fetch(`${CALYX_BACKEND_BASE_URL}${LITERATURE_REVIEW_API_PREFIX}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      // Curators ride the existing owner session (cookie or same-tab bearer);
      // reviewers identify only by their own bearer token.
      credentials: auth.kind === "curator" ? "include" : "omit",
      signal: init.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new LiteratureReviewError("network", "The review service could not be reached.");
  }

  let payload: unknown = null;
  try {
    const raw = await response.text();
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const { code, message } = codeOf(payload);
    const status = response.status;
    if (status === 404 && options.allowNotFound) return null;
    if (status === 401) throw new LiteratureReviewError("unauthorized", message ?? "Not signed in.", status, code);
    if (status === 403) throw new LiteratureReviewError("forbidden", message ?? "Not permitted.", status, code);
    if (status === 404) throw new LiteratureReviewError("not_found", message ?? "Not found.", status, code);
    if (status === 429) {
      const retry = Number.parseInt(response.headers?.get?.("Retry-After") ?? "", 10);
      throw new LiteratureReviewError("rate_limited", message ?? "Rate limited.", status, code, Number.isFinite(retry) && retry > 0 ? retry : null);
    }
    if (status >= 400 && status < 500)
      throw new LiteratureReviewError("rejected", message ?? "Rejected.", status, code, null, fieldsOf(payload));
    throw new LiteratureReviewError("unavailable", message ?? "Unavailable.", status, code);
  }
  return payload as T;
}

function malformed(what: string): never {
  throw new LiteratureReviewError("malformed", `Malformed ${what} response.`);
}

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const optStr = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/**
 * The server's value as text, exactly as sent. Enumerated fields keep the raw
 * value so the page can label known values and show anything else as
 * "Unknown value: <raw>" — never substituting a value the server did not send.
 */
function rawText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v === undefined) return "(missing)";
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

/** Label a known enumerated value; show anything else verbatim as an unknown value. */
export function enumLabel(labels: Record<string, string>, raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return "Not recorded";
  return Object.prototype.hasOwnProperty.call(labels, raw) ? labels[raw] : `Unknown value: ${raw}`;
}

export function topicLabel(raw: string): string {
  return enumLabel(TOPIC_LABELS, raw);
}

function itemKind(raw: Record<string, unknown>): "card" | "paper" | null {
  if (raw.kind === "card" || raw.kind === "paper") return raw.kind;
  const id = str(raw.item_id);
  if (id?.startsWith("card:")) return "card";
  if (id?.startsWith("paper:")) return "paper";
  return null;
}

/** Whitelist the displayable item fields. Unknown fields are dropped on purpose. */
export function normaliseItem(raw: unknown): ReviewItem {
  if (!isObj(raw)) malformed("item");
  const item_id = str(raw.item_id);
  const item_version = num(raw.item_version);
  const doi = str(raw.doi);
  const kind = itemKind(raw);
  if (!item_id || item_version === null || !doi || !kind) malformed("item");
  const base = {
    item_id,
    item_version,
    doi,
    paper_title: str(raw.paper_title) ?? "",
    citation: str(raw.citation) ?? "",
    topic: rawText(raw.topic),
    input_note: optStr(raw.input_note),
  };
  if (kind === "paper") {
    const ids = Array.isArray(raw.card_item_ids) ? raw.card_item_ids.filter((x): x is string => typeof x === "string") : [];
    return { kind, ...base, card_item_ids: ids };
  }
  const claim = str(raw.claim);
  if (!claim) malformed("card item");
  return {
    kind,
    ...base,
    paper_item_id: optStr(raw.paper_item_id),
    claim,
    orchid_name: optStr(raw.orchid_name),
    evidence_quote: optStr(raw.evidence_quote),
    source_locator: optStr(raw.source_locator),
    evidence_type: optStr(raw.evidence_type),
  };
}

function normaliseThreshold(raw: unknown): ThresholdProgress {
  if (!isObj(raw)) malformed("progress");
  const verified = num(raw.verified);
  const required = num(raw.required);
  if (verified === null || required === null) malformed("progress");
  return { verified, required, met: bool(raw.met) ?? verified >= required };
}

function normaliseProgress(raw: unknown): RecognitionProgress {
  if (!isObj(raw)) malformed("progress");
  return {
    paper_reviews: normaliseThreshold(raw.paper_reviews),
    claim_reviews: normaliseThreshold(raw.claim_reviews),
    eligible_bases: Array.isArray(raw.eligible_bases)
      ? raw.eligible_bases.filter((b): b is AwardBasis => (AWARD_BASES as readonly unknown[]).includes(b))
      : [],
    submissions_total: num(raw.submissions_total),
    pending_verification: num(raw.pending_verification),
  };
}

function normaliseAward(raw: unknown): ContributorAward | null {
  if (raw === null || raw === undefined) return null;
  if (!isObj(raw)) malformed("award");
  const awarded_at = str(raw.awarded_at);
  const basis = raw.basis as AwardBasis;
  if (!awarded_at || !(AWARD_BASES as readonly string[]).includes(basis)) malformed("award");
  return { title: str(raw.title) ?? CONTRIBUTOR_TITLE, basis, awarded_at };
}

export function normaliseRecognition(raw: unknown): RecognitionState | null {
  if (raw === null || raw === undefined) return null;
  if (!isObj(raw)) malformed("recognition");
  const consent = bool(raw.consent) ?? false;
  const curator_approved = bool(raw.curator_approved) ?? false;
  const slug = optStr(raw.slug);
  return {
    consent,
    consent_updated_at: optStr(raw.consent_updated_at),
    display_name: str(raw.display_name) ?? "",
    affiliation: optStr(raw.affiliation),
    link: safeHttpsUrl(optStr(raw.link)),
    description: str(raw.description) ?? "",
    curator_approved,
    listed: bool(raw.listed) ?? (consent && curator_approved),
    slug,
    // Built from the slug only; a server-sent path is never trusted as a link.
    citable_path: slug ? contributorPath(slug) : null,
  };
}

/** Raw text when present; null only when the server sent null/nothing. */
function rawOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : rawText(v);
}

export function normaliseMe(raw: unknown): MyProfile {
  if (!isObj(raw) || !isObj(raw.profile)) malformed("profile");
  const profile = raw.profile;
  const name = str(profile.name);
  const email = str(profile.email);
  if (!name || !email) malformed("profile");
  const submissions = Array.isArray(raw.submissions) ? raw.submissions : [];
  return {
    reviewer_id: optStr(profile.reviewer_id),
    name,
    email,
    education_training: optStr(profile.education_training),
    future_invitations_opt_in: bool(profile.future_invitations_opt_in) ?? false,
    future_invitations_updated_at: optStr(profile.future_invitations_updated_at),
    submissions: submissions.filter(isObj).map((s) => ({
      submission_id: str(s.submission_id) ?? "",
      item_id: str(s.item_id) ?? "",
      item_version: num(s.item_version) ?? 0,
      item_version_was_current: bool(s.item_version_was_current),
      kind: rawOrNull(s.kind),
      doi: str(s.doi) ?? "",
      verdict: rawOrNull(s.verdict),
      submitted_at: str(s.submitted_at) ?? "",
      supersedes_submission_id: optStr(s.supersedes_submission_id),
      counts_toward_recognition: bool(s.counts_toward_recognition),
    })),
    progress: normaliseProgress(raw.progress),
    award: normaliseAward(raw.award),
    recognition: normaliseRecognition(raw.recognition),
    resume_wording: optStr(raw.resume_wording),
    authorship_note: optStr(raw.authorship_note) ?? AUTHORSHIP_NOTE,
    privacy_notice: optStr(raw.privacy_notice),
  };
}

function normaliseContributor(raw: unknown): PublicContributor {
  if (!isObj(raw)) malformed("contributor");
  const slug = str(raw.slug);
  const display_name = str(raw.display_name);
  if (!slug || !display_name) malformed("contributor");
  return {
    slug,
    display_name,
    affiliation: optStr(raw.affiliation),
    link: safeHttpsUrl(optStr(raw.link)),
    description: str(raw.description) ?? "",
    title: str(raw.title) ?? CONTRIBUTOR_TITLE,
    awarded_on: optStr(raw.awarded_on),
    // Built from the slug only; a server-sent path is never trusted as a link.
    citable_path: contributorPath(slug),
    resume_wording: optStr(raw.resume_wording) ?? RESUME_WORDING,
  };
}

function normaliseCurationSubmission(raw: unknown): CurationSubmission {
  if (!isObj(raw)) malformed("submission");
  const submission_id = str(raw.submission_id);
  if (!submission_id) malformed("submission");
  const reviewer = isObj(raw.reviewer) ? raw.reviewer : {};
  // Every correction the server sent is kept (as text); unknown ones are
  // shown as unknown values rather than dropped.
  const corrections = Array.isArray(raw.corrections) ? raw.corrections.map(rawText) : [];
  const v = isObj(raw.verification) ? raw.verification : null;
  return {
    submission_id,
    reviewer_id: str(reviewer.reviewer_id) ?? "",
    reviewer_name: str(reviewer.name) ?? "",
    reviewer_email: str(reviewer.email) ?? "",
    reviewer_education_training: optStr(reviewer.education_training),
    kind: rawOrNull(raw.kind),
    item_version: num(raw.item_version) ?? 0,
    item_version_was_current: bool(raw.item_version_was_current),
    submitted_at: str(raw.submitted_at) ?? "",
    supersedes_submission_id: optStr(raw.supersedes_submission_id),
    superseded_by_submission_id: optStr(raw.superseded_by_submission_id),
    verdict: rawOrNull(raw.verdict),
    corrections,
    explanation: optStr(raw.explanation),
    source_citation: optStr(raw.source_citation),
    own_key_findings: optStr(raw.own_key_findings),
    own_findings_before_reveal: bool(raw.own_findings_before_reveal),
    missed_findings: optStr(raw.missed_findings),
    answer_changing_omissions: optStr(raw.answer_changing_omissions),
    not_sure: bool(raw.not_sure),
    verification: v
      ? {
          counts_toward_recognition: bool(v.counts_toward_recognition),
          counts_raw: rawText(v.counts_toward_recognition),
          note: str(v.note) ?? "",
          verified_by: optStr(v.verified_by),
          verified_at: optStr(v.verified_at),
        }
      : null,
  };
}

/** Every numeric count the server sent, keyed by its raw name (unknown keys kept). */
function countMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const n = num(v);
    if (n !== null) out[k] = n;
  }
  return out;
}

function normaliseDecision(d: Record<string, unknown>): CurationDecision {
  return {
    decision_id: optStr(d.decision_id),
    item_version: num(d.item_version),
    decision: rawText(d.decision),
    note: str(d.note) ?? "",
    curator_principal: str(d.curator_principal) ?? "",
    decided_at: str(d.decided_at) ?? "",
    submission_ids: Array.isArray(d.submission_ids) ? d.submission_ids.filter((x): x is string => typeof x === "string") : [],
  };
}

function normaliseQueueEntry(raw: unknown): CurationQueueEntry {
  if (!isObj(raw)) malformed("queue entry");
  const itemRaw = isObj(raw.item) ? raw.item : null;
  const agreement = isObj(raw.agreement) ? raw.agreement : {};
  const versions = Array.isArray(agreement.versions) ? agreement.versions.filter(isObj) : [];
  return {
    item: normaliseItem(itemRaw),
    is_current: itemRaw ? bool(itemRaw.is_current) : null,
    withdrawn: itemRaw ? (bool(itemRaw.withdrawn) ?? false) : false,
    current_item_version: num(raw.current_item_version),
    submissions: Array.isArray(raw.submissions) ? raw.submissions.map(normaliseCurationSubmission) : [],
    agreement: versions.map((v) => ({
      item_version: num(v.item_version) ?? 0,
      submissions: num(v.submissions) ?? 0,
      status: rawText(v.status),
      verdict_counts: isObj(v.verdict_counts) ? countMap(v.verdict_counts) : null,
      corrections: countMap(v.corrections),
      not_sure: num(v.not_sure),
    })),
    decisions: Array.isArray(raw.decisions) ? raw.decisions.filter(isObj).map(normaliseDecision) : [],
    latest_decision: isObj(raw.latest_decision) ? normaliseDecision(raw.latest_decision) : null,
  };
}

function normaliseCuratorReviewer(raw: unknown): CuratorReviewer {
  if (!isObj(raw)) malformed("reviewer");
  const reviewer_id = str(raw.reviewer_id);
  if (!reviewer_id) malformed("reviewer");
  return {
    reviewer_id,
    name: str(raw.name) ?? "",
    email: str(raw.email) ?? "",
    education_training: optStr(raw.education_training),
    future_invitations_opt_in: bool(raw.future_invitations_opt_in) ?? false,
    created_at: optStr(raw.created_at),
    progress: normaliseProgress(raw.progress),
    award: normaliseAward(raw.award),
    recognition: normaliseRecognition(raw.recognition),
  };
}

const enc = encodeURIComponent;

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export async function listItems(
  filter: { kind?: "card" | "paper"; topic?: ReviewTopic; doi?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<ReviewItem[]> {
  const params = new URLSearchParams();
  if (filter.limit) params.set("limit", String(filter.limit));
  if (filter.kind) params.set("kind", filter.kind);
  if (filter.topic) params.set("topic", filter.topic);
  if (filter.doi) params.set("doi", filter.doi);
  const qs = params.toString();
  const payload = await request<{ items?: unknown }>(`/items${qs ? `?${qs}` : ""}`, { kind: "public" }, { signal });
  if (!isObj(payload) || !Array.isArray(payload.items)) malformed("items");
  return payload.items.map(normaliseItem);
}

export async function getItem(itemId: string, signal?: AbortSignal): Promise<ReviewItem> {
  const payload = await request<unknown>(`/items/${enc(itemId)}`, { kind: "public" }, { signal });
  return normaliseItem(payload);
}

export async function registerReviewer(body: ReviewerRegistration): Promise<string> {
  const payload = await request<{ reviewer_token?: unknown }>("/reviewers", { kind: "public" }, { method: "POST", body });
  const token = isObj(payload) ? str(payload.reviewer_token) : null;
  if (!token) malformed("registration");
  return token;
}

export async function listContributors(signal?: AbortSignal): Promise<ContributorsPage> {
  const payload = await request<Record<string, unknown>>("/contributors", { kind: "public" }, { signal });
  if (!isObj(payload) || !Array.isArray(payload.contributors)) malformed("contributors");
  return {
    title: optStr(payload.title) ?? CONTRIBUTOR_TITLE,
    purpose: optStr(payload.purpose),
    authorship_note: optStr(payload.authorship_note) ?? AUTHORSHIP_NOTE,
    resume_wording: optStr(payload.resume_wording) ?? RESUME_WORDING,
    contributors: payload.contributors.map(normaliseContributor),
  };
}

export async function getContributor(
  slug: string,
  signal?: AbortSignal,
): Promise<PublicContributor & { authorship_note: string }> {
  const payload = await request<unknown>(`/contributors/${enc(slug)}`, { kind: "public" }, { signal });
  const entry = normaliseContributor(payload);
  const note = isObj(payload) ? optStr(payload.authorship_note) : null;
  return { ...entry, authorship_note: note ?? AUTHORSHIP_NOTE };
}

// ---------------------------------------------------------------------------
// Reviewer (Bearer reviewer token)
// ---------------------------------------------------------------------------

function normaliseReceipt(raw: unknown): SubmissionReceipt {
  if (!isObj(raw)) malformed("submission");
  const submission_id = str(raw.submission_id);
  if (!submission_id) malformed("submission");
  return {
    submission_id,
    item_id: str(raw.item_id) ?? "",
    item_version: num(raw.item_version) ?? 0,
    doi: str(raw.doi) ?? "",
    submitted_at: str(raw.submitted_at) ?? "",
    item_version_was_current: bool(raw.item_version_was_current),
    supersedes_submission_id: optStr(raw.supersedes_submission_id),
  };
}

export async function submitCardReview(
  token: string,
  item: Pick<CardItem, "item_id" | "item_version">,
  input: CardSubmissionInput,
  website = "",
): Promise<SubmissionReceipt> {
  const body = {
    item_id: item.item_id,
    item_version: item.item_version,
    verdict: input.verdict,
    corrections: input.corrections,
    explanation: input.explanation,
    source_citation: input.source_citation,
    website,
  };
  return normaliseReceipt(await request<unknown>("/submissions", { kind: "reviewer", token }, { method: "POST", body }));
}

export async function submitPaperReview(
  token: string,
  item: Pick<PaperItem, "item_id" | "item_version">,
  input: PaperSubmissionInput,
  website = "",
): Promise<SubmissionReceipt> {
  const body = {
    item_id: item.item_id,
    item_version: item.item_version,
    ...input,
    website,
  };
  return normaliseReceipt(await request<unknown>("/submissions", { kind: "reviewer", token }, { method: "POST", body }));
}

/** A missing draft (404) is "no draft", not a failure. */
export async function getServerDraft(token: string, itemId: string, signal?: AbortSignal): Promise<unknown | null> {
  const payload = await request<{ payload?: unknown }>(
    `/drafts/${enc(itemId)}`,
    { kind: "reviewer", token },
    { signal },
    { allowNotFound: true },
  );
  if (payload === null) return null;
  return isObj(payload) && "payload" in payload ? (payload.payload ?? null) : null;
}

export async function putServerDraft(token: string, itemId: string, draft: unknown): Promise<void> {
  await request<unknown>(`/drafts/${enc(itemId)}`, { kind: "reviewer", token }, { method: "PUT", body: { payload: draft } });
}

export async function getMe(token: string, signal?: AbortSignal): Promise<MyProfile> {
  return normaliseMe(await request<unknown>("/me", { kind: "reviewer", token }, { signal }));
}

export async function updatePreferences(token: string, future_invitations_opt_in: boolean): Promise<void> {
  await request<unknown>("/me/preferences", { kind: "reviewer", token }, { method: "PUT", body: { future_invitations_opt_in } });
}

export async function updateRecognition(token: string, input: RecognitionInput): Promise<RecognitionState | null> {
  const payload = await request<unknown>("/me/recognition", { kind: "reviewer", token }, { method: "PUT", body: input });
  return normaliseRecognition(payload);
}

// ---------------------------------------------------------------------------
// Curator (existing owner session; never the reviewer token)
// ---------------------------------------------------------------------------

export async function getCurationQueue(filter: { item_id?: string; doi?: string } = {}, signal?: AbortSignal): Promise<CurationQueueEntry[]> {
  const params = new URLSearchParams();
  if (filter.item_id) params.set("item_id", filter.item_id);
  if (filter.doi) params.set("doi", filter.doi);
  const qs = params.toString();
  const payload = await request<{ items?: unknown }>(`/curation/queue${qs ? `?${qs}` : ""}`, { kind: "curator" }, { signal });
  if (!isObj(payload) || !Array.isArray(payload.items)) malformed("curation queue");
  return payload.items.map(normaliseQueueEntry);
}

export async function postCurationDecision(body: {
  item_id: string;
  item_version?: number;
  decision: CurationDecisionKind;
  note: string;
  submission_ids: string[];
}): Promise<void> {
  await request<unknown>("/curation/decisions", { kind: "curator" }, { method: "POST", body });
}

export async function postSubmissionVerification(submissionId: string, body: { counts_toward_recognition: boolean; note: string }): Promise<void> {
  await request<unknown>(`/curation/submissions/${enc(submissionId)}/verification`, { kind: "curator" }, { method: "POST", body });
}

export async function getCuratorReviewers(
  signal?: AbortSignal,
): Promise<{ thresholds: CuratorThresholds | null; reviewers: CuratorReviewer[] }> {
  const payload = await request<Record<string, unknown>>("/curation/reviewers", { kind: "curator" }, { signal });
  if (!isObj(payload) || !Array.isArray(payload.reviewers)) malformed("reviewers");
  const t = isObj(payload.thresholds) ? payload.thresholds : null;
  const pr = t ? num(t.paper_reviews) : null;
  const cr = t ? num(t.claim_reviews) : null;
  return {
    thresholds: pr !== null && cr !== null ? { paper_reviews: pr, claim_reviews: cr } : null,
    reviewers: payload.reviewers.map(normaliseCuratorReviewer),
  };
}

export async function postAward(body: { reviewer_id: string; basis: AwardBasis; note: string }): Promise<void> {
  await request<unknown>("/curation/awards", { kind: "curator" }, { method: "POST", body });
}

export async function setRecognitionApproval(reviewerId: string, action: "approve" | "revoke"): Promise<void> {
  await request<unknown>(`/curation/recognition/${enc(reviewerId)}/${action}`, { kind: "curator" }, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Small helpers shared by the pages
// ---------------------------------------------------------------------------

/**
 * An https URL re-serialised through URL, or null. Whitespace, quotes, angle
 * brackets and backslashes are refused outright rather than repaired.
 */
export function safeHttpsUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value) return null;
  if (/[\s"'<>\\`]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function isHttpsUrl(value: string): boolean {
  return safeHttpsUrl(value) !== null;
}

export function reviewPaperPath(doi: string): string {
  return `/review/paper/${enc(doi)}`;
}

export function reviewCardPath(itemId: string): string {
  return `/review/card/${enc(itemId)}`;
}

export function contributorPath(slug: string): string {
  return `/contributors/${enc(slug)}`;
}
