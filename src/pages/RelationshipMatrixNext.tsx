import { FormEvent, useMemo, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";

const API_BASE = (import.meta.env.VITE_CALYX_API_URL || "").replace(/\/$/, "");

const SAMPLE_ASSERTIONS = JSON.stringify(
  [
    {
      subject_id: "taxon-a",
      subject_label: "Taxon A",
      dimension: "pollinator",
      object_id: "bee",
      object_label: "Bee",
      state: "present",
      confidence: 0.9,
      provenance: { source: "reviewed literature assertion" },
    },
    {
      subject_id: "taxon-b",
      subject_label: "Taxon B",
      dimension: "pollinator",
      object_id: "bee",
      object_label: "Bee",
      state: "unknown",
      confidence: 0.4,
      provenance: { source: "incomplete observation" },
    },
  ],
  null,
  2,
);

type MatrixCell = {
  subject_id: string;
  object_id: string;
  state: string;
  assertion_count: number;
  confidence?: number | null;
};

type MatrixResult = {
  dimension: string;
  subjects: Array<{ id: string; label: string }>;
  objects: Array<{ id: string; label: string }>;
  cells: MatrixCell[];
  disclaimer: string;
};

export default function RelationshipMatrixNext() {
  const { session } = useAuth();
  const [dimension, setDimension] = useState("pollinator");
  const [assertionsText, setAssertionsText] = useState(SAMPLE_ASSERTIONS);
  const [result, setResult] = useState<MatrixResult>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const cells = useMemo(
    () => new Map(result?.cells.map((cell) => [`${cell.subject_id}:${cell.object_id}`, cell]) || []),
    [result],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    try {
      if (!API_BASE) throw new Error("VITE_CALYX_API_URL is not configured.");
      const assertions = JSON.parse(assertionsText);
      if (!Array.isArray(assertions)) throw new Error("Assertions must be a JSON array.");
      const response = await fetch(`${API_BASE}/api/matrix-relationship/build`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ dimension, assertions }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.detail || `Request failed (${response.status})`));
      setResult(body as MatrixResult);
    } catch (reason) {
      setResult(undefined);
      setError(reason instanceof Error ? reason.message : "Matrix evaluation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-12 text-foreground">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Calyx Matrix Lab</p>
        <h1 className="mt-2 text-4xl font-semibold">Governed Relationship Matrix</h1>
        <p className="mt-4 max-w-3xl text-muted-foreground">
          Build a read-only evidence matrix. Not recorded, unknown, conflicting, present and absent remain distinct.
        </p>

        <form className="mt-8 grid gap-6 lg:grid-cols-[0.7fr_1.3fr]" onSubmit={submit}>
          <section className="rounded-2xl border bg-card p-6">
            <label className="block text-sm font-medium">
              Relationship dimension
              <input
                className="mt-2 w-full rounded-lg border bg-background px-3 py-2"
                value={dimension}
                onChange={(event) => setDimension(event.target.value)}
              />
            </label>
            <p className="mt-5 text-sm text-muted-foreground">
              Examples: pollinator, mycorrhizal_partner, habitat, geography, parentage or collection_taxon.
            </p>
            <button className="mt-6 rounded-lg bg-primary px-4 py-2 text-primary-foreground" disabled={loading}>
              {loading ? "Building matrix…" : "Build governed matrix"}
            </button>
            {error && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          </section>

          <section className="rounded-2xl border bg-card p-6">
            <label className="block text-sm font-medium">
              Evidence assertions JSON
              <textarea
                className="mt-2 min-h-[24rem] w-full rounded-lg border bg-background p-3 font-mono text-xs"
                value={assertionsText}
                onChange={(event) => setAssertionsText(event.target.value)}
              />
            </label>
          </section>
        </form>

        {result && (
          <section className="mt-8 overflow-x-auto rounded-2xl border bg-card p-6">
            <h2 className="text-2xl font-semibold">{result.dimension.replaceAll("_", " ")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{result.disclaimer}</p>
            <table className="mt-6 min-w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border p-3 text-left">Subject</th>
                  {result.objects.map((object) => <th key={object.id} className="border p-3 text-left">{object.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {result.subjects.map((subject) => (
                  <tr key={subject.id}>
                    <th className="border p-3 text-left">{subject.label}</th>
                    {result.objects.map((object) => {
                      const cell = cells.get(`${subject.id}:${object.id}`);
                      return (
                        <td key={object.id} className="border p-3 align-top">
                          <strong className="block capitalize">{cell?.state.replaceAll("_", " ") || "not recorded"}</strong>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {cell?.assertion_count || 0} assertion{cell?.assertion_count === 1 ? "" : "s"}
                            {cell?.confidence == null ? "" : ` · confidence ${cell.confidence.toFixed(2)}`}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </main>
  );
}
