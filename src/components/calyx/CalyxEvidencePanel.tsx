import { useId } from "react";

import {
  CALYX_EVIDENCE_ANSWER_HEADING,
  CALYX_EVIDENCE_SENTENCE_LIMIT,
  evidenceIsVisible,
  type CalyxEvidenceBoundary,
  type CalyxEvidenceProvenance,
  type CalyxEvidenceView,
} from "@/lib/calyxScientificEvidence";

/**
 * CalyxEvidencePanel — the graph and source records behind one Calyx turn.
 *
 * Shows only what the backend's `research.scientific_evidence` block reported.
 * It never:
 *   - rewords, ranks or summarises an evidence sentence;
 *   - states that pollination is verified unless the block says so, or that it
 *     is not verified when the block did not report it;
 *   - presents a boundary (read-only, unreviewed, ...) the block did not report;
 *   - shows sentences from a block it could not read;
 *   - shows as an evidence sentence anything that did not arrive in the block's
 *     own `reading` (text in the reply is the reply provider's, not the records').
 *
 * A turn with no block, or a block that says the path was off or did not apply,
 * renders nothing, the same way the citation list does when it is empty.
 */

const NOTE = "mt-2 rounded-xl border bg-background px-4 py-3";
const CODE = "break-all font-mono text-[11px]";

function words(value: string): string {
  return value.replace(/_/g, " ").toLowerCase();
}

