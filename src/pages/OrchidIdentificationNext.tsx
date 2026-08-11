import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import {
  lexiconHrefForMatrixCharacter,
  readIdentificationSourceContext,
} from "@/features/calyx-workspace/identificationContext";
import { MatrixCalyxChat } from "@/features/calyx-workspace/MatrixCalyxChat";
import { recordCalyxSurfaceContext } from "@/features/calyx-workspace/sessionContext";
import { WorkspaceOutputDock } from "@/features/calyx-workspace/WorkspaceOutputDock";
import { emitWorkspaceOutput, type WorkspaceOutput } from "@/features/calyx-workspace/workspaceOutputBus";
import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";

type Certainty = "certain" | "probable" | "uncertain" | "unknown";

type Observation = {
  character: string;
  value: unknown;
  certainty: Certainty;
  weight: number;
};

type Candidate = {
  taxon_id: string;
  scientific_name: string;
  states: Record<string, unknown>;
  provenance?: Record<string, unknown>;
};

type Explanation = {
  character: string;
  observation: unknown;
  candidate_state: unknown;
  certainty: Certainty;
  effective_weight: number;
  similarity: number | null;
  contribution: number;
  status: string;
};

type CandidateResult = {
  taxon_id: string;
  scientific_name: string;
  score: number;
  coverage: number;
  compared_weight: number;
  possible_weight: number;
  explanations: Explanation[];
  provenance?: Record<string, unknown>;
};

type IdentificationReport = {
  candidates: CandidateResult[];
  observation_count: number;
  compared_character_count: number;
  disclaimer: string;
  workspace_outputs?: unknown;
};

const exampleObservations: Observation[] = [
  { character: "flower_color", value: "white", certainty: "certain", weight: 1 },
  { character: "spur_length_mm", value: 300, certainty: "probable", weight: 2 },
  { character: "flower_shape", value: "star-shaped", certainty: "certain", weight: 1 },
];

const exampleCandidates: Candidate[] = [
  {
    taxon_id: "world-plants:angraecum-sesquipedale",
    scientific_name: "Angraecum sesquipedale",
    states: {
      flower_color: ["white", "greenish-white"],
      spur_length_mm: { min: 250, max: 350 },
      flower_shape: "star-shaped",
    },
    provenance: { source: "demonstration matrix; replace with governed assertions" },
  },
  {
    taxon_id: "world-plants:angraecum-eburneum",
    scientific_name: "Angraecum eburneum",
    states: {
      flower_color: ["white", "greenish-white"],
      spur_length_mm: { min: 80, max: 150 },
      flower_shape: "star-shaped",
    },
    provenance: { source: "demonstration matrix; replace with governed assertions" },
  },
];

function pretty(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function emitMatrixWorkspaceOutputs(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  let emitted = 0;
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    try {
      emitWorkspaceOutput(candidate as WorkspaceOutput);
      emitted += 1;
    } catch {
      // Matrix chat and the primary ranking remain usable when an auxiliary
      // panel violates the shared workspace schema or provenance contract.
    }
  }
  return emitted;
}

