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

function buildTurnResult(conversationId: string, answer = "Done.") {
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
    mocks.stopListening.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
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

  it("offers an immediate retry path during cold-start recovery", async () => {
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

    expect(container.textContent).toContain("Automatic retry in 20s.");
    expect(mocks.sendCalyxTurn).toHaveBeenCalledTimes(1);

    await act(async () => {
      getButton(container, "Retry now").click();
    });
    await flush(4);

    expect(mocks.createCalyxConversation).toHaveBeenCalledTimes(1);
    expect(mocks.sendCalyxTurn).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Recovered answer");
  });

  it("cancels a pending cold-start retry from the retry controls", async () => {
    vi.useFakeTimers();
    mocks.createCalyxConversation.mockResolvedValue(buildConversation("retry-cancel-thread"));
    mocks.sendCalyxTurn.mockRejectedValue(new CalyxApiError("network_error", "Backend asleep"));

    await act(async () => {
      root.render(
        <MemoryRouter>
          <CalyxWorkspace />
        </MemoryRouter>,
      );
    });
    await flush(2);

    await act(async () => {
      mocks.pushTranscript("Original retry message");
    });

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush(4);

    await act(async () => {
      getButton(container, "Cancel").click();
    });
    await flush(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(21_000);
    });
    await flush(2);

    expect(mocks.sendCalyxTurn).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("Automatic retry in");
    expect((container.querySelector("#calyx-message") as HTMLTextAreaElement).value).toBe(
      "Original retry message",
    );
    vi.useRealTimers();
  });

  it("shows the sign-in banner when the backend preflight signals authentication required", async () => {
    mocks.listCalyxConversations.mockRejectedValue(
      new CalyxApiError("authentication_required", "Owner authentication is required.", 401),
    );

    await act(async () => {
      root.render(
        <MemoryRouter>
          <CalyxWorkspace />
        </MemoryRouter>,
      );
    });
    await flush(3);

    expect(container.textContent).toContain("Owner sign-in required.");
    expect(container.textContent).toContain("Sign in at Mission Control");
  });

  it("clears the sign-in banner after a successful history refresh", async () => {
    mocks.listCalyxConversations
      .mockRejectedValueOnce(
        new CalyxApiError("authentication_required", "Owner authentication is required.", 401),
      )
      .mockResolvedValue({ conversations: [], persistence_mode: "memory" });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <CalyxWorkspace />
        </MemoryRouter>,
      );
    });
    await flush(3);

    expect(container.textContent).toContain("Owner sign-in required.");

    await act(async () => {
      getButton(container, "Refresh").click();
    });
    await flush(3);

    expect(container.textContent).not.toContain("Owner sign-in required.");
  });
});