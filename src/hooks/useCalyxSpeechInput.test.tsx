// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCalyxSpeechInput } from "./useCalyxSpeechInput";

type MockSpeechRecognition = {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onstart: (() => void) | null;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function Harness() {
  const hook = useCalyxSpeechInput(() => undefined);
  return (
    <div>
      <button onClick={hook.startListening} type="button">start</button>
      <button onClick={hook.stopListening} type="button">stop</button>
      <p data-testid="state">{hook.state}</p>
      <p data-testid="error">{hook.error ?? ""}</p>
    </div>
  );
}

describe("useCalyxSpeechInput", () => {
  let container: HTMLDivElement;
  let root: Root;
  let instances: MockSpeechRecognition[];

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
    vi.unstubAllGlobals();
  });

  function renderWithSpeechSupport() {
    instances = [];
    class FakeSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onstart: (() => void) | null = null;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: { error?: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();

      constructor() {
        instances.push(this);
      }
    }

    vi.stubGlobal("webkitSpeechRecognition", FakeSpeechRecognition);
    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      value: FakeSpeechRecognition,
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(<Harness />);
    });
  }

  it("prevents duplicate recognizer starts while a session is already active", async () => {
    renderWithSpeechSupport();

    const start = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      start.click();
      start.click();
    });

    expect(instances).toHaveLength(1);
    expect(instances[0].start).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="state"]')?.textContent).toBe("listening");
  });

  it("does not surface a no-speech error after an intentional stop", async () => {
    renderWithSpeechSupport();

    const [start, stop] = Array.from(container.querySelectorAll("button")) as HTMLButtonElement[];
    await act(async () => {
      start.click();
    });

    await act(async () => {
      stop.click();
    });

    await act(async () => {
      instances[0].onerror?.({ error: "no-speech" });
    });

    expect(container.querySelector('[data-testid="state"]')?.textContent).toBe("idle");
    expect(container.querySelector('[data-testid="error"]')?.textContent).toBe("");
  });
});
