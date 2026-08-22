import React, { useCallback, useRef, useState } from "react";

import {
  EvidenceRetrievalError,
  isExcerptWithheld,
  isSearchableQuery,
  isTraceable,
  retrieveEvidence,
  type EvidenceRetrievalResponse,
  type EvidenceRetrievalResult,
} from "@/lib/evidenceRetrieval";

/**
 * Searches the governed corpus for material bearing on a Calyx claim.
 *
 * The Verification Workbench above this panel audits the evidence a mission
 * already cited. It cannot answer the next question a scientist asks — what
 * else does the corpus hold, including material the mission never cited. That
 * is what this does.
 *
 * The trust boundary is the whole point of the design:
 *
 *   - the claim text is the QUERY, never a result. Searching with a claim does
 *     not make the claim true;
 *   - retrieved documents are corpus material with their own review and
 *     verification states. They are not verification of the claim, and are
 *     never labelled as supporting or contradicting it — the backend returns
 *     relevance, not entailment, and inferring the latter from the former is
 *     exactly the fabrication this surface exists to prevent;
 *   - not-authorised and index-unavailable are rendered as themselves. Neither
 *     may look like "no evidence exists".
 */

type PanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; response: EvidenceRetrievalResponse }
  | { status: "failed"; error: EvidenceRetrievalError };

function TraceRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="inline font-medium text-foreground">{label}: </dt>
      <dd className="inline break-all">{value}</dd>
    </div>
  );
}

function ResultCard({ result }: { result: EvidenceRetrievalResult }) {
  const citation = result.citation ?? {};
  const anchors = citation.source_anchor_ids ?? [];
  const traceable = isTraceable(result);

  return (
    <article className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-medium">{result.title ?? "Untitled source"}</p>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
          {result.object_type ?? "unknown type"}
        </span>
      </div>

      {isExcerptWithheld(result) ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          Excerpt withheld by display policy
          {result.display_policy ? ` (${result.display_policy})` : ""}. The source exists; its text
          is not releasable here.
        </p>
      ) : (
        <blockquote className="mt-2 border-l-2 border-primary/30 pl-3 text-xs leading-5 text-muted-foreground">
          {result.authorized_excerpt}
        </blockquote>
      )}

      <dl className="mt-3 grid gap-1 text-[10px] text-muted-foreground sm:grid-cols-2">
        <TraceRow label="Document" value={citation.document_title ?? citation.document_id ?? "not supplied"} />
        <TraceRow label="Revision" value={citation.revision_id ?? "not supplied"} />
        <TraceRow label="Anchors" value={anchors.length ? anchors.join(", ") : "not supplied"} />
        <TraceRow label="Source hash" value={result.source_content_hash ?? "not surfaced"} />
        <TraceRow label="Review state" value={result.review_state ?? "not supplied"} />
        <TraceRow label="Verification state" value={result.verification_state ?? "not supplied"} />
      </dl>

      {!traceable ? (
        <p className="mt-2 text-[10px] text-amber-700 dark:text-amber-300">
          This result cannot be traced to an exact source location. Treat it as a pointer for
          manual follow-up, not as citable evidence.
        </p>
      ) : null}

      {citation.locator != null ? (
        <details className="mt-2 text-[10px] text-muted-foreground">
          <summary className="cursor-pointer">Exact source locator</summary>
          <pre className="mt-1 overflow-auto rounded bg-muted p-2">
            {JSON.stringify(citation.locator, null, 2)}
          </pre>
        </details>
      ) : null}
    </article>
  );
}

export default function GovernedEvidenceSearch({ claimText }: { claimText: string }) {
  const [state, setState] = useState<PanelState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const searchable = isSearchableQuery(claimText);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "loading" });
    try {
      const response = await retrieveEvidence(
        "hybrid",
        { query: claimText, limit: 10 },
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) setState({ status: "loaded", response });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setState({
        status: "failed",
        error:
          cause instanceof EvidenceRetrievalError
            ? cause
            : new EvidenceRetrievalError("network", "The evidence search could not be completed."),
      });
    }
  }, [claimText]);

  return (
    <section className="mt-4 rounded-lg border bg-background p-3" data-testid="governed-evidence-search">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold">Search the governed corpus</h4>
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
            Uses this claim as a search query. Results are corpus material with their own review
            state — they are not verification of the claim.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={!searchable || state.status === "loading"}
          className="shrink-0 rounded-full border border-primary/30 px-3 py-1.5 text-[11px] font-medium disabled:opacity-50"
        >
          {state.status === "loading"
            ? "Searching…"
            : state.status === "loaded" || state.status === "failed"
              ? "Search again"
              : "Search evidence"}
        </button>
      </div>

      {!searchable ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          This claim has no searchable text.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p className="mt-3 text-[11px] text-muted-foreground">Retrieving governed evidence…</p>
      ) : null}

      {state.status === "failed" ? (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
            {state.error.kind === "unauthorized"
              ? "Not authorised to search governed evidence"
              : state.error.kind === "unavailable"
                ? "Evidence index unavailable"
                : state.error.kind === "rejected"
                  ? "Query rejected by the evidence service"
                  : "Evidence search failed"}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{state.error.message}</p>
          {/* The line that keeps a failure from reading as a scientific finding. */}
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            This is not a statement about the evidence. No conclusion about the corpus can be drawn
            from a search that did not run.
          </p>
          {state.error.code ? (
            <p className="mt-1 text-[10px] text-muted-foreground">Code: {state.error.code}</p>
          ) : null}
          {state.error.retryable ? (
            <button
              type="button"
              onClick={run}
              className="mt-2 rounded-full border px-3 py-1 text-[11px] font-medium"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {state.status === "loaded" ? (
        state.response.results.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed p-3">
            <p className="text-xs text-muted-foreground">
              The search ran and returned no eligible results.
            </p>
            {state.response.excluded_counts &&
            Object.keys(state.response.excluded_counts).length > 0 ? (
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                Records were excluded by governance filters (
                {Object.entries(state.response.excluded_counts)
                  .map(([reason, count]) => `${reason.toLowerCase().replace(/_/g, " ")}: ${count}`)
                  .join(", ")}
                ). Absence here is not evidence of absence in the corpus.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <p className="text-[10px] text-muted-foreground">
              {state.response.results.length} shown
              {typeof state.response.total_eligible_results === "number"
                ? ` of ${state.response.total_eligible_results} eligible`
                : ""}
              {state.response.retrieval_mode ? ` · ${state.response.retrieval_mode}` : ""}
              {state.response.ranking_configuration_version
                ? ` · ranking ${state.response.ranking_configuration_version}`
                : ""}
            </p>
            {state.response.results.map((result, index) => (
              <ResultCard key={`${result.citation?.revision_id ?? "r"}-${index}`} result={result} />
            ))}
          </div>
        )
      ) : null}
    </section>
  );
}
