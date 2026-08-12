import { useEffect, useState } from "react";
import { Eye, ImageIcon, ShieldCheck, XCircle } from "lucide-react";

import {
  attachVisionAnalysis,
  coerceObservationValue,
  listVisionSuggestions,
  reviewVisionSuggestion,
  type Certainty,
  type VisionSuggestion,
} from "@/lib/matrixIdentification";

type Props = {
  sessionId: string;
  disabled?: boolean;
  onObservationAccepted: () => Promise<void> | void;
};

function displayValue(value: unknown): string {
  if (value == null || value === "") return "No safe automatic mapping";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function stateLabel(state: VisionSuggestion["state"]): string {
  return state.replaceAll("_", " ");
}

export default function MatrixVisionReviewPanel({ sessionId, disabled, onObservationAccepted }: Props) {
  const [analysisId, setAnalysisId] = useState("");
  const [suggestions, setSuggestions] = useState<VisionSuggestion[]>([]);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState(
    "Attach an existing governed Calyx Vision analysis. Machine suggestions remain outside Matrix scoring until you review them.",
  );
  const [certainty, setCertainty] = useState<Record<string, Certainty>>({});
  const [revision, setRevision] = useState<Record<string, string>>({});

  async function refresh(): Promise<void> {
    const result = await listVisionSuggestions(sessionId);
    setSuggestions(result.suggestions ?? []);
  }

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [sessionId]);

  async function attach(): Promise<void> {
    if (!analysisId.trim()) return;
    setStatus("working");
    setMessage("Loading governed Vision observations for review…");
    try {
      const result = await attachVisionAnalysis(sessionId, analysisId.trim());
      setSuggestions(result.suggestions ?? []);
      setStatus("idle");
      setMessage(
        result.added
          ? `${result.added} Vision suggestion${result.added === 1 ? "" : "s"} added to the review queue. Nothing has been scored yet.`
          : "That Vision analysis is already attached to this Matrix session.",
      );
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to attach Vision analysis.");
    }
  }

  async function decide(suggestion: VisionSuggestion, decision: "accept" | "revise" | "reject"): Promise<void> {
    setStatus("working");
    setMessage("Recording the review decision…");
    try {
      const selectedCertainty = certainty[suggestion.suggestion_id] ?? "probable";
      const rawRevision = revision[suggestion.suggestion_id] ?? "";
      const revisedValue = decision === "revise"
        ? coerceObservationValue(rawRevision, suggestion.numeric_value != null ? "numeric" : undefined)
        : undefined;
      const result = await reviewVisionSuggestion(
        sessionId,
        suggestion.suggestion_id,
        decision,
        {
          certainty: decision === "reject" ? undefined : selectedCertainty,
          revisedValue,
          comments: decision === "revise" ? "Reviewed and revised in guided Matrix Vision queue." : undefined,
        },
      );
      await refresh();
      if (result.observation_added) await onObservationAccepted();
      setStatus("idle");
      setMessage(
        result.observation_added
          ? "Reviewed Vision evidence entered the Matrix observation trail and the candidates were recalculated."
          : "Suggestion rejected. The decision is preserved as provenance and is not scored.",
      );
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to review Vision suggestion.");
    }
  }

  const pending = suggestions.filter((item) => !["accepted", "revised", "rejected"].includes(item.state));
  const completed = suggestions.filter((item) => ["accepted", "revised", "rejected"].includes(item.state));

  return (
    <section className="rounded-3xl border bg-card p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Calyx Vision · Review gate</p>
          <h2 className="mt-2 text-2xl font-semibold">Turn image analysis into reviewed observations</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Vision may suggest a structure, state, or measurement. It does not become Matrix evidence until you accept or revise it. Rejected suggestions remain in the provenance trail.
          </p>
        </div>
        <ShieldCheck className="h-7 w-7 text-emerald-700" />
      </div>

      <div className="mt-5 rounded-2xl border bg-background p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={analysisId}
            onChange={(event) => setAnalysisId(event.target.value)}
            placeholder="Existing Vision analysis ID"
            className="min-w-0 flex-1 rounded-xl border bg-card px-4 py-3"
            disabled={disabled || status === "working"}
          />
          <button
            type="button"
            onClick={() => void attach()}
            disabled={disabled || status === "working" || !analysisId.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-medium disabled:opacity-50"
          >
            <ImageIcon className="h-4 w-4" /> Attach governed analysis
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground" aria-live="polite">{message}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Live image inference is not implied here. This queue consumes analyses already created by the governed Vision subsystem.
        </p>
      </div>

      {pending.length > 0 && (
        <div className="mt-6 space-y-4">
          {pending.map((suggestion) => {
            const canAccept = suggestion.state === "pending_review";
            return (
              <article key={suggestion.suggestion_id} className="rounded-2xl border p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                      <Eye className="h-4 w-4" /> Machine suggestion · not scored
                    </div>
                    <h3 className="mt-2 text-lg font-semibold">{suggestion.character.replaceAll("_", " ")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Proposed value: <strong className="text-foreground">{displayValue(suggestion.proposed_value)}</strong>
                      {suggestion.unit ? ` ${suggestion.unit}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full border px-3 py-1 text-xs uppercase">{stateLabel(suggestion.state)}</span>
                </div>

                <div className="mt-4 grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
                  <div>Confidence: {suggestion.machine_confidence == null ? "—" : `${Math.round(suggestion.machine_confidence * 100)}%`}</div>
                  <div>Basis: {suggestion.measurement_basis?.replaceAll("_", " ") ?? "—"}</div>
                  <div>Vision state: {suggestion.vision_review_state?.replaceAll("_", " ") ?? "—"}</div>
                </div>
                {suggestion.evidence_region && <p className="mt-3 text-xs text-muted-foreground">Evidence region: {suggestion.evidence_region}</p>}
                {!!suggestion.limitations?.length && <p className="mt-2 text-xs text-muted-foreground">Limitations: {suggestion.limitations.join("; ")}</p>}

                <div className="mt-5 grid gap-3 sm:grid-cols-[auto_1fr]">
                  <select
                    value={certainty[suggestion.suggestion_id] ?? "probable"}
                    onChange={(event) => setCertainty((current) => ({ ...current, [suggestion.suggestion_id]: event.target.value as Certainty }))}
                    className="rounded-xl border bg-background px-3 py-2 text-sm"
                  >
                    <option value="certain">Certain</option>
                    <option value="probable">Probable</option>
                    <option value="uncertain">Uncertain</option>
                    <option value="unknown">Unknown</option>
                  </select>
                  <input
                    value={revision[suggestion.suggestion_id] ?? ""}
                    onChange={(event) => setRevision((current) => ({ ...current, [suggestion.suggestion_id]: event.target.value }))}
                    placeholder={canAccept ? "Optional revised value" : "Revision required before this can enter Matrix evidence"}
                    className="rounded-xl border bg-background px-3 py-2 text-sm"
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!canAccept || disabled || status === "working"}
                    onClick={() => void decide(suggestion, "accept")}
                    className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >Accept suggestion</button>
                  <button
                    type="button"
                    disabled={!revision[suggestion.suggestion_id]?.trim() || disabled || status === "working"}
                    onClick={() => void decide(suggestion, "revise")}
                    className="rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-40"
                  >Use revised value</button>
                  <button
                    type="button"
                    disabled={disabled || status === "working"}
                    onClick={() => void decide(suggestion, "reject")}
                    className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium"
                  ><XCircle className="h-4 w-4" /> Reject</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {completed.length > 0 && (
        <details className="mt-6 rounded-2xl border p-4">
          <summary className="cursor-pointer text-sm font-semibold">Reviewed Vision provenance ({completed.length})</summary>
          <div className="mt-4 space-y-2 text-xs text-muted-foreground">
            {completed.map((item) => (
              <div key={item.suggestion_id} className="rounded-xl bg-background p-3">
                {item.character.replaceAll("_", " ")} · {stateLabel(item.state)} · image {item.image_id ?? "unknown"}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
