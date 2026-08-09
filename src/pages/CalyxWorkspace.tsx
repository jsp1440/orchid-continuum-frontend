import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  BrainMissionApiError,
  loadCalyxWorkspace,
  startBrainMission,
  type BrainMission,
  type CalyxWorkspaceSnapshot,
  type MissionEvidence,
  type MissionSource,
} from "@/lib/calyxWorkspace";

const emptySnapshot: CalyxWorkspaceSnapshot = {
  capabilities: null,
  homepage: null,
  orchestrator: null,
  orchestratorState: "unavailable",
  errors: [],
};

function EvidenceList({ title, items }: { title: string; items: MissionEvidence[] }) {
  return (
    <section className="rounded-xl border p-5">
      <h3 className="font-semibold">{title} ({items.length})</h3>
      {items.length ? <ul className="mt-3 space-y-3">{items.map((item, index) => (
        <li className="rounded-lg bg-muted p-3 text-sm" key={`${String(item.candidate_id ?? "evidence")}-${index}`}>
          <p className="font-medium">{String(item.subject ?? "Source-backed claim")}{item.predicate ? ` · ${String(item.predicate)}` : ""}</p>
          {item.value !== undefined && item.value !== null ? <p className="mt-1 text-muted-foreground">{String(item.value)}</p> : null}
          <p className="mt-2 text-xs text-muted-foreground">Revision {String(item.source_revision_id ?? "not supplied")} · anchors {item.source_anchor_ids?.map(String).join(", ") || "not supplied"}</p>
          {item.provenance && Object.keys(item.provenance).length ? <p className="mt-1 break-words text-xs text-muted-foreground">Provenance: {JSON.stringify(item.provenance)}</p> : null}
        </li>
      ))}</ul> : <p className="mt-2 text-sm text-muted-foreground">No evidence was returned in this category.</p>}
    </section>
  );
}

function SourceList({ items }: { items: MissionSource[] }) {
  return (
    <section className="rounded-xl border p-5">
      <h3 className="font-semibold">Retrieved canonical sources ({items.length})</h3>
      {items.length ? <ul className="mt-3 space-y-3">{items.map((item, index) => (
        <li className="rounded-lg bg-muted p-3 text-sm" key={item.result_id ?? `source-${index}`}>
          <p className="font-medium">{item.title || item.object_type || "Canonical source"}</p>
          {item.authorized_excerpt ? <blockquote className="mt-2 border-l-2 pl-3 text-muted-foreground">{item.authorized_excerpt}</blockquote> : <p className="mt-2 text-muted-foreground">Source text is not authorized for display.</p>}
          <p className="mt-2 text-xs text-muted-foreground">Revision {String(item.citation?.revision_id ?? "not supplied")} · anchors {item.citation?.source_anchor_ids?.map(String).join(", ") || "not supplied"}</p>
          {item.citation?.locator ? <p className="mt-1 break-words text-xs text-muted-foreground">Locator: {JSON.stringify(item.citation.locator)}</p> : null}
        </li>
      ))}</ul> : <p className="mt-2 text-sm text-muted-foreground">No display-authorized canonical sources were returned.</p>}
    </section>
  );
}

