import type { BrainMission } from "@/lib/calyxWorkspace";

function formatConfidence(confidence: number | null): string {
  if (confidence === null || !Number.isFinite(confidence)) return "Not reported";
  const normalized = confidence <= 1 ? confidence * 100 : confidence;
  return `${Math.max(0, Math.min(100, Math.round(normalized)))}%`;
}

export default function ScientificSynthesis({ mission }: { mission: BrainMission }) {
  return (
    <section aria-labelledby="scientific-synthesis-heading" className="rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold" id="scientific-synthesis-heading">Scientific synthesis</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Brain conclusions are bounded to the evidence retrieved for this mission. Evidence and provenance remain separate below.
          </p>
        </div>
        <p className="rounded-full border px-3 py-1 text-xs font-medium">Mission confidence: {formatConfidence(mission.confidence)}</p>
      </div>

      {mission.partial ? (
        <div className="mt-4 rounded-lg border px-4 py-3 text-sm" role="status">
          <p className="font-medium">Partial result</p>
          <p className="mt-1 text-muted-foreground">The Brain did not complete the full evidence path. Treat these conclusions as incomplete and review the evidence gaps before interpretation.</p>
        </div>
      ) : null}

      {mission.conclusions.length ? (
        <ol className="mt-4 space-y-3">
          {mission.conclusions.map((conclusion, index) => (
            <li className="rounded-lg bg-muted p-4 text-sm" key={`${conclusion.type ?? "conclusion"}-${index}`}>
              {conclusion.type ? <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{conclusion.type.replaceAll("_", " ")}</p> : null}
              <p className="mt-1">{conclusion.text}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Associated claim IDs: {conclusion.claim_ids?.length ? conclusion.claim_ids.map(String).join(", ") : "not supplied"}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No bounded scientific conclusion was returned for this mission.</p>
      )}
    </section>
  );
}
