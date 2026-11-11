/**
 * Client model for `research.scientific_evidence` on a Calyx Speak turn.
 *
 * The block is produced by the backend's
 * `app/calyx_conversation/scientific_evidence_context.py`
 * (schema `oc.calyx-scientific-evidence-context.v1`). It carries what the
 * Continuum's graph and source records returned for a pollination question about
 * exactly one named species, or the stated reason nothing was returned.
 *
 * Rules this module holds to:
 *
 *   - The block is optional. A backend that predates it, or has it switched off,
 *     sends none, and that must read as "nothing to show", never as an error.
 *   - Nothing is inferred. A field the backend did not send stays unknown; in
 *     particular `pollination_verified` is three-valued here (true, false, not
 *     reported) so an absent flag can never read as "verified" or "not verified".
 *   - An unrecognised status or a block of the wrong shape fails closed: its
 *     sentences are not shown as evidence.
 *   - Sentences are the backend's wording and are passed through unchanged.
 */

export const CALYX_SCIENTIFIC_EVIDENCE_SCHEMA = "oc.calyx-scientific-evidence-context.v1";

/** The heading the backend puts above the sentences it appends to the answer text. */
export const CALYX_EVIDENCE_ANSWER_HEADING = "What the Continuum's evidence records show";

export type CalyxScientificEvidenceStatus =
  | "not_enabled"
  | "not_requested"
  | "not_applicable"
  | "not_resolved"
  | "unavailable"
  | "available";

const KNOWN_STATUSES: readonly CalyxScientificEvidenceStatus[] = [
  "not_enabled",
  "not_requested",
  "not_applicable",
  "not_resolved",
  "unavailable",
  "available",
];

export type CalyxEvidenceMission = {
  mission_id?: string | null;
  state?: string | null;
  review_status?: string | null;
  publication_eligibility?: {
    eligible?: boolean;
    automatic_publication?: boolean;
    blockers?: string[];
  } | null;
};

/** The block as it arrives on the wire. Every field but `status` may be missing. */
export type CalyxScientificEvidenceContext = {
  schema?: string;
  status: CalyxScientificEvidenceStatus | (string & {});
  reading?: string[];
  species?: string | null;
  resolution?: string | null;
  mission?: CalyxEvidenceMission | null;
  evidence_packet_id?: string | null;
  graph_state?: string | null;
  graph_completeness?: string | null;
  pollination_verified?: boolean;
  reason?: string | null;
  error?: string | null;
  explanation?: string | null;
  read_only?: boolean;
  knowledge_graph_mutation?: boolean;
  automatic_publication?: boolean;
  durable_mission_record?: boolean;
  is_reviewed_conclusion?: boolean;
};

/** `null` always means "the backend did not report this", never "false". */
export type CalyxEvidenceBoundary = {
  readOnly: boolean | null;
  knowledgeGraphMutation: boolean | null;
  automaticPublication: boolean | null;
  durableMissionRecord: boolean | null;
  isReviewedConclusion: boolean | null;
};

export type CalyxEvidenceProvenance = {
  missionId: string | null;
  missionState: string | null;
  reviewStatus: string | null;
  publicationEligible: boolean | null;
  publicationBlockers: string[];
  evidencePacketId: string | null;
  graphState: string | null;
  graphCompleteness: string | null;
  resolution: string | null;
};

export type CalyxEvidenceView = {
  /**
   * `absent`: no block at all. `quiet`: a block that says there is nothing to
   * show for this turn. `malformed` / `unrecognised`: a block this page cannot
   * read safely. The remaining kinds mirror the backend statuses.
   */
  kind:
    | "absent"
    | "quiet"
    | "not_applicable"
    | "not_resolved"
    | "unavailable"
    | "available"
    | "unrecognised"
    | "malformed";
  /** The status string the backend sent, when it sent one. */
  status: string | null;
  /** Where the view came from: the turn response, or a saved conversation message. */
  origin: "turn" | "saved_message";
  sentences: string[];
  species: string | null;
  pollinationVerified: boolean | null;
  explanation: string | null;
  /** Machine code for why there is no evidence (`reason` or `error`). */
  code: string | null;
  provenance: CalyxEvidenceProvenance;
  boundary: CalyxEvidenceBoundary;
};

const EMPTY_PROVENANCE: CalyxEvidenceProvenance = {
  missionId: null,
  missionState: null,
  reviewStatus: null,
  publicationEligible: null,
  publicationBlockers: [],
  evidencePacketId: null,
  graphState: null,
  graphCompleteness: null,
  resolution: null,
};

