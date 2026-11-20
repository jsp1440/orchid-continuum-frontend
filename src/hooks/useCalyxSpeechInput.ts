import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SpeechInputState = "idle" | "listening" | "unsupported";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error?: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

interface CalyxSpeechInput {
  state: SpeechInputState;
  interimTranscript: string;
  error: string | null;
  startListening: () => boolean;
  stopListening: () => void;
}

function resolveSpeechRecognition(windowValue: Window | undefined) {
  if (!windowValue) return undefined;
  const speechWindow = windowValue as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function detachRecognition(recognition: BrowserSpeechRecognition) {
  recognition.onstart = null;
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
}

export function useCalyxSpeechInput(onResult: (transcript: string) => void): CalyxSpeechInput {
  const speechRecognition = useMemo(
    () => resolveSpeechRecognition(typeof window === "undefined" ? undefined : window),
    [],
  );
  const [state, setState] = useState<SpeechInputState>(speechRecognition ? "idle" : "unsupported");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const onResultRef = useRef(onResult);

  onResultRef.current = onResult;

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;

    detachRecognition(recognition);
    setInterimTranscript("");
    setState("idle");
    recognition.stop();
  }, []);

  const startListening = useCallback((): boolean => {
    // The ref changes synchronously when a session starts or stops.
    // React state can still describe the previous session during a restart.
    if (!speechRecognition || recognitionRef.current) return false;

    const recognition = new speechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    // Each handler checks it is still the current recognizer before touching
    // state - a stale recognizer's callbacks (e.g. a delayed onend from a
    // previous session) must never clobber a newer one's state.
    recognition.onstart = () => {
      if (recognitionRef.current !== recognition) return;
      setError(null);
      setState("listening");
      setInterimTranscript("");
    };

    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return;
      let interim = "";
      let finalTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalTranscript += result[0].transcript;
        else interim += result[0].transcript;
      }

      setInterimTranscript(interim.trim());

      if (finalTranscript.trim()) {
        onResultRef.current(finalTranscript.trim());
        setInterimTranscript("");
      }
    };

    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      setError(
        event.error === "not-allowed"
          ? "Microphone access was denied."
          : event.error === "no-speech"
            ? "No speech was detected."
            : "Voice input could not start.",
      );
      setState("idle");
      setInterimTranscript("");
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      setState("idle");
      setInterimTranscript("");
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setError("Voice input could not start.");
      setState("idle");
      return false;
    }
    return true;
  }, [speechRecognition]);

  useEffect(() => () => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;

    detachRecognition(recognition);
    recognition.stop();
  }, []);

  return { state, interimTranscript, error, startListening, stopListening };
}
