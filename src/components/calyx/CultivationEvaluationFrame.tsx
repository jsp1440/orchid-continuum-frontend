import type { CultivationHandoff } from "@/lib/conservatoryCultivationCalyx";

function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

/**
 * A visible interpretation contract for Conservatory → Calyx cultivation turns.
 *
 * This component intentionally does not invent species requirements or parse
 * model prose into claims. It renders only the grower's governed observations
 * as facts, then tells the reader exactly how requirements, recommendations,
 * and missing information must be treated in the answer below.
 */
export default function CultivationEvaluationFrame({ context }: { context: CultivationHandoff }) {
  return (
    <section
      aria-label="Cultivation evaluation evidence classes"
      className="border-b bg-background px-5 py-4 text-foreground"
      data-testid="cultivation-evaluation-frame"
    >
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          How to read this cultivation evaluation
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <section className="rounded-xl border p-4" data-testid="cultivation-observed-conditions">
            <h2 className="text-sm font-semibold">Observed conditions</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Your private cultivation observations. These describe the growing place, not the species.
            </p>
            <ul className="mt-3 space-y-2 text-xs">
              {context.observations.map((row) => (
                <li key={row.variable}>
                  <span className="font-medium">{humanize(row.variable)}</span>{" "}
                  {row.value}{row.unit}
                  <span className="text-muted-foreground"> · {row.origin} · {row.observed_on}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border p-4" data-testid="cultivation-evidence-requirements">
            <h2 className="text-sm font-semibold">Evidence-backed requirements</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Temperature, humidity, light, or other species requirements count here only when Calyx can
              support them with Continuum evidence or a surfaced source. An unsupported range stays unknown.
            </p>
          </section>

          <section className="rounded-xl border p-4" data-testid="cultivation-recommendation-inference">
            <h2 className="text-sm font-semibold">Recommendation / inference</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Any suggestion to move the plant or change heat, light, humidity, water, or culture is Calyx&apos;s
              interpretation of observations against evidence. It is not itself scientific evidence.
            </p>
          </section>

          <section className="rounded-xl border p-4" data-testid="cultivation-unknown-missing">
            <h2 className="text-sm font-semibold">Unknown / missing data</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Unrecorded growing conditions and requirements without adequate evidence remain explicitly unknown.
              Missing information must never be treated as proof that the placement is suitable or unsuitable.
            </p>
          </section>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Subject: <i>{context.taxon}</i> · location type: {humanize(context.location.kind)} · cultivation observations are not scientific evidence or occurrence data.
        </p>
      </div>
    </section>
  );
}
