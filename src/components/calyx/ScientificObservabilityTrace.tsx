import React, { useCallback, useEffect, useState } from "react";

import {
  assertReviewerSafe,
  classifyEvidence,
  displayConfidence,
  fetchTrace,
  lineageIsConnected,
  reconstructTrace,
  summarizeTrace,
  type SciObsEvent,
  type SciObsTraceResponse,
  type TraceCellState,
} from "@/lib/scientificObservability";

/**
 * Reviewer-safe scientific-observability trace surface (SCI-OBS-001).
 *
 * Renders the reconstructed pipeline trace for one correlation id so an
 * authorized reviewer can follow an assertion from acquisition to the frontend
 * consumer. It is strictly advisory and read-only — it never publishes,
 * promotes, or mutates scientific state.
 *
 * The whole point of the design is honest state:
 *
 *   - the six pipeline states (present, unknown, absent, withheld,
 *     contradictory, blocked, unavailable) are rendered as themselves and never
 *     collapsed. "Withheld from you" never looks like "does not exist";
 *     "we don't know" never looks like "no evidence";
 *   - confidence with no value stays "unknown", never 0;
 *   - an event that leaks raw protected locality is refused client-side by
 *     `assertReviewerSafe`, on top of server-side redaction;
 *   - a broken/partial lineage is reported as such rather than implied complete.
 */

const STATE_LABEL: Record<TraceCellState, string> = {
  present: "Present",
  unknown: "Unknown",
  absent: "Absent",
  withheld: "Withheld",
  contradictory: "Counterevidence",
  blocked: "Blocked",
  unavailable: "Unavailable",
};

const STATE_CLASS: Record<TraceCellState, string> = {
  present: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  unknown: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  absent: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  withheld: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  contradictory: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200",
  blocked: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
  unavailable: "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200",
};

type PanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "error"; message: string }
  | { status: "loaded"; response: SciObsTraceResponse };

function StateBadge({ state }: { state: TraceCellState }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATE_CLASS[state]}`}>
      {STATE_LABEL[state]}
    </span>
  );
}

function TraceRow({ event }: { event: SciObsEvent }) {
  const safe = assertReviewerSafe(event);
  if (!safe) {
    // Fail closed: refuse to render an event that leaked protected locality.
    return (
      <li className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200">
        Event <code className="break-all">{event.event_id}</code> withheld from display: it did not
        pass the reviewer-safe locality guard.
      </li>
    );
  }
  const state = classifyEvidence(event);
  const confidence = displayConfidence(event);
  return (
    <li className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-sm font-medium text-foreground">{event.event_type}</div>
        <StateBadge state={state} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
        <div>
          <dt className="font-medium">Stage</dt>
          <dd>{event.pipeline.stage}</dd>
        </div>
        <div>
          <dt className="font-medium">Safe status</dt>
          <dd>
            {event.safe_status.status}
            {event.safe_status.reason_code ? ` · ${event.safe_status.reason_code}` : ""}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Confidence</dt>
          <dd>{confidence === "unknown" ? "unknown" : confidence.toFixed(2)}</dd>
        </div>
        {event.source?.source_anchor_id ? (
          <div>
            <dt className="font-medium">Source anchor</dt>
            <dd className="break-all">{event.source.source_anchor_id}</dd>
          </div>
        ) : null}
        {event.locality_classification?.disclosure ? (
          <div>
            <dt className="font-medium">Disclosure</dt>
            <dd>{event.locality_classification.disclosure}</dd>
          </div>
        ) : null}
        {event.safe_status.blocker ? (
          <div>
            <dt className="font-medium">Blocker</dt>
            <dd>{event.safe_status.blocker}</dd>
          </div>
        ) : null}
      </dl>
    </li>
  );
}

export interface ScientificObservabilityTraceProps {
  correlationId: string;
  /** Optional pre-fetched response, primarily for tests/storybook. */
  initialResponse?: SciObsTraceResponse;
}

export default function ScientificObservabilityTrace({
  correlationId,
  initialResponse,
}: ScientificObservabilityTraceProps) {
  const [state, setState] = useState<PanelState>(
    initialResponse ? { status: "loaded", response: initialResponse } : { status: "idle" },
  );

  const load = useCallback(async () => {
    setState({ status: "loading" });
    const result = await fetchTrace(correlationId);
    if (result.unconfigured) {
      setState({ status: "unconfigured" });
      return;
    }
    if (result.error || !result.data) {
      setState({ status: "error", message: result.error?.message ?? "Trace unavailable" });
      return;
    }
    setState({ status: "loaded", response: result.data });
  }, [correlationId]);

  useEffect(() => {
    if (!initialResponse) void load();
  }, [initialResponse, load]);

  return (
    <section className="rounded-xl border bg-background p-4" aria-label="Scientific observability trace">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Scientific observability trace</h3>
          <p className="text-xs text-muted-foreground">
            Read-only reviewer view · correlation <code className="break-all">{correlationId}</code>
          </p>
        </div>
      </header>

      {state.status === "loading" ? (
        <p className="text-sm text-muted-foreground">Reconstructing trace…</p>
      ) : null}

      {state.status === "unconfigured" ? (
        <p className="text-sm text-muted-foreground">
          Observability API is not configured for this deployment. The trace surface is present but
          has no producer to read — this is the documented next bounded lane, not an error.
        </p>
      ) : null}

      {state.status === "error" ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Trace could not be loaded: {state.message}. Downstream unavailability is shown as itself,
          not as absence of evidence.
        </p>
      ) : null}

      {state.status === "loaded"
        ? (() => {
            const summary = summarizeTrace(state.response);
            const ordered = reconstructTrace(state.response.events);
            const connected = lineageIsConnected(ordered);
            return (
              <div>
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {summary.eventCount} events
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 ${
                      connected
                        ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
                        : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
                    }`}
                  >
                    {connected ? "Lineage reconstructable" : "Partial lineage"}
                  </span>
                  {summary.hasWithheld ? <StateBadge state="withheld" /> : null}
                  {summary.hasCounterevidence ? <StateBadge state="contradictory" /> : null}
                  {summary.hasBlocked ? <StateBadge state="blocked" /> : null}
                </div>
                {ordered.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No events for this correlation id. This is honest absence — no trace was
                    recorded — not a failure.
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {ordered.map((event) => (
                      <TraceRow key={event.event_id} event={event} />
                    ))}
                  </ol>
                )}
              </div>
            );
          })()
        : null}
    </section>
  );
}
