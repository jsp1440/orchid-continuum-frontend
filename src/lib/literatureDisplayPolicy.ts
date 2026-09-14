/**
 * What may be shown from an extracted paper, and what may not.
 *
 * A literature extraction holds the paper's own words: section text, abstracts,
 * evidence excerpts. Those words are usually somebody else's copyright, and the
 * backend already models the permission to display them as a `display_policy`
 * on the canonical source binding. This module is the frontend half of that
 * contract.
 *
 * THE GATE IS COPIED, NOT INVENTED. The rules below mirror
 * `app/evidence_retrieval/engine.py::_assemble`, which is the backend's own
 * release decision — the same five policy values, the same internal-access
 * condition, the same 160-character preview. A second, subtly different gate on
 * the frontend would be worse than none, because it would look authoritative
 * while disagreeing with the service.
 *
 * IT FAILS CLOSED, AND THE ABSENT CASE IS THE IMPORTANT ONE. A paper with no
 * canonical source binding has no established display permission. That is not
 * "no restriction" — it is "nobody has decided yet", which the backend spells
 * UNKNOWN_REQUIRES_REVIEW and treats as excluded
 * (`app/semantic_index/service.py`). Most papers in a young corpus have no
 * binding, so a gate that defaulted open would release nearly the whole corpus
 * on the strength of a missing file.
 *
 * WITHHELD IS NOT EMPTY. Every refusal carries a reason, so a reader can tell
 * "this paper has no methods section" from "the methods section exists and may
 * not be shown here". Rendering both as blank space misreports the corpus.
 */

/** The backend's policy vocabulary. Any other string is not a policy. */
export const DISPLAY_POLICIES = [
  "FULL_TEXT_ALLOWED",
  "INTERNAL_RESEARCH_ONLY",
  "LIMITED_PREVIEW_ONLY",
  "METADATA_ONLY",
  "UNKNOWN_REQUIRES_REVIEW",
] as const;

export type DisplayPolicy = (typeof DISPLAY_POLICIES)[number];

/**
 * Preview length for LIMITED_PREVIEW_ONLY, matching `excerpt_limit`'s default
 * in the retrieval engine. A policy constant, not a layout choice.
 */
export const LIMITED_PREVIEW_CHARS = 160;

export type WithheldReason =
  /** No canonical source binding exists, so no permission has been established. */
  | "no-binding"
  /** The binding says identity only. */
  | "metadata-only"
  /** The binding says nobody has adjudicated this source yet. */
  | "requires-review"
  /** Internal-research text without the internal-use permission to read it. */
  | "internal-permission-absent"
  /** The binding carried a policy this client does not recognise. */
  | "unrecognised-policy"
  /** There is no text to release. Distinct from every refusal above. */
  | "absent";

export type TextRelease =
  | { released: true; text: string; truncated: boolean; policy: DisplayPolicy }
  | { released: false; reason: WithheldReason; policy: DisplayPolicy | null };

/** The half of a source binding that governs display. */
export interface DisplayBinding {
  display_policy?: unknown;
  internal_use_permission?: unknown;
}

/**
 * Read a policy from a binding, or `null` if it is not one this client knows.
 *
 * An unknown string is deliberately not coerced to a default. Coercing it to
 * UNKNOWN_REQUIRES_REVIEW would be safe but silent; returning null lets the
 * caller say "this binding carries a policy we cannot honour", which is a
 * different and more useful statement than "this needs review".
 */
export function readDisplayPolicy(binding: DisplayBinding | null | undefined): DisplayPolicy | null {
  if (!binding || typeof binding !== "object") return null;
  const raw = binding.display_policy;
  if (typeof raw !== "string") return null;
  return (DISPLAY_POLICIES as readonly string[]).includes(raw) ? (raw as DisplayPolicy) : null;
}

/**
 * Decide whether a piece of the paper's own text may be shown.
 *
 * `binding` is null when the paper has no canonical source binding at all —
 * the common case, and the one that must withhold.
 */
export function releaseText(
  text: string | null | undefined,
  binding: DisplayBinding | null | undefined,
): TextRelease {
  if (!binding) return { released: false, reason: "no-binding", policy: null };

  const policy = readDisplayPolicy(binding);
  if (policy === null) return { released: false, reason: "unrecognised-policy", policy: null };

  // Order matters: the policy is checked before the text. A caller must not be
  // able to learn "there is no methods section here" for a source it may not
  // read, and a permitted-but-empty field is a different fact from a withheld
  // one either way.
  if (policy === "UNKNOWN_REQUIRES_REVIEW") {
    return { released: false, reason: "requires-review", policy };
  }
  if (policy === "METADATA_ONLY") {
    return { released: false, reason: "metadata-only", policy };
  }
  if (policy === "INTERNAL_RESEARCH_ONLY" && binding.internal_use_permission !== true) {
    // Strict `=== true`: a missing permission, a null, or a truthy-looking
    // string is not a grant. The default on the backend model is false.
    return { released: false, reason: "internal-permission-absent", policy };
  }

  if (typeof text !== "string" || text.length === 0) {
    return { released: false, reason: "absent", policy };
  }

  if (policy === "LIMITED_PREVIEW_ONLY") {
    const truncated = text.length > LIMITED_PREVIEW_CHARS;
    return {
      released: true,
      text: truncated ? text.slice(0, LIMITED_PREVIEW_CHARS) : text,
      truncated,
      policy,
    };
  }

  return { released: true, text, truncated: false, policy };
}

/** Reader-facing sentence for a refusal. Never renders as absence. */
export function describeWithheld(reason: WithheldReason): string {
  switch (reason) {
    case "no-binding":
      return "This paper has no canonical source binding, so no display permission has been established for its text. Withheld until one is recorded — an unrecorded permission is not an unrestricted one.";
    case "metadata-only":
      return "The source binding permits identity and counts only. The text exists in the extraction and is not shown here.";
    case "requires-review":
      return "The source binding is marked as requiring review. Nobody has yet decided what may be displayed from this source.";
    case "internal-permission-absent":
      return "This source is internal-research-only and this session does not carry the internal-use permission for it.";
    case "unrecognised-policy":
      return "The source binding carries a display policy this client does not recognise, so it cannot be honoured. Withheld rather than guessed.";
    case "absent":
      return "No text was extracted for this section.";
  }
}
