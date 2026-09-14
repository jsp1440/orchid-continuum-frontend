import React, { useEffect, useRef, useState } from "react";
import { CalyxApiError } from "@/lib/calyxWorkspace";
import {
  listResearchActivity,
  nextResearchActivityOffset,
  previousResearchActivityOffset,
  reconcileResearchActivityOffset,
  researchActivityRange,
  researchActivityRequestKey,
  type ResearchActivityPage,
} from "@/lib/researchStationActivity";

const PAGE_SIZE = 25;

type ActivityState =
  | { status: "loading" }
  | { status: "ready"; page: ResearchActivityPage }
  | { status: "error"; message: string };

export const ResearchActivityPanel: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<ActivityState>({ status: "loading" });
  const latestRequest = useRef("");

  useEffect(() => {
    setOffset(0);
  }, [projectId]);

  useEffect(() => {
    const controller = new AbortController();
    const requestKey = researchActivityRequestKey(projectId, PAGE_SIZE, offset);
    latestRequest.current = requestKey;
    setState({ status: "loading" });

    void listResearchActivity(projectId, {
      limit: PAGE_SIZE,
      offset,
      signal: controller.signal,
    })
      .then((page) => {
        if (latestRequest.current !== requestKey) return;
        const reconciled = reconcileResearchActivityOffset(offset, page.total, page.limit);
        if (reconciled !== offset) {
          setOffset(reconciled);
          return;
        }
        setState({ status: "ready", page });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || latestRequest.current !== requestKey) return;
        setState({
          status: "error",
          message:
            error instanceof CalyxApiError || error instanceof Error
              ? error.message
              : "Project activity could not be loaded.",
        });
      });

    return () => controller.abort();
  }, [projectId, offset]);

  if (state.status === "loading") {
    return <p className="text-xs text-white/55">Loading project activity…</p>;
  }

  if (state.status === "error") {
    return (
      <div className="rounded-xl border border-amber-300/25 bg-amber-300/5 px-4 py-3" role="status">
        <p className="text-xs leading-5 text-amber-100">{state.message}</p>
        <p className="mt-1 text-[11px] leading-5 text-white/45">
          Activity is unavailable; no missing history is represented as an empty audit trail.
        </p>
      </div>
    );
  }

  const { page } = state;
  const range = researchActivityRange(page);
  const nextOffset = nextResearchActivityOffset(page);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
          {range.total === 0 ? "No recorded activity" : `Showing ${range.start}–${range.end} of ${range.total}`}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page.offset === 0}
            onClick={() => setOffset(previousResearchActivityOffset(page.offset, page.limit))}
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70 disabled:opacity-35"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={nextOffset === null}
            onClick={() => nextOffset !== null && setOffset(nextOffset)}
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70 disabled:opacity-35"
          >
            Next
          </button>
        </div>
      </div>

      {page.items.length === 0 ? (
        <p className="text-xs leading-5 text-white/50">This project has no recorded audit events.</p>
      ) : (
        <ol className="grid gap-2">
          {page.items.map((event) => (
            <li key={event.event_id} className="rounded-xl border border-white/10 bg-black/15 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm text-white/80">{event.action}</span>
                <time className="font-mono text-[10px] text-white/40" dateTime={event.occurred_at}>
                  {event.occurred_at}
                </time>
              </div>
              <p className="mt-1 text-xs text-white/50">
                {event.entity_type} · {event.entity_id}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default ResearchActivityPanel;
