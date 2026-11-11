// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The scientific evidence block in the Speak conversation view.
 *
 * The Calyx client is replaced here, as in `CalyxWorkspace.test.tsx`, so these
 * tests prove what the page does with a turn response, not that a backend
 * produced one. The responses are built from recorded backend output
 * (`calyxScientificEvidence.realBackend.json`, see its `_source`).
 */

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
}));

vi.mock("@/hooks/useCalyxSpeechInput", () => ({
  useCalyxSpeechInput: (onResult: (transcript: string) => void) => {
    mocks.pushTranscript = onResult;
    return { state: "unsupported", interimTranscript: "", error: null, startListening: vi.fn(), stopListening: vi.fn() };
  },
}));

vi.mock("@/hooks/useCalyxSpeechOutput", () => ({
  useCalyxSpeechOutput: () => ({ speak: vi.fn(), cancel: vi.fn(), supported: false }),
}));

vi.mock("@/lib/calyxWorkspace", async () => {
  const actual = await vi.importActual<typeof import("@/lib/calyxWorkspace")>("@/lib/calyxWorkspace");
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

import recorded from "@/lib/__fixtures__/calyxScientificEvidence.realBackend.json";
import { STORAGE_KEY } from "@/lib/calyxConversation";
import CalyxWorkspace from "./CalyxWorkspace";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });

const turns = recorded.turns;
const CONVERSATION_ID = "evidence-conversation";
const FIRST_SENTENCE = turns.available.scientific_evidence.reading[0];

type RecordedTurn = { question: string; answer: string; scientific_evidence: unknown; saved_message_metadata: Record<string, unknown> };

function messages(turn: RecordedTurn, withSavedKeys: boolean) {
  return [
    { message_id: "operator-1", conversation_id: CONVERSATION_ID, role: "operator" as const, content: turn.question, created_at: "2026-11-11T00:00:02Z" },
    {
      message_id: "calyx-1",
      conversation_id: CONVERSATION_ID,
      role: "calyx" as const,
      content: turn.answer,
      created_at: "2026-11-11T00:00:03Z",
      metadata: { provider: "deterministic-governed", model: "calyx-conversational-composer-v3", ...(withSavedKeys ? turn.saved_message_metadata : {}) },
    },
  ];
}

function conversation(turn: RecordedTurn | null, withSavedKeys = true) {
  return {
    conversation_id: CONVERSATION_ID,
    project_id: "calyx-speak",
    created_at: "2026-11-11T00:00:00Z",
    updated_at: "2026-11-11T00:00:01Z",
    messages: turn ? messages(turn, withSavedKeys) : [],
    persistence_mode: "memory",
  };
}

/** A turn response. `includeBlock: false` is the response of a backend without the feature. */
function turnResponse(turn: RecordedTurn, includeBlock: boolean) {
  const [operator, calyx] = messages(turn, includeBlock);
  return {
    conversation_id: CONVERSATION_ID,
    operator_message: operator,
    calyx_message: calyx,
    answer: turn.answer,
    provider: { name: "deterministic-governed", model: "calyx-conversational-composer-v3", request_hash: "hash" },
    research: {
      casual: false, mission: null, mission_error: null, retrieval: {},
      ...(includeBlock ? { scientific_evidence: turn.scientific_evidence } : {}),
    },
    persistence_mode: "memory",
    epistemic_policy: { continuum_first: true },
  };
}

async function flush(times = 1) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

function occurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

