import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { isFieldJournalPath, registerFieldJournalShell } from "./lib/fieldJournalShell";

// Remove dark mode class addition
createRoot(document.getElementById("root")!).render(<App />);

if (isFieldJournalPath(window.location.pathname)) {
  // Opening /field directly (Home Screen, reload, offline) installs the shell
  // on load; arriving in-app registers it when the Field Journal mounts.
  window.addEventListener("load", () => {
    void registerFieldJournalShell();
  });
}
