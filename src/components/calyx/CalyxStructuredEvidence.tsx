import { useId, useState } from "react";

import {
  doiHref,
  type EvidenceItem,
  type EvidenceSubject,
  type RecordsSection,
  type RecordsSectionKind,
  type StructuredEvidence,
} from "@/lib/calyxStructuredEvidence";

/**
 * CalyxStructuredEvidence — the records behind each taxon of one Calyx turn.
 *
 * Draws only what `readStructuredEvidence` returned. It never rewords a
 * sentence or a source's text, never gives a marker, a conservation note or the
 * text after a synonym name a meaning (no legend, colour or badge), never turns
 * an empty or unretrieved list into "none", and never draws a link from the
 * data except a DOI that has the DOI shape.
 */

const HEADINGS: Record<RecordsSectionKind, string> = {
  relationships: "Cited interaction records",
  held_back: "Records held back",
  not_retrieved: "Not retrieved",
  distribution: "Checklist areas",
  conservation: "Checklist conservation note",
  synonymy: "Checklist synonym entries",
  synonym_resolution: "Name lookup in the checklist",
  mycorrhiza: "Mycorrhizal records",
  host_pathogen: "Host and pathogen records",
};

const ALWAYS_OPEN: RecordsSectionKind[] = ["held_back", "not_retrieved"];

function Doi({ doi }: { doi: string }) {
  const href = doiHref(doi);
  return href ? (
    <a className="underline" href={href} rel="noreferrer noopener" target="_blank">DOI {doi}</a>
  ) : (
    <span>DOI {doi}</span>
  );
}

function ItemLine({ kind, item }: { kind: RecordsSectionKind; item: EvidenceItem }) {
  let main = item.text;
  if (kind === "synonymy" && item.detail) main = `${item.text} ${item.detail}`;
  if (kind === "held_back" && item.detail) main = `${item.detail}: ${item.text}`;
  if (kind === "synonym_resolution" && item.detail) main = `${item.text} \u2014 listed under ${item.detail}`;
  const meta = [item.state, item.review].filter((part): part is string => part !== null).join(" \u00b7 ");
  return (
    <li className="break-words">
      <span data-testid="calyx-record-text">{main}</span>
      {meta ? <span className="block text-xs text-muted-foreground">{meta}</span> : null}
      {item.citation ? <span className="block text-xs text-muted-foreground">Cited: {item.citation}</span> : null}
      {item.doi ? <span className="block text-xs text-muted-foreground"><Doi doi={item.doi} /></span> : null}
    </li>
  );
}