function MissionResult({ mission }: { mission: BrainMission }) {
  return (
    <section aria-live="polite" className="space-y-4 rounded-xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Mission state</p><h2 className="text-2xl font-semibold">{mission.state.replaceAll("_", " ")}</h2></div><p className="text-sm text-muted-foreground">Stage: {mission.current_stage.replaceAll("_", " ")}</p></div>
      {mission.partial || mission.blockers.length ? <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4"><h3 className="font-semibold">Mission stopped with partial results</h3><ul className="mt-2 list-disc pl-5 text-sm">{mission.blockers.map((item, index) => <li key={`${item.code}-${index}`}>{item.code} at {item.stage}{item.detail ? `: ${item.detail}` : ""}</li>)}</ul></div> : null}
      <SourceList items={mission.sources} />
      <div className="grid gap-4 md:grid-cols-2"><EvidenceList title="Supporting evidence" items={mission.supporting_evidence} /><EvidenceList title="Contradicting evidence" items={mission.contradicting_evidence} /></div>
      <section className="rounded-xl border p-5"><h3 className="font-semibold">Evidence gaps</h3>{mission.missing_evidence.length ? <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{mission.missing_evidence.map((gap, index) => <li key={`${gap}-${index}`}>{gap}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No additional gaps were reported.</p>}</section>
      <section className="rounded-xl border p-5"><h3 className="font-semibold">Provisional scientific interpretation</h3>{mission.conclusions.length ? mission.conclusions.map((item, index) => <p className="mt-2 text-sm" key={`${item.text}-${index}`}>{item.text}</p>) : <p className="mt-2 text-sm text-muted-foreground">No conclusion was produced.</p>}<p className="mt-3 text-xs text-muted-foreground">Backend confidence: {mission.confidence === null ? "not available" : mission.confidence.toFixed(2)}. This is an inference requiring scientific review, not a published fact.</p></section>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border p-5"><h3 className="font-semibold">Reasoning Ledger</h3><p className="mt-2 text-sm text-muted-foreground">{mission.reasoning_ledger ? `${mission.reasoning_ledger.ledger_id} · version ${mission.reasoning_ledger.version}` : "No ledger revision was created."}</p><p className="mt-2 text-sm">Review: {mission.review_status.replaceAll("_", " ")}</p><p className="text-sm">Validation: {mission.validation.valid ? "valid" : "not valid"}</p>{mission.validation.blockers.length ? <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{mission.validation.blockers.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : null}</section>
        <section className="rounded-xl border p-5"><h3 className="font-semibold">Publication boundary</h3><p className="mt-2 text-sm">Eligible: {mission.publication_eligibility.eligible ? "yes" : "no"}</p><p className="text-sm">Automatic publication: never</p>{mission.publication_eligibility.blockers.length ? <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{mission.publication_eligibility.blockers.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : null}</section>
      </div>
    </section>
  );
}

export default function CalyxWorkspace() {
  const [snapshot, setSnapshot] = useState<CalyxWorkspaceSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [projectId, setProjectId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mission, setMission] = useState<BrainMission | null>(null);
  const [missionError, setMissionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadCalyxWorkspace()
      .then((value) => active && setSnapshot(value))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true); setMissionError(null); setMission(null);
    try {
      setMission(await startBrainMission({ question: question.trim(), project_id: projectId.trim(), max_sources: 20, max_execution_steps: 10, timeout_seconds: 30 }));
    } catch (error) {
      setMissionError(error instanceof BrainMissionApiError ? error.message : "The mission could not be started.");
    } finally { setSubmitting(false); }
  }

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

        <section className="rounded-xl border p-5">
          <h2 className="text-xl font-semibold">Start a scientific mission</h2>
          <p className="mt-2 text-sm text-muted-foreground">Owner authentication and an authorized research project are required.</p>
          <form className="mt-5 space-y-4" onSubmit={submit}>
            <div><label className="text-sm font-medium" htmlFor="calyx-project">Research project ID</label><input className="mt-1 w-full rounded-md border bg-background px-3 py-2" id="calyx-project" maxLength={200} onChange={(event) => setProjectId(event.target.value)} required value={projectId} /></div>
            <div><label className="text-sm font-medium" htmlFor="calyx-question">Scientific question</label><textarea className="mt-1 min-h-32 w-full rounded-md border bg-background px-3 py-2" id="calyx-question" maxLength={1000} onChange={(event) => setQuestion(event.target.value)} required value={question} /><p className="mt-1 text-xs text-muted-foreground">Include the taxon and the evidence domains you want assessed.</p></div>
            <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50" disabled={submitting || !question.trim() || !projectId.trim()} type="submit">{submitting ? "Running bounded mission…" : "Run mission"}</button>
          </form>
          {missionError ? <p className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm" role="alert">{missionError}</p> : null}
        </section>

        {mission ? <MissionResult mission={mission} /> : null}

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
            This workspace does not calculate scientific scores in the browser, verify an orchid identity, promote taxonomy, merge code, deploy production, approve a ledger, or publish scientific knowledge.
          </p>
        </section>
      </div>
    </main>
  );
}
