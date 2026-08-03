import { matrixFixture } from "@/data/parallelPlatformFixtures";

export default function RelationshipMatrixNext() {
  return (
    <main className="min-h-screen bg-background px-6 py-12 text-foreground">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Relationship Matrix</p>
        <h1 className="mt-2 text-4xl font-semibold">Compare orchids across evidence domains</h1>
        <p className="mt-4 max-w-3xl text-muted-foreground">Unavailable evidence is shown as unavailable, never as a zero relationship. Every score remains a candidate interpretation until governed review.</p>

        <section className="mt-8 rounded-2xl border bg-card p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div><p className="text-xs uppercase text-muted-foreground">Subject</p><p className="mt-1 font-medium">{matrixFixture.subject_taxon_id}</p></div>
            <div><p className="text-xs uppercase text-muted-foreground">Compared with</p><p className="mt-1 font-medium">{matrixFixture.object_taxon_id}</p></div>
            <div><p className="text-xs uppercase text-muted-foreground">Candidate score</p><p className="mt-1 text-3xl font-semibold">{matrixFixture.score?.toFixed(2) ?? "—"}</p></div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          {matrixFixture.dimensions.map((dimension) => (
            <article key={dimension.name} className="rounded-2xl border bg-card p-5">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-semibold capitalize">{dimension.name.replace("_", " ")}</h2>
                <span className="rounded-full border px-2 py-1 text-xs uppercase">{dimension.availability}</span>
              </div>
              <p className="mt-4 text-2xl font-semibold">{dimension.score == null ? "Not available" : dimension.score.toFixed(2)}</p>
              <p className="mt-2 text-sm text-muted-foreground">Confidence: {dimension.confidence == null ? "not assessed" : dimension.confidence.toFixed(2)}</p>
              <p className="mt-3 text-xs text-muted-foreground">Evidence: {dimension.evidence.length ? dimension.evidence.join(", ") : "No supporting evidence loaded"}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
