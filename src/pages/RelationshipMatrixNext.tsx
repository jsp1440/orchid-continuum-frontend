import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { featuredTaxonAtlasHref, featuredTaxonCalyxHref } from "@/lib/featuredTaxonNavigation";

const API_BASE = (import.meta.env.VITE_CALYX_API_URL || "").replace(/\/$/, "");

const GOVERNED_DIMENSIONS = [
  "pollinator",
  "mycorrhizal_partner",
  "literature",
  "trait",
  "conservation_status",
  "geography",
  "elevation",
] as const;

const SAFE_PROVENANCE_KEYS = [
  "source_domain",
  "source_query_id",
  "source_pk",
  "evidence_class",
  "evidence_citation",
  "citation",
  "doi",
  "year",
  "trait_name",
  "trait_value",
  "support_count",
  "confidence_label",
  "iucn_category",
  "cites_appendix",
  "population_trend",
  "assessment_year",
  "region",
  "source_name",
  "country",
  "event_date",
  "basis_of_record",
  "elevation",
] as const;

type GovernedDimension = (typeof GOVERNED_DIMENSIONS)[number];
type SourceMode = "canonical" | "manual";
type ProvenanceRecord = Record<string, unknown>;
type GenusContinuation = { atlasHref: string; calyxHref: string };

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
  provenance?: ProvenanceRecord[];
};

type MatrixResult = {
  dimension: string;
  subjects: Array<{ id: string; label: string }>;
  objects: Array<{ id: string; label: string }>;
  cells: MatrixCell[];
  disclaimer: string;
  source_mode?: string;
  source_domain?: string;
};

function parseSubjectIds(value: string): string[] | undefined {
  const ids = value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return ids.length ? Array.from(new Set(ids)).slice(0, 1000) : undefined;
}

function formatProvenanceValue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).slice(0, 500);
  }
  return undefined;
}

function safeProvenanceEntries(record: ProvenanceRecord): Array<[string, string]> {
  return SAFE_PROVENANCE_KEYS.flatMap((key) => {
    const value = formatProvenanceValue(record[key]);
    return value === undefined ? [] : [[key, value] as [string, string]];
  });
}

function governedGenusContinuation(label: string): GenusContinuation | null {
  try {
    return {
      atlasHref: featuredTaxonAtlasHref(label),
      calyxHref: featuredTaxonCalyxHref(label),
    };
  } catch {
    return null;
  }
}

