import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  CalyxApiError,
  createCalyxConversation,
  getBrainMission,
  getCalyxConversation,
  loadCalyxWorkspace,
  sendCalyxTurn,
  type BrainMission,
  type CalyxConversation,
  type CalyxServerMessage,
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
const STORAGE_KEY = "orchid-continuum:calyx-speak:v2";
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
          {item.authorized_excerpt ? <blockquote className="mt-2 border-l-2 pl-3 text-muted-foreground">{item.authorized_excerpt}</blockquote> : null}
          <p className="mt-2 text-xs text-muted-foreground">Revision {String(item.citation?.revision_id ?? "not supplied")} · anchors {item.citation?.source_anchor_ids?.map(String).join(", ") || "not supplied"}</p>
        </li>
      ))}</ul> : <p className="mt-2 text-sm text-muted-foreground">No display-authorized canonical sources were returned.</p>}
    </section>
  );
}

function MissionResult({ mission }: { mission: BrainMission }) {
  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Mission state</p><h3 className="text-lg font-semibold">{mission.state.replaceAll("_", " ")}</h3></div><p className="text-sm text-muted-foreground">Stage: {mission.current_stage.replaceAll("_", " ")}</p></div>
      <SourceList items={mission.sources} />
      <div className="grid gap-4 md:grid-cols-2"><EvidenceList title="Supporting evidence" items={mission.supporting_evidence} /><EvidenceList title="Contradicting evidence" items={mission.contradicting_evidence} /></div>
      <section className="rounded-xl border p-5"><h3 className="font-semibold">Evidence gaps</h3>{mission.missing_evidence.length ? <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{mission.missing_evidence.map((gap, index) => <li key={`${gap}-${index}`}>{gap}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No additional gaps were reported.</p>}</section>
      <section className="rounded-xl border p-5"><h3 className="font-semibold">Governance</h3><p className="mt-2 text-sm">Review: {mission.review_status.replaceAll("_", " ")}</p><p className="text-sm">Automatic publication: never</p><p className="text-sm">Publication eligible: {mission.publication_eligibility.eligible ? "yes" : "no"}</p></section>
    </div>
  );
}

function visibleMessages(messages: CalyxServerMessage[]) {
  return messages.filter((message) => message.role === "operator" || message.role === "calyx");
}

export default function CalyxWorkspace() {
  const [snapshot, setSnapshot] = useState<CalyxWorkspaceSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [projectId, setProjectId] = useState(DEFAULT_PROJECT_ID);
  const [conversation, setConversation] = useState<CalyxConversation | null>(null);
  const [missions, setMissions] = useState<Record<string, BrainMission>>({});
  const [submitting, setSubmitting] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as { conversationId?: string; projectId?: string };
        if (stored.projectId) setProjectId(stored.projectId);
        if (stored.conversationId) {
          const restored = await getCalyxConversation(stored.conversationId);
          if (active) setConversation(restored);
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
      const value = await loadCalyxWorkspace();
      if (active) { setSnapshot(value); setLoading(false); }
    };
    void restore();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ conversationId: conversation?.conversation_id, projectId }));
  }, [conversation?.conversation_id, projectId]);

  useEffect(() => {
    if (!conversation) return;
    for (const item of conversation.messages) {
      if (item.role !== "calyx" || missions[item.message_id]) continue;
      const missionId = typeof item.metadata?.mission_id === "string" ? item.metadata.mission_id : null;
      if (!missionId) continue;
      void getBrainMission(missionId).then((mission) => setMissions((current) => ({ ...current, [item.message_id]: mission }))).catch(() => undefined);
    }
  }, [conversation, missions]);

  async function ensureConversation(): Promise<CalyxConversation> {
    if (conversation) return conversation;
    const created = await createCalyxConversation({ title: "Speak with Calyx", project_id: projectId.trim() || DEFAULT_PROJECT_ID, context: { surface: "orchid-continuum-frontend" } });
    setConversation(created);
    return created;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setConversationError(null);
    setMessage("");
    try {
      const thread = await ensureConversation();
      const result = await sendCalyxTurn(thread.conversation_id, { message: text, project_id: projectId.trim() || DEFAULT_PROJECT_ID, research_mode: "auto", retrieval_limit: 8 });
      if (result.research.mission) setMissions((current) => ({ ...current, [result.calyx_message.message_id]: result.research.mission as BrainMission }));
      setConversation(await getCalyxConversation(thread.conversation_id));
    } catch (error) {
      const detail = error instanceof CalyxApiError ? error.message : "Calyx could not complete that turn.";
      setConversationError(detail);
    } finally {
      setSubmitting(false);
    }
  }

  function newConversation() {
    setConversation(null);
    setMissions({});
    setMessage("");
    setConversationError(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2"><p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Calyx Workspace</p><h1 className="text-4xl font-semibold">Speak with Calyx</h1><p className="max-w-3xl text-muted-foreground">A server-owned conversation with the Orchid Continuum Brain. Calyx decides when a turn needs governed retrieval or a scientific mission; the browser no longer authors its answers.</p></div>
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={newConversation} type="button">New conversation</button>
        </header>

        <section className="rounded-xl border bg-card">
          <div className="max-h-[62vh] min-h-80 space-y-5 overflow-y-auto p-5" aria-live="polite">
            {!conversation || !visibleMessages(conversation.messages).length ? <div className="mx-auto max-w-2xl py-14 text-center"><h2 className="text-2xl font-semibold">What would you like to work on?</h2><p className="mt-3 text-sm text-muted-foreground">Try “What do you need Calyx Vision to be able to see and understand?” and continue naturally with follow-up questions.</p></div> : visibleMessages(conversation.messages).map((turn) => (
              <article className={`max-w-4xl ${turn.role === "operator" ? "ml-auto" : "mr-auto"}`} key={turn.message_id}>
                <div className={`rounded-2xl px-4 py-3 ${turn.role === "operator" ? "bg-primary text-primary-foreground" : "bg-muted"}`}><p className="whitespace-pre-wrap text-sm leading-6">{turn.content}</p></div>
                {turn.role === "calyx" && missions[turn.message_id] ? <details className="mt-2 rounded-xl border bg-background px-4 py-3"><summary className="cursor-pointer text-sm font-medium">Research details · mission {missions[turn.message_id].mission_id}</summary><MissionResult mission={missions[turn.message_id]} /></details> : null}
                {turn.role === "calyx" && turn.metadata?.provider ? <p className="mt-1 text-xs text-muted-foreground">Server reply · {String(turn.metadata.provider)} · {String(turn.metadata.model ?? "model not reported")}</p> : null}
              </article>
            ))}
            {submitting ? <div className="mr-auto rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">Calyx is working…</div> : null}
          </div>
          <form className="border-t p-4" onSubmit={submit}>
            <label className="sr-only" htmlFor="calyx-message">Message Calyx</label>
            <textarea className="min-h-24 w-full resize-y rounded-xl border bg-background px-4 py-3" id="calyx-message" maxLength={5000} onChange={(event) => setMessage(event.target.value)} placeholder="Message Calyx…" value={message} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Conversation settings</summary><label className="mt-2 block font-medium" htmlFor="calyx-project">Research project ID</label><input className="mt-1 w-72 max-w-full rounded-md border bg-background px-3 py-2 text-foreground" id="calyx-project" maxLength={200} onChange={(event) => setProjectId(event.target.value)} value={projectId} /></details><button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50" disabled={submitting || !message.trim()} type="submit">{submitting ? "Working…" : "Send"}</button></div>
            {conversationError ? <p className="mt-3 text-sm text-destructive" role="alert">{conversationError}</p> : null}
          </form>
        </section>

        {loading ? <p className="text-sm text-muted-foreground">Loading Calyx systems…</p> : null}
        {snapshot.errors.length ? <section className="rounded-xl border p-4"><h2 className="font-semibold">Degraded connections</h2><ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{snapshot.errors.map((error) => <li key={error}>{error}</li>)}</ul></section> : null}
        <section className="grid gap-4 md:grid-cols-3"><article className="rounded-xl border p-5"><h2 className="font-semibold">Platform capabilities</h2><p className="mt-2 text-sm text-muted-foreground">{snapshot.capabilities ? "Canonical capability contract available." : "Capability service unavailable."}</p></article><article className="rounded-xl border p-5"><h2 className="font-semibold">Conversation persistence</h2><p className="mt-2 text-sm text-muted-foreground">{conversation?.persistence_mode ? `${conversation.persistence_mode} conversation state reported by the backend.` : "A server thread will be created when you send the first message."}</p></article><article className="rounded-xl border p-5"><h2 className="font-semibold">Durable orchestrator</h2><p className="mt-2 text-sm text-muted-foreground">{snapshot.orchestratorState === "available" ? "Authenticated orchestrator status available." : snapshot.orchestratorState === "authentication_required" ? "Owner authentication is required." : "Orchestrator status unavailable."}</p></article></section>
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"><Link className="rounded-xl border p-5 hover:bg-muted" to="/relationship-matrix"><h2 className="font-semibold">Relationship Matrix</h2></Link><Link className="rounded-xl border p-5 hover:bg-muted" to="/orchid-identification"><h2 className="font-semibold">Orchid Identification</h2></Link><Link className="rounded-xl border p-5 hover:bg-muted" to="/continuum-next"><h2 className="font-semibold">Homepage Intelligence</h2></Link><Link className="rounded-xl border p-5 hover:bg-muted" to="/university"><h2 className="font-semibold">Orchid University</h2></Link></section>
        <section className="rounded-xl border p-5"><h2 className="font-semibold">Governance</h2><p className="mt-2 text-sm text-muted-foreground">Conversation can retrieve and reason, but does not automatically publish scientific knowledge, promote Candidate Knowledge, change taxonomy, or mutate the Knowledge Graph.</p></section>
      </div>
    </main>
  );
}
