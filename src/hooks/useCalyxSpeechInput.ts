/**
 * useCalyxSpeechInput — Web Speech API microphone input for the Calyx workspace.
 *
 * Uses the browser's native SpeechRecognition (prefixed in some browsers).
 * The caller receives the live interim transcript and a finalised transcript
 * when recognition ends, plus simple state flags for UI binding.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type SpeechInputState = "idle" | "listening" | "unsupported";

interface CalyxSpeechInput {
  state: SpeechInputState;
  interimTranscript: string;
  startListening: () => void;
  stopListening: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWindow = Window & Record<string, any>;
const SpeechRecognitionImpl: typeof SpeechRecognition | undefined =
  (typeof window !== "undefined" &&
    ((window as AnyWindow).SpeechRecognition ??
      (window as AnyWindow).webkitSpeechRecognition)) ||
  undefined;

export function useCalyxSpeechInput(
  onResult: (transcript: string) => void,
): CalyxSpeechInput {
  const [state, setState] = useState<SpeechInputState>(
    SpeechRecognitionImpl ? "idle" : "unsupported",
  );
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognitionImpl || state === "listening") return;

    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setState("listening");
      setInterimTranscript("");
    };

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimTranscript(interim);
      if (final) {
        onResultRef.current(final.trim());
        setInterimTranscript("");
      }
    };

    recognition.onerror = () => {
      setState("idle");
      setInterimTranscript("");
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setState("idle");
      setInterimTranscript("");
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [state]);

  // Stop any active recognition on unmount to prevent microphone leaks.
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return { state, interimTranscript, startListening, stopListening };
}