export default function RelationshipMatrixNext() {
  const { session } = useAuth();
  const [sourceMode, setSourceMode] = useState<SourceMode>("canonical");
  const [dimension, setDimension] = useState<GovernedDimension>("pollinator");
  const [subjectIdsText, setSubjectIdsText] = useState("");
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

      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      let response: Response;
      if (sourceMode === "canonical") {
        response = await fetch(`${API_BASE}/api/matrix-relationship/build-from-canonical-source`, {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify({
            dimension,
            subject_ids: parseSubjectIds(subjectIdsText),
            limit: 5000,
          }),
        });
      } else {
        const assertions = JSON.parse(assertionsText);
        if (!Array.isArray(assertions)) throw new Error("Assertions must be a JSON array.");
        response = await fetch(`${API_BASE}/api/matrix-relationship/build`, {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify({ dimension, assertions }),
        });
      }

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
            <fieldset>
              <legend className="text-sm font-medium">Evidence source</legend>
              <div className="mt-2 grid gap-2">
                <label className="flex items-start gap-3 rounded-lg border p-3">
                  <input
                    className="mt-1"
                    type="radio"
                    name="source-mode"
                    checked={sourceMode === "canonical"}
                    onChange={() => setSourceMode("canonical")}
                  />
                  <span>
                    <strong className="block">Canonical Continuum sources</strong>
                    <span className="text-xs text-muted-foreground">
                      Read governed source-registry evidence directly. Missing rows remain not recorded.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-lg border p-3">
                  <input
                    className="mt-1"
                    type="radio"
                    name="source-mode"
                    checked={sourceMode === "manual"}
                    onChange={() => setSourceMode("manual")}
                  />
                  <span>
                    <strong className="block">Manual assertions</strong>
                    <span className="text-xs text-muted-foreground">Review/test mode for explicitly supplied evidence JSON.</span>
                  </span>
                </label>
              </div>
            </fieldset>

            <label className="mt-5 block text-sm font-medium">
              Relationship dimension
              <select
                className="mt-2 w-full rounded-lg border bg-background px-3 py-2"
                value={dimension}
                onChange={(event) => setDimension(event.target.value as GovernedDimension)}
              >
                {GOVERNED_DIMENSIONS.map((value) => (
                  <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>

            {sourceMode === "canonical" && (
              <label className="mt-5 block text-sm font-medium">
                Canonical subject IDs (optional)
                <textarea
                  className="mt-2 min-h-28 w-full rounded-lg border bg-background p-3 font-mono text-xs"
                  value={subjectIdsText}
                  onChange={(event) => setSubjectIdsText(event.target.value)}
                  placeholder="One canonical taxon ID per line or comma-separated"
                />
                <span className="mt-2 block text-xs text-muted-foreground">
                  Leave blank for the backend&apos;s bounded source read. Geography is country-level only; elevation is a recorded occurrence value, not an inferred range.
                </span>
              </label>
            )}

            <button className="mt-6 rounded-lg bg-primary px-4 py-2 text-primary-foreground" disabled={loading}>
              {loading ? "Building matrix…" : sourceMode === "canonical" ? "Build from canonical evidence" : "Build governed matrix"}
            </button>
            {error && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          </section>

          <section className="rounded-2xl border bg-card p-6">
            {sourceMode === "canonical" ? (
              <div>
                <h2 className="text-lg font-semibold">Governed source contract</h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Canonical mode reads only backend-approved source-registry paths for pollinators, mycorrhiza, literature, normalized traits, conservation, country-level occurrence geography and recorded occurrence elevation.
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Precise locality and coordinates are not requested or rendered here. A missing relationship is not evidence that the relationship is biologically absent.
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Cell provenance is rendered from a bounded allowlist of source, citation, review, country and recorded-elevation fields; arbitrary provenance keys are never displayed.
                </p>
              </div>
            ) : (
              <label className="block text-sm font-medium">
                Evidence assertions JSON
                <textarea
                  className="mt-2 min-h-[24rem] w-full rounded-lg border bg-background p-3 font-mono text-xs"
                  value={assertionsText}
                  onChange={(event) => setAssertionsText(event.target.value)}
                />
              </label>
            )}
          </section>
        </form>

        {result && (
          <section className="mt-8 overflow-x-auto rounded-2xl border bg-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold">{result.dimension.replaceAll("_", " ")}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{result.disclaimer}</p>
                {result.source_mode === "canonical_governed_source" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Genus continuation carries canonical genus context only; Matrix cells remain the evidence surface.
                  </p>
                )}
              </div>
              {result.source_mode === "canonical_governed_source" && (
                <p className="rounded-full border px-3 py-1 text-xs font-medium">
                  Canonical governed source{result.source_domain ? ` · ${result.source_domain}` : ""}
                </p>
              )}
            </div>
            <table className="mt-6 min-w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border p-3 text-left">Subject</th>
                  {result.objects.map((object) => <th key={object.id} className="border p-3 text-left">{object.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {result.subjects.map((subject) => {
                  const continuation =
                    result.source_mode === "canonical_governed_source"
                      ? governedGenusContinuation(subject.label)
                      : null;
                  return (
                    <tr key={subject.id}>
                      <th className="border p-3 text-left align-top">
                        <span className="block">{subject.label}</span>
                        {continuation && (
                          <span className="mt-2 flex flex-wrap gap-2 text-xs font-normal">
                            <Link className="underline underline-offset-2" to={continuation.atlasHref}>Atlas</Link>
                            <Link className="underline underline-offset-2" to={continuation.calyxHref}>Ask Calyx</Link>
                          </span>
                        )}
                      </th>
                      {result.objects.map((object) => {
                        const cell = cells.get(`${subject.id}:${object.id}`);
                        const provenance =
                          result.source_mode === "canonical_governed_source"
                            ? (cell?.provenance || []).map(safeProvenanceEntries).filter((entries) => entries.length)
                            : [];
                        return (
                          <td key={object.id} className="border p-3 align-top">
                            <strong className="block capitalize">{cell?.state.replaceAll("_", " ") || "not recorded"}</strong>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {cell?.assertion_count || 0} assertion{cell?.assertion_count === 1 ? "" : "s"}
                              {cell?.confidence == null ? "" : ` · confidence ${cell.confidence.toFixed(2)}`}
                            </span>
                            {provenance.length > 0 && (
                              <details className="mt-3 text-xs">
                                <summary className="cursor-pointer font-medium">Evidence provenance ({provenance.length})</summary>
                                <ol className="mt-2 space-y-2">
                                  {provenance.map((entries, index) => (
                                    <li key={`${cell?.subject_id}:${cell?.object_id}:${index}`} className="rounded border p-2">
                                      <dl className="space-y-1">
                                        {entries.map(([key, value]) => (
                                          <div key={key} className="grid grid-cols-[8rem_1fr] gap-2">
                                            <dt className="font-medium">{key.replaceAll("_", " ")}</dt>
                                            <dd className="break-words text-muted-foreground">{value}</dd>
                                          </div>
                                        ))}
                                      </dl>
                                    </li>
                                  ))}
                                </ol>
                              </details>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </main>
  );
}
