import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  BrainMissionApiError,
  buildConversationalMissionQuestion,
  casualCalyxReply,
  isCasualCalyxTurn,
  loadCalyxWorkspace,
  startBrainMission,
  summarizeMissionForConversation,
  type BrainMission,
  type CalyxConversationTurn,
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
const STORAGE_KEY = "orchid-continuum:calyx-speak:v1";
const DEFAULT_PROJECT_ID = "calyx-speak";

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
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Mission state</p><h3 className="text-lg font-semibold">{mission.state.replaceAll("_", " ")}</h3></div><p className="text-sm text-muted-foreground">Stage: {mission.current_stage.replaceAll("_", " ")}</p></div>
      {mission.partial || mission.blockers.length ? <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4"><h3 className="font-semibold">Mission stopped with partial results</h3><ul className="mt-2 list-disc pl-5 text-sm">{mission.blockers.map((item, index) => <li key={`${item.code}-${index}`}>{item.code} at {item.stage}{item.detail ? `: ${item.detail}` : ""}</li>)}</ul></div> : null}
      <SourceList items={mission.sources} />
      <div className="grid gap-4 md:grid-cols-2"><EvidenceList title="Supporting evidence" items={mission.supporting_evidence} /><EvidenceList title="Contradicting evidence" items={mission.contradicting_evidence} /></div>
      <section className="rounded-xl border p-5"><h3 className="font-semibold">Evidence gaps</h3>{mission.missing_evidence.length ? <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{mission.missing_evidence.map((gap, index) => <li key={`${gap}-${index}`}>{gap}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No additional gaps were reported.</p>}</section>
      <section className="rounded-xl border p-5"><h3 className="font-semibold">Provisional scientific interpretation</h3>{mission.conclusions.length ? mission.conclusions.map((item, index) => <p className="mt-2 text-sm" key={`${item.text}-${index}`}>{item.text}</p>) : <p className="mt-2 text-sm text-muted-foreground">No conclusion was produced.</p>}<p className="mt-3 text-xs text-muted-foreground">Backend confidence: {mission.confidence === null ? "not available" : mission.confidence.toFixed(2)}. This is an inference requiring scientific review, not a published fact.</p></section>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border p-5"><h3 className="font-semibold">Reasoning Ledger</h3><p className="mt-2 text-sm text-muted-foreground">{mission.reasoning_ledger ? `${mission.reasoning_ledger.ledger_id} · version ${mission.reasoning_ledger.version}` : "No ledger revision was created."}</p><p className="mt-2 text-sm">Review: {mission.review_status.replaceAll("_", " ")}</p><p className="text-sm">Validation: {mission.validation.valid ? "valid" : "not valid"}</p>{mission.validation.blockers.length ? <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{mission.validation.blockers.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : null}</section>
        <section className="rounded-xl border p-5"><h3 className="font-semibold">Publication boundary</h3><p className="mt-2 text-sm">Eligible: {mission.publication_eligibility.eligible ? "yes" : "no"}</p><p className="text-sm">Automatic publication: never</p>{mission.publication_eligibility.blockers.length ? <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{mission.publication_eligibility.blockers.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : null}</section>
      </div>
    </div>
  );
}

function newTurn(role: CalyxConversationTurn["role"], text: string, mission?: BrainMission): CalyxConversationTurn {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, role, text, created_at: new Date().toISOString(), mission };
}

export default function CalyxWorkspace() {
  const [snapshot, setSnapshot] = useState<CalyxWorkspaceSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [projectId, setProjectId] = useState(DEFAULT_PROJECT_ID);
  const [turns, setTurns] = useState<CalyxConversationTurn[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { projectId?: string; turns?: CalyxConversationTurn[] };
        if (parsed.projectId) setProjectId(parsed.projectId);
        if (Array.isArray(parsed.turns)) setTurns(parsed.turns);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    loadCalyxWorkspace()
      .then((value) => active && setSnapshot(value))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ projectId, turns }));
  }, [projectId, turns]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || submitting) return;
    const userTurn = newTurn("user", text);
    const priorTurns = turns;
    setTurns((current) => [...current, userTurn]);
    setMessage("");
    setConversationError(null);

    if (isCasualCalyxTurn(text)) {
      setTurns((current) => [...current, newTurn("calyx", casualCalyxReply(text))]);
      return;
    }

    setSubmitting(true);
    try {
      const mission = await startBrainMission({
        question: buildConversationalMissionQuestion(text, priorTurns),
        project_id: projectId.trim() || DEFAULT_PROJECT_ID,
        max_sources: 20,
        max_execution_steps: 10,
        timeout_seconds: 30,
      });
      setTurns((current) => [...current, newTurn("calyx", summarizeMissionForConversation(mission), mission)]);
    } catch (error) {
      const detail = error instanceof BrainMissionApiError ? error.message : "Calyx could not complete that turn.";
      setConversationError(detail);
      setTurns((current) => [...current, newTurn("calyx", `I could not complete the governed research step for that question. ${detail}`)]);
    } finally {
      setSubmitting(false);
    }
  }

  function newConversation() {
    setTurns([]);
    setMessage("");
    setConversationError(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Calyx Workspace</p>
            <h1 className="text-4xl font-semibold">Speak with Calyx</h1>
            <p className="max-w-3xl text-muted-foreground">A persistent conversation with the Orchid Continuum Brain. Ordinary greetings stay conversational; substantive questions can escalate into governed evidence missions without leaving the thread.</p>
          </div>
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={newConversation} type="button">New conversation</button>
        </header>

        <section className="rounded-xl border bg-card">
          <div className="max-h-[62vh] min-h-80 space-y-5 overflow-y-auto p-5" aria-live="polite">
            {!turns.length ? (
              <div className="mx-auto max-w-2xl py-14 text-center">
                <h2 className="text-2xl font-semibold">What would you like to work on?</h2>
                <p className="mt-3 text-sm text-muted-foreground">Try “What do you need Calyx Vision to be able to see and understand?” or ask a follow-up naturally after the first response.</p>
              </div>
            ) : turns.map((turn) => (
              <article className={`max-w-4xl ${turn.role === "user" ? "ml-auto" : "mr-auto"}`} key={turn.id}>
                <div className={`rounded-2xl px-4 py-3 ${turn.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <p className="whitespace-pre-wrap text-sm leading-6">{turn.text}</p>
                </div>
                {turn.role === "calyx" && turn.mission ? (
                  <details className="mt-2 rounded-xl border bg-background px-4 py-3">
                    <summary className="cursor-pointer text-sm font-medium">Research details · mission {turn.mission.mission_id}</summary>
                    <MissionResult mission={turn.mission} />
                  </details>
                ) : null}
              </article>
            ))}
            {submitting ? <div className="mr-auto rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">Calyx is consulting the governed Brain…</div> : null}
          </div>

          <form className="border-t p-4" onSubmit={submit}>
            <label className="sr-only" htmlFor="calyx-message">Message Calyx</label>
            <textarea className="min-h-24 w-full resize-y rounded-xl border bg-background px-4 py-3" id="calyx-message" maxLength={1000} onChange={(event) => setMessage(event.target.value)} placeholder="Message Calyx…" value={message} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Conversation settings</summary>
                <label className="mt-2 block font-medium" htmlFor="calyx-project">Research project ID</label>
                <input className="mt-1 w-72 max-w-full rounded-md border bg-background px-3 py-2 text-foreground" id="calyx-project" maxLength={200} onChange={(event) => setProjectId(event.target.value)} value={projectId} />
              </details>
              <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50" disabled={submitting || !message.trim()} type="submit">{submitting ? "Working…" : "Send"}</button>
            </div>
            {conversationError ? <p className="mt-3 text-sm text-destructive" role="alert">{conversationError}</p> : null}
          </form>
        </section>

        {loading ? <p className="text-sm text-muted-foreground">Loading Calyx systems…</p> : null}
        {snapshot.errors.length ? (
          <section className="rounded-xl border p-4">
            <h2 className="font-semibold">Degraded connections</h2>
            <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{snapshot.errors.map((error) => <li key={error}>{error}</li>)}</ul>
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border p-5"><h2 className="font-semibold">Platform capabilities</h2><p className="mt-2 text-sm text-muted-foreground">{snapshot.capabilities ? "Canonical capability contract available." : "Capability service unavailable."}</p></article>
          <article className="rounded-xl border p-5"><h2 className="font-semibold">Homepage intelligence</h2><p className="mt-2 text-sm text-muted-foreground">{snapshot.homepage ? `${snapshot.homepage.sections.length} governed sections returned.` : "Homepage document unavailable."}</p></article>
          <article className="rounded-xl border p-5"><h2 className="font-semibold">Durable orchestrator</h2><p className="mt-2 text-sm text-muted-foreground">{snapshot.orchestratorState === "available" ? "Authenticated orchestrator status available." : snapshot.orchestratorState === "authentication_required" ? "Owner authentication is required to view queue and findings." : "Orchestrator status unavailable."}</p></article>
        </section>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Link className="rounded-xl border p-5 hover:bg-muted" to="/relationship-matrix"><h2 className="font-semibold">Relationship Matrix</h2><p className="mt-2 text-sm text-muted-foreground">Compare taxa and inspect evidence coverage.</p></Link>
          <Link className="rounded-xl border p-5 hover:bg-muted" to="/orchid-identification"><h2 className="font-semibold">Orchid Identification</h2><p className="mt-2 text-sm text-muted-foreground">Record observations and review candidate suggestions.</p></Link>
          <Link className="rounded-xl border p-5 hover:bg-muted" to="/continuum-next"><h2 className="font-semibold">Homepage Intelligence</h2><p className="mt-2 text-sm text-muted-foreground">Review the next-generation evidence-driven homepage.</p></Link>
          <Link className="rounded-xl border p-5 hover:bg-muted" to="/university"><h2 className="font-semibold">Orchid University</h2><p className="mt-2 text-sm text-muted-foreground">Open learning, curriculum, and virtual-lab experiences.</p></Link>
        </section>

        <section className="rounded-xl border p-5">
          <h2 className="font-semibold">Governance</h2>
          <p className="mt-2 text-sm text-muted-foreground">Conversation history is retained locally in this browser for continuity. Scientific evidence, scoring, ledger state, review, and publication authority remain governed by the backend. Calyx does not automatically publish scientific knowledge.</p>
        </section>
      </div>
    </main>
  );
}