const EMPTY_BOUNDARY: CalyxEvidenceBoundary = {
  readOnly: null,
  knowledgeGraphMutation: null,
  automaticPublication: null,
  durableMissionRecord: null,
  isReviewedConclusion: null,
};

function emptyView(kind: CalyxEvidenceView["kind"], origin: CalyxEvidenceView["origin"], status: string | null = null): CalyxEvidenceView {
  return {
    kind,
    status,
    origin,
    sentences: [],
    species: null,
    pollinationVerified: null,
    explanation: null,
    code: null,
    provenance: { ...EMPTY_PROVENANCE },
    boundary: { ...EMPTY_BOUNDARY },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function flag(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function provenanceOf(raw: Record<string, unknown>): CalyxEvidenceProvenance {
  const mission = isRecord(raw.mission) ? raw.mission : {};
  const eligibility = isRecord(mission.publication_eligibility) ? mission.publication_eligibility : {};
  return {
    missionId: text(mission.mission_id),
    missionState: text(mission.state),
    reviewStatus: text(mission.review_status),
    publicationEligible: flag(eligibility.eligible),
    publicationBlockers: strings(eligibility.blockers),
    evidencePacketId: text(raw.evidence_packet_id),
    graphState: text(raw.graph_state),
    graphCompleteness: text(raw.graph_completeness),
    resolution: text(raw.resolution),
  };
}

function boundaryOf(raw: Record<string, unknown>): CalyxEvidenceBoundary {
  return {
    readOnly: flag(raw.read_only),
    knowledgeGraphMutation: flag(raw.knowledge_graph_mutation),
    automaticPublication: flag(raw.automatic_publication),
    durableMissionRecord: flag(raw.durable_mission_record),
    isReviewedConclusion: flag(raw.is_reviewed_conclusion),
  };
}

/**
 * Read `research.scientific_evidence` from a turn response.
 *
 * Accepts anything: the value comes from `response.json()` with no runtime
 * shape check, so it may be missing, null, or not what the type says.
 */
export function readScientificEvidence(raw: unknown): CalyxEvidenceView {
  if (raw === undefined || raw === null) return emptyView("absent", "turn");
  if (!isRecord(raw)) return emptyView("malformed", "turn");
  const status = text(raw.status);
  if (!status) return emptyView("malformed", "turn");
  // A different schema is a different contract. Its fields may mean something
  // else, so nothing is read from it.
  const schema = text(raw.schema);
  if (schema !== null && schema !== CALYX_SCIENTIFIC_EVIDENCE_SCHEMA) return emptyView("malformed", "turn", status);
  if (!KNOWN_STATUSES.includes(status as CalyxScientificEvidenceStatus)) return emptyView("unrecognised", "turn", status);

  const base: CalyxEvidenceView = {
    ...emptyView("quiet", "turn", status),
    species: text(raw.species),
    explanation: text(raw.explanation),
    code: text(raw.reason) ?? text(raw.error),
    provenance: provenanceOf(raw),
    boundary: boundaryOf(raw),
  };

  switch (status as CalyxScientificEvidenceStatus) {
    case "not_enabled":
    case "not_requested":
      return { ...base, kind: "quiet" };
    case "not_applicable":
      // Without an explanation the backend has nothing to say about this turn.
      return { ...base, kind: base.explanation ? "not_applicable" : "quiet" };
    case "not_resolved":
      return { ...base, kind: "not_resolved" };
    case "unavailable":
      return { ...base, kind: "unavailable" };
    case "available": {
      // `reading` must be a list. Anything else is not evidence this page can show.
      if (!Array.isArray(raw.reading)) return emptyView("malformed", "turn", status);
      return {
        ...base,
        kind: "available",
        sentences: strings(raw.reading),
        pollinationVerified: flag(raw.pollination_verified),
      };
    }
  }
}

export type CalyxAnswerParts = {
  /** The answer without the appended evidence section. */
  body: string;
  /** The sentences of the appended section, in order; empty when there is none. */
  evidenceSentences: string[];
};

/**
 * Separate the evidence section the backend appends to the answer text.
 *
 * The backend adds `"\n\n" + heading + ":" + "\n- sentence"...` after whatever
 * the reply provider wrote. Only that exact trailing shape is recognised: the
 * heading on its own line, followed to the end of the text by `- ` items. If a
 * reply merely mentions the heading, or anything else follows it, the text is
 * left whole.
 */
export function splitEvidenceSection(content: string): CalyxAnswerParts {
  const whole: CalyxAnswerParts = { body: content, evidenceSentences: [] };
  if (typeof content !== "string") return { body: "", evidenceSentences: [] };
  const marker = `${CALYX_EVIDENCE_ANSWER_HEADING}:`;
  const lines = content.split("\n");
  let headingIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].trim() === marker) {
      headingIndex = index;
      break;
    }
  }
  if (headingIndex === -1) return whole;
  const sentences: string[] = [];
  for (const line of lines.slice(headingIndex + 1)) {
    if (!line.trim()) continue;
    if (!line.startsWith("- ")) return whole;
    const sentence = line.slice(2).trim();
    if (sentence) sentences.push(sentence);
  }
  if (!sentences.length) return whole;
  return { body: lines.slice(0, headingIndex).join("\n").trimEnd(), evidenceSentences: sentences };
}

