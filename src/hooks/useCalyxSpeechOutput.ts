/**
 * useCalyxSpeechOutput — SpeechSynthesis wrapper for speaking Calyx responses.
 *
 * Cancels any in-flight utterance on unmount to prevent audio leaks.
 */
import { useCallback, useEffect, useRef } from "react";

const supported =
  typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined";

export function useCalyxSpeechOutput() {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback((text: string) => {
    if (!supported || !text) return;
    // Cancel anything already playing.
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    // Prefer a natural-sounding voice when available.
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        (v.name.includes("Natural") ||
          v.name.includes("Google") ||
          v.name.includes("Samantha")),
    );
    if (preferred) utterance.voice = preferred;
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, []);

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
  }, []);

  // Stop any in-progress speech on unmount to prevent audio leaks.
  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, []);

  return { speak, cancel, supported };
}
