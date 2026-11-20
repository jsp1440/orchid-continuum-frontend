// @vitest-environment jsdom
//
// Regression: mounted CalyxWorkspace + the REAL useCalyxSpeechInput hook.
// A late transcript from project A's recognizer must never land in project B's
// draft, whether or not the hook accepts the restart in B.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ResultHandler = (event: { resultIndex: number; results: Array<{ isFinal: boolean; 0: { transcript: string } }> }) => void;

class FakeRecognition {
  static all: FakeRecognition[] = [];
  static startThrows = false;
  onstart: (() => void) | null = null;
  onresult: ResultHandler | null = null;
  onerror: (() => void) | null = null;
  onend: (() => void) | null = null;
  continuous = false;
  interimResults = false;
  lang = "";
  start = vi.fn(() => {
    if (FakeRecognition.startThrows) throw new Error("refused");
    queueMicrotask(() => this.onstart?.());
  });
  stop = vi.fn();
  constructor() {
    FakeRecognition.all.push(this);
  }
}

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

describe("mounted CalyxWorkspace + REAL speech hook: voice vs project switch", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    FakeRecognition.all = [];
    FakeRecognition.startThrows = false;
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  });

  const say = (handler: ResultHandler | null, transcript: string) =>
    act(async () => {
      handler?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript } }] });
    });

  for (const refuse of [false, true]) {
    it(`late transcript from project A must not land in B (restart ${refuse ? "throws" : "accepted"})`, async () => {
      await act(async () => { root.render(<MemoryRouter><CalyxWorkspace /></MemoryRouter>); });
      await act(async () => { await Promise.resolve(); });
      await act(async () => { findButton(container, "Start voice input").click(); });
      await act(async () => { await Promise.resolve(); });
      const recognitionA = FakeRecognition.all[0];
      const handlerA = recognitionA.onresult;
      expect(handlerA).toBeTruthy();

      await act(async () => { setValue(container.querySelector("#calyx-project") as HTMLInputElement, "project-b"); });
      await act(async () => { await Promise.resolve(); });
      FakeRecognition.startThrows = refuse;
      await act(async () => { findButton(container, "Start voice input").click(); });
      await act(async () => { await Promise.resolve(); });

      await say(handlerA, "LATE FROM A");
      await say(recognitionA.onresult, "LATE FROM A (current handler)");
      expect((container.querySelector("#calyx-message") as HTMLTextAreaElement).value).not.toContain("LATE FROM A");
    });
  }
});
