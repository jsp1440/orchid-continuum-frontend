import { useCallback, useEffect } from "react";

function speechSynthesisSupported() {
  return typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined";
}

export function useCalyxSpeechOutput() {
  const supported = speechSynthesisSupported();

  const speak = useCallback((text: string) => {
    if (!supported || !text.trim()) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1;

    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (voice) =>
        voice.lang.startsWith("en") &&
        (voice.name.includes("Natural") ||
          voice.name.includes("Google") ||
          voice.name.includes("Samantha")),
    );

    if (preferred) utterance.voice = preferred;

    window.speechSynthesis.speak(utterance);
  }, [supported]);

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  useEffect(() => () => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  return { speak, cancel, supported };
}
