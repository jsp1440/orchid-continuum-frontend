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
  startListening: () => void;
  stopListening: () => void;
}

function resolveSpeechRecognition(windowValue: Window | undefined) {
  if (!windowValue) return undefined;
  const speechWindow = windowValue as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
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
  const stopRequestedRef = useRef(false);
  const onResultRef = useRef(onResult);

  onResultRef.current = onResult;

  const stopListening = useCallback(() => {
    stopRequestedRef.current = true;
    const activeRecognition = recognitionRef.current;
    recognitionRef.current = null;
    activeRecognition?.stop();
    setInterimTranscript("");
    setState("idle");
  }, []);

  const startListening = useCallback(() => {
    if (!speechRecognition || state === "listening" || recognitionRef.current) return;

    const recognition = new speechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    stopRequestedRef.current = false;
    recognitionRef.current = recognition;
    setState("listening");
    setInterimTranscript("");

    recognition.onstart = () => {
      setError(null);
    };

    recognition.onresult = (event) => {
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
      const isGracefulStop = stopRequestedRef.current && (event.error === "aborted" || event.error === "no-speech");
      setError(
        isGracefulStop
          ? null
          : event.error === "not-allowed"
            ? "Microphone access was denied."
            : event.error === "no-speech"
              ? "No speech was detected."
              : "Voice input could not start.",
      );
      setState("idle");
      setInterimTranscript("");
      stopRequestedRef.current = false;
      if (recognitionRef.current === recognition) recognitionRef.current = null;
    };

    recognition.onend = () => {
      setState("idle");
      setInterimTranscript("");
      stopRequestedRef.current = false;
      if (recognitionRef.current === recognition) recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch {
      setError("Voice input could not start.");
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setState("idle");
      stopRequestedRef.current = false;
    }
  }, [speechRecognition, state]);

  useEffect(() => () => {
    stopRequestedRef.current = true;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  return { state, interimTranscript, error, startListening, stopListening };
}
