import React, { useEffect, useState } from "react";

import { apiRequest } from "@/lib/api";
import {
  parseCalyxAnomalyReviews,
  type CalyxAnomalyReview,
} from "@/lib/calyxVerification";

type QueueResponse = { tasks?: unknown[] };
type QueueState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "loaded"; items: CalyxAnomalyReview[] };

export default function ScientificObservabilityAnomalyQueue({
  correlationId,
}: {
  correlationId: string;
}) {
  const [state, setState] = useState<QueueState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    void apiRequest<QueueResponse>("/api/mission-control/review/queue?limit=200").then(
      (result) => {
        if (!active) return;
        if (result.error || result.unconfigured || !result.data) {
          setState({ status: "unavailable" });
          return;
        }
        setState({
          status: "loaded",
          items: parseCalyxAnomalyReviews(result.data, correlationId),
        });
      },
    );
    return () => {
      active = false;
    };
  }, [correlationId]);

  return (
    <section
      className="mt-4 rounded-lg border bg-background p-3"
      aria-label="Scientific observability anomaly review"
    >
      <h4 className="text-xs font-semibold">Scientific observability anomalies</h4>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
        Read-only review tasks for this exact correlation. They do not grant scientific,
        publication, or mutation authority.
      </p>

      {state.status === "loading" ? (
        <p className="mt-2 text-xs text-muted-foreground">Loading review queue…</p>
      ) : null}
      {state.status === "unavailable" ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          Review queue unavailable. This is not evidence that no anomalies exist.
        </p>
      ) : null}
      {state.status === "loaded" && state.items.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          No validated anomaly review task was returned for this correlation.
        </p>
      ) : null}
      {state.status === "loaded" && state.items.length ? (
        <ul className="mt-2 space-y-2">
          {state.items.map((item) => (
            <li className="rounded-md border px-3 py-2" key={item.taskId}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-medium">
                  {item.anomalyType.replace(/_/g, " ")}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {item.riskClass} risk · {item.state.replace(/_/g, " ")}
                </span>
              </div>
              <p className="mt-1 break-all text-[10px] text-muted-foreground">
                Correlation: {item.correlationId}
              </p>
              {item.sealed ? (
                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                  Protected-locality details are sealed for the authorized partner. No locality
                  value is available in this view.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
