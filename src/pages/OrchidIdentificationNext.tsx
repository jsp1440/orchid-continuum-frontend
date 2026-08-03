import { identificationFixture } from "@/data/parallelPlatformFixtures";

export default function OrchidIdentificationNext() {
  return (
    <main className="min-h-screen bg-background px-6 py-12 text-foreground">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Orchid Identification</p>
        <h1 className="mt-2 text-4xl font-semibold">Build an evidence-based identification</h1>
        <p className="mt-4 max-w-3xl text-muted-foreground">These are candidate suggestions, not verified identities. Add observations to reduce ambiguity and preserve the evidence used for every comparison.</p>

        <section className="mt-8 rounded-2xl border bg-card p-6">
          <p className="text-xs uppercase text-muted-foreground">Current state</p>
          <p className="mt-1 text-2xl font-semibold capitalize">{identificationFixture.state.replace("_", " ")}</p>
          <p className="mt-3 text-sm text-muted-foreground">Next best observation: <strong>{identificationFixture.next_best_observation?.replace("_", " ") ?? "none"}</strong></p>
        </section>

        <section className="mt-6 space-y-4">
          {identificationFixture.candidates.map((candidate, index) => (
            <article key={candidate.taxon_id} className="rounded-2xl border bg-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Candidate {index + 1}</p>
                  <h2 className="mt-1 text-2xl font-semibold italic">{candidate.scientific_name}</h2>
                </div>
                <div className="text-right"><p className="text-xs uppercase text-muted-foreground">Fit</p><p className="text-3xl font-semibold">{Math.round(candidate.score * 100)}%</p></div>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div><h3 className="text-sm font-semibold">Supports</h3><p className="mt-2 text-sm text-muted-foreground">{candidate.support.join(", ") || "None"}</p></div>
                <div><h3 className="text-sm font-semibold">Conflicts</h3><p className="mt-2 text-sm text-muted-foreground">{candidate.conflicts.join(", ") || "None observed"}</p></div>
                <div><h3 className="text-sm font-semibold">Missing</h3><p className="mt-2 text-sm text-muted-foreground">{candidate.missing.join(", ") || "None"}</p></div>
              </div>
              <p className="mt-5 text-xs text-muted-foreground">Evidence: {candidate.evidence.join(", ") || "No evidence loaded"}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
