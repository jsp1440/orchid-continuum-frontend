// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCalyxSpeechInput } from "./useCalyxSpeechInput";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

interface FakeResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface FakeResultEvent {
  resultIndex: number;
  results: FakeResultLike[];
}

class FakeSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  onstart: (() => void) | null = null;
  onresult: ((event: FakeResultEvent) => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();

  constructor() {
    instances.push(this);
  }
}

let instances: FakeSpeechRecognition[] = [];
let onResultSpy = vi.fn();
let latest: ReturnType<typeof useCalyxSpeechInput> | null = null;

function Harness() {
  latest = useCalyxSpeechInput(onResultSpy);
  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  instances = [];
  onResultSpy = vi.fn();
  latest = null;
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeSpeechRecognition;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<Harness />);
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
});

describe("useCalyxSpeechInput", () => {
  it("does not create a second recognizer while the first is still starting", () => {
    // `state` only becomes "listening" once onstart fires - calling
    // startListening() again before that must not create a second
    // recognizer, or the first one is silently orphaned.
    act(() => {
      latest!.startListening();
    });
    act(() => {
      latest!.startListening();
    });
    expect(instances).toHaveLength(1);
    expect(instances[0].start).toHaveBeenCalledTimes(1);
  });

  it("allows starting a new session once the previous one has ended", () => {
    act(() => {
      latest!.startListening();
    });
    act(() => {
      instances[0].onend?.();
    });
    act(() => {
      latest!.startListening();
    });
    expect(instances).toHaveLength(2);
  });

  it("ignores a stale recognizer's result event after a newer session has started", () => {
    act(() => {
      latest!.startListening();
    });
    const stale = instances[0];
    act(() => {
      stale.onend?.();
    });
    act(() => {
      latest!.startListening();
    });
    expect(instances).toHaveLength(2);

    act(() => {
      stale.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "stale transcript" } }],
      });
    });

    expect(onResultSpy).not.toHaveBeenCalled();
  });

  it("still delivers a result from the current recognizer", () => {
    act(() => {
      latest!.startListening();
    });
    const current = instances[0];
    act(() => {
      current.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "current transcript" } }],
      });
    });
    expect(onResultSpy).toHaveBeenCalledWith("current transcript");
  });

  it("ignores a stale recognizer's error event after a newer session has started", () => {
    act(() => {
      latest!.startListening();
    });
    const stale = instances[0];
    act(() => {
      stale.onend?.();
    });
    act(() => {
      latest!.startListening();
    });

    act(() => {
      stale.onerror?.({ error: "not-allowed" });
    });

    // The stale recognizer's error must not clear out the newer session's ref.
    expect(latest!.error).toBeNull();
  });

  it("stopListening stops whichever recognizer is currently referenced", () => {
    act(() => {
      latest!.startListening();
    });
    act(() => {
      latest!.stopListening();
    });
    expect(instances[0].stop).toHaveBeenCalledTimes(1);
  });
});