function SectionBody({ section }: { section: Extract<RecordsSection, { unreadable: false }> }) {
  return (
    <div className="mt-1 text-sm leading-6">
      <p className="text-xs text-muted-foreground" data-testid="calyx-record-state">
        {section.state ?? "evidence state not reported"} {"\u00b7"} {section.review ?? "review state not reported"}
      </p>
      {section.citation ? <p className="break-words text-xs text-muted-foreground">Source: {section.citation}</p> : null}
      {section.items.length ? (
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {section.items.map((item, index) => <ItemLine item={item} key={`${index}-${item.text.slice(0, 24)}`} kind={section.kind} />)}
        </ul>
      ) : null}
      {section.statements.length ? (
        <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {section.statements.map((statement, index) => (
            <li className="break-words" key={`${index}-${statement.text.slice(0, 24)}`}>
              {statement.cls ? `${statement.cls}: ` : ""}{statement.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Section({ section }: { section: RecordsSection }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const heading = HEADINGS[section.kind];
  if (section.unreadable) {
    return <p className="mt-2 text-xs text-muted-foreground" data-testid="calyx-record-unreadable">{heading}: could not be displayed.</p>;
  }
  const summary = section.counts ?? `${section.items.length} listed`;
  if (ALWAYS_OPEN.includes(section.kind)) {
    return (
      <div className="mt-2" data-kind={section.kind} data-testid="calyx-record-section">
        <h5 className="text-xs font-medium">{heading} {"\u00b7"} {summary}</h5>
        <SectionBody section={section} />
      </div>
    );
  }
  return (
    <div className="mt-2" data-kind={section.kind} data-testid="calyx-record-section">
      <button
        aria-controls={bodyId}
        aria-expanded={open}
        className="text-xs font-medium underline"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {open ? "Hide" : "Show"} {heading} {"\u00b7"} {summary}
      </button>
      <div hidden={!open} id={bodyId}>{open ? <SectionBody section={section} /> : null}</div>
    </div>
  );
}

function Subject({ subject, mainSentences }: { subject: EvidenceSubject; mainSentences: string[] }) {
  if (subject.unreadable) {
    return <div className="mt-3 rounded-lg border px-3 py-2 text-xs" data-testid="calyx-subject-unreadable">The records of this taxon could not be displayed.</div>;
  }
  const label = subject.label ?? "Taxon not reported";
  const repeatsMain = subject.sentences.length === mainSentences.length && subject.sentences.every((sentence, index) => sentence === mainSentences[index]);
  const contextual = subject.scope === "contextual_parent_species";
  return (
    <div className="mt-3 rounded-lg border px-3 py-2" data-scope={subject.scope} data-testid="calyx-subject">
      <h4 className="text-sm font-medium">
        {contextual ? "Context only, records of the species: " : subject.scope === "direct_subtaxon" ? "Records of this taxon itself: " : ""}
        <i>{label}</i>
        {subject.kgNodeId !== null ? <span className="font-mono text-[11px] text-muted-foreground"> {"\u00b7"} graph node {subject.kgNodeId}</span> : null}
      </h4>
      {contextual && subject.contextNote ? <p className="mt-1 text-xs leading-5" data-testid="calyx-subject-context-note">{subject.contextNote}</p> : null}
      {subject.askedAs ? <p className="mt-1 text-xs leading-5" data-testid="calyx-subject-asked-as">Asked as {subject.askedAs}; the records are those of {label}.</p> : null}
      {subject.alsoAskedAs.map((name) => <p className="mt-1 text-xs leading-5" data-testid="calyx-subject-also-asked-as" key={name}>Also asked as {name}; the records are those of {label}.</p>)}
      {subject.status !== null && subject.status !== "available" ? <p className="mt-1 text-xs text-muted-foreground">Status: {subject.status}</p> : null}
      {subject.explanation ? <p className="mt-1 break-words text-xs leading-5" data-testid="calyx-subject-explanation">{subject.explanation}</p> : null}
      {subject.sentences.length && !repeatsMain ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6" data-testid="calyx-subject-sentences">
          {subject.sentences.map((sentence, index) => <li className="break-words" key={`${index}-${sentence.slice(0, 24)}`}>{sentence}</li>)}
        </ul>
      ) : null}
      {subject.sections.map((section, index) => <Section key={`${section.kind}-${index}`} section={section} />)}
    </div>
  );
}

export default function CalyxStructuredEvidence({ structured, mainSentences }: { structured: StructuredEvidence; mainSentences: string[] }) {
  return (
    <div data-testid="calyx-structured-evidence">
      {structured.topicsUnreadable ? <p className="mt-3 text-xs text-muted-foreground">The topics could not be displayed.</p> : null}
      {structured.topics.length ? <p className="mt-3 text-xs text-muted-foreground" data-testid="calyx-topics">Topics read: {structured.topics.join(", ")}</p> : null}
      {structured.noticesUnreadable ? <p className="mt-2 text-xs text-muted-foreground">The notices could not be displayed.</p> : null}
      {structured.notices.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5" data-testid="calyx-notices">
          {structured.notices.map((line, index) => <li className="break-words" key={`${index}-${line.slice(0, 24)}`}>{line}</li>)}
        </ul>
      ) : null}
      {structured.subjects.map((subject, index) => <Subject key={index} mainSentences={mainSentences} subject={subject} />)}
      {structured.comparisonUnreadable ? <p className="mt-2 text-xs text-muted-foreground">The comparison could not be displayed.</p> : null}
      {structured.comparison.length ? (
        <div className="mt-3" data-testid="calyx-comparison">
          <h4 className="text-xs font-medium">Comparison</h4>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6">
            {structured.comparison.map((line, index) => <li className="break-words" key={`${index}-${line.slice(0, 24)}`}>{line}</li>)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