/** Remove one trailing paragraph when the text ends with exactly that paragraph. */
function withoutTrailingParagraph(content: string, paragraph: string): string | null {
  const trimmed = content.trimEnd();
  if (!paragraph || !trimmed.endsWith(paragraph)) return null;
  const before = trimmed.slice(0, trimmed.length - paragraph.length);
  if (before && !before.endsWith("\n")) return null;
  return before.trimEnd();
}

export type CalyxAnswerWithEvidence = {
  /** The text to print as the answer. */
  answerText: string;
  /** The view to hand to the evidence panel. */
  evidence: CalyxEvidenceView;
};

/**
 * Decide what the answer prints and what the evidence panel prints, so that the
 * same sentences are not shown twice and none are dropped.
 *
 * Text is removed from the answer only when the panel shows that same text. If
 * the appended section and the structured `reading` disagree, the answer is
 * left whole: printing something twice is better than hiding it.
 */
export function composeAnswerWithEvidence(content: string, evidence: CalyxEvidenceView): CalyxAnswerWithEvidence {
  const parts = splitEvidenceSection(content);

  if (evidence.kind === "available") {
    if (!parts.evidenceSentences.length) return { answerText: content, evidence };
    if (!evidence.sentences.length) {
      // The saved-message path: the sentences exist only in the answer text.
      return { answerText: parts.body, evidence: { ...evidence, sentences: parts.evidenceSentences } };
    }
    const shown = new Set(evidence.sentences);
    const allShown = parts.evidenceSentences.every((sentence) => shown.has(sentence));
    return { answerText: allShown ? parts.body : content, evidence };
  }

  if ((evidence.kind === "not_applicable" || evidence.kind === "not_resolved" || evidence.kind === "unavailable") && evidence.explanation) {
    const body = withoutTrailingParagraph(content, evidence.explanation);
    return { answerText: body ?? content, evidence };
  }

  return { answerText: content, evidence };
}

/**
 * Rebuild what can honestly be rebuilt for a turn loaded from a saved
 * conversation, where the full block is no longer available.
 *
 * The backend stores three keys on the Calyx message
 * (`scientific_evidence_status`, `scientific_evidence_mission_id`,
 * `scientific_evidence_packet_id`) and the sentences inside the answer text.
 * The species, the pollination flag, the review status and the boundary flags
 * are not stored, so they stay "not reported".
 */
export function readSavedMessageEvidence(metadata: unknown): CalyxEvidenceView {
  if (!isRecord(metadata)) return emptyView("absent", "saved_message");
  const status = text(metadata.scientific_evidence_status);
  if (!status) return emptyView("absent", "saved_message");
  if (!KNOWN_STATUSES.includes(status as CalyxScientificEvidenceStatus)) return emptyView("unrecognised", "saved_message", status);
  const view = emptyView("quiet", "saved_message", status);
  view.provenance = {
    ...EMPTY_PROVENANCE,
    missionId: text(metadata.scientific_evidence_mission_id),
    evidencePacketId: text(metadata.scientific_evidence_packet_id),
  };
  if (status === "available" || status === "not_resolved" || status === "unavailable") view.kind = status;
  return view;
}

/** Whether a view puts anything on the page. */
export function evidenceIsVisible(view: CalyxEvidenceView): boolean {
  return view.kind !== "absent" && view.kind !== "quiet";
}
