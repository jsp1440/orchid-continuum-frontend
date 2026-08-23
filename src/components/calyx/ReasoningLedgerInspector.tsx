import React, { useCallback, useRef, useState } from "react";

import {
  ReasoningLedgerError,
  contradictingEntries,
  fetchLedgerRevision,
  hasRecordedReview,
  unresolvedAssumptions,
  type LedgerEntry,
  type LedgerRevisionResponse,
} from "@/lib/reasoningLedger";

/**
 * Inspect the exact reasoning-ledger revision behind a claim.
 *
 * Until now the Workbench could report that a versioned ledger was *recorded*
 * and had no way to read it, which #342 said on screen rather than implying an
 * audit had happened. The backend contract (#1135) now exists, so this closes
 * the loop — carefully, because a readable ledger is the easiest thing in this
 * surface to mistake for a verified one.
 *
 * Four states, kept apart deliberately:
 *
 *   recorded      the mission carries an id and a version
 *   inspectable   this retrieval succeeded
 *   reviewed      the returned review contract says a human reviewed it
 *   verified      not something any ledger read can establish
 *
 * Every failure is rendered as itself. Unauthorised is not an empty ledger, a
 * missing revision is not a missing ledger, and an outage is not an absence of
 * reasoning.
 */

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; response: LedgerRevisionResponse }
  | { status: "failed"; error: ReasoningLedgerError };

function EntryRow({ entry }: { entry: LedgerEntry }) {
  const provenance = entry.provenance ?? null;
  return (
    <li className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {entry.kind ?? "entry"}
        </span>
        {typeof entry.sequence === "number" ? (
          <span className="text-[10px] text-muted-foreground">#{entry.sequence}</span>
        ) : null}
      </div>
      {entry.statement ? (
        <p className="mt-1 text-xs leading-5">{entry.statement}</p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">No statement recorded on this entry.</p>
      )}

      <dl className="mt-2 grid gap-1 text-[10px] text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="inline font-medium text-foreground">Source: </dt>
          <dd className="inline">
            {provenance?.source_kind ? `${provenance.source_kind} · ${provenance.source_id ?? "no id"}` : "not supplied"}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium text-foreground">Content hash: </dt>
          <dd className="inline break-all">{provenance?.content_hash ?? "not surfaced"}</dd>
        </div>
      </dl>

      {entry.uncertainty ? (
        <p className="mt-2 text-[10px] leading-4 text-amber-700 dark:text-amber-300">
          Recorded confidence {entry.uncertainty.confidence ?? "not stated"}
          {entry.uncertainty.rationale ? ` — ${entry.uncertainty.rationale}` : ""}
        </p>
      ) : null}
    </li>
  );
}

