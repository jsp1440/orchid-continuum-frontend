import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronDown, CircleHelp, FlaskConical, RotateCcw, Sparkles } from "lucide-react";

import {
  addSessionObservation,
  coerceObservationValue,
  createIdentificationSession,
  evaluateIdentificationSession,
  explainIdentificationSession,
  explanationText,
  listMatrixRegistries,
  type Certainty,
  type ExplanationAudience,
  type RegistrySummary,
  type SessionEvaluation,
} from "@/lib/matrixIdentification";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function scopeLabel(scope?: Record<string, unknown>): string {
  if (!scope) return "Governed orchid matrix";
  const genus = typeof scope.genus === "string" ? scope.genus : null;
  const clade = typeof scope.clade === "string" ? scope.clade : null;
  return genus ? `Genus ${genus}` : clade ? clade : "Governed orchid matrix";
}

export default function OrchidIdentificationNext() {
  const [registries, setRegistries] = useState<RegistrySummary[]>([]);
  const [selectedRegistryKey, setSelectedRegistryKey] = useState("");
  const [evaluation, setEvaluation] = useState<SessionEvaluation | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "working" | "error">("loading");
  const [message, setMessage] = useState("Loading governed identification matrices…");
  const [answer, setAnswer] = useState("");
  const [certainty, setCertainty] = useState<Certainty>("certain");
  const [audience, setAudience] = useState<ExplanationAudience>("beginner");
  const [calyxText, setCalyxText] = useState("");
  const requestId = useRef(0);

  const selectedRegistry = useMemo(
    () => registries.find((item) => `${item.registry_id}:${item.version}` === selectedRegistryKey) ?? null,
    [registries, selectedRegistryKey],
  );
  const session = evaluation?.session ?? null;
  const next = evaluation?.next_observation ?? null;

  useEffect(() => {
    const id = ++requestId.current;
    void listMatrixRegistries()
      .then((items) => {
        if (id !== requestId.current) return;
        setRegistries(items);
        setSelectedRegistryKey(items[0] ? `${items[0].registry_id}:${items[0].version}` : "");
        setStatus("ready");
        setMessage(items.length ? "Choose a governed matrix and begin." : "No governed Matrix registry versions are available yet.");
      })
      .catch((error) => {
        if (id !== requestId.current) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Unable to load Matrix registries.");
      });
    return () => { requestId.current += 1; };
  }, []);

  async function start(): Promise<void> {
    if (!selectedRegistry) return;
    const id = ++requestId.current;
    setStatus("working");
    setMessage("Starting an evidence-bound identification session…");
    setCalyxText("");
    setAnswer("");
    try {
      const created = await createIdentificationSession(selectedRegistry);
      const result = await evaluateIdentificationSession(created.session_id);
      if (id !== requestId.current) return;
      setEvaluation(result);
      setStatus("ready");
      setMessage("Session ready. Add the most useful observation you can make.");
    } catch (error) {
      if (id !== requestId.current) return;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to start identification.");
    }
  }

  async function submitObservation(): Promise<void> {
    if (!session || !next || !answer.trim()) return;
    const id = ++requestId.current;
    setStatus("working");
    setMessage(`Recording ${next.label.toLowerCase()} and recalculating the candidates…`);
    try {
      await addSessionObservation(
        session.session_id,
        next.character,
        coerceObservationValue(answer, next.value_type),
        certainty,
      );
      const result = await evaluateIdentificationSession(session.session_id);
      if (id !== requestId.current) return;
      setEvaluation(result);
      setAnswer("");
      setCalyxText("");
      setStatus("ready");
      setMessage(result.next_observation ? "Evidence updated. The Matrix selected the next most discriminating observation." : "No further discriminating Matrix character is available in this registry.");
    } catch (error) {
      if (id !== requestId.current) return;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to record observation.");
    }
  }

  async function askCalyx(focus: "summary" | "next_observation" | "candidate_comparison"): Promise<void> {
    if (!session) return;
    const id = ++requestId.current;
    setStatus("working");
    setMessage("Calyx is explaining the structured Matrix evidence…");
    try {
      const explanation = await explainIdentificationSession(session.session_id, audience, focus);
      if (id !== requestId.current) return;
      setCalyxText(explanationText(explanation) || "Calyx returned a governed explanation packet without narrative text.");
      setStatus("ready");
      setMessage("Calyx explanation loaded. The Matrix ranking itself is unchanged.");
    } catch (error) {
      if (id !== requestId.current) return;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to ask Calyx.");
    }
  }

  function reset(): void {
    requestId.current += 1;
    setEvaluation(null);
    setAnswer("");
    setCalyxText("");
    setCertainty("certain");
    setStatus("ready");
    setMessage("Choose a governed matrix and begin.");
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="overflow-hidden rounded-3xl border bg-card">
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.25fr_.75fr] lg:p-10">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-700">Calyx Matrix · Guided Identification</p>
              <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Investigate the orchid, one piece of evidence at a time.</h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">
                The Matrix ranks governed candidates from your observations. Calyx explains what the evidence means and why the next observation matters. Scores are evidence for review, not a verified taxonomic identification.
              </p>
            </div>
            <div className="rounded-2xl border bg-background/70 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scientific boundary</p>
              <p className="mt-2 text-sm leading-6">Matrix calculations determine ranking and the next diagnostic character. Calyx can explain those results, but cannot rewrite them.</p>
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4" /> Missing data ≠ biological absence</div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4" /> Score and evidence coverage stay separate</div>
            </div>
          </div>
        </header>

        <div className="mt-5 flex flex-wrap items-center gap-3" aria-live="polite">
          <span className="rounded-full border px-3 py-1 text-xs font-semibold uppercase">{status}</span>
          <span className="text-sm text-muted-foreground">{message}</span>
          {session && <span className="rounded-full border px-3 py-1 text-xs">Revision {session.revision}</span>}
        </div>

        {!session ? (
          <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_.8fr]">
            <div className="rounded-3xl border bg-card p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">1 · Choose the scientific scope</p>
              <h2 className="mt-2 text-2xl font-semibold">Start with a governed character matrix</h2>
              <label className="mt-6 block text-sm font-medium" htmlFor="matrix-registry">Identification matrix</label>
              <div className="relative mt-2">
                <select
                  id="matrix-registry"
                  value={selectedRegistryKey}
                  onChange={(event) => setSelectedRegistryKey(event.target.value)}
                  className="w-full appearance-none rounded-xl border bg-background px-4 py-3 pr-10"
                  disabled={status === "loading" || status === "working"}
                >
                  {registries.map((registry) => (
                    <option key={`${registry.registry_id}:${registry.version}`} value={`${registry.registry_id}:${registry.version}`}>
                      {registry.title || registry.registry_id} · {registry.version}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" />
              </div>
              {selectedRegistry && (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Scope</p><p className="mt-1 text-sm font-medium">{scopeLabel(selectedRegistry.scope)}</p></div>
                  <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Candidates</p><p className="mt-1 text-sm font-medium">{selectedRegistry.candidate_count ?? "—"}</p></div>
                  <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Characters</p><p className="mt-1 text-sm font-medium">{selectedRegistry.character_count ?? "—"}</p></div>
                </div>
              )}
              <button type="button" onClick={() => void start()} disabled={!selectedRegistry || status === "working"} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50">
                Begin guided identification <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <aside className="rounded-3xl border bg-card p-6 sm:p-8">
              <FlaskConical className="h-7 w-7 text-emerald-700" />
              <h2 className="mt-4 text-xl font-semibold">What happens next?</h2>
              <ol className="mt-5 space-y-4 text-sm leading-6 text-muted-foreground">
                <li><strong className="text-foreground">Observe.</strong> The Matrix asks for a character that can separate the remaining candidates.</li>
                <li><strong className="text-foreground">Compare.</strong> Candidate rankings update, with match and coverage shown independently.</li>
                <li><strong className="text-foreground">Understand.</strong> Ask Calyx why the character matters or why candidates differ.</li>
                <li><strong className="text-foreground">Repeat.</strong> The next question adapts to the evidence already recorded.</li>
              </ol>
            </aside>
          </section>
        ) : (
          <>
            <section className="mt-8 grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
              <div className="rounded-3xl border bg-card p-6 sm:p-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">2 · Next observation</p>
                    <h2 className="mt-2 text-2xl font-semibold">{next?.label ?? "Matrix evidence complete for this registry"}</h2>
                  </div>
                  <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><RotateCcw className="h-4 w-4" /> Start over</button>
                </div>

                {next ? (
                  <>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{next.description || "Record what you can observe. If you cannot determine the character confidently, lower the certainty rather than guessing."}</p>
                    <div className="mt-5 rounded-2xl border bg-background p-4">
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span>{next.distinct_state_count ?? "—"} distinct states</span>
                        <span>{next.candidate_coverage == null ? "—" : percent(next.candidate_coverage)} candidate coverage</span>
                        <span>{next.reason_code?.replaceAll("_", " ")}</span>
                      </div>
                    </div>
                    <label className="mt-6 block text-sm font-medium" htmlFor="observation-answer">Your observation</label>
                    <input
                      id="observation-answer"
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") void submitObservation(); }}
                      placeholder={next.value_type?.startsWith("numeric") ? "Enter a measurement" : "Describe the observed state"}
                      className="mt-2 w-full rounded-xl border bg-background px-4 py-3"
                    />
                    <div className="mt-4">
                      <label className="text-sm font-medium" htmlFor="certainty">How certain are you?</label>
                      <select id="certainty" value={certainty} onChange={(event) => setCertainty(event.target.value as Certainty)} className="mt-2 w-full rounded-xl border bg-background px-4 py-3 sm:w-auto">
                        <option value="certain">Certain</option>
                        <option value="probable">Probable</option>
                        <option value="uncertain">Uncertain</option>
                        <option value="unknown">Unknown / cannot determine</option>
                      </select>
                    </div>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <button type="button" onClick={() => void submitObservation()} disabled={!answer.trim() || status === "working"} className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50">Record observation</button>
                      <button type="button" onClick={() => void askCalyx("next_observation")} disabled={status === "working"} className="inline-flex items-center gap-2 rounded-xl border px-4 py-3 font-medium"><CircleHelp className="h-4 w-4" /> Why are you asking this?</button>
                    </div>
                  </>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">The current registry has no additional unobserved character that can discriminate the ranked candidates. Review the evidence below or ask Calyx to compare the remaining candidates.</p>
                )}
              </div>

              <div className="rounded-3xl border bg-card p-6 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">3 · Candidate field</p><h2 className="mt-2 text-2xl font-semibold">Evidence narrows the possibilities</h2></div>
                  <button type="button" onClick={() => void askCalyx("candidate_comparison")} disabled={status === "working"} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium"><Sparkles className="h-4 w-4" /> Ask Calyx to compare</button>
                </div>
                <div className="mt-6 space-y-3">
                  {(evaluation?.report.candidates ?? []).slice(0, 8).map((candidate, index) => (
                    <article key={candidate.taxon_id} className="rounded-2xl border p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div><p className="text-xs uppercase text-muted-foreground">Candidate {index + 1}</p><h3 className="mt-1 text-lg font-semibold italic">{candidate.scientific_name}</h3></div>
                        <div className="grid grid-cols-2 gap-4 text-right"><div><p className="text-xs text-muted-foreground">Match</p><p className="font-semibold">{percent(candidate.score)}</p></div><div><p className="text-xs text-muted-foreground">Coverage</p><p className="font-semibold">{percent(candidate.coverage)}</p></div></div>
                      </div>
                      <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted-foreground">Character evidence</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{candidate.explanations.map((item) => <div key={`${candidate.taxon_id}:${item.character}`} className="rounded-lg bg-muted/40 p-2"><span className="font-medium">{item.character.replaceAll("_", " ")}</span><span className="ml-2 text-xs text-muted-foreground">{item.status.replaceAll("_", " ")}</span></div>)}</div></details>
                    </article>
                  ))}
                </div>
                <p className="mt-5 text-xs leading-5 text-muted-foreground">{evaluation?.report.disclaimer}</p>
              </div>
            </section>

            <section className="mt-6 rounded-3xl border bg-card p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Calyx · explanation layer</p><h2 className="mt-2 text-2xl font-semibold">Understand the evidence</h2></div>
                <div className="flex items-center gap-2"><label htmlFor="audience" className="text-sm text-muted-foreground">Level</label><select id="audience" value={audience} onChange={(event) => setAudience(event.target.value as ExplanationAudience)} className="rounded-xl border bg-background px-3 py-2 text-sm"><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="expert">Expert</option></select></div>
              </div>
              {calyxText ? <div className="mt-5 whitespace-pre-wrap rounded-2xl border bg-background p-5 text-sm leading-7">{calyxText}</div> : <p className="mt-4 text-sm text-muted-foreground">Ask Calyx why the Matrix selected a character or how the leading candidates differ. Calyx receives the structured evidence but cannot rewrite it.</p>}
              <button type="button" onClick={() => void askCalyx("summary")} disabled={status === "working"} className="mt-5 inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium"><Sparkles className="h-4 w-4" /> Explain the identification so far</button>
            </section>

            <details className="mt-6 rounded-2xl border bg-card p-5">
              <summary className="cursor-pointer text-sm font-semibold">Expert provenance trail</summary>
              <div className="mt-4 grid gap-4 text-xs text-muted-foreground sm:grid-cols-3">
                <div><p className="font-semibold text-foreground">Session</p><p className="mt-1 break-all">{session.session_id}</p></div>
                <div><p className="font-semibold text-foreground">Registry</p><p className="mt-1">{session.registry.registry_id} · {session.registry.version}</p></div>
                <div><p className="font-semibold text-foreground">Observations</p><p className="mt-1">{session.observations.length} recorded · revision {session.revision}</p></div>
              </div>
            </details>
          </>
        )}
      </div>
    </main>
  );
}
