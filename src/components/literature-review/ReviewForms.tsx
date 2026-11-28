import { useState, type FormEvent, type ReactNode } from "react";
import {
  CORRECTIONS,
  CORRECTION_LABELS,
  TEXT_FIELD_MAX,
  VERDICTS,
  VERDICT_LABELS,
  type CardItem,
  type CardSubmissionInput,
  type Correction,
  type PaperSubmissionInput,
} from "@/lib/literatureReviewApi";
import type { SubmitState } from "./useReviewerIdentity";
import { NOT_SURE_TEXT, paperDraftToInput, type CardDraft, type PaperDraft } from "./reviewDraftModel";

const fieldClass =
  "w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-emerald-300/50 focus:outline-none";
const buttonClass =
  "rounded-full bg-emerald-300 px-5 py-2 text-sm font-semibold text-[#0d1f17] disabled:cursor-not-allowed disabled:opacity-50";

export function SubmitStatus({ state }: { state: SubmitState }) {
  if (state.status === "submitting") return <p className="text-xs text-white/60">Submitting…</p>;
  if (state.status === "failed") return <p role="alert" className="text-xs text-amber-200">{state.message}</p>;
  if (state.status === "submitted")
    return (
      <p role="status" className="text-xs text-emerald-200" data-testid="submit-receipt">
        Submitted. Thank you. Your review was recorded for version {state.receipt.item_version}. You may revise it later; earlier answers are kept.
      </p>
    );
  return null;
}

export function CardItemView({ item }: { item: CardItem }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5" data-testid="card-item">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Extracted claim · version {item.item_version}</p>
      <p className="mt-2 font-serif text-xl text-white">{item.claim}</p>
      {item.orchid_name ? <p className="mt-2 text-sm italic text-white/70">{item.orchid_name}</p> : null}
      {item.evidence_quote ? (
        <blockquote className="mt-3 border-l-2 border-emerald-300/40 pl-3 text-sm text-white/75">“{item.evidence_quote}”</blockquote>
      ) : null}
      <dl className="mt-3 grid gap-1 text-xs text-white/55">
        {item.source_locator ? <div><dt className="inline">Where in the paper: </dt><dd className="inline">{item.source_locator}</dd></div> : null}
        {item.evidence_type ? <div><dt className="inline">Evidence type: </dt><dd className="inline">{item.evidence_type}</dd></div> : null}
        {item.input_note ? <div><dt className="inline">What the extractor read: </dt><dd className="inline">{item.input_note}</dd></div> : null}
        <div><dt className="inline">Paper: </dt><dd className="inline">{item.citation || item.paper_title} · DOI {item.doi}</dd></div>
      </dl>
    </article>
  );
}

