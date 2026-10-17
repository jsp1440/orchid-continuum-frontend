import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Remove dark mode class addition
createRoot(document.getElementById("root")!).render(<App />);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/field-journal-sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        // Let the offline shell cache static files this page loaded before the
        // worker controlled it (for example lazily imported chunks).
        const urls = performance.getEntriesByType("resource").map((entry) => entry.name)
          .filter((url) => url.startsWith(window.location.origin));
        registration.active?.postMessage({ type: "FIELD_JOURNAL_CACHE_URLS", urls });
      })
      .catch((error) => {
        console.warn("Field Journal offline shell registration failed", error);
      });
  });
}
