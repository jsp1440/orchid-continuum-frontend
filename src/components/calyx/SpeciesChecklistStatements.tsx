import { useEffect, useId, useState } from "react";

import CalyxStructuredEvidence from "@/components/calyx/CalyxStructuredEvidence";
import {
  fetchSpeciesChecklistStatements,
  type SpeciesChecklistStatementsResult,
} from "@/lib/calyxSpeciesChecklistStatements";

/**
 * SpeciesChecklistStatements — what one checklist states about the taxon of a species page.
 *
 * Mount it with the dossier's canonical taxon id. It fetches the checklist-statements route once and draws the
 * returned block with the same component a Calyx turn uses. It draws nothing at all while loading and whenever
 * the route is off, the taxon has no graph node, the id is unknown or the request failed (see
 * `calyxSpeciesChecklistStatements.ts`); it draws a plain "could not be read" line for a 5xx or a stated gap.
 * It logs nothing, never shows "none" or "no statements" for a topic that holds nothing, and never builds a
 * display string from a backend sentence: the notice and the sentences are shown as returned.
 */

type Fetcher = (taxonId: string, signal?: AbortSignal) => Promise<SpeciesChecklistStatementsResult>;

export default function SpeciesChecklistStatements({ taxonId, fetcher = fetchSpeciesChecklistStatements }: { taxonId: string | null | undefined; fetcher?: Fetcher }) {
  const [result, setResult] = useState<SpeciesChecklistStatementsResult | null>(null);
  const headingId = useId();

  useEffect(() => {
    setResult(null);
    if (!taxonId) return undefined;
    const controller = new AbortController();
    fetcher(taxonId, controller.signal)
      .then((next) => { if (!controller.signal.aborted) setResult(next); })
      .catch(() => { /* an aborted or failed request leaves the page as it was */ });
    return () => controller.abort();
  }, [taxonId, fetcher]);

  if (result === null || result.kind === "inert") return null;

  if (result.kind === "could_not_be_read") {
    return (
      <section aria-labelledby={headingId} className="mt-2 rounded-xl border px-4 py-3" data-testid="species-checklist-statements" data-state="could_not_be_read">
        <h3 className="text-sm font-medium" id={headingId}>Checklist statements could not be read</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {result.explanation ?? "Nothing is concluded from a failed retrieval."}
        </p>
      </section>
    );
  }

  if (result.kind === "could_not_be_displayed") {
    return (
      <section aria-labelledby={headingId} className="mt-2 rounded-xl border px-4 py-3" data-testid="species-checklist-statements" data-state="could_not_be_displayed">
        <h3 className="text-sm font-medium" id={headingId}>Checklist statements could not be displayed</h3>
      </section>
    );
  }

  const { evidence } = result;
  return (
    <section aria-labelledby={headingId} className="mt-2 rounded-xl border-2 border-primary/30 bg-background px-4 py-3 text-foreground" data-state="available" data-testid="species-checklist-statements">
      <h3 className="text-sm font-semibold" id={headingId}>{result.acceptedName ? <>Checklist statements for <i>{result.acceptedName}</i></> : "Checklist statements"}</h3>
      {result.notice ? <p className="mt-1 text-xs leading-5 text-muted-foreground" data-testid="species-checklist-notice">{result.notice}</p> : null}
      {result.topicsNotRead.length ? (
        <p className="mt-1 text-xs leading-5" data-testid="species-checklist-not-read">Not read this time: {result.topicsNotRead.join(", ")}. Nothing is concluded about them.</p>
      ) : null}
      {result.allTopicsRead === false && !result.topicsNotRead.length ? (
        <p className="mt-1 text-xs leading-5" data-testid="species-checklist-not-to-the-end">Not every topic was read to its end; a list may be cut.</p>
      ) : null}
      {evidence.sentences.length ? (
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6" data-testid="species-checklist-sentences">
          {evidence.sentences.map((sentence, index) => <li className="break-words" key={`${index}-${sentence.slice(0, 24)}`}>{sentence}</li>)}
        </ul>
      ) : null}
      {evidence.structured ? <CalyxStructuredEvidence mainSentences={evidence.sentences} structured={evidence.structured} /> : null}
    </section>
  );
}
