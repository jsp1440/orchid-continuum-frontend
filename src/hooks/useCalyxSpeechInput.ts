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
  const recognitionSessionRef = useRef(0);
  const onResultRef = useRef(onResult);

  onResultRef.current = onResult;

  const stopListening = useCallback(() => {
    const activeRecognition = recognitionRef.current;
    if (!activeRecognition) return;
    recognitionSessionRef.current += 1;
    activeRecognition.onstart = null;
    activeRecognition.onresult = null;
    activeRecognition.onerror = null;
    activeRecognition.onend = null;
    recognitionRef.current = null;
    setState("idle");
    setInterimTranscript("");
    activeRecognition.stop();
  }, []);

  const startListening = useCallback(() => {
    if (!speechRecognition || recognitionRef.current) return;

    const recognition = new speechRecognition();
    const sessionId = recognitionSessionRef.current + 1;
    recognitionSessionRef.current = sessionId;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      if (recognitionSessionRef.current !== sessionId) return;
      setError(null);
      setState("listening");
      setInterimTranscript("");
    };

    recognition.onresult = (event) => {
      if (recognitionSessionRef.current !== sessionId || recognitionRef.current !== recognition) return;
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
      if (recognitionSessionRef.current !== sessionId || recognitionRef.current !== recognition) return;
      setError(
        event.error === "not-allowed"
          ? "Microphone access was denied."
          : event.error === "no-speech"
            ? "No speech was detected."
            : "Voice input could not start.",
      );
      setState("idle");
      setInterimTranscript("");
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      if (recognitionSessionRef.current !== sessionId || recognitionRef.current !== recognition) return;
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      setState("idle");
      setInterimTranscript("");
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      if (recognitionSessionRef.current !== sessionId) return;
      setError("Voice input could not start.");
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognitionRef.current = null;
      setState("idle");
    }
  }, [speechRecognition]);

  useEffect(() => () => {
    recognitionSessionRef.current += 1;
    const activeRecognition = recognitionRef.current;
    if (!activeRecognition) return;
    activeRecognition.onstart = null;
    activeRecognition.onresult = null;
    activeRecognition.onerror = null;
    activeRecognition.onend = null;
    recognitionRef.current = null;
    activeRecognition.stop();
  }, []);

  return { state, interimTranscript, error, startListening, stopListening };
}