describe("CalyxWorkspace scientific evidence", () => {
  let container: HTMLDivElement;
  let root: Root;

  const panels = () => Array.from(container.querySelectorAll<HTMLElement>('[data-testid="calyx-evidence-panel"]'));
  const answerBubble = () => container.querySelector<HTMLElement>(".calyx-prose");

  async function renderPage() {
    await act(async () => {
      root.render(<MemoryRouter><CalyxWorkspace /></MemoryRouter>);
    });
    await flush(3);
  }

  async function ask(turn: RecordedTurn, includeBlock: boolean) {
    mocks.createCalyxConversation.mockResolvedValue(conversation(null));
    mocks.sendCalyxTurn.mockResolvedValue(turnResponse(turn, includeBlock));
    mocks.getCalyxConversation.mockResolvedValue(conversation(turn, includeBlock));
    await renderPage();
    await act(async () => { mocks.pushTranscript(turn.question); });
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush(5);
    expect(mocks.sendCalyxTurn).toHaveBeenCalledTimes(1);
  }

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.createCalyxConversation.mockReset();
    mocks.getCalyxConversation.mockReset();
    mocks.sendCalyxTurn.mockReset();
    mocks.getBrainMission.mockReset();
    mocks.listCalyxConversations.mockReset();
    mocks.listCalyxConversations.mockResolvedValue({ conversations: [], persistence_mode: "memory" });
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
  });

  it("shows the evidence panel for a turn and prints each sentence once", async () => {
    await ask(turns.available, true);

    expect(panels()).toHaveLength(1);
    expect(panels()[0].dataset.evidenceKind).toBe("available");
    expect(panels()[0].querySelectorAll('[data-testid="calyx-evidence-sentences"] li')).toHaveLength(22);
    expect(panels()[0].querySelector('[data-testid="calyx-evidence-pollination"]')?.getAttribute("data-pollination")).toBe("not-established");

    // The answer keeps Calyx's own paragraphs and loses only the appended section.
    expect(answerBubble()?.textContent).toContain(turns.available.answer.slice(0, 60));
    expect(answerBubble()?.textContent).toContain("One caveat about this particular reply");
    expect(answerBubble()?.textContent).not.toContain(FIRST_SENTENCE);
    expect(occurrences(container.textContent ?? "", FIRST_SENTENCE)).toBe(1);
    expect(occurrences(container.textContent ?? "", "What the Continuum's evidence records show")).toBe(1);
  });

  it.each([100, 101, 150])("keeps every one of %i backend sentences on the page exactly once", async (count) => {
    // Synthetic length: no recording has this many sentences. Each sentence is
    // bracketed so "Sentence 1" cannot match inside "Sentence 10".
    const reading = Array.from({ length: count }, (_unused, index) => `[Sentence ${index + 1} of ${count}]`);
    const turn = {
      ...turns.available,
      answer: `Body.\n\nWhat the Continuum's evidence records show:\n${reading.map((sentence) => `- ${sentence}`).join("\n")}`,
      scientific_evidence: { ...turns.available.scientific_evidence, reading },
    };
    await ask(turn, true);

    const pageText = container.textContent ?? "";
    for (const sentence of reading) expect(occurrences(pageText, sentence)).toBe(1);
    // They are in the panel, as list items, in order; the answer keeps its body.
    const items = Array.from(panels()[0].querySelectorAll('[data-testid="calyx-evidence-sentences"] li, [data-testid="calyx-evidence-sentences-more"] li')).map((item) => item.textContent);
    expect(items).toEqual(reading);
    expect(answerBubble()?.textContent?.trim()).toBe("Body.");
    const more = panels()[0].querySelector<HTMLElement>('[data-testid="calyx-evidence-more"]');
    if (count > 100) {
      expect(more?.tagName).toBe("DETAILS");
      expect(more?.querySelector("summary")?.textContent).toBe(`Show ${count - 100} more sentence${count - 100 === 1 ? "" : "s"}`);
    } else {
      expect(more).toBeNull();
    }
  });

  it("renders today's production response (no block) exactly as before: whole answer, no panel", async () => {
    await ask(turns.not_applicable_silent, false);
    expect(panels()).toHaveLength(0);
    for (const paragraph of turns.not_applicable_silent.answer.split("\n\n")) {
      expect(answerBubble()?.textContent).toContain(paragraph);
    }
  });

  it("does not hide the appended sentences when a turn carries them without a block", async () => {
    await ask(turns.available, false);
    expect(panels()).toHaveLength(0);
    expect(occurrences(container.textContent ?? "", FIRST_SENTENCE)).toBe(1);
    expect(answerBubble()?.textContent).toContain(FIRST_SENTENCE);
  });

  it("shows the ambiguous name as its own state and moves its explanation out of the answer", async () => {
    await ask(turns.not_resolved, true);
    expect(panels()).toHaveLength(1);
    expect(panels()[0].dataset.evidenceKind).toBe("not_resolved");
    const explanation = turns.not_resolved.scientific_evidence.explanation;
    expect(panels()[0].textContent).toContain(explanation);
    expect(occurrences(container.textContent ?? "", explanation)).toBe(1);
    expect(container.querySelector('[data-testid="calyx-evidence-sentences"]')).toBeNull();
  });

  it("shows a failed retrieval as unavailable", async () => {
    await ask(turns.unavailable, true);
    expect(panels()[0].dataset.evidenceKind).toBe("unavailable");
    expect(occurrences(container.textContent ?? "", turns.unavailable.scientific_evidence.explanation)).toBe(1);
  });

  it("shows nothing for a greeting (not_requested)", async () => {
    await ask(turns.not_requested, true);
    expect(panels()).toHaveLength(0);
  });

  it("shows status and identifiers, not sentences, for a conversation restored from the server", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ conversationId: CONVERSATION_ID, projectId: "calyx-speak" }));
    mocks.getCalyxConversation.mockResolvedValue(conversation(turns.available, true));
    await renderPage();

    expect(mocks.sendCalyxTurn).not.toHaveBeenCalled();
    expect(panels()).toHaveLength(1);
    expect(panels()[0].dataset.evidenceKind).toBe("available");
    // The saved conversation keeps no `reading`, so the sentences stay in the
    // reply, whole, and the panel does not present them as records.
    expect(panels()[0].querySelector('[data-testid="calyx-evidence-sentences"]')).toBeNull();
    expect(panels()[0].textContent).not.toContain(FIRST_SENTENCE);
    expect(panels()[0].querySelector('[data-testid="calyx-evidence-saved-note"]')?.textContent).toContain("not re-verified");
    expect(answerBubble()?.textContent).toContain(FIRST_SENTENCE);
    expect(occurrences(container.textContent ?? "", FIRST_SENTENCE)).toBe(1);
    expect(panels()[0].textContent).toContain(turns.available.scientific_evidence.evidence_packet_id);
    expect(occurrences(container.textContent ?? "", "What the Continuum's evidence records show")).toBe(1);
    // The saved message does not keep the flag, so nothing is said either way.
    expect(panels()[0].querySelector('[data-testid="calyx-evidence-pollination"]')?.getAttribute("data-pollination")).toBe("not-reported");
  });

  it("does not move text a reply wrote under the evidence heading into the panel", async () => {
    const invented = "LLM INVENTED: verified pollinator is Bee";
    const turn = {
      ...turns.available,
      answer: `A reply.\n\nWhat the Continuum's evidence records show:\n- ${invented}`,
      scientific_evidence: { ...turns.available.scientific_evidence, reading: [] },
    };
    await ask(turn, true);
    expect(panels()).toHaveLength(1);
    expect(panels()[0].textContent).not.toContain(invented);
    expect(answerBubble()?.textContent).toContain(invented);
  });

  it("forgets a turn's evidence when a new conversation is started", async () => {
    await ask(turns.available, true);
    expect(panels()).toHaveLength(1);
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === "New conversation");
    await act(async () => { button?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await flush(2);
    expect(panels()).toHaveLength(0);
  });
});
