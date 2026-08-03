import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { loadCalyxWorkspace, type CalyxWorkspaceSnapshot } from "@/lib/calyxWorkspace";

const emptySnapshot: CalyxWorkspaceSnapshot = {
  capabilities: null,
  homepage: null,
  orchestrator: null,
  orchestratorState: "unavailable",
  errors: [],
};

export default function CalyxWorkspace() {
  const [snapshot, setSnapshot] = useState<CalyxWorkspaceSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadCalyxWorkspace()
      .then((value) => active && setSnapshot(value))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Mission Control</p>
          <h1 className="text-4xl font-semibold">Speak with Calyx</h1>
          <p className="max-w-3xl text-muted-foreground">
            A governed workspace for evidence, relationships, identification, taxonomy, design, education, and autonomous findings. Scientific scores and publication authority remain on the backend.
          </p>
        </header>

        {loading ? <p>Loading Calyx systems…</p> : null}
        {snapshot.errors.length ? (
          <section className="rounded-xl border p-4">
            <h2 className="font-semibold">Degraded connections</h2>
            <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
              {snapshot.errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border p-5">
            <h2 className="font-semibold">Platform capabilities</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {snapshot.capabilities ? "Canonical capability contract available." : "Capability service unavailable."}
            </p>
          </article>
          <article className="rounded-xl border p-5">
            <h2 className="font-semibold">Homepage intelligence</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {snapshot.homepage ? `${snapshot.homepage.sections.length} governed sections returned.` : "Homepage document unavailable."}
            </p>
          </article>
          <article className="rounded-xl border p-5">
            <h2 className="font-semibold">Durable orchestrator</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {snapshot.orchestratorState === "available"
                ? "Authenticated orchestrator status available."
                : snapshot.orchestratorState === "authentication_required"
                  ? "Owner authentication is required to view queue and findings."
                  : "Orchestrator status unavailable."}
            </p>
          </article>
        </section>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Link className="rounded-xl border p-5 hover:bg-muted" to="/relationship-matrix">
            <h2 className="font-semibold">Relationship Matrix</h2>
            <p className="mt-2 text-sm text-muted-foreground">Compare taxa and inspect evidence coverage.</p>
          </Link>
          <Link className="rounded-xl border p-5 hover:bg-muted" to="/orchid-identification">
            <h2 className="font-semibold">Orchid Identification</h2>
            <p className="mt-2 text-sm text-muted-foreground">Record observations and review candidate suggestions.</p>
          </Link>
          <Link className="rounded-xl border p-5 hover:bg-muted" to="/continuum-next">
            <h2 className="font-semibold">Homepage Intelligence</h2>
            <p className="mt-2 text-sm text-muted-foreground">Review the next-generation evidence-driven homepage.</p>
          </Link>
          <Link className="rounded-xl border p-5 hover:bg-muted" to="/university">
            <h2 className="font-semibold">Orchid University</h2>
            <p className="mt-2 text-sm text-muted-foreground">Open learning, curriculum, and virtual-lab experiences.</p>
          </Link>
        </section>

        <section className="rounded-xl border p-5">
          <h2 className="font-semibold">Governance</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This workspace does not calculate scientific scores in the browser, verify an orchid identity, promote taxonomy, merge code, deploy production, or publish scientific knowledge automatically.
          </p>
        </section>
      </div>
    </main>
  );
}
