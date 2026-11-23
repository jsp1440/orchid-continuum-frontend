// @vitest-environment jsdom
//
// Regression: mounted CalyxWorkspace with a hook double that REFUSES a restart
// (startListening returns false and creates no recognizer) and does not detach
// the previous recognizer's callback on stop. A late transcript from project A's
// recognizer must not land in project B's draft.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callback: (_transcript: string) => undefined as void,
  start: vi.fn(() => false),
  stop: vi.fn(),
}));

vi.mock("@/hooks/useCalyxSpeechInput", () => ({
  useCalyxSpeechInput: (onResult: (transcript: string) => void) => {
    mocks.callback = onResult;
    return { state: "idle", interimTranscript: "", error: null, startListening: mocks.start, stopListening: mocks.stop };
  },
}));
const output = vi.hoisted(() => ({ speak: () => undefined, cancel: () => undefined, supported: false }));
vi.mock("@/hooks/useCalyxSpeechOutput", () => ({ useCalyxSpeechOutput: () => output }));
vi.mock("@/lib/calyxWorkspace", async () => {
  const actual = await vi.importActual<typeof import("@/lib/calyxWorkspace")>("@/lib/calyxWorkspace");
  return {
    ...actual,
    loadCalyxWorkspace: vi.fn(async () => ({ capabilities: null, homepage: null, orchestrator: null, orchestratorState: "unavailable", errors: [] })),
    listCalyxConversations: vi.fn(async () => ({ conversations: [], persistence_mode: "memory" })),
  };
});

import CalyxWorkspace from "./CalyxWorkspace";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });

function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function findButton(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.getAttribute("aria-label") === label || item.textContent?.includes(label),
  );
  if (!button) throw new Error(`no button ${label}`);
  return button as HTMLButtonElement;
}

describe("mounted page with a hook that refuses restart", () => {
  it("late transcript from A's recognizer must not land in B's draft", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    window.localStorage.clear();
    await act(async () => { root.render(<MemoryRouter><CalyxWorkspace /></MemoryRouter>); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { findButton(container, "Start voice input").click(); }); // A starts (hook refuses: start returns false)
    const callbackA = mocks.callback;
    await act(async () => { setValue(container.querySelector("#calyx-project") as HTMLInputElement, "project-b"); });
    await act(async () => { findButton(container, "Start voice input").click(); }); // restart in B: refused
    await act(async () => { callbackA("LATE FROM A"); });
    expect((container.querySelector("#calyx-message") as HTMLTextAreaElement).value).not.toContain("LATE FROM A");
    act(() => root.unmount());
    container.remove();
  });
});