// The single column is explicit: an implicit grid track takes the width of its
// widest content, which let a 64-character identifier widen the page on a phone.
function Row({ label, value, code = false }: { label: string; value: string | null; code?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-[11rem_minmax(0,1fr)]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 ${value === null ? "text-muted-foreground" : code ? CODE : "break-words"}`}>
        {value ?? "Not reported"}
      </dd>
    </div>
  );
}

function Provenance({ provenance, complete }: { provenance: CalyxEvidenceProvenance; complete: boolean }) {
  const eligibility =
    provenance.publicationEligible === null
      ? null
      : provenance.publicationEligible
        ? "Eligible"
        : `Not eligible${provenance.publicationBlockers.length ? ` (${provenance.publicationBlockers.map(words).join("; ")})` : ""}`;
  return (
    <details className="mt-3 rounded-lg border px-3 py-2" data-testid="calyx-evidence-provenance">
      <summary className="cursor-pointer text-xs font-medium">Provenance</summary>
      <dl className="mt-2 space-y-1.5 text-xs leading-5">
        <Row label="Mission state" value={provenance.missionState ? words(provenance.missionState) : null} />
        <Row label="Review status" value={provenance.reviewStatus ? words(provenance.reviewStatus) : null} />
        <Row label="Publication" value={eligibility} />
        <Row label="Graph read" value={provenance.graphState ? words(provenance.graphState) : null} />
        <Row label="Graph completeness" value={provenance.graphCompleteness ? words(provenance.graphCompleteness) : null} />
        <Row label="Name resolution" value={provenance.resolution ? words(provenance.resolution) : null} />
        <Row code label="Mission ID" value={provenance.missionId} />
        <Row code label="Evidence packet ID" value={provenance.evidencePacketId} />
      </dl>
      {complete ? null : (
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
          This turn was loaded from a saved conversation, which keeps only the status and the two identifiers.
        </p>
      )}
    </details>
  );
}

/**
 * The review line is always printed and never implies review: only an explicit
 * `false` is stated as the backend's report, and every other value (missing,
 * not a boolean, or `true`, which this contract never sends) reads as
 * "treat as unreviewed". The other lines are printed only for a value the
 * backend actually reported.
 */
function boundaryLines(boundary: CalyxEvidenceBoundary): string[] {
  const lines: string[] = [];
  if (boundary.isReviewedConclusion === false) lines.push("Unreviewed. These are records, not a reviewed conclusion.");
  else if (boundary.isReviewedConclusion === null) lines.push("Review state not reported; treat these records as unreviewed.");
  else lines.push("Review state could not be confirmed by this page; treat these records as unreviewed.");
  if (boundary.readOnly === true) lines.push("Read-only. Retrieving these records changed nothing.");
  if (boundary.knowledgeGraphMutation === false) lines.push("Nothing was written to the Knowledge Graph.");
  if (boundary.knowledgeGraphMutation === true) lines.push("The backend reports a Knowledge Graph write for this turn.");
  if (boundary.automaticPublication === false) lines.push("Nothing was published.");
  if (boundary.automaticPublication === true) lines.push("The backend reports automatic publication for this turn.");
  if (boundary.durableMissionRecord === false) lines.push("The evidence mission was held for this turn only and is not stored.");
  return lines;
}

function Boundary({ boundary }: { boundary: CalyxEvidenceBoundary }) {
  return (
    <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs leading-5 text-muted-foreground" data-testid="calyx-evidence-boundary">
      {boundaryLines(boundary).map((line) => <li key={line}>{line}</li>)}
    </ul>
  );
}

function PollinationStatus({ verified }: { verified: boolean | null }) {
  if (verified === true) {
    return (
      <p className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-3 py-2 text-sm leading-6" data-pollination="verified" data-testid="calyx-evidence-pollination">
        <strong>Verified pollination: established</strong> in the returned records, as reported by the backend.
      </p>
    );
  }
  if (verified === false) {
    return (
      <p className="rounded-lg border border-amber-600/50 bg-amber-500/10 px-3 py-2 text-sm leading-6" data-pollination="not-established" data-testid="calyx-evidence-pollination">
        <strong>Verified pollination: not established.</strong> The records below do not show it. A recorded flower visit is not pollination.
      </p>
    );
  }
  return (
    <p className="rounded-lg border px-3 py-2 text-sm leading-6 text-muted-foreground" data-pollination="not-reported" data-testid="calyx-evidence-pollination">
      Verified pollination: not reported for this turn. Nothing is implied either way.
    </p>
  );
}

export default function CalyxEvidencePanel({ evidence }: { evidence: CalyxEvidenceView }) {
  const headingId = useId();
  if (!evidenceIsVisible(evidence)) return null;
  const saved = evidence.origin === "saved_message";

  if (evidence.kind === "malformed" || evidence.kind === "unrecognised") {
    return (
      <section aria-labelledby={headingId} className={NOTE} data-evidence-kind={evidence.kind} data-testid="calyx-evidence-panel">
        <h3 className="text-sm font-medium" id={headingId}>Evidence records not shown</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {evidence.kind === "unrecognised"
            ? <>The backend reported an evidence status this page does not recognise (<span className={CODE}>{evidence.status}</span>). Nothing from it is shown as evidence.</>
            : "The backend sent an evidence block this page could not read. Nothing from it is shown as evidence."}
        </p>
      </section>
    );
  }

  if (evidence.kind === "not_applicable") {
    return (
      <section aria-labelledby={headingId} className={NOTE} data-evidence-kind="not_applicable" data-testid="calyx-evidence-panel">
        <h3 className="text-sm font-medium" id={headingId}>No graph evidence was looked up for this question</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{evidence.explanation}</p>
      </section>
    );
  }

  if (evidence.kind === "not_resolved" || evidence.kind === "unavailable") {
    const notResolved = evidence.kind === "not_resolved";
    return (
      <section
        aria-labelledby={headingId}
        className={`${NOTE} ${notResolved ? "border-amber-600/50" : "border-destructive/40"}`}
        data-evidence-kind={evidence.kind}
        data-testid="calyx-evidence-panel"
      >
        <h3 className="text-sm font-medium" id={headingId}>
          {notResolved ? "The name is not a single species in the Continuum graph" : "Graph evidence could not be retrieved this turn"}
        </h3>
        {evidence.species ? (
          <p className="mt-1 text-sm leading-6">
            Species named in the question: <i>{evidence.species}</i>
            {notResolved && evidence.provenance.resolution ? ` · graph resolution: ${words(evidence.provenance.resolution)}` : ""}
          </p>
        ) : null}
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {evidence.explanation
            ?? (saved
              ? "The reply above states why. This turn was loaded from a saved conversation, which does not keep the detail."
              : notResolved
                ? "No evidence was attached to a guessed identity."
                : "Nothing is concluded from a failed retrieval.")}
        </p>
        {!notResolved && evidence.code ? (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Reported cause: <span className={CODE}>{evidence.code}</span></p>
        ) : null}
        {evidence.provenance.missionId ? <Provenance provenance={evidence.provenance} complete={!saved} /> : null}
      </section>
    );
  }

  const shownSentences = evidence.sentences.slice(0, CALYX_EVIDENCE_SENTENCE_LIMIT);
  const hiddenCount = evidence.sentences.length - shownSentences.length;

  return (
    <section
      aria-labelledby={headingId}
      className="mt-2 rounded-xl border-2 border-primary/30 bg-background px-4 py-3"
      data-evidence-kind="available"
      data-testid="calyx-evidence-panel"
    >
      <h3 className="text-sm font-semibold" id={headingId}>{CALYX_EVIDENCE_ANSWER_HEADING}</h3>
      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
        {saved
          ? "Evidence records were retrieved when this turn was asked."
          : "Evidence records were retrieved for this turn. The sentences are the records\u2019 own wording, not Calyx\u2019s interpretation."}
      </p>

      <dl className="mt-3 text-sm leading-6">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Species</dt>
          <dd data-testid="calyx-evidence-species">
            {evidence.species ? <i>{evidence.species}</i> : <span className="text-muted-foreground">Not reported{saved ? " in the saved conversation" : ""}</span>}
          </dd>
        </div>
      </dl>

      <div className="mt-2"><PollinationStatus verified={evidence.pollinationVerified} /></div>

      {/* The transcript is a polite live region. The heading, species and
          pollination line above are announced with the turn; the detail below
          is switched off for announcement so a screen reader is not read every
          sentence after each turn. It stays fully readable by navigation. */}
      <div aria-live="off" data-testid="calyx-evidence-detail">
        {saved ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground" data-testid="calyx-evidence-saved-note">
            The evidence sentences are in the reply above. A saved conversation keeps only the status and the two identifiers below, so the sentences were not re-verified against the records on reload and are not repeated here.
          </p>
        ) : shownSentences.length ? (
          <>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6" data-testid="calyx-evidence-sentences">
              {shownSentences.map((sentence, index) => <li className="break-words" key={`${index}-${sentence.slice(0, 24)}`}>{sentence}</li>)}
            </ul>
            {hiddenCount > 0 ? (
              <p className="mt-2 text-xs leading-5 text-muted-foreground" data-testid="calyx-evidence-more">
                {hiddenCount.toLocaleString("en-US")} more sentence{hiddenCount === 1 ? "" : "s"} not shown.
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-3 text-sm leading-6 text-muted-foreground" data-testid="calyx-evidence-empty">
            The backend returned no evidence sentences for this turn. That is missing evidence, not evidence of absence.
          </p>
        )}

        <Boundary boundary={evidence.boundary} />
        <Provenance complete={!saved} provenance={evidence.provenance} />
      </div>
    </section>
  );
}
