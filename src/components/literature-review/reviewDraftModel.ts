import type { Correction, PaperSubmissionInput, Verdict } from "@/lib/literatureReviewApi";

/** Draft shapes for the review forms (kept out of the component file for fast refresh). */
export type CardDraft = { verdict: Verdict | ""; corrections: Correction[]; explanation: string; source_citation: string };
export const EMPTY_CARD_DRAFT: CardDraft = { verdict: "", corrections: [], explanation: "", source_citation: "" };

export type PaperDraft = {
  own_key_findings: string;
  /** null until the reviewer saves their own findings or skips the step. */
  reveal: "saved" | "skipped" | null;
  missed_findings: string;
  answer_changing_omissions: string;
  source_citation: string;
  not_sure: boolean;
  not_sure_fields: Array<"own_key_findings" | "missed_findings" | "answer_changing_omissions" | "source_citation">;
};
export const EMPTY_PAPER_DRAFT: PaperDraft = {
  own_key_findings: "",
  reveal: null,
  missed_findings: "",
  answer_changing_omissions: "",
  source_citation: "",
  not_sure: false,
  not_sure_fields: [],
};

type PaperTextField = PaperDraft["not_sure_fields"][number];

export const NOT_SURE_TEXT = "Not sure";

export function paperDraftToInput(draft: PaperDraft): PaperSubmissionInput {
  const text = (field: PaperTextField) => (draft.not_sure_fields.includes(field) ? NOT_SURE_TEXT : draft[field].trim());
  return {
    own_key_findings: draft.reveal === "skipped" ? "" : text("own_key_findings"),
    own_findings_before_reveal: draft.reveal === "saved",
    missed_findings: text("missed_findings"),
    answer_changing_omissions: text("answer_changing_omissions"),
    source_citation: text("source_citation"),
    not_sure: draft.not_sure,
  };
}

