// The Field Journal offline shell is installed only by the Field Journal.
// Registering it from every page made every visitor (and every browser
// journey in CI) download and precache the whole app at install, which the
// rest of the site does not need.

export const FIELD_JOURNAL_SW_URL = "/field-journal-sw.js";

export function isFieldJournalPath(pathname: string): boolean {
  return pathname === "/field" || pathname.startsWith("/field/");
}

let registration: Promise<void> | null = null;

export function registerFieldJournalShell(
  nav: Navigator | undefined = typeof navigator === "undefined" ? undefined : navigator,
  production: boolean = import.meta.env.PROD,
): Promise<void> | null {
  if (!production || !nav || !("serviceWorker" in nav)) return null;
  if (registration) return registration;
  registration = nav.serviceWorker.register(FIELD_JOURNAL_SW_URL)
    .then(() => nav.serviceWorker.ready)
    .then((ready) => {
      // Let the offline shell cache static files this page loaded before the
      // worker controlled it (for example lazily imported chunks).
      const urls = performance.getEntriesByType("resource").map((entry) => entry.name)
        .filter((url) => url.startsWith(window.location.origin));
      ready.active?.postMessage({ type: "FIELD_JOURNAL_CACHE_URLS", urls });
    })
    .catch((error) => {
      registration = null;
      console.warn("Field Journal offline shell registration failed", error);
    });
  return registration;
}

export function resetFieldJournalShellForTests(): void {
  registration = null;
}
