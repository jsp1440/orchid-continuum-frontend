import { marked } from "marked";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";

import { useCalyxSpeechInput } from "@/hooks/useCalyxSpeechInput";
import { useCalyxSpeechOutput } from "@/hooks/useCalyxSpeechOutput";
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

// Configure marked for safe, simple rendering.
marked.setOptions({ gfm: true, breaks: true });

const emptySnapshot: CalyxWorkspaceSnapshot = {
  capabilities: null,
  homepage: null,
  orchestrator: null,
  orchestratorState: "unavailable",
  errors: [],
};

const STORAGE_KEY = "orchid-continuum:calyx-speak:v2";
const DEFAULT_PROJECT_ID = "calyx-speak";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EvidenceList({
  title,
  items,
}: {
  title: string;
  items: MissionEvidence[];
}) {
  return (
    <section className="rounded-xl border p-5">
      <h3 className="font-semibold">
        {title} ({items.length})
      </h3>
      {items.length ? (
        <ul className="mt-3 space-y-3">
          {items.map((item, index) => (
            <li
              className="rounded-lg bg-muted p-3 text-sm"
              key={`${String(item.candidate_id ?? "evidence")}-${index}`}
            >
              <p className="font-medium">
                {String(item.subject ?? "Source-backed claim")}
                {item.predicate ? ` · ${String(item.predicate)}` : ""}
              </p>
              {item.value !== undefined && item.value !== null ? (
                <p className="mt-1 text-muted-foreground">
                  {String(item.value)}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                Revision {String(item.source_revision_id ?? "not supplied")} ·
                anchors{" "}
                {item.source_anchor_ids?.map(String).join(", ") ||
                  "not supplied"}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          No evidence was returned in this category.
        </p>
      )}
    </section>
  );
}

function SourceList({ items }: { items: MissionSource[] }) {
  return (
    <section className="rounded-xl border p-5">
      <h3 className="font-semibold">
        Retrieved canonical sources ({items.length})
      </h3>
      {items.length ? (
        <ul className="mt-3 space-y-3">
          {items.map((item, index) => (
            <li
              className="rounded-lg bg-muted p-3 text-sm"
              key={item.result_id ?? `source-${index}`}
            >
              <p className="font-medium">
                {item.title || item.object_type || "Canonical source"}
              </p>
              {item.authorized_excerpt ? (
                <blockquote className="mt-2 border-l-2 pl-3 text-muted-foreground">
                  {item.authorized_excerpt}
                </blockquote>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                Revision{" "}
                {String(item.citation?.revision_id ?? "not supplied")} ·
                anchors{" "}
                {item.citation?.source_anchor_ids?.map(String).join(", ") ||
                  "not supplied"}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          No display-authorized canonical sources were returned.
        </p>
      )}
    </section>
  );
}

function MissionResult({ mission }: { mission: BrainMission }) {
  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Mission state
          </p>
          <h3 className="text-lg font-semibold">
            {mission.state.replaceAll("_", " ")}
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Stage: {mission.current_stage.replaceAll("_", " ")}
        </p>
      </div>
      <SourceList items={mission.sources} />
      <div className="grid gap-4 md:grid-cols-2">
        <EvidenceList
          title="Supporting evidence"
          items={mission.supporting_evidence}
        />
        <EvidenceList
          title="Contradicting evidence"
          items={mission.contradicting_evidence}
        />
      </div>
      <section className="rounded-xl border p-5">
        <h3 className="font-semibold">Evidence gaps</h3>
        {mission.missing_evidence.length ? (
          <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
            {mission.missing_evidence.map((gap, index) => (
              <li key={`${gap}-${index}`}>{gap}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No additional gaps were reported.
          </p>
        )}
      </section>
      <section className="rounded-xl border p-5">
        <h3 className="font-semibold">Governance</h3>
        <p className="mt-2 text-sm">
          Review: {mission.review_status.replaceAll("_", " ")}
        </p>
        <p className="text-sm">Automatic publication: never</p>
        <p className="text-sm">
          Publication eligible:{" "}
          {mission.publication_eligibility.eligible ? "yes" : "no"}
        </p>
      </section>
    </div>
  );
}

/** Render a Calyx message as sanitised markdown HTML. */
function CalyxMessageContent({ content }: { content: string }) {
  const html =
    typeof marked.parse === "function"
      ? (marked.parse(content) as string)
      : content;
  return (
    <div
      className="calyx-prose text-sm leading-6"
        dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function visibleMessages(messages: CalyxServerMessage[]) {
  return messages.filter(
    (m) => m.role === "operator" || m.role === "calyx",
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CalyxWorkspace() {
  const [snapshot, setSnapshot] = useState<CalyxWorkspaceSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [projectId, setProjectId] = useState(DEFAULT_PROJECT_ID);
  const [conversation, setConversation] = useState<CalyxConversation | null>(null);
  const [missions, setMissions] = useState<Record<string, BrainMission>>({});
  const [submitting, setSubmitting] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { speak, cancel: cancelSpeech, supported: ttsSupported } =
    useCalyxSpeechOutput();

  const handleSpeechResult = useCallback(
    (transcript: string) => {
      setMessage((prev) => (prev ? `${prev} ${transcript}` : transcript));
    },
    [],
  );

  const { state: micState, interimTranscript, startListening, stopListening } =
    useCalyxSpeechInput(handleSpeechResult);

  // -------------------------------------------------------------------------
  // Initialisation — restore from localStorage, then load workspace status.
  // -------------------------------------------------------------------------
  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        const stored = JSON.parse(
          window.localStorage.getItem(STORAGE_KEY) || "{}",
        ) as { conversationId?: string; projectId?: string; speakReplies?: boolean };
        if (stored.projectId) setProjectId(stored.projectId);
        if (stored.speakReplies !== undefined) setSpeakReplies(stored.speakReplies);
        if (stored.conversationId) {
          const restored = await getCalyxConversation(stored.conversationId);
          if (active) {
            setConversation(restored);
            conversationIdRef.current = restored.conversation_id;
          }
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
      const value = await loadCalyxWorkspace();
      if (active) {
        setSnapshot(value);
        setLoading(false);
      }
    };
    void restore();
    return () => {
      active = false;
    };
  }, []);

  // Persist settings whenever they change.
  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        conversationId: conversation?.conversation_id,
        projectId,
        speakReplies,
      }),
    );
  }, [conversation?.conversation_id, projectId, speakReplies]);

  // Load mission details for any Calyx message that carries a mission_id.
  useEffect(() => {
    if (!conversation) return;
    for (const item of conversation.messages) {
      if (item.role !== "calyx" || missions[item.message_id]) continue;
      const missionId =
        typeof item.metadata?.mission_id === "string"
          ? item.metadata.mission_id
          : null;
      if (!missionId) continue;
      void getBrainMission(missionId)
        .then((mission) =>
          setMissions((current) => ({
            ...current,
            [item.message_id]: mission,
          })),
        )
        .catch(() => undefined);
    }
  }, [conversation, missions]);

  // Auto-scroll to the bottom whenever messages change.
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages, submitting]);

  // -------------------------------------------------------------------------
  // Core conversation actions
  // -------------------------------------------------------------------------

  async function ensureConversation(): Promise<CalyxConversation> {
    if (conversation) return conversation;
    const created = await createCalyxConversation({
      title: "Speak with Calyx",
      project_id: projectId.trim() || DEFAULT_PROJECT_ID,
      context: { surface: "orchid-continuum-frontend" },
    });
    setConversation(created);
    conversationIdRef.current = created.conversation_id;
    return created;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage();
  }

  async function sendMessage() {
    const text = message.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setConversationError(null);
    setMessage("");
    cancelSpeech();

    // Track conversation ID so we can guard against stale lifecycle updates.
    let targetConversationId: string | null = null;
    try {
      const thread = await ensureConversation();
      targetConversationId = thread.conversation_id;

      const result = await sendCalyxTurn(thread.conversation_id, {
        message: text,
        project_id: projectId.trim() || DEFAULT_PROJECT_ID,
        research_mode: "auto",
        retrieval_limit: 8,
      });

      // Guard: discard if the user already started a new conversation.
      if (conversationIdRef.current !== targetConversationId) return;

      if (result.research.mission) {
        setMissions((current) => ({
          ...current,
          [result.calyx_message.message_id]: result.research.mission as BrainMission,
        }));
      }

      const refreshed = await getCalyxConversation(thread.conversation_id);
      if (conversationIdRef.current !== targetConversationId) return;
      setConversation(refreshed);

      // Speak the reply if the user has opted in.
      if (speakReplies && result.answer) {
        speak(result.answer);
      }
    } catch (error) {
      if (conversationIdRef.current !== targetConversationId) return;
      const detail =
        error instanceof CalyxApiError
          ? error.message
          : "Calyx could not complete that turn.";
      setConversationError(detail);
    } finally {
      setSubmitting(false);
    }
  }

  function newConversation() {
    cancelSpeech();
    stopListening();
    conversationIdRef.current = null;
    setConversation(null);
    setMissions({});
    setMessage("");
    setConversationError(null);
    setUploadedFiles([]);
    window.localStorage.removeItem(STORAGE_KEY);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl+Enter or Cmd+Enter submits without requiring the button.
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length) {
      setUploadedFiles((prev) => [...prev, ...files]);
    }
    // Reset so the same file can be re-selected.
    event.target.value = "";
  }

  function removeFile(index: number) {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const messages = conversation ? visibleMessages(conversation.messages) : [];

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Calyx Workspace
            </p>
            <h1 className="text-4xl font-semibold">Speak with Calyx</h1>
            <p className="max-w-3xl text-muted-foreground">
              A server-owned conversation with the Orchid Continuum Brain. Calyx
              decides when a turn needs governed retrieval or a scientific
              mission; the browser no longer authors its answers.
            </p>
          </div>
          <button
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
            onClick={newConversation}
            type="button"
          >
            New conversation
          </button>
        </header>

        {/* Conversation panel */}
        <section className="rounded-xl border bg-card">
          {/* Message list */}
          <div
            aria-live="polite"
            className="max-h-[62vh] min-h-80 space-y-5 overflow-y-auto p-5"
          >
            {!messages.length ? (
              <div className="mx-auto max-w-2xl py-14 text-center">
                <h2 className="text-2xl font-semibold">
                  What would you like to work on?
                </h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Try &ldquo;What do you need Calyx Vision to be able to see and
                  understand?&rdquo; and continue naturally with follow-up
                  questions.
                </p>
              </div>
            ) : (
              messages.map((turn) => (
                <article
                  className={`max-w-4xl ${turn.role === "operator" ? "ml-auto" : "mr-auto"}`}
                  key={turn.message_id}
                >
                  <div
                    className={`rounded-2xl px-4 py-3 ${turn.role === "operator" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                  >
                    {turn.role === "calyx" ? (
                      <CalyxMessageContent content={turn.content} />
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-6">
                        {turn.content}
                      </p>
                    )}
                  </div>
                  {turn.role === "calyx" && missions[turn.message_id] ? (
                    <details className="mt-2 rounded-xl border bg-background px-4 py-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        Research details · mission{" "}
                        {missions[turn.message_id].mission_id}
                      </summary>
                      <MissionResult mission={missions[turn.message_id]} />
                    </details>
                  ) : null}
                  {turn.role === "calyx" && turn.metadata?.provider ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Server reply · {String(turn.metadata.provider)} ·{" "}
                      {String(turn.metadata.model ?? "model not reported")}
                    </p>
                  ) : null}
                </article>
              ))
            )}

            {submitting ? (
              <div className="mr-auto rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
                Calyx is working…
              </div>
            ) : null}

            {/* Scroll anchor */}
            <div ref={scrollAnchorRef} />
          </div>

          {/* Input form */}
          <form className="border-t p-4" onSubmit={submit}>
            {/* Uploaded files list */}
            {uploadedFiles.length > 0 ? (
              <ul className="mb-3 flex flex-wrap gap-2">
                {uploadedFiles.map((file, index) => (
                  <li
                    className="flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-xs"
                    key={`${file.name}-${index}`}
                  >
                    <span className="max-w-[140px] truncate">{file.name}</span>
                    <button
                      aria-label={`Remove ${file.name}`}
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      onClick={() => removeFile(index)}
                      type="button"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <label className="sr-only" htmlFor="calyx-message">
              Message Calyx
            </label>

            {/* Interim voice transcript preview */}
            {interimTranscript ? (
              <p className="mb-2 text-xs italic text-muted-foreground">
                {interimTranscript}…
              </p>
            ) : null}

            <textarea
              className="min-h-24 w-full resize-y rounded-xl border bg-background px-4 py-3"
              id="calyx-message"
              maxLength={5000}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Calyx… (Ctrl+Enter to send)"
              value={message}
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              {/* Left side: settings + voice controls */}
              <div className="flex flex-wrap items-center gap-3">
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">
                    Conversation settings
                  </summary>
                  <label
                    className="mt-2 block font-medium"
                    htmlFor="calyx-project"
                  >
                    Research project ID
                  </label>
                  <input
                    className="mt-1 w-72 max-w-full rounded-md border bg-background px-3 py-2 text-foreground"
                    id="calyx-project"
                    maxLength={200}
                    onChange={(event) => setProjectId(event.target.value)}
                    value={projectId}
                  />
                </details>

                {/* Microphone button */}
                {micState !== "unsupported" ? (
                  <button
                    aria-label={
                      micState === "listening"
                        ? "Stop listening"
                        : "Start voice input"
                    }
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      micState === "listening"
                        ? "border-destructive bg-destructive/10 text-destructive"
                        : "hover:bg-muted"
                    }`}
                    onClick={
                      micState === "listening" ? stopListening : startListening
                    }
                    type="button"
                  >
                    {micState === "listening" ? "⏹ Stop" : "🎤 Voice"}
                  </button>
                ) : null}

                {/* Attach file button */}
                <button
                  aria-label="Attach file"
                  className="rounded-full border px-3 py-1 text-xs hover:bg-muted"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  📎 Attach
                </button>
                <input
                  accept="*/*"
                  aria-hidden
                  className="sr-only"
                  multiple
                  onChange={handleFileChange}
                  ref={fileInputRef}
                  tabIndex={-1}
                  type="file"
                />

                {/* Spoken replies toggle */}
                {ttsSupported ? (
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <input
                      checked={speakReplies}
                      className="h-3 w-3"
                      onChange={(e) => {
                        setSpeakReplies(e.target.checked);
                        if (!e.target.checked) cancelSpeech();
                      }}
                      type="checkbox"
                    />
                    Speak replies
                  </label>
                ) : null}
              </div>

              {/* Send button */}
              <button
                className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
                disabled={submitting || !message.trim()}
                type="submit"
              >
                {submitting ? "Working…" : "Send"}
              </button>
            </div>

            {conversationError ? (
              <p
                className="mt-3 text-sm text-destructive"
                role="alert"
              >
                {conversationError}
              </p>
            ) : null}
          </form>
        </section>

        {/* Workspace status */}
        {loading ? (
          <p className="text-sm text-muted-foreground">
            Loading Calyx systems…
          </p>
        ) : null}
        {snapshot.errors.length ? (
          <section className="rounded-xl border p-4">
            <h2 className="font-semibold">Degraded connections</h2>
            <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
              {snapshot.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border p-5">
            <h2 className="font-semibold">Platform capabilities</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {snapshot.capabilities
                ? "Canonical capability contract available."
                : "Capability service unavailable."}
            </p>
          </article>
          <article className="rounded-xl border p-5">
            <h2 className="font-semibold">Conversation persistence</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {conversation?.persistence_mode
                ? `${conversation.persistence_mode} conversation state reported by the backend.`
                : "A server thread will be created when you send the first message."}
            </p>
          </article>
          <article className="rounded-xl border p-5">
            <h2 className="font-semibold">Durable orchestrator</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {snapshot.orchestratorState === "available"
                ? "Authenticated orchestrator status available."
                : snapshot.orchestratorState === "authentication_required"
                  ? "Owner authentication is required."
                  : "Orchestrator status unavailable."}
            </p>
          </article>
        </section>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Link
            className="rounded-xl border p-5 hover:bg-muted"
            to="/relationship-matrix"
          >
            <h2 className="font-semibold">Relationship Matrix</h2>
          </Link>
          <Link
            className="rounded-xl border p-5 hover:bg-muted"
            to="/orchid-identification"
          >
            <h2 className="font-semibold">Orchid Identification</h2>
          </Link>
          <Link
            className="rounded-xl border p-5 hover:bg-muted"
            to="/continuum-next"
          >
            <h2 className="font-semibold">Homepage Intelligence</h2>
          </Link>
          <Link
            className="rounded-xl border p-5 hover:bg-muted"
            to="/university"
          >
            <h2 className="font-semibold">Orchid University</h2>
          </Link>
        </section>

        <section className="rounded-xl border p-5">
          <h2 className="font-semibold">Governance</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Conversation can retrieve and reason, but does not automatically
            publish scientific knowledge, promote Candidate Knowledge, change
            taxonomy, or mutate the Knowledge Graph.
          </p>
        </section>
      </div>
    </main>
  );
}