export default function OrchidIdentificationNext() {
  const location = useLocation();
  const sourceContext = useMemo(
    () => readIdentificationSourceContext(location.search),
    [location.search],
  );
  const [observationsText, setObservationsText] = useState(
    JSON.stringify(exampleObservations, null, 2),
  );
  const [candidatesText, setCandidatesText] = useState(
    JSON.stringify(exampleCandidates, null, 2),
  );
  const [report, setReport] = useState<IdentificationReport | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "live" | "error">("idle");
  const [message, setMessage] = useState(
    "Enter observed characters and a governed candidate matrix, then evaluate.",
  );

  useEffect(() => {
    recordCalyxSurfaceContext({
      surface: "matrix-identification",
      module: "matrix-identification",
      object_type: sourceContext.concept ? "lexicon_context" : "identification_workspace",
      object_id: sourceContext.concept ?? "matrix-identification",
      label: sourceContext.label ?? "Matrix Identification Lab",
      path: typeof window === "undefined" ? undefined : `${window.location.pathname}${window.location.search}`,
      metadata: {
        source_lexicon_concept: sourceContext.concept ?? null,
        source_lexicon_label: sourceContext.label ?? null,
        context_is_observation: false,
      },
    });
  }, [sourceContext.concept, sourceContext.label]);

  const candidateCount = useMemo(() => {
    try {
      const parsed = JSON.parse(candidatesText) as unknown;
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }, [candidatesText]);

  async function evaluate(): Promise<void> {
    setStatus("loading");
    setMessage("Evaluating candidates against the supplied character evidence…");
    try {
      const observations = JSON.parse(observationsText) as Observation[];
      const candidates = JSON.parse(candidatesText) as Candidate[];
      if (!Array.isArray(observations) || observations.length === 0) {
        throw new Error("Observations must be a non-empty JSON array.");
      }
      if (!Array.isArray(candidates) || candidates.length === 0) {
        throw new Error("Candidates must be a non-empty JSON array.");
      }

      const response = await fetch(`${CALYX_BACKEND_BASE_URL}/api/matrix-identification/evaluate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ observations, candidates, limit: 50 }),
      });
      const payload = await response.json().catch(() => null) as IdentificationReport | { detail?: unknown } | null;
      if (!response.ok) {
        const detail = payload && "detail" in payload ? pretty(payload.detail) : response.statusText;
        throw new Error(`Identification API ${response.status}: ${detail}`);
      }
      const nextReport = payload as IdentificationReport;
      setReport(nextReport);
      emitMatrixWorkspaceOutputs(nextReport.workspace_outputs);
      setStatus("live");
      setMessage("Live explainable candidate ranking from Calyx. Derived workspace output is available beside the conversation.");
    } catch (error) {
      setReport(null);
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to evaluate candidates.");
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Matrix Identification Lab</p>
        <h1 className="mt-2 text-4xl font-semibold">Build an explainable orchid identification</h1>
        <p className="mt-4 max-w-4xl text-muted-foreground">
          Supply observable characters and a governed candidate matrix. Calyx ranks candidates, reports data coverage, and explains every match, partial match, conflict, unknown, and missing candidate state. A ranking is evidence for review—not a verified identification.
        </p>

        {sourceContext.concept && (
          <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4" aria-label="Lexicon context">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">Carried from the Illustrated Orchid Lexicon</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-stone-700">
                Calyx retains <strong>{sourceContext.label ?? sourceContext.concept}</strong> as interface context only. It has not been added to the observation matrix or treated as evidence.
              </p>
              <Link
                to={`/lexicon/entry/${encodeURIComponent(sourceContext.concept)}`}
                className="rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                Return to concept
              </Link>
            </div>
          </section>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="rounded-full border px-3 py-1 text-xs font-semibold uppercase">{status}</span>
          <span className="text-sm text-muted-foreground">{message}</span>
          <span className="rounded-full border px-3 py-1 text-xs">{candidateCount} candidates loaded</span>
        </div>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <label className="block rounded-2xl border bg-card p-5">
            <span className="text-sm font-semibold">Observed characters</span>
            <span className="mt-1 block text-xs text-muted-foreground">Use certainty: certain, probable, uncertain, or unknown. Unknown observations contribute no score.</span>
            <textarea
              value={observationsText}
              onChange={(event) => setObservationsText(event.target.value)}
              className="mt-4 min-h-[360px] w-full rounded-xl border bg-background p-4 font-mono text-xs"
              spellCheck={false}
            />
          </label>

          <label className="block rounded-2xl border bg-card p-5">
            <span className="text-sm font-semibold">Candidate character matrix</span>
            <span className="mt-1 block text-xs text-muted-foreground">Each taxon may carry categorical values, multiple states, numeric values, ranges, and provenance.</span>
            <textarea
              value={candidatesText}
              onChange={(event) => setCandidatesText(event.target.value)}
              className="mt-4 min-h-[360px] w-full rounded-xl border bg-background p-4 font-mono text-xs"
              spellCheck={false}
            />
          </label>
        </section>

        <button
          type="button"
          onClick={() => void evaluate()}
          disabled={status === "loading"}
          className="mt-6 rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
        >
          {status === "loading" ? "Evaluating…" : "Evaluate candidate matrix"}
        </button>

        <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,.9fr),minmax(0,1.1fr)]" aria-label="Calyx adaptive identification workspace">
          <MatrixCalyxChat sourceConcept={sourceContext.concept} sourceLabel={sourceContext.label} />
          <WorkspaceOutputDock
            title="Identification tool outputs"
            emptyMessage="Run the candidate matrix to open the derived ranking panel here. Calyx conversation remains available alongside it."
          />
        </section>

        {report && (
          <section className="mt-10">
            <div className="rounded-2xl border bg-card p-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div><p className="text-xs uppercase text-muted-foreground">Observations</p><p className="mt-1 text-2xl font-semibold">{report.observation_count}</p></div>
                <div><p className="text-xs uppercase text-muted-foreground">Scored characters</p><p className="mt-1 text-2xl font-semibold">{report.compared_character_count}</p></div>
                <div><p className="text-xs uppercase text-muted-foreground">Ranked candidates</p><p className="mt-1 text-2xl font-semibold">{report.candidates.length}</p></div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{report.disclaimer}</p>
            </div>

            <div className="mt-6 space-y-5">
              {report.candidates.map((candidate, index) => (
                <article key={candidate.taxon_id} className="rounded-2xl border bg-card p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Candidate {index + 1}</p>
                      <h2 className="mt-1 text-2xl font-semibold italic">{candidate.scientific_name}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">{candidate.taxon_id}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-5 text-right">
                      <div><p className="text-xs uppercase text-muted-foreground">Match</p><p className="text-3xl font-semibold">{Math.round(candidate.score * 100)}%</p></div>
                      <div><p className="text-xs uppercase text-muted-foreground">Coverage</p><p className="text-3xl font-semibold">{Math.round(candidate.coverage * 100)}%</p></div>
                    </div>
                  </div>

                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[850px] border-collapse text-left text-sm">
                      <thead><tr className="border-b"><th className="p-2">Character</th><th className="p-2">Observed</th><th className="p-2">Candidate state</th><th className="p-2">Certainty</th><th className="p-2">Status</th><th className="p-2">Similarity</th></tr></thead>
                      <tbody>
                        {candidate.explanations.map((item) => (
                          <tr key={`${candidate.taxon_id}:${item.character}`} className="border-b align-top">
                            <td className="p-2 font-medium">
                              <Link
                                to={lexiconHrefForMatrixCharacter(item.character)}
                                className="text-emerald-800 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-950"
                                title="Search this identification character in the Illustrated Orchid Lexicon"
                              >
                                {item.character.replaceAll("_", " ")}
                              </Link>
                            </td>
                            <td className="p-2 font-mono text-xs">{pretty(item.observation)}</td>
                            <td className="p-2 font-mono text-xs">{pretty(item.candidate_state)}</td>
                            <td className="p-2">{item.certainty}</td>
                            <td className="p-2">{item.status.replaceAll("_", " ")}</td>
                            <td className="p-2">{item.similarity == null ? "—" : `${Math.round(item.similarity * 100)}%`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {candidate.provenance && (
                    <p className="mt-4 text-xs text-muted-foreground">Provenance: {pretty(candidate.provenance)}</p>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