export default function ReasoningLedgerInspector({
  ledgerId,
  version,
}: {
  ledgerId: string | null;
  version: number | null;
}) {
  const [state, setState] = useState<State>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const recorded = Boolean(ledgerId && version);

  const run = useCallback(async () => {
    if (!ledgerId || !version) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "loading" });
    try {
      const response = await fetchLedgerRevision(ledgerId, version, { signal: controller.signal });
      if (!controller.signal.aborted) setState({ status: "loaded", response });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setState({
        status: "failed",
        error:
          cause instanceof ReasoningLedgerError
            ? cause
            : new ReasoningLedgerError("network", "The reasoning ledger could not be retrieved."),
      });
    }
  }, [ledgerId, version]);

  if (!recorded) {
    return (
      <section className="mt-4 rounded-lg border border-dashed p-3" data-testid="ledger-inspector">
        <h4 className="text-xs font-semibold">Reasoning ledger</h4>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
          This mission carries no versioned reasoning ledger, so there is nothing to inspect. That is
          a gap in the record, not a finding about the claim.
        </p>
      </section>
    );
  }

  const loaded = state.status === "loaded" ? state.response : null;
  const reviewed = loaded ? hasRecordedReview(loaded.revision) : false;

  return (
    <section className="mt-4 rounded-lg border bg-background p-3" data-testid="ledger-inspector">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold">Reasoning ledger</h4>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            {ledgerId} · v{version}
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={state.status === "loading"}
          className="shrink-0 rounded-full border border-primary/30 px-3 py-1.5 text-[11px] font-medium disabled:opacity-50"
        >
          {state.status === "loading"
            ? "Retrieving…"
            : loaded
              ? "Retrieve again"
              : "Inspect reasoning ledger"}
        </button>
      </div>

      {/* The four states, always shown, so none of them can be read off another. */}
      <dl className="mt-3 grid gap-1 text-[10px] sm:grid-cols-2" data-testid="ledger-states">
        <div>
          <dt className="inline font-medium text-foreground">Recorded: </dt>
          <dd className="inline text-muted-foreground">yes — id and version are present</dd>
        </div>
        <div>
          <dt className="inline font-medium text-foreground">Inspectable: </dt>
          <dd className="inline text-muted-foreground">
            {loaded?.inspectable ? "yes — this revision was retrieved" : "not established"}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium text-foreground">Reviewed: </dt>
          <dd className="inline text-muted-foreground">
            {loaded ? (reviewed ? "a review decision is recorded" : "no review decision recorded") : "not established"}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium text-foreground">Claim verified: </dt>
          <dd className="inline text-muted-foreground">
            not established by reading a ledger
          </dd>
        </div>
      </dl>

      {state.status === "failed" ? (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
            {state.error.kind === "unauthorized"
              ? "Not authorised to read this ledger"
              : state.error.kind === "revision_not_found"
                ? "That exact revision is not in the ledger"
                : state.error.kind === "ledger_not_found"
                  ? "No ledger under that identifier"
                  : state.error.kind === "unavailable"
                    ? "Reasoning ledger unavailable"
                    : "Could not retrieve the reasoning ledger"}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{state.error.message}</p>
          {/* The line that stops a failed read reading as an absence of reasoning. */}
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            The ledger identity is still recorded on this mission. This is a statement about
            retrieval, not about whether reasoning was captured.
          </p>
          {state.error.availableVersions?.length ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Revisions that do exist: {state.error.availableVersions.join(", ")}
            </p>
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

      {loaded ? (
        <div className="mt-3 space-y-3">
          <p className="text-[10px] text-muted-foreground">
            Revision {loaded.revision.version ?? loaded.requested_version}
            {loaded.revision.status ? ` · ${loaded.revision.status}` : ""}
            {loaded.revision.ledger_fingerprint
              ? ` · fingerprint ${loaded.revision.ledger_fingerprint.slice(0, 12)}`
              : ""}
          </p>

          {!loaded.reasoning_certified ? (
            <p className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[10px] leading-4 text-amber-800 dark:text-amber-200">
              Retrieval makes the recorded reasoning readable. It does not certify that the
              reasoning is sound or that the claim follows from it.
            </p>
          ) : null}

          {unresolvedAssumptions(loaded.revision).length ? (
            <div>
              <p className="text-[11px] font-medium">Unresolved assumptions the ledger recorded</p>
              <ul className="mt-1 list-disc pl-5 text-[11px] leading-5 text-muted-foreground">
                {unresolvedAssumptions(loaded.revision).map((assumption, index) => (
                  <li key={`assumption-${index}`}>{assumption}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {contradictingEntries(loaded.revision).length ? (
            <p className="text-[11px] text-muted-foreground">
              {contradictingEntries(loaded.revision).length} entr
              {contradictingEntries(loaded.revision).length === 1 ? "y records" : "ies record"} a
              contradiction within this revision.
            </p>
          ) : null}

          {loaded.revision.entries?.length ? (
            <ul className="space-y-2">
              {loaded.revision.entries.map((entry, index) => (
                <EntryRow key={entry.entry_id ?? `entry-${index}`} entry={entry} />
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              This revision was retrieved and contains no entries. That is an empty revision, not a
              failed retrieval.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
