import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useCalyxSpeechInput } from "@/hooks/useCalyxSpeechInput";
import { useCalyxSpeechOutput } from "@/hooks/useCalyxSpeechOutput";
import {
  DEFAULT_PROJECT_ID,
  STORAGE_KEY,
  formatUploadedFileSize,
  normalizeProjectId,
  renderCalyxRichText,
  shouldReuseConversation,
} from "@/lib/calyxConversation";
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

function CalyxMessageContent({ content }: { content: string }) {
  return (
    <div
      className="calyx-prose text-sm leading-6"
      dangerouslySetInnerHTML={{ __html: renderCalyxRichText(content) }}
    />
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
  const [authRequired, setAuthRequired] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedAttachmentIndex, setSelectedAttachmentIndex] = useState<number | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<string | null>(null);

  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const conversationIdRef = useRef<string | null>(null);
  const activeProjectIdRef = useRef(DEFAULT_PROJECT_ID);

  const { speak, cancel: cancelSpeech, supported: ttsSupported } = useCalyxSpeechOutput();
  const { state: micState, interimTranscript, error: speechInputError, startListening, stopListening } =
    useCalyxSpeechInput(
      useCallback((transcript: string) => {
        setMessage((current) => (current ? `${current} ${transcript}`.trim() : transcript));
      }, []),
    );

  const normalizedProjectId = normalizeProjectId(projectId);
  const projectMismatch = Boolean(conversation && !shouldReuseConversation(conversation, normalizedProjectId));
  const messages = conversation ? visibleMessages(conversation.messages) : [];
  const latestMission = useMemo(() => {
    const calyxMessages = conversation?.messages.filter((item) => item.role === "calyx") ?? [];
    for (let index = calyxMessages.length - 1; index >= 0; index -= 1) {
      const mission = missions[calyxMessages[index].message_id];
      if (mission) return mission;
    }
    return null;
  }, [conversation?.messages, missions]);
  const selectedAttachment =
    selectedAttachmentIndex === null ? null : uploadedFiles[selectedAttachmentIndex] ?? null;
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    activeProjectIdRef.current = normalizedProjectId;
  }, [normalizedProjectId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelSpeech();
      stopListening();
    };
  }, [cancelSpeech, stopListening]);

  useEffect(() => {
    let active = true;
    const restoreRequestId = requestIdRef.current;

    const restore = async () => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as {
          conversationId?: string;
          projectId?: string;
          speakReplies?: boolean;
        };

        if (stored.projectId) setProjectId(stored.projectId);
        if (typeof stored.speakReplies === "boolean") setSpeakReplies(stored.speakReplies);

        if (stored.conversationId) {
          const restored = await getCalyxConversation(stored.conversationId);
          if (
            active &&
            mountedRef.current &&
            requestIdRef.current === restoreRequestId &&
            (!stored.projectId || shouldReuseConversation(restored, stored.projectId))
          ) {
            setConversation(restored);
            conversationIdRef.current = restored.conversation_id;
            if (!stored.projectId && restored.project_id) setProjectId(restored.project_id);
          } else if (
            active &&
            mountedRef.current &&
            requestIdRef.current === restoreRequestId &&
            stored.projectId
          ) {
            setWorkspaceStatus(
              `A saved CALYX thread for another project was skipped so project ${normalizeProjectId(stored.projectId)} stays clean.`,
            );
          }
        }
      } catch {
        if (active && mountedRef.current && requestIdRef.current === restoreRequestId) {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }

      try {
        const value = await loadCalyxWorkspace();
        if (active && mountedRef.current) setSnapshot(value);
      } finally {
        if (active && mountedRef.current) setLoading(false);
      }
    };

    void restore();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        conversationId: conversation?.conversation_id,
        projectId: normalizedProjectId,
        speakReplies,
      }),
    );
  }, [conversation?.conversation_id, normalizedProjectId, speakReplies]);

  useEffect(() => {
    if (!conversation) return;

    for (const item of conversation.messages) {
      if (item.role !== "calyx" || missions[item.message_id]) continue;
      const missionId = typeof item.metadata?.mission_id === "string" ? item.metadata.mission_id : null;
      if (!missionId) continue;

      void getBrainMission(missionId)
        .then((mission) => {
          if (!mountedRef.current) return;
          setMissions((current) => ({ ...current, [item.message_id]: mission }));
        })
        .catch(() => undefined);
    }
  }, [conversation, missions]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages, submitting, workspaceStatus]);

  useEffect(() => {
    if (!selectedAttachment) {
      setPreviewUrl(null);
      return;
    }

    if (!(selectedAttachment.type === "application/pdf" || selectedAttachment.type.startsWith("image/"))) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedAttachment);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedAttachment]);

  function isActiveLifecycleRequest(requestId: number, targetProjectId: string) {
    return (
      mountedRef.current &&
      requestIdRef.current === requestId &&
      activeProjectIdRef.current === targetProjectId
    );
  }

  async function ensureConversation(
    activeProjectId: string,
    requestId: number,
  ): Promise<CalyxConversation | null> {
    if (shouldReuseConversation(conversation, activeProjectId)) return conversation as CalyxConversation;

    const created = await createCalyxConversation({
      title: "Speak with Calyx",
      project_id: activeProjectId,
      context: {
        surface: "orchid-continuum-frontend",
        project_id: activeProjectId,
      },
    });

    if (!isActiveLifecycleRequest(requestId, activeProjectId)) return null;

    if (conversation && !shouldReuseConversation(conversation, activeProjectId)) {
      setMissions({});
      setWorkspaceStatus(`Started a clean CALYX thread for project ${activeProjectId}.`);
    } else {
      setWorkspaceStatus(null);
    }

    setConversation(created);
    conversationIdRef.current = created.conversation_id;
    return created;
  }

  function isCurrentRequest(
    requestId: number,
    targetConversationId: string | null,
    targetProjectId: string,
  ) {
    return (
      mountedRef.current &&
      requestIdRef.current === requestId &&
      conversationIdRef.current === targetConversationId &&
      activeProjectIdRef.current === targetProjectId
    );
  }

  async function sendMessage() {
    const text = message.trim();
    if (!text || submitting) return;

    const activeProjectId = normalizeProjectId(projectId);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setSubmitting(true);
    setConversationError(null);
    setAuthRequired(false);
    setWorkspaceStatus(null);
    setMessage("");
    cancelSpeech();

    let targetConversationId: string | null = null;

    try {
      const thread = await ensureConversation(activeProjectId, requestId);
      if (!thread) return;
      targetConversationId = thread.conversation_id;

      const result = await sendCalyxTurn(thread.conversation_id, {
        message: text,
        project_id: activeProjectId,
        research_mode: "auto",
        retrieval_limit: 8,
      });

      if (!isCurrentRequest(requestId, targetConversationId, activeProjectId)) return;

      if (result.research.mission) {
        setMissions((current) => ({
          ...current,
          [result.calyx_message.message_id]: result.research.mission as BrainMission,
        }));
      }

      const refreshed = await getCalyxConversation(thread.conversation_id);
      if (!isCurrentRequest(requestId, targetConversationId, activeProjectId)) return;

      setConversation(refreshed);
      conversationIdRef.current = refreshed.conversation_id;

      if (speakReplies && result.answer) speak(result.answer);
    } catch (error) {
      if (!isActiveLifecycleRequest(requestId, activeProjectId)) {
        return;
      }

      const isAuth = error instanceof CalyxApiError && error.kind === "authentication_required";
      const detail = error instanceof CalyxApiError ? error.message : "Calyx could not complete that turn.";
      setAuthRequired(isAuth);
      setConversationError(detail);
    } finally {
      if (mountedRef.current && requestIdRef.current === requestId) setSubmitting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage();
  }

  function newConversation() {
    requestIdRef.current += 1;
    cancelSpeech();
    stopListening();
    conversationIdRef.current = null;
    setConversation(null);
    setMissions({});
    setMessage("");
    setConversationError(null);
    setAuthRequired(false);
    setWorkspaceStatus(null);
    setSubmitting(false);
    setUploadedFiles([]);
    setSelectedAttachmentIndex(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (files.length) {
      setUploadedFiles((current) => {
        const next = [...current, ...files];
        if (selectedAttachmentIndex === null) setSelectedAttachmentIndex(current.length);
        return next;
      });
      setWorkspaceStatus(
        "Files are attached locally. Canonical backend still needs a CALYX file upload and paper retrieval contract for authenticated ingestion.",
      );
    }

    event.target.value = "";
  }

  function removeFile(index: number) {
    setUploadedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
    setSelectedAttachmentIndex((current) => {
      if (current === null) return null;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
  }

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2"><p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Calyx Workspace</p><h1 className="text-4xl font-semibold">Speak with Calyx</h1><p className="max-w-3xl text-muted-foreground">A server-owned conversation with the Orchid Continuum Brain. Calyx decides when a turn needs governed retrieval or a scientific mission; the browser no longer authors its answers.</p></div>
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={newConversation} type="button">New conversation</button>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <section className="rounded-xl border bg-card">
            <div className="max-h-[62vh] min-h-80 space-y-5 overflow-y-auto p-5" aria-live="polite">
              {!messages.length ? <div className="mx-auto max-w-2xl py-14 text-center"><h2 className="text-2xl font-semibold">What would you like to work on?</h2><p className="mt-3 text-sm text-muted-foreground">Try “What do you need Calyx Vision to be able to see and understand?” and continue naturally with follow-up questions.</p></div> : messages.map((turn) => (
                <article className={`max-w-4xl ${turn.role === "operator" ? "ml-auto" : "mr-auto"}`} key={turn.message_id}>
                  <div className={`rounded-2xl px-4 py-3 ${turn.role === "operator" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {turn.role === "calyx" ? <CalyxMessageContent content={turn.content} /> : <p className="whitespace-pre-wrap text-sm leading-6">{turn.content}</p>}
                  </div>
                  {turn.role === "calyx" && missions[turn.message_id] ? <details className="mt-2 rounded-xl border bg-background px-4 py-3"><summary className="cursor-pointer text-sm font-medium">Research details · mission {missions[turn.message_id].mission_id}</summary><MissionResult mission={missions[turn.message_id]} /></details> : null}
                  {turn.role === "calyx" && turn.metadata?.provider ? <p className="mt-1 text-xs text-muted-foreground">Server reply · {String(turn.metadata.provider)} · {String(turn.metadata.model ?? "model not reported")}</p> : null}
                </article>
              ))}
              {submitting ? <div className="mr-auto rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">Calyx is working…</div> : null}
              <div ref={scrollAnchorRef} />
            </div>
            <form className="border-t p-4" onSubmit={submit}>
              {interimTranscript ? <p className="mb-2 text-xs italic text-muted-foreground">{interimTranscript}…</p> : null}
              <label className="sr-only" htmlFor="calyx-message">Message Calyx</label>
              <textarea className="min-h-24 w-full resize-y rounded-xl border bg-background px-4 py-3" id="calyx-message" maxLength={5000} onChange={(event) => setMessage(event.target.value)} onKeyDown={handleKeyDown} placeholder="Message Calyx… (Ctrl+Enter to send)" value={message} />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Conversation settings</summary>
                    <label className="mt-2 block font-medium" htmlFor="calyx-project">Research project ID</label>
                    <input className="mt-1 w-72 max-w-full rounded-md border bg-background px-3 py-2 text-foreground" id="calyx-project" maxLength={200} onChange={(event) => setProjectId(event.target.value)} value={projectId} />
                  </details>
                  {micState !== "unsupported" ? <button aria-label={micState === "listening" ? "Stop voice input" : "Start voice input"} className={`rounded-full border px-3 py-1 text-xs transition-colors ${micState === "listening" ? "border-destructive bg-destructive/10 text-destructive" : "hover:bg-muted"}`} onClick={micState === "listening" ? stopListening : startListening} type="button">{micState === "listening" ? "⏹ Stop" : "🎤 Voice"}</button> : <span className="text-xs text-muted-foreground">Voice input unavailable in this browser.</span>}
                  <button className="rounded-full border px-3 py-1 text-xs hover:bg-muted" onClick={() => fileInputRef.current?.click()} type="button">📎 Attach</button>
                  <input accept="application/pdf,image/*,.csv,.tsv,.txt,.md,.json" aria-hidden className="sr-only" multiple onChange={handleFileChange} ref={fileInputRef} tabIndex={-1} type="file" />
                  {ttsSupported ? <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"><input checked={speakReplies} className="h-3 w-3" onChange={(event) => { setSpeakReplies(event.target.checked); if (!event.target.checked) cancelSpeech(); }} type="checkbox" />Speak replies</label> : <span className="text-xs text-muted-foreground">Spoken replies unavailable in this browser.</span>}
                </div>
                <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50" disabled={submitting || !message.trim()} type="submit">{submitting ? "Working…" : projectMismatch ? "Start new project thread" : "Send"}</button>
              </div>
              {projectMismatch ? <p className="mt-3 text-xs text-muted-foreground">The visible thread belongs to project <strong>{normalizeProjectId(conversation?.project_id)}</strong>. Sending now starts a clean CALYX thread for <strong>{normalizedProjectId}</strong>.</p> : null}
              {speechInputError ? <p className="mt-3 text-sm text-destructive" role="alert">{speechInputError}</p> : null}
              {conversationError ? (
                <p className="mt-3 text-sm text-destructive" role="alert">
                  {conversationError}
                  {authRequired ? <> · <Link className="underline" to="/mission-control">Sign in at Mission Control</Link></> : null}
                </p>
              ) : null}
            </form>
          </section>

          <aside className="space-y-4">
            <section className="rounded-xl border bg-card p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Scientific workspace</p>
              <h2 className="mt-2 text-2xl font-semibold">Conversation context</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Project</dt><dd className="text-right font-medium">{normalizedProjectId}</dd></div>
                <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Conversation</dt><dd className="text-right font-medium">{conversation?.conversation_id ?? "Not started yet"}</dd></div>
                <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Persistence</dt><dd className="text-right font-medium">{conversation?.persistence_mode ?? "Will be created on first turn"}</dd></div>
                <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">Latest mission</dt><dd className="text-right font-medium">{latestMission ? latestMission.current_stage.replaceAll("_", " ") : "No research mission yet"}</dd></div>
              </dl>
              {workspaceStatus ? <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{workspaceStatus}</p> : null}
            </section>

            <section className="rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Papers and files</p>
                  <h2 className="mt-2 text-2xl font-semibold">Local workspace</h2>
                </div>
                <span className="rounded-full border px-2 py-1 text-[11px] text-muted-foreground">{uploadedFiles.length} file{uploadedFiles.length === 1 ? "" : "s"}</span>
              </div>
              {uploadedFiles.length ? <ul className="mt-4 space-y-3">{uploadedFiles.map((file, index) => (
                <li className={`rounded-xl border p-3 ${selectedAttachmentIndex === index ? "border-primary bg-primary/5" : ""}`} key={`${file.name}-${file.size}-${index}`}>
                  <div className="flex items-start justify-between gap-3">
                    <button className="min-w-0 flex-1 text-left" onClick={() => setSelectedAttachmentIndex(index)} type="button">
                      <p className="truncate font-medium">{file.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatUploadedFileSize(file.size)} · {file.type || "Unknown type"}</p>
                    </button>
                    <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => removeFile(index)} type="button">Remove</button>
                  </div>
                </li>
              ))}</ul> : <p className="mt-4 text-sm text-muted-foreground">Attach a PDF, image, or dataset file to keep it visible beside the conversation tonight. Server-side ingestion is blocked until the canonical file contract exists.</p>}
            </section>

            <section className="rounded-xl border bg-card p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Preview</p>
              <h2 className="mt-2 text-2xl font-semibold">Scientific viewer</h2>
              {!selectedAttachment ? <p className="mt-4 text-sm text-muted-foreground">Select an attached paper or image to keep it visible while you talk to CALYX.</p> : previewUrl && selectedAttachment.type === "application/pdf" ? <iframe className="mt-4 h-[28rem] w-full rounded-lg border bg-background" src={previewUrl} title={selectedAttachment.name} /> : previewUrl && selectedAttachment.type.startsWith("image/") ? <img alt={selectedAttachment.name} className="mt-4 max-h-[28rem] w-full rounded-lg border object-contain" src={previewUrl} /> : <p className="mt-4 text-sm text-muted-foreground">Preview is available tonight for PDFs and images. Other file types stay attached locally until the backend provides canonical upload and rendering support.</p>}
            </section>
          </aside>
        </div>

        {loading ? <p className="text-sm text-muted-foreground">Loading Calyx systems…</p> : null}
        {snapshot.errors.length ? <section className="rounded-xl border p-4"><h2 className="font-semibold">Degraded connections</h2><ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{snapshot.errors.map((error) => <li key={error}>{error}</li>)}</ul></section> : null}
        <section className="grid gap-4 md:grid-cols-3"><article className="rounded-xl border p-5"><h2 className="font-semibold">Platform capabilities</h2><p className="mt-2 text-sm text-muted-foreground">{snapshot.capabilities ? "Canonical capability contract available." : "Capability service unavailable."}</p></article><article className="rounded-xl border p-5"><h2 className="font-semibold">Conversation persistence</h2><p className="mt-2 text-sm text-muted-foreground">{conversation?.persistence_mode ? `${conversation.persistence_mode} conversation state reported by the backend.` : "A server thread will be created when you send the first message."}</p></article><article className="rounded-xl border p-5"><h2 className="font-semibold">Durable orchestrator</h2><p className="mt-2 text-sm text-muted-foreground">{snapshot.orchestratorState === "available" ? "Authenticated orchestrator status available." : snapshot.orchestratorState === "authentication_required" ? <><Link className="underline" to="/mission-control">Sign in at Mission Control</Link> to enable the durable orchestrator.</> : "Orchestrator status unavailable."}</p></article></section>
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"><Link className="rounded-xl border p-5 hover:bg-muted" to="/relationship-matrix"><h2 className="font-semibold">Relationship Matrix</h2></Link><Link className="rounded-xl border p-5 hover:bg-muted" to="/orchid-identification"><h2 className="font-semibold">Orchid Identification</h2></Link><Link className="rounded-xl border p-5 hover:bg-muted" to="/continuum-next"><h2 className="font-semibold">Homepage Intelligence</h2></Link><Link className="rounded-xl border p-5 hover:bg-muted" to="/university"><h2 className="font-semibold">Orchid University</h2></Link></section>
        <section className="rounded-xl border p-5"><h2 className="font-semibold">Governance</h2><p className="mt-2 text-sm text-muted-foreground">Conversation can retrieve and reason, but does not automatically publish scientific knowledge, promote Candidate Knowledge, change taxonomy, or mutate the Knowledge Graph.</p></section>
      </div>
    </main>
  );
}
