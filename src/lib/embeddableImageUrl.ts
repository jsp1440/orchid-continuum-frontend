// Browser-embeddability guard for hotlinked images (frontend #933).
//
// Some hosts send `Cross-Origin-Resource-Policy: same-origin`, so the browser
// blocks them when embedded from another origin (net::ERR_BLOCKED_BY_RESPONSE).
// A relative path stored in the data has no host and is broken off its
// originating host. Neither can ever render here, so they must be skipped
// up front rather than consuming a load-timeout slot.

// Hosts verified to send a same-origin CORP header. Extend only with evidence.
const CORP_BLOCKED_HOSTS: readonly string[] = ['content.eol.org'];

export function isBrowserEmbeddableImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!/^https?:\/\//i.test(text)) return false;
  let host: string;
  try {
    host = new URL(text).hostname.toLowerCase();
  } catch {
    return false;
  }
  return !CORP_BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}
