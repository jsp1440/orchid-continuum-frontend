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

export function readPersistedAuthUser(
  storage: ReadableStorage | undefined | null,
  storageKey: string | undefined | null,
): User | null {
  if (!storage || !storageKey) return null;
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

export function browserLocalStorage(): ReadableStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
