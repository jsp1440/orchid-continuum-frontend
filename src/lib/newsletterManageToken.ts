/**
 * newsletterManageToken — remembers, per browser and per address, the
 * preference-centre token the backend issues at subscription
 * (orchid-calyx-backend `app/constituent_platform`, `manage_token`).
 *
 * The preference centre never opens on an email address alone (that would
 * tell anyone whether an address is subscribed). It opens with this token or,
 * later, with the same token carried by a confirmation email. Storing it here
 * lets the browser that subscribed manage its own preferences immediately.
 *
 * Browser storage can be absent, blocked or cleared, so every access is
 * guarded and the caller must render correctly without it.
 */

const STORAGE_KEY_PREFIX = "orchid-continuum.newsletter.manage-token.v1";

export function normalizeNewsletterEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function manageTokenStorageKey(email: string): string {
  return `${STORAGE_KEY_PREFIX}.${encodeURIComponent(normalizeNewsletterEmail(email))}`;
}

type TokenStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): TokenStorage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function rememberManageToken(email: string, token: string | null | undefined, store: TokenStorage | null = storage()): boolean {
  if (!store || !token || typeof token !== "string" || token.length > 120 || !normalizeNewsletterEmail(email)) return false;
  try {
    store.setItem(manageTokenStorageKey(email), token);
    return true;
  } catch {
    return false;
  }
}

export function readManageToken(email: string, store: TokenStorage | null = storage()): string | null {
  if (!store || !normalizeNewsletterEmail(email)) return null;
  try {
    const value = store.getItem(manageTokenStorageKey(email));
    return value && value.length <= 120 ? value : null;
  } catch {
    return null;
  }
}

export function forgetManageToken(email: string, store: TokenStorage | null = storage()): void {
  if (!store) return;
  try {
    store.removeItem(manageTokenStorageKey(email));
  } catch {
    // Nothing to forget, or storage is blocked; either way the token is not usable.
  }
}