export function CardReviewForm({
  value,
  onChange,
  onSubmit,
  state,
}: {
  value: CardDraft;
  onChange: (next: CardDraft) => void;
  onSubmit: (input: CardSubmissionInput) => void;
  state: SubmitState;
}) {
  const [touched, setTouched] = useState(false);
  const verdictMissing = value.verdict === "";

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (value.verdict === "") return;
    onSubmit({
      verdict: value.verdict,
      corrections: value.corrections,
      explanation: value.explanation.trim(),
      source_citation: value.source_citation.trim(),
    });
  }

  const toggle = (c: Correction) =>
    onChange({
      ...value,
      corrections: value.corrections.includes(c) ? value.corrections.filter((x) => x !== c) : [...value.corrections, c],
    });

  return (
    <form onSubmit={submit} className="mt-6 grid gap-5" data-testid="card-review-form" noValidate>
      <fieldset>
        <legend className="text-sm font-semibold text-white">Does the paper support this claim? (required)</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {VERDICTS.map((v) => (
            <label key={v} className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-sm text-white/85">
              <input type="radio" name="verdict" value={v} checked={value.verdict === v} onChange={() => onChange({ ...value, verdict: v })} />
              {VERDICT_LABELS[v]}
            </label>
          ))}
        </div>
        {touched && verdictMissing ? (
          <p role="alert" className="mt-2 text-xs text-amber-200">Choose a verdict. “Not sure” is a valid answer.</p>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-white">What needs correcting? (optional)</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {CORRECTIONS.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm text-white/80">
              <input type="checkbox" checked={value.corrections.includes(c)} onChange={() => toggle(c)} />
              {CORRECTION_LABELS[c]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="grid gap-1 text-sm text-white">
        Explanation
        <textarea className={fieldClass} rows={4} maxLength={TEXT_FIELD_MAX} value={value.explanation} onChange={(e) => onChange({ ...value, explanation: e.target.value })} />
      </label>
      <label className="grid gap-1 text-sm text-white">
        Source citation (section, figure, table row, page)
        <input className={fieldClass} maxLength={TEXT_FIELD_MAX} value={value.source_citation} onChange={(e) => onChange({ ...value, source_citation: e.target.value })} />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={buttonClass} disabled={state.status === "submitting"}>
          Submit this review
        </button>
        <SubmitStatus state={state} />
      </div>
    </form>
  );
}

type PaperTextField = PaperDraft["not_sure_fields"][number];

function NotSureText({
  label,
  field,
  value,
  onChange,
  rows = 4,
}: {
  label: ReactNode;
  field: PaperTextField;
  value: PaperDraft;
  onChange: (next: PaperDraft) => void;
  rows?: number;
}) {
  const unsure = value.not_sure_fields.includes(field);
  return (
    <div className="grid gap-1">
      <label className="grid gap-1 text-sm text-white">
        {label}
        <textarea
          className={fieldClass}
          rows={rows}
          maxLength={TEXT_FIELD_MAX}
          disabled={unsure}
          value={unsure ? "" : value[field]}
          onChange={(e) => onChange({ ...value, [field]: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-white/60">
        <input
          type="checkbox"
          checked={unsure}
          onChange={() =>
            onChange({
              ...value,
              not_sure_fields: unsure ? value.not_sure_fields.filter((f) => f !== field) : [...value.not_sure_fields, field],
            })
          }
        />
        Not sure
      </label>
    </div>
  );
}

/**
 * Close-read step: the reviewer writes their own key findings BEFORE any
 * extracted card for the paper is fetched or shown, or explicitly skips.
 * `children` (the extracted cards) render only after that choice.
 */
export function CloseReadGate({
  value,
  onChange,
  children,
}: {
  value: PaperDraft;
  onChange: (next: PaperDraft) => void;
  children: ReactNode;
}) {
  if (value.reveal !== null) {
    return (
      <div>
        <p className="mb-3 text-xs text-white/55" data-testid="close-read-state">
          {value.reveal === "saved"
            ? "Your own key findings were saved before the extraction was shown."
            : "You skipped writing your own findings first."}
        </p>
        {children}
      </div>
    );
  }
  const unsure = value.not_sure_fields.includes("own_key_findings");
  const canSave = unsure || value.own_key_findings.trim().length > 0;
  return (
    <section className="rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.04] p-5" data-testid="close-read-gate">
      <h2 className="font-serif text-xl text-white">Step 1 · Your own key findings</h2>
      <p className="mt-1 text-sm text-white/65">
        Read the paper and note its key findings in your own words before you see what was extracted. The extracted claims stay hidden until you save this step or skip it.
      </p>
      <div className="mt-4">
        <NotSureText label="Key findings, in your words" field="own_key_findings" value={value} onChange={onChange} rows={6} />
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className={buttonClass} disabled={!canSave} onClick={() => onChange({ ...value, reveal: "saved" })}>
          Save my findings and show the extraction
        </button>
        <button
          type="button"
          className="rounded-full border border-white/20 px-5 py-2 text-sm text-white/75"
          onClick={() => onChange({ ...value, reveal: "skipped" })}
        >
          Skip this step
        </button>
      </div>
    </section>
  );
}

export function PaperReviewForm({
  value,
  onChange,
  onSubmit,
  state,
}: {
  value: PaperDraft;
  onChange: (next: PaperDraft) => void;
  onSubmit: (input: PaperSubmissionInput) => void;
  state: SubmitState;
}) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(paperDraftToInput(value));
  }
  return (
    <form onSubmit={submit} className="grid gap-5" data-testid="paper-review-form">
      <h2 className="font-serif text-xl text-white">Step 2 · The paper as a whole</h2>
      {value.reveal === "saved" ? (
        // Read-only after the reveal, so "written before the extraction was
        // shown" stays true of what is submitted.
        <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white/75" data-testid="own-findings-locked">
          <p className="text-xs uppercase tracking-[0.14em] text-white/45">Your key findings, written before the reveal</p>
          <p className="mt-1 whitespace-pre-wrap">
            {value.not_sure_fields.includes("own_key_findings") ? NOT_SURE_TEXT : value.own_key_findings}
          </p>
        </div>
      ) : null}
      <NotSureText label="Findings the extraction missed" field="missed_findings" value={value} onChange={onChange} />
      <NotSureText
        label="Omissions or errors that would change an answer from Calyx"
        field="answer_changing_omissions"
        value={value}
        onChange={onChange}
      />
      <NotSureText label="Source citation (section, figure, table row, page)" field="source_citation" value={value} onChange={onChange} rows={2} />
      <label className="flex items-center gap-2 text-sm text-white/80">
        <input type="checkbox" checked={value.not_sure} onChange={(e) => onChange({ ...value, not_sure: e.target.checked })} />
        I am not sure about this paper overall
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={buttonClass} disabled={state.status === "submitting"}>
          Submit paper review
        </button>
        <SubmitStatus state={state} />
      </div>
    </form>
  );
}
