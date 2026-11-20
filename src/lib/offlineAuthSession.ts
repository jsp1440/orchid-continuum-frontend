import { isAuthRetryableFetchError, type User } from '@supabase/supabase-js';

/**
 * Offline access to the Field Journal for a device that is already signed in.
 *
 * Supabase keeps the session (including its refresh token) in localStorage.
 * When the short-lived access token has expired, `getSession()` tries to
 * refresh it over the network. Offline, that refresh fails with a *retryable*
 * fetch error: supabase-js keeps the stored session but returns
 * `session: null`, so a plain "no session → sign in" gate locks the owner out
 * of observations that live only on this device, about an hour after the
 * last time the device was online.
 *
 * This module only identifies *which account* the device was last signed in
 * as, so the Field Journal can open that account's local data. It grants no
 * server authority: no token is returned, and the journal's sync uses its own
 * backend session, which fails closed offline. Any non-retryable refresh
 * failure (revoked or invalid session) makes supabase-js delete the stored
 * session, after which this returns null.
 */

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Set when someone signs out on this device and cleared only when a real
 * session is next established. While it is set, the offline path returns no
 * account, so a sign-out that could not reach the network (shared iPad) can
 * never be undone by reopening the journal offline.
 */
export const SIGNED_OUT_MARKER_KEY = 'oc-auth-explicitly-signed-out';

export function markSignedOut(storage: WritableStorage | undefined | null): void {
  try {
    storage?.setItem(SIGNED_OUT_MARKER_KEY, '1');
  } catch {
    // Storage unavailable: nothing persisted can be resurrected either.
  }
}

export function clearSignedOutMarker(storage: WritableStorage | undefined | null): void {
  try {
    storage?.removeItem(SIGNED_OUT_MARKER_KEY);
  } catch {
    // Non-fatal.
  }
}

function markedSignedOut(storage: ReadableStorage): boolean {
  try {
    return storage.getItem(SIGNED_OUT_MARKER_KEY) !== null;
  } catch {
    // Cannot prove the device was not signed out: fail closed.
    return true;
  }
}

/**
 * Remove the persisted supabase session (and its PKCE verifier and split user
 * record) when supabase-js could not do it itself. Offline, its signOut()
 * fails while loading the session and returns before removing anything.
 */
export function clearPersistedAuthSession(
  storage: WritableStorage | undefined | null,
  storageKey: string | undefined | null,
): void {
  if (!storage || !storageKey) return;
  for (const key of [storageKey, `${storageKey}-code-verifier`, `${storageKey}-user`]) {
    try {
      storage.removeItem(key);
    } catch {
      // The signed-out marker still blocks offline access.
    }
  }
}

export function readPersistedAuthUser(
  storage: ReadableStorage | undefined | null,
  storageKey: string | undefined | null,
): User | null {
  if (!storage || !storageKey) return null;
  if (markedSignedOut(storage)) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(storageKey);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as { refresh_token?: unknown; user?: unknown };
  // Without a refresh token the session can never be renewed, so it is not a
  // signed-in device; supabase-js itself treats such a session as invalid.
  if (typeof record.refresh_token !== 'string' || !record.refresh_token) return null;
  const user = record.user as { id?: unknown } | null | undefined;
  if (!user || typeof user !== 'object' || typeof user.id !== 'string' || !user.id) return null;
  return user as User;
}

/**
 * True when the absence of a session is explained by the network rather than
 * by the account: the browser reports itself offline, or the refresh failed
 * with a retryable fetch error. Anything else (no stored session, a revoked
 * refresh token, an unexpected error) is not grounds for offline access.
 */
export function sessionMissingBecauseOffline(error: unknown, online: boolean): boolean {
  return !online || isAuthRetryableFetchError(error);
}

export function browserIsOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export function browserLocalStorage(): WritableStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
