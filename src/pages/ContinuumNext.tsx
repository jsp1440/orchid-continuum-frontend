import { Link } from "react-router-dom";
import { homepageFixture } from "@/data/parallelPlatformFixtures";

const labels: Record<string, string> = {
  mission: "Our Mission",
  featured_genus: "Featured Genus",
  featured_species: "Featured Species",
  evolution: "Evolution",
  relationships: "Relationships",
  species: "Species",
  conservation: "Conservation",
  education: "Education",
  current_activity: "Continuum Activity",
};

export default function ContinuumNext() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b bg-gradient-to-b from-emerald-950 to-emerald-900 px-6 py-24 text-white">
        <div className="mx-auto max-w-6xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-emerald-200">Orchid biodiversity intelligence</p>
          <h1 className="max-w-4xl text-5xl font-semibold leading-tight md:text-7xl">Knowledge grows through relationships.</h1>
          <p className="mt-6 max-w-3xl text-lg text-emerald-100 md:text-xl">{homepageFixture.mission}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="rounded-full bg-white px-5 py-3 font-medium text-emerald-950" to="/relationship-matrix">Explore relationships</Link>
            <Link className="rounded-full border border-emerald-300 px-5 py-3 font-medium text-white" to="/orchid-identification">Identify an orchid</Link>
            <Link className="rounded-full border border-emerald-300 px-5 py-3 font-medium text-white" to="/university">Enter the University</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-6 py-12 md:grid-cols-2 lg:grid-cols-3">
        {homepageFixture.sections.filter((section) => section.id !== "mission").map((section) => (
          <article key={section.id} className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">{labels[section.id] ?? section.id}</h2>
              <span className="rounded-full border px-2 py-1 text-xs uppercase tracking-wide">{section.availability}</span>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{section.message ?? "Canonical evidence is available for this section."}</p>
            {section.evidence.length > 0 && <p className="mt-4 text-xs text-muted-foreground">Evidence: {section.evidence.join(", ")}</p>}
          </article>
        ))}
      </section>

      <footer className="border-t px-6 py-8 text-center text-sm text-muted-foreground">
        Scientific provenance and uncertainty remain visible. Client-side scientific scoring is disabled.
      </footer>
    </main>
  );
}
