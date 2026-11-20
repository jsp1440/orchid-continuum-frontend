// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadCalyxWorkspace: vi.fn(async () => ({
    capabilities: null,
    homepage: null,
    orchestrator: null,
    orchestratorState: "unavailable" as const,
    errors: [],
  })),
  createCalyxConversation: vi.fn(),
  getCalyxConversation: vi.fn(),
  listCalyxConversations: vi.fn(async () => ({ conversations: [], persistence_mode: "memory" })),
  sendCalyxTurn: vi.fn(),
  getBrainMission: vi.fn(),
  pushTranscript: (_text: string) => undefined,
  speechInputState: "unsupported" as "unsupported" | "idle" | "listening",
  startListening: vi.fn(),
  stopListening: vi.fn(),
}));

vi.mock("@/hooks/useCalyxSpeechInput", () => ({
  useCalyxSpeechInput: (onResult: (transcript: string) => void) => {
    mocks.pushTranscript = onResult;
    return {
      state: mocks.speechInputState,
      interimTranscript: "",
      error: null,
      startListening: mocks.startListening,
      stopListening: mocks.stopListening,
    };
  },
}));

vi.mock("@/hooks/useCalyxSpeechOutput", () => ({
  useCalyxSpeechOutput: () => ({
    speak: vi.fn(),
    cancel: vi.fn(),
    supported: false,
  }),
}));

vi.mock("@/lib/calyxWorkspace", async () => {
  const actual = await vi.importActual<typeof import("@/lib/calyxWorkspace")>(
    "@/lib/calyxWorkspace",
  );
  return {
    ...actual,
    loadCalyxWorkspace: mocks.loadCalyxWorkspace,
    createCalyxConversation: mocks.createCalyxConversation,
    getCalyxConversation: mocks.getCalyxConversation,
    listCalyxConversations: mocks.listCalyxConversations,
    sendCalyxTurn: mocks.sendCalyxTurn,
    getBrainMission: mocks.getBrainMission,
  };
});

import AtlasAwareCalyxRoute from "@/components/calyx/AtlasAwareCalyxRoute";
import { atlasChecklistCalyxHref } from "@/features/atlas-next/calyxHandoff";
import { STORAGE_KEY } from "@/lib/calyxConversation";
import { CalyxApiError } from "@/lib/calyxWorkspace";
import CalyxWorkspace from "./CalyxWorkspace";

type ConversationMessage = {
  message_id: string;
  conversation_id: string;
  role: "operator" | "calyx";
  content: string;
  created_at: string;
  metadata?: Record<string, unknown>;
};

type ConversationFixture = {
  conversation_id: string;
  project_id: string;
  created_at: string;
  updated_at: string;
  messages: ConversationMessage[];
  persistence_mode: string;
};

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function buildConversation(
  conversationId: string,
  messages: ConversationMessage[] = [],
): ConversationFixture {
  return {
    conversation_id: conversationId,
    project_id: "calyx-speak",
    created_at: "2026-08-10T00:00:00Z",
    updated_at: "2026-08-10T00:00:01Z",
    messages,
    persistence_mode: "postgres",
  };
}

function buildTurnResult(conversationId: string, answer = "Done.", workspaceOutputs: unknown[] = []) {
  return {
    conversation_id: conversationId,
    operator_message: {
      message_id: `${conversationId}-operator`,
      conversation_id: conversationId,
      role: "operator" as const,
      content: "Question",
      created_at: "2026-08-10T00:00:02Z",
    },
    calyx_message: {
      message_id: `${conversationId}-calyx`,
      conversation_id: conversationId,
      role: "calyx" as const,
      content: answer,
      created_at: "2026-08-10T00:00:03Z",
    },
    answer,
    workspace_outputs: workspaceOutputs,
    provider: {
      name: "deterministic-governed",
      model: "calyx-governed-summary-v1",
      request_hash: "hash",
    },
    research: { casual: false, mission: null, mission_error: null, retrieval: {} },
    persistence_mode: "postgres",
    epistemic_policy: { continuum_first: true },
  };
}

function storedWorkspace() {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as {
    conversationId?: string;
    projectId?: string;
    speakReplies?: boolean;
  };
}

async function flush(times = 1) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function getContextValue(container: HTMLElement, label: string) {
  const entry = Array.from(container.querySelectorAll("dl > div")).find(
    (item) => item.querySelector("dt")?.textContent === label,
  );
  const value = entry?.querySelector("dd")?.textContent?.trim();
  if (!value) throw new Error(`Missing context value for ${label}`);
  return value;
}

function getButton(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.trim().includes(text),
  );
  if (!button) throw new Error(`Missing button ${text}`);
  return button;
}

function setInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("CalyxWorkspace conversation lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.createCalyxConversation.mockReset();
    mocks.getCalyxConversation.mockReset();
    mocks.listCalyxConversations.mockReset();
    mocks.sendCalyxTurn.mockReset();
    mocks.getBrainMission.mockReset();
    mocks.listCalyxConversations.mockResolvedValue({ conversations: [], persistence_mode: "memory" });
    mocks.loadCalyxWorkspace.mockClear();
    mocks.speechInputState = "unsupported";
    mocks.startListening.mockReset();
    // The real hook returns true only when it actually created a recognizer.
    mocks.startListening.mockReturnValue(true);
    mocks.stopListening.mockReset();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("opens the checklist question in the editable composer and waits for Send", async () => {
    const question = "Which checklist supports this name?";
    const href = atlasChecklistCalyxHref(question)!;
    await act(async () => {
      root.render(<MemoryRouter initialEntries={[href]}><AtlasAwareCalyxRoute /></MemoryRouter>);
    });
    const composer = container.querySelector<HTMLTextAreaElement>("#calyx-message")!;
    expect(composer.value).toBe(question);
    expect(composer.readOnly).toBe(false);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
    expect(mocks.createCalyxConversation).not.toHaveBeenCalled();
    expect(mocks.sendCalyxTurn).not.toHaveBeenCalled();
  });

  it("keeps the reset UI clean when new conversation interrupts a pending create", async () => {
    const createOperation = deferred<ConversationFixture>();
    mocks.createCalyxConversation.mockReturnValue(createOperation.promise);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <CalyxWorkspace />
        </MemoryRouter>,
      );
    });
    await flush(2);

    await act(async () => {
      mocks.pushTranscript("What should Calyx study?");
    });

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush(2);

    expect(mocks.createCalyxConversation).toHaveBeenCalledTimes(1);

    await act(async () => {
      getButton(container, "New conversation").click();
    });
    await flush(2);

    createOperation.resolve(buildConversation("created-conversation"));
    await flush(3);

    expect(getContextValue(container, "Conversation")).toBe("Not started yet");
    expect(container.textContent).not.toContain("created-conversation");
    expect((container.querySelector("#calyx-message") as HTMLTextAreaElement).value).toBe("");
    expect(mocks.sendCalyxTurn).not.toHaveBeenCalled();
    expect(storedWorkspace()).not.toHaveProperty("conversationId");
  });

  it("keeps the reset UI clean when new conversation interrupts a pending restore", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        conversationId: "saved-conversation",
        projectId: "calyx-speak",
        speakReplies: false,
      }),
    );
    const restoreOperation = deferred<ConversationFixture>();
    mocks.getCalyxConversation.mockReturnValue(restoreOperation.promise);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <CalyxWorkspace />
        </MemoryRouter>,
      );
    });
    await flush(2);

    await act(async () => {
      getButton(container, "New conversation").click();
    });
    await flush(2);

    restoreOperation.resolve(
      buildConversation("saved-conversation", [
        {
          message_id: "operator-1",
          conversation_id: "saved-conversation",
          role: "operator",
          content: "saved question",
          created_at: "2026-08-10T00:00:02Z",
        },
      ]),
    );
    await flush(3);

    expect(getContextValue(container, "Conversation")).toBe("Not started yet");
    expect(container.textContent).not.toContain("saved question");
    expect(storedWorkspace()).not.toHaveProperty("conversationId");
  });

  it("creates and refreshes a conversation normally when no reset occurs", async () => {
    const createdConversation = buildConversation("new-conversation");
    const refreshedConversation = buildConversation("new-conversation", [
      {
        message_id: "operator-1",
        conversation_id: "new-conversation",
        role: "operator",
        content: "What should Calyx study?",
        created_at: "2026-08-10T00:00:02Z",
      },
      {
        message_id: "calyx-1",
        conversation_id: "new-conversation",
        role: "calyx",
        content: "Study orchid resilience signals.",
        created_at: "2026-08-10T00:00:03Z",
        metadata: { provider: "deterministic-governed", model: "calyx-governed-summary-v1" },
      },
    ]);

    mocks.createCalyxConversation.mockResolvedValue(createdConversation);
    mocks.sendCalyxTurn.mockResolvedValue({
      conversation_id: "new-conversation",
      operator_message: refreshedConversation.messages[0],
      calyx_message: refreshedConversation.messages[1],
      answer: "Study orchid resilience signals.",
      provider: { name: "deterministic-governed", model: "calyx-governed-summary-v1", request_hash: "hash" },
      research: { casual: false, mission: null, mission_error: null, retrieval: {} },
      persistence_mode: "postgres",
      epistemic_policy: { continuum_first: true },
    });
    mocks.getCalyxConversation.mockResolvedValue(refreshedConversation);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <CalyxWorkspace />
        </MemoryRouter>,
      );
    });
    await flush(2);

    await act(async () => {
      mocks.pushTranscript("What should Calyx study?");
    });

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush(4);

    expect(mocks.createCalyxConversation).toHaveBeenCalledWith({
      title: "Speak with Calyx",
      project_id: "calyx-speak",
      context: {
        surface: "orchid-continuum-frontend",
        project_id: "calyx-speak",
        workspace: {
          attachment_count: 0,
          attachments: [],
          selected_attachment: undefined,
          draft_document_context: undefined,
        },
      },
    });
    expect(mocks.sendCalyxTurn).toHaveBeenCalledWith("new-conversation", {
      message: "What should Calyx study?",
      project_id: "calyx-speak",
      context: {
        surface: "orchid-continuum-frontend",
        project_id: "calyx-speak",
        workspace: {
          attachment_count: 0,
          attachments: [],
          selected_attachment: undefined,
          draft_document_context: undefined,
        },
      },
      research_mode: "auto",
      retrieval_limit: 20,
    });
    expect(getContextValue(container, "Conversation")).toBe("new-conversation");
    expect(container.textContent).toContain("Study orchid resilience signals.");
    expect(storedWorkspace().conversationId).toBe("new-conversation");
  });

  it("renders validated server workspace outputs with provenance and clears them for a new thread", async () => {
    mocks.createCalyxConversation.mockResolvedValue(buildConversation("rich-thread"));
    mocks.sendCalyxTurn.mockResolvedValue(
      buildTurnResult("rich-thread", "Here are the retrieved sources.", [
        {
          id: "sources-output",
          kind: "table",
          title: "Retrieved canonical sources",
          subtitle: "1 source",
          provenance: {
            source_module: "brain_mission",
            source_id: "mission-1",
            generated: false,
            evidence_status: "evidence",
          },
          payload: {
            columns: [{ key: "title", label: "Title" }],
            rows: [{ title: "Orchid mycorrhizal symbiosis review" }],
          },
          created_at: "2026-08-10T00:00:03Z",
        },
        {
          id: "invalid-output",
          kind: "table",
          title: "Invalid output must not render",
          provenance: { source_module: "brain_mission", evidence_status: "unknown" },
          payload: { columns: [], rows: [] },
          created_at: "2026-08-10T00:00:03Z",
        },
      ]),
    );
    mocks.getCalyxConversation.mockResolvedValue(
      buildConversation("rich-thread", [
        {
          message_id: "rich-thread-operator",
          conversation_id: "rich-thread",
          role: "operator",
          content: "Find papers about mycorrhizal symbiosis",
          created_at: "2026-08-10T00:00:02Z",
        },
        {
          message_id: "rich-thread-calyx",
          conversation_id: "rich-thread",
          role: "calyx",
          content: "Here are the retrieved sources.",
          created_at: "2026-08-10T00:00:03Z",
        },
      ]),
    );

    await act(async () => {
      root.render(
        <MemoryRouter>
          <CalyxWorkspace />
        </MemoryRouter>,
      );
    });
    await flush(2);

    await act(async () => {
      mocks.pushTranscript("Find papers about mycorrhizal symbiosis");
    });
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush(4);

    expect(container.textContent).toContain("Retrieved canonical sources");
    expect(container.textContent).toContain("Orchid mycorrhizal symbiosis review");
    expect(container.textContent).toContain("evidence");
    expect(container.textContent).toContain("mission-1");
    expect(container.textContent).not.toContain("Invalid output must not render");

    await act(async () => {
      getButton(container, "New conversation").click();
    });
    expect(container.textContent).not.toContain("Retrieved canonical sources");
    expect(container.textContent).not.toContain("Orchid mycorrhizal symbiosis review");
  });

  it("restores a saved conversation normally when no reset occurs", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        conversationId: "saved-conversation",
        projectId: "calyx-speak",
        speakReplies: false,
      }),
    );
    mocks.getCalyxConversation.mockResolvedValue(
      buildConversation("saved-conversation", [
        {
          message_id: "operator-1",
          conversation_id: "saved-conversation",
          role: "operator",
          content: "saved question",
          created_at: "2026-08-10T00:00:02Z",
        },
        {
          message_id: "calyx-1",
          conversation_id: "saved-conversation",
          role: "calyx",
          content: "saved answer",
          created_at: "2026-08-10T00:00:03Z",
        },
      ]),
    );

    await act(async () => {
      root.render(
        <MemoryRouter>
          <CalyxWorkspace />
        </MemoryRouter>,
      );
    });
    await flush(3);

    expect(getContextValue(container, "Conversation")).toBe("saved-conversation");
    expect(container.textContent).toContain("saved answer");
    expect(storedWorkspace().conversationId).toBe("saved-conversation");
  });

  it("ignores a conversation load that resolves after the project changes", async () => {
    const loadOperation = deferred<ConversationFixture>();
    mocks.listCalyxConversations.mockResolvedValue({
      conversations: [{
        conversation_id: "late-conversation",
        title: "Late conversation",
        created_at: "2026-08-10T00:00:00Z",
      }],
      persistence_mode: "postgres",
    });
    mocks.getCalyxConversation.mockReturnValue(loadOperation.promise);

    await act(async () => {
      root.render(<MemoryRouter><CalyxWorkspace /></MemoryRouter>);
    });
    await flush(2);
    await act(async () => {
      getButton(container, "Late conversation").click();
    });

    const projectInput = container.querySelector("#calyx-project") as HTMLInputElement;
    await act(async () => {
      const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setInputValue?.call(projectInput, "new-project");
      projectInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    loadOperation.resolve(buildConversation("late-conversation"));
    await flush(3);

    expect(projectInput.value).toBe("new-project");
    expect(getContextValue(container, "Conversation")).toBe("Not started yet");
    expect(container.textContent).not.toContain("Loading conversation…");
  });

  it("restores the user message to the textarea when the Calyx turn fails", async () => {
    const createdConversation = buildConversation("net-error-conversation");
    mocks.createCalyxConversation.mockResolvedValue(createdConversation);
    mocks.sendCalyxTurn.mockRejectedValue(new TypeError("Failed to fetch"));

    await act(async () => {
      root.render(
        <MemoryRouter>
          <CalyxWorkspace />
        </MemoryRouter>,
      );
    });
    await flush(2);

    await act(async () => {
      mocks.pushTranscript("What does Calyx know about mycorrhizal networks?");
    });

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush(4);

    const textarea = container.querySelector("#calyx-message") as HTMLTextAreaElement;
    expect(textarea.value).toBe("What does Calyx know about mycorrhizal networks?");
    expect(container.textContent).toContain("Calyx could not complete that turn.");
  });

  it("does not automatically resend an uncertain turn and requires acknowledgement before retry", async () => {
    vi.useFakeTimers();
    mocks.createCalyxConversation.mockResolvedValue(buildConversation("retry-thread"));
    mocks.sendCalyxTurn
      .mockRejectedValueOnce(new CalyxApiError("network_error", "Backend asleep"))
      .mockResolvedValueOnce(buildTurnResult("retry-thread", "Recovered answer"));
    mocks.getCalyxConversation.mockResolvedValue(
      buildConversation("retry-thread", [
        {
          message_id: "operator-1",
          conversation_id: "retry-thread",
          role: "operator",
          content: "Wake up please",
          created_at: "2026-08-10T00:00:02Z",
        },
        {
          message_id: "calyx-1",
          conversation_id: "retry-thread",
          role: "calyx",
          content: "Recovered answer",
          created_at: "2026-08-10T00:00:03Z",
        },
      ]),
    );

    await act(async () => {
      root.render(
        <MemoryRouter>
          <CalyxWorkspace />
        </MemoryRouter>,
      );
    });
    await flush(2);

    await act(async () => {
      mocks.pushTranscript("Wake up please");
    });

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush(4);

    expect(container.textContent).toContain("The connection may have dropped after CALYX completed the turn");
    expect(container.textContent).toContain("Check conversation history");
    expect(mocks.sendCalyxTurn).toHaveBeenCalledTimes(1);
    expect((getButton(container, "Send") as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(21_000);
    });
    expect(mocks.sendCalyxTurn).toHaveBeenCalledTimes(1);

    await act(async () => {
      mocks.pushTranscript("Edited draft");
    });
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(mocks.sendCalyxTurn).toHaveBeenCalledTimes(1);

    const retryButton = getButton(container, "Retry after checking history") as HTMLButtonElement;
    expect(retryButton.disabled).toBe(true);
    const retryConfirmation = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      retryConfirmation.click();
    });
    expect(retryButton.disabled).toBe(false);

    await act(async () => {
      retryButton.click();
    });
    await flush(4);

    expect(mocks.createCalyxConversation).toHaveBeenCalledTimes(1);
    expect(mocks.sendCalyxTurn).toHaveBeenCalledTimes(2);
    expect(mocks.sendCalyxTurn.mock.calls[1]).toEqual(mocks.sendCalyxTurn.mock.calls[0]);
    expect((container.querySelector("#calyx-message") as HTMLTextAreaElement).value).toContain("Edited draft");
    expect(container.textContent).toContain("Recovered answer");
  });

  it("does not restore a committed message when the post-turn refresh fails", async () => {
    const createdConversation = buildConversation("refresh-error-conversation");
    const operatorMessage: ConversationMessage = {
      message_id: "operator-committed",
      conversation_id: "refresh-error-conversation",
      role: "operator",
      content: "Committed question",
      created_at: "2026-08-10T00:00:02Z",
    };
    const calyxMessage: ConversationMessage = {
      message_id: "calyx-committed",
      conversation_id: "refresh-error-conversation",
      role: "calyx",
      content: "Committed answer",
      created_at: "2026-08-10T00:00:03Z",
    };

    mocks.createCalyxConversation.mockResolvedValue(createdConversation);
    mocks.sendCalyxTurn.mockResolvedValue({
      conversation_id: "refresh-error-conversation",
      operator_message: operatorMessage,
      calyx_message: calyxMessage,
      answer: "Committed answer",
      provider: { name: "deterministic-governed", model: "calyx-governed-summary-v1", request_hash: "hash" },
      research: { casual: false, mission: null, mission_error: null, retrieval: {} },
      persistence_mode: "postgres",
      epistemic_policy: { continuum_first: true },
    });
    mocks.getCalyxConversation.mockRejectedValue(new TypeError("refresh failed"));

    await act(async () => {
      root.render(
        <MemoryRouter>
          <CalyxWorkspace />
        </MemoryRouter>,
      );
    });
    await flush(2);

    await act(async () => {
      mocks.pushTranscript("Committed question");
    });

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush(4);

    const textarea = container.querySelector("#calyx-message") as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
    expect(container.textContent).toContain("CALYX completed the turn, but the conversation could not be refreshed.");
    expect(container.textContent).toContain("same turn is not sent twice");
    expect(mocks.sendCalyxTurn).toHaveBeenCalledTimes(1);
  });

  it("prevents duplicate submissions in the same event loop", async () => {
    const sendOperation = deferred<{
      conversation_id: string;
      operator_message: ConversationMessage;
      calyx_message: ConversationMessage;
      answer: string;
      provider: { name: string; model: string; request_hash: string };
      research: { casual: boolean; mission: null; mission_error: null; retrieval: Record<string, unknown> };
      persistence_mode: string;
      epistemic_policy: { continuum_first: boolean };
    }>();
    mocks.createCalyxConversation.mockResolvedValue(buildConversation("dedupe-thread"));
    mocks.sendCalyxTurn.mockReturnValue(sendOperation.promise);
    mocks.getCalyxConversation.mockResolvedValue(buildConversation("dedupe-thread"));

    await act(async () => {
      root.render(
        <MemoryRouter>
          <CalyxWorkspace />
        </MemoryRouter>,
      );
    });
    await flush(2);

    await act(async () => {
      mocks.pushTranscript("Deduplicate this turn");
    });

    await act(async () => {
      const form = container.querySelector("form");
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush(2);

    expect(mocks.createCalyxConversation).toHaveBeenCalledTimes(1);
    expect(mocks.sendCalyxTurn).toHaveBeenCalledTimes(1);

    sendOperation.resolve({
      conversation_id: "dedupe-thread",
      operator_message: {
        message_id: "operator-1",
        conversation_id: "dedupe-thread",
        role: "operator",
        content: "Deduplicate this turn",
        created_at: "2026-08-10T00:00:02Z",
      },
      calyx_message: {
        message_id: "calyx-1",
        conversation_id: "dedupe-thread",
        role: "calyx",
        content: "Done.",
        created_at: "2026-08-10T00:00:03Z",
      },
      answer: "Done.",
      provider: { name: "deterministic-governed", model: "calyx-governed-summary-v1", request_hash: "hash" },
      research: { casual: false, mission: null, mission_error: null, retrieval: {} },
      persistence_mode: "postgres",
      epistemic_policy: { continuum_first: true },
    });
    await flush(4);
  });

  it("clears prior-project files and drafts and ignores late voice input after a project switch", async () => {
    mocks.speechInputState = "idle";
    mocks.createCalyxConversation.mockResolvedValue({
      ...buildConversation("field-study-thread"),
      project_id: "field-study",
    });
    mocks.sendCalyxTurn.mockResolvedValue(buildTurnResult("field-study-thread", "New project answer"));
    mocks.getCalyxConversation.mockResolvedValue({
      ...buildConversation("field-study-thread", [
        {
          message_id: "field-study-operator",
          conversation_id: "field-study-thread",
          role: "operator",
          content: "New project question",
          created_at: "2026-08-10T00:00:02Z",
        },
        {
          message_id: "field-study-calyx",
          conversation_id: "field-study-thread",
          role: "calyx",
          content: "New project answer",
          created_at: "2026-08-10T00:00:03Z",
        },
      ]),
      project_id: "field-study",
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <CalyxWorkspace />
        </MemoryRouter>,
      );
    });
    await flush(2);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [new File(["private notes"], "previous-project.txt", { type: "text/plain" })],
    });
    await act(async () => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush(2);
    expect(container.textContent).toContain("previous-project.txt");

    const textarea = container.querySelector("#calyx-message") as HTMLTextAreaElement;
    await act(async () => {
      setInputValue(textarea, "Draft that belongs to the previous project");
      getButton(container, "Voice").click();
    });

    const projectInput = container.querySelector("#calyx-project") as HTMLInputElement;
    await act(async () => {
      setInputValue(projectInput, "field-study");
    });
    await flush(2);

    expect(textarea.value).toBe("");
    expect(container.textContent).not.toContain("previous-project.txt");
    expect(container.textContent).toContain("local files, excerpts, and the unsent draft were cleared");
    expect(mocks.stopListening).toHaveBeenCalled();

    await act(async () => {
      mocks.pushTranscript("Late speech from the previous project");
    });
    expect(textarea.value).toBe("");

    await act(async () => {
      setInputValue(textarea, "New project question");
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush(5);

    expect(mocks.createCalyxConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "field-study",
        context: expect.objectContaining({
          project_id: "field-study",
          workspace: expect.objectContaining({
            attachment_count: 0,
            attachments: [],
            selected_attachment: undefined,
            draft_document_context: undefined,
          }),
        }),
      }),
    );
    expect(mocks.sendCalyxTurn).toHaveBeenCalledWith(
      "field-study-thread",
      expect.objectContaining({
        message: "New project question",
        project_id: "field-study",
        context: expect.objectContaining({
          workspace: expect.objectContaining({ attachment_count: 0, attachments: [] }),
        }),
      }),
    );
    expect(container.textContent).toContain("New project answer");
  });

  it("stops active speech input before starting the network turn, in addition to speech output", async () => {
    mocks.speechInputState = "listening";
    const sendOperation = deferred<ReturnType<typeof buildTurnResult>>();
    mocks.createCalyxConversation.mockResolvedValue(buildConversation("stop-listening-thread"));
    mocks.sendCalyxTurn.mockReturnValue(sendOperation.promise);
    mocks.getCalyxConversation.mockResolvedValue(buildConversation("stop-listening-thread"));

    await act(async () => {
      root.render(
        <MemoryRouter>
          <CalyxWorkspace />
        </MemoryRouter>,
      );
    });
    await flush(2);

    await act(async () => {
      mocks.pushTranscript("Stop listening before sending");
    });

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush(2);

    expect(mocks.stopListening).toHaveBeenCalled();

    sendOperation.resolve(buildTurnResult("stop-listening-thread"));
    await flush(4);
  });

  it("freezes context-mutating controls while a turn is in flight, but leaves an active microphone stoppable", async () => {
    mocks.speechInputState = "listening";
    const sendOperation = deferred<ReturnType<typeof buildTurnResult>>();
    mocks.createCalyxConversation.mockResolvedValue(buildConversation("frozen-thread"));
    mocks.sendCalyxTurn.mockReturnValue(sendOperation.promise);
    mocks.getCalyxConversation.mockResolvedValue(buildConversation("frozen-thread"));

    await act(async () => {
      root.render(
        <MemoryRouter>
          <CalyxWorkspace />
        </MemoryRouter>,
      );
    });
    await flush(2);

    await act(async () => {
      mocks.pushTranscript("Freeze the controls");
    });

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush(2);

    const projectInput = container.querySelector("#calyx-project") as HTMLInputElement;
    expect(projectInput.disabled).toBe(true);

    const attachButton = getButton(container, "Attach");
    expect(attachButton.disabled).toBe(true);

    const refreshButton = getButton(container, "Refresh");
    expect(refreshButton.disabled).toBe(true);

    // The microphone was already listening - it must still be stoppable even
    // while every other context-mutating control is frozen for this turn.
    const stopButton = getButton(container, "Stop");
    expect(stopButton.disabled).toBe(false);

    sendOperation.resolve(buildTurnResult("frozen-thread"));
    await flush(4);

    expect(projectInput.disabled).toBe(false);
    expect(attachButton.disabled).toBe(false);
  });

  it("does not let an obsolete request release a newer submission lock", async () => {
    const firstTurn = deferred<ReturnType<typeof buildTurnResult>>();
    const secondTurn = deferred<ReturnType<typeof buildTurnResult>>();

    mocks.createCalyxConversation
      .mockResolvedValueOnce(buildConversation("first-thread"))
      .mockResolvedValueOnce(buildConversation("second-thread"));
    mocks.sendCalyxTurn
      .mockReturnValueOnce(firstTurn.promise)
      .mockReturnValueOnce(secondTurn.promise);
    mocks.getCalyxConversation.mockResolvedValue(buildConversation("second-thread"));

    await act(async () => {
      root.render(
        <MemoryRouter>
          <CalyxWorkspace />
        </MemoryRouter>,
      );
    });
    await flush(2);

    await act(async () => {
      mocks.pushTranscript("First pending turn");
    });
    await flush();
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush(2);
    expect(mocks.sendCalyxTurn).toHaveBeenCalledTimes(1);

    await act(async () => {
      getButton(container, "New conversation").click();
    });
    await flush();
    await act(async () => {
      mocks.pushTranscript("Second pending turn");
    });
    await flush();
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush(2);
    expect(mocks.sendCalyxTurn).toHaveBeenCalledTimes(2);

    firstTurn.resolve(buildTurnResult("first-thread", "Obsolete answer"));
    await flush(3);

    await act(async () => {
      mocks.pushTranscript("This must remain blocked");
    });
    await flush();
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush(2);
    expect(mocks.sendCalyxTurn).toHaveBeenCalledTimes(2);

    secondTurn.resolve(buildTurnResult("second-thread", "Current answer"));
    await flush(4);
  });

  it("loads a selected prior conversation from history", async () => {
    mocks.listCalyxConversations.mockResolvedValue({
      conversations: [
        {
          conversation_id: "history-thread",
          title: "Prior Vision Thread",
          created_at: "2026-08-10T00:00:00Z",
          message_count: 2,
        },
      ],
      persistence_mode: "postgres",
    });
    mocks.getCalyxConversation.mockResolvedValue(
      buildConversation("history-thread", [
        {
          message_id: "operator-1",
          conversation_id: "history-thread",
          role: "operator",
          content: "saved question",
          created_at: "2026-08-10T00:00:02Z",
        },
        {
          message_id: "calyx-1",
          conversation_id: "history-thread",
          role: "calyx",
          content: "saved answer",
          created_at: "2026-08-10T00:00:03Z",
        },
      ]),
    );

    await act(async () => {
      root.render(
        <MemoryRouter>
          <CalyxWorkspace />
        </MemoryRouter>,
      );
    });
    await flush(3);

    await act(async () => {
      getButton(container, "Prior Vision Thread").click();
    });
    await flush(3);

    expect(getContextValue(container, "Conversation")).toBe("history-thread");
    expect(container.textContent).toContain("saved answer");
    expect(storedWorkspace().conversationId).toBe("history-thread");
  });
  type MutableTurn = { conversation_id: string; operator_message: Record<string, unknown>; calyx_message: Record<string, unknown> };
  const invalidCommittedTurnCases: Array<{ name: string; mutate: (turn: MutableTurn) => void }> = [
    { name: "response for a different conversation", mutate: (t) => { t.conversation_id = "other-thread"; } },
    { name: "operator message for a different conversation", mutate: (t) => { t.operator_message.conversation_id = "other-thread"; } },
    { name: "Calyx message for a different conversation", mutate: (t) => { t.calyx_message.conversation_id = "other-thread"; } },
    { name: "operator message with the wrong role", mutate: (t) => { t.operator_message.role = "calyx"; } },
    { name: "Calyx message with the wrong role", mutate: (t) => { t.calyx_message.role = "operator"; } },
    { name: "two messages with the same server ID", mutate: (t) => { t.calyx_message.message_id = t.operator_message.message_id; } },
    { name: "an empty server message ID", mutate: (t) => { t.operator_message.message_id = "  "; } },
    { name: "a missing server message ID", mutate: (t) => { delete t.calyx_message.message_id; } },
    { name: "a non-string server message ID", mutate: (t) => { t.operator_message.message_id = 7; } },
  ];

  // Ported from the Copilot-owned #954 head 7963c312 (all-or-nothing committed-exchange rule),
  // with the committed question AND answer both asserted absent.
  it.each(invalidCommittedTurnCases)("COPILOT954: does not append a $name when the post-turn refresh fails", async ({ mutate }) => {
    const invalidTurn = JSON.parse(JSON.stringify(buildTurnResult("validated-thread", "Must not render"))) as MutableTurn;
    invalidTurn.operator_message.content = "Validate this server exchange";
    mutate(invalidTurn);
    mocks.createCalyxConversation.mockResolvedValue(buildConversation("validated-thread"));
    mocks.sendCalyxTurn.mockResolvedValue(invalidTurn);
    mocks.getCalyxConversation.mockRejectedValue(new TypeError("refresh failed"));
    await act(async () => { root.render(<MemoryRouter><CalyxWorkspace /></MemoryRouter>); });
    await flush(2);
    await act(async () => { mocks.pushTranscript("Validate this server exchange"); });
    await act(async () => { container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush(4);
    expect(container.textContent).not.toContain("Must not render");
    expect(container.textContent).not.toContain("Validate this server exchange");
    expect(container.querySelectorAll('[aria-live="polite"] article')).toHaveLength(0);
    expect(container.textContent).toContain("CALYX completed the turn, but the conversation could not be refreshed.");
    expect((container.querySelector("#calyx-message") as HTMLTextAreaElement).value).toBe("");
    expect(mocks.sendCalyxTurn).toHaveBeenCalledTimes(1);
  });

  it("does not attach workspace outputs to a CALYX message whose id already exists in the transcript", async () => {
    mocks.createCalyxConversation.mockResolvedValue(
      buildConversation("c1", [
        { message_id: "c1-calyx", conversation_id: "c1", role: "calyx", content: "Earlier answer", created_at: "2026-08-10T00:00:01Z" },
      ]),
    );
    mocks.sendCalyxTurn.mockResolvedValue(
      buildTurnResult("c1", "Replayed answer", [
        {
          id: "dup-output", kind: "text", title: "Output for a duplicate id",
          provenance: { source_module: "brain_mission", generated: false, evidence_status: "unknown" },
          payload: { body: "must not attach" }, created_at: "2026-08-10T00:00:03Z",
        },
      ]),
    );
    mocks.getCalyxConversation.mockRejectedValue(new TypeError("refresh failed"));
    await act(async () => { root.render(<MemoryRouter><CalyxWorkspace /></MemoryRouter>); });
    await flush(2);
    await act(async () => { mocks.pushTranscript("Question"); });
    await act(async () => { container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush(4);
    expect(container.textContent).toContain("Earlier answer");
    expect(container.textContent).not.toContain("Output for a duplicate id");
    expect(container.textContent).not.toContain("must not attach");
  });

  describe("committed turn stays visible when the transcript refresh fails", () => {
    type Overrides = {
      conversationId?: string;
      operator?: Record<string, unknown> | null;
      calyx?: Record<string, unknown> | null;
      top?: Record<string, unknown>;
    };

    function committedTurn(conversationId: string, overrides: Overrides = {}) {
      const base = buildTurnResult(conversationId, "Committed answer");
      return {
        ...base,
        operator_message:
          overrides.operator === null
            ? undefined
            : { ...base.operator_message, content: "Committed question", ...(overrides.operator ?? {}) },
        calyx_message:
          overrides.calyx === null
            ? undefined
            : { ...base.calyx_message, content: "Committed answer", ...(overrides.calyx ?? {}) },
        ...(overrides.top ?? {}),
      };
    }

    async function renderWorkspace() {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <CalyxWorkspace />
          </MemoryRouter>,
        );
      });
      await flush(2);
    }

    async function submitDraft(text: string) {
      await act(async () => {
        mocks.pushTranscript(text);
      });
      await act(async () => {
        container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      await flush(4);
    }

    function occurrences(haystack: string, needle: string) {
      return haystack.split(needle).length - 1;
    }

    function articleCount() {
      return container.querySelectorAll('[aria-live="polite"] article').length;
    }

    it("(a) keeps committed operator and CALYX messages visible when the refresh rejects", async () => {
      mocks.createCalyxConversation.mockResolvedValue(buildConversation("c1"));
      mocks.sendCalyxTurn.mockResolvedValue(committedTurn("c1"));
      mocks.getCalyxConversation.mockRejectedValue(new TypeError("refresh failed"));
      await renderWorkspace();
      await submitDraft("Committed question");

      expect(occurrences(container.textContent ?? "", "Committed question")).toBe(1);
      expect(occurrences(container.textContent ?? "", "Committed answer")).toBe(1);
      expect(articleCount()).toBe(2);
    });

    it("(b) does not restore the committed text to the draft or offer the retry confirmation", async () => {
      mocks.createCalyxConversation.mockResolvedValue(buildConversation("c1"));
      mocks.sendCalyxTurn.mockResolvedValue(committedTurn("c1"));
      mocks.getCalyxConversation.mockRejectedValue(new TypeError("refresh failed"));
      await renderWorkspace();
      await submitDraft("Committed question");

      expect((container.querySelector("#calyx-message") as HTMLTextAreaElement).value).toBe("");
      expect(container.textContent).toContain("CALYX completed the turn, but the conversation could not be refreshed.");
      expect(container.textContent).not.toContain("Retry after checking history");
      expect(container.querySelector('form input[type="checkbox"][class*="h-3"]:not([id])')).toBeNull();
      expect(mocks.sendCalyxTurn).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["result.conversation_id", { top: { conversation_id: "other-thread" } }],
      ["operator_message.conversation_id", { operator: { conversation_id: "other-thread" } }],
      ["calyx_message.conversation_id", { calyx: { conversation_id: "other-thread" } }],
    ] as Array<[string, Overrides]>)("(c) does not append an exchange whose %s differs from the active conversation", async (_label, overrides) => {
      mocks.createCalyxConversation.mockResolvedValue(buildConversation("c1"));
      mocks.sendCalyxTurn.mockResolvedValue(committedTurn("c1", overrides));
      mocks.getCalyxConversation.mockRejectedValue(new TypeError("refresh failed"));
      await renderWorkspace();
      await submitDraft("Committed question");

      expect(container.textContent).not.toContain("Committed answer");
      expect(articleCount()).toBe(0);
    });

    it("(d1) does not append a response that arrives after a new conversation was started", async () => {
      const turn = deferred<ReturnType<typeof committedTurn>>();
      mocks.createCalyxConversation.mockResolvedValue(buildConversation("c1"));
      mocks.sendCalyxTurn.mockReturnValue(turn.promise);
      mocks.getCalyxConversation.mockRejectedValue(new TypeError("refresh failed"));
      await renderWorkspace();
      await submitDraft("Committed question");

      await act(async () => {
        getButton(container, "New conversation").click();
      });
      turn.resolve(committedTurn("c1", { calyx: { content: "Late answer" } }));
      await flush(4);

      expect(container.textContent).not.toContain("Late answer");
      expect(articleCount()).toBe(0);
      expect(getContextValue(container, "Conversation")).toBe("Not started yet");
    });

    it("(d2) does not append a response that arrives after the project was switched", async () => {
      const turn = deferred<ReturnType<typeof committedTurn>>();
      mocks.createCalyxConversation.mockResolvedValue(buildConversation("c1"));
      mocks.sendCalyxTurn.mockReturnValue(turn.promise);
      mocks.getCalyxConversation.mockRejectedValue(new TypeError("refresh failed"));
      await renderWorkspace();
      await submitDraft("Committed question");

      await act(async () => {
        getButton(container, "New conversation").click();
      });
      await act(async () => {
        setInputValue(container.querySelector("#calyx-project") as HTMLInputElement, "other-project");
      });
      turn.resolve(committedTurn("c1", { calyx: { content: "Late answer" } }));
      await flush(4);

      expect(container.textContent).not.toContain("Late answer");
      expect(articleCount()).toBe(0);
    });

    it("(d3) does not append a response that arrives after another conversation was loaded", async () => {
      const turn = deferred<ReturnType<typeof committedTurn>>();
      mocks.listCalyxConversations.mockResolvedValue({
        conversations: [{ conversation_id: "other-thread", title: "Other thread", created_at: "2026-08-10T00:00:00Z", message_count: 1 }],
        persistence_mode: "postgres",
      });
      mocks.createCalyxConversation.mockResolvedValue(buildConversation("c1"));
      mocks.sendCalyxTurn.mockReturnValue(turn.promise);
      mocks.getCalyxConversation.mockImplementation(async (id: string) => {
        if (id === "other-thread") {
          return buildConversation("other-thread", [
            { message_id: "o-1", conversation_id: "other-thread", role: "operator", content: "Other thread question", created_at: "2026-08-10T00:00:02Z" },
          ]);
        }
        throw new TypeError("refresh failed");
      });
      await renderWorkspace();
      await submitDraft("Committed question");

      await act(async () => {
        getButton(container, "New conversation").click();
      });
      await flush(2);
      await act(async () => {
        getButton(container, "Other thread").click();
      });
      await flush(3);
      turn.resolve(committedTurn("c1", { calyx: { content: "Late answer" } }));
      await flush(4);

      expect(container.textContent).toContain("Other thread question");
      expect(container.textContent).not.toContain("Late answer");
      expect(getContextValue(container, "Conversation")).toBe("other-thread");
    });

    it("(e) does not duplicate messages whose ids already exist in the transcript", async () => {
      mocks.createCalyxConversation.mockResolvedValue(
        buildConversation("c1", [
          { message_id: "c1-operator", conversation_id: "c1", role: "operator", content: "Existing operator text", created_at: "2026-08-10T00:00:01Z" },
        ]),
      );
      mocks.sendCalyxTurn.mockResolvedValue(
        committedTurn("c1", { operator: { content: "Replayed operator text" } }),
      );
      mocks.getCalyxConversation.mockRejectedValue(new TypeError("refresh failed"));
      await renderWorkspace();
      await submitDraft("Committed question");

      expect(occurrences(container.textContent ?? "", "Existing operator text")).toBe(1);
      expect(container.textContent).not.toContain("Replayed operator text");
      expect(occurrences(container.textContent ?? "", "Committed answer")).toBe(1);
      expect(articleCount()).toBe(2);
    });

    it("(f) appends nothing when the exchange repeats a message id, and emits no duplicate React keys", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        mocks.createCalyxConversation.mockResolvedValue(buildConversation("c1"));
        mocks.sendCalyxTurn.mockResolvedValue(
          committedTurn("c1", {
            operator: { message_id: "same-id", content: "Same-id question" },
            calyx: { message_id: "same-id", content: "Same-id answer" },
          }),
        );
        mocks.getCalyxConversation.mockRejectedValue(new TypeError("refresh failed"));
        await renderWorkspace();
        await submitDraft("Same-id question");

        expect(container.textContent).not.toContain("Same-id question");
        expect(container.textContent).not.toContain("Same-id answer");
        expect(articleCount()).toBe(0);
        const keyWarnings = consoleError.mock.calls.filter((call) => String(call[0]).includes("same key"));
        expect(keyWarnings).toHaveLength(0);
      } finally {
        consoleError.mockRestore();
      }
    });

    it.each([
      ["blank operator id", { operator: { message_id: "   ", content: "Blank-id question" }, calyx: { content: "Blank-id answer" } }, ["Blank-id question", "Blank-id answer"]],
      ["empty calyx id", { operator: { content: "Empty-id question" }, calyx: { message_id: "", content: "Empty-id answer" } }, ["Empty-id question", "Empty-id answer"]],
      ["non-string operator id", { operator: { message_id: 7, content: "Numeric-id question" }, calyx: { content: "Numeric-id answer" } }, ["Numeric-id question", "Numeric-id answer"]],
    ] as Array<[string, Overrides, string[]]>)("(f2) appends nothing for an exchange with a %s", async (_label, overrides, texts) => {
      mocks.createCalyxConversation.mockResolvedValue(buildConversation("c1"));
      mocks.sendCalyxTurn.mockResolvedValue(committedTurn("c1", overrides));
      mocks.getCalyxConversation.mockRejectedValue(new TypeError("refresh failed"));
      await renderWorkspace();
      await submitDraft("Committed question");

      for (const text of texts) expect(container.textContent).not.toContain(text);
      expect(articleCount()).toBe(0);
    });

    it.each([
      ["operator role missing", { operator: { role: undefined }, calyx: { content: "Roleless exchange answer" } }, "Roleless exchange answer"],
      ["operator_message missing", { operator: null, calyx: { content: "Orphan answer" } }, "Orphan answer"],
      ["calyx_message missing", { calyx: null }, "Committed question"],
      ["calyx message_id missing", { calyx: { message_id: undefined, content: "Headless answer" } }, "Headless answer"],
    ] as Array<[string, Overrides, string]>)("(g) appends nothing and does not crash on a malformed turn response: %s", async (_label, overrides, forbiddenText) => {
      mocks.createCalyxConversation.mockResolvedValue(buildConversation("c1"));
      mocks.sendCalyxTurn.mockResolvedValue(committedTurn("c1", overrides));
      mocks.getCalyxConversation.mockRejectedValue(new TypeError("refresh failed"));
      await renderWorkspace();
      await submitDraft("Committed question");

      expect(container.textContent).not.toContain(forbiddenText);
      expect(container.textContent).not.toContain("Committed answer");
      expect(articleCount()).toBe(0);
      expect(container.querySelector("#calyx-message")).not.toBeNull();
    });

    it("(h) replaces the optimistic messages with the server transcript on a successful refresh, without duplicates", async () => {
      mocks.createCalyxConversation.mockResolvedValue(buildConversation("c1"));
      mocks.sendCalyxTurn.mockResolvedValue(
        committedTurn("c1", {
          operator: { content: "Optimistic question" },
          calyx: { content: "Optimistic answer" },
        }),
      );
      mocks.getCalyxConversation.mockResolvedValue(
        buildConversation("c1", [
          { message_id: "c1-operator", conversation_id: "c1", role: "operator", content: "Server question", created_at: "2026-08-10T00:00:02Z" },
          { message_id: "c1-calyx", conversation_id: "c1", role: "calyx", content: "Server answer", created_at: "2026-08-10T00:00:03Z" },
        ]),
      );
      await renderWorkspace();
      await submitDraft("Optimistic question");

      expect(container.textContent).not.toContain("Optimistic");
      expect(occurrences(container.textContent ?? "", "Server question")).toBe(1);
      expect(occurrences(container.textContent ?? "", "Server answer")).toBe(1);
      expect(articleCount()).toBe(2);
      expect(container.textContent).not.toContain("could not be refreshed");
    });
  });
  describe("combined behaviour across the merged PRs", () => {
    const tableOutput = (title: string) => ({
      id: `out-${title}`,
      kind: "table",
      title,
      provenance: { source_module: "brain_mission", source_id: "m-1", generated: false, evidence_status: "evidence" },
      payload: { columns: [{ key: "t", label: "T" }], rows: [{ t: "row" }] },
      created_at: "2026-08-10T00:00:03Z",
    });

    async function renderAndSend(text: string) {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <CalyxWorkspace />
          </MemoryRouter>,
        );
      });
      await flush(2);
      await act(async () => {
        mocks.pushTranscript(text);
      });
      await act(async () => {
        container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      await flush(4);
    }

    it("shows committed messages and their workspace outputs together when the transcript refresh fails", async () => {
      mocks.createCalyxConversation.mockResolvedValue(buildConversation("c1"));
      mocks.sendCalyxTurn.mockResolvedValue(buildTurnResult("c1", "Committed answer", [tableOutput("Committed output")]));
      mocks.getCalyxConversation.mockRejectedValue(new TypeError("refresh failed"));
      await renderAndSend("Question");

      expect(container.textContent).toContain("Committed answer");
      expect(container.textContent).toContain("Committed output");
      expect(container.textContent).toContain("could not be refreshed");
    });

    it("renders backend-shaped outputs whose subtitle and source_id are null", async () => {
      // speak_routes._workspace_outputs emits subtitle=None (evidence-gap text) and
      // source_id=None (external citations); the bus validator itself rejects null.
      mocks.createCalyxConversation.mockResolvedValue(buildConversation("c1"));
      mocks.sendCalyxTurn.mockResolvedValue(
        buildTurnResult("c1", "Answer with gaps", [
          {
            id: "c1-calyx:missing-evidence",
            kind: "text",
            title: "Evidence gaps for this turn",
            subtitle: null,
            provenance: { source_module: "brain_mission", source_id: null, generated: false, evidence_status: "unknown" },
            payload: { body: "- no pollinator records" },
            created_at: "2026-08-10T00:00:03Z",
          },
        ]),
      );
      mocks.getCalyxConversation.mockRejectedValue(new TypeError("refresh failed"));
      await renderAndSend("Question");

      expect(container.textContent).toContain("Evidence gaps for this turn");
      expect(container.textContent).toContain("no pollinator records");
    });

    it("does not render workspace outputs from a response that is no longer current", async () => {
      const turn = deferred<ReturnType<typeof buildTurnResult>>();
      mocks.createCalyxConversation.mockResolvedValue(buildConversation("c1"));
      mocks.sendCalyxTurn.mockReturnValue(turn.promise);
      mocks.getCalyxConversation.mockRejectedValue(new TypeError("refresh failed"));
      await renderAndSend("Question");
      await act(async () => {
        getButton(container, "New conversation").click();
      });
      turn.resolve(buildTurnResult("c1", "Late answer", [tableOutput("Late output")]));
      await flush(4);

      expect(container.textContent).not.toContain("Late output");
      expect(container.textContent).not.toContain("Late answer");
    });

    it("a project switch clears the pending retry confirmation and workspace outputs", async () => {
      mocks.createCalyxConversation.mockResolvedValue(buildConversation("c1"));
      mocks.sendCalyxTurn
        .mockResolvedValueOnce(buildTurnResult("c1", "First answer", [tableOutput("First output")]))
        .mockRejectedValueOnce(new CalyxApiError("network_error", "Backend asleep"));
      mocks.getCalyxConversation.mockResolvedValue(buildConversation("c1", [
        { message_id: "c1-operator", conversation_id: "c1", role: "operator", content: "Question", created_at: "2026-08-10T00:00:02Z" },
        { message_id: "c1-calyx", conversation_id: "c1", role: "calyx", content: "First answer", created_at: "2026-08-10T00:00:03Z" },
      ]));
      await renderAndSend("Question");
      expect(container.textContent).toContain("First output");

      await act(async () => {
        mocks.pushTranscript("Second question");
      });
      await act(async () => {
        container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      await flush(4);
      expect(container.textContent).toContain("Retry after checking history");
      await act(async () => {
        (container.querySelector('input[type="checkbox"][class*="h-3"]') as HTMLInputElement).click();
      });

      await act(async () => {
        setInputValue(container.querySelector("#calyx-project") as HTMLInputElement, "other-project");
      });
      await flush(2);

      expect(container.textContent).not.toContain("Retry after checking history");
      expect(container.textContent).not.toContain("First output");
      expect((container.querySelector("#calyx-message") as HTMLTextAreaElement).value).toBe("");
    });
  });
});
