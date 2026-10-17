import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  clearPersistedAuthSession,
  clearSignedOutMarker,
  markSignedOut,
  readPersistedAuthUser,
  sessionMissingBecauseOffline,
  SIGNED_OUT_MARKER_KEY,
} from './offlineAuthSession';

const KEY = 'sb-project-auth-token';

function storageWith(value: string | null) {
  return { getItem: (key: string) => (key === KEY ? value : null) };
}

describe('readPersistedAuthUser', () => {
  it('returns the stored user when the session still has a refresh token', () => {
    const stored = JSON.stringify({ access_token: 'expired', refresh_token: 'r', expires_at: 1, user: { id: 'user-1' } });
    expect(readPersistedAuthUser(storageWith(stored), KEY)?.id).toBe('user-1');
  });

  it('refuses a session without a refresh token, without a user id, or that is not JSON', () => {
    expect(readPersistedAuthUser(storageWith(JSON.stringify({ user: { id: 'user-1' } })), KEY)).toBeNull();
    expect(readPersistedAuthUser(storageWith(JSON.stringify({ refresh_token: 'r', user: {} })), KEY)).toBeNull();
    expect(readPersistedAuthUser(storageWith(JSON.stringify({ refresh_token: 'r', user: null })), KEY)).toBeNull();
    expect(readPersistedAuthUser(storageWith('{not json'), KEY)).toBeNull();
    expect(readPersistedAuthUser(storageWith(null), KEY)).toBeNull();
  });

  it('returns null when storage or its key is unavailable, or reading throws', () => {
    expect(readPersistedAuthUser(null, KEY)).toBeNull();
    expect(readPersistedAuthUser(storageWith('{}'), null)).toBeNull();
    expect(readPersistedAuthUser({ getItem: () => { throw new Error('blocked'); } }, KEY)).toBeNull();
  });
});

describe('sessionMissingBecauseOffline', () => {
  it('is true when the browser is offline or the refresh failed for network reasons', () => {
    expect(sessionMissingBecauseOffline(null, false)).toBe(true);
    expect(sessionMissingBecauseOffline(new AuthRetryableFetchError('Failed to fetch', 0), true)).toBe(true);
  });

  it('is false online when there was no error or the account itself was rejected', () => {
    expect(sessionMissingBecauseOffline(null, true)).toBe(false);
    expect(sessionMissingBecauseOffline(new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found'), true)).toBe(false);
    expect(sessionMissingBecauseOffline(new Error('boom'), true)).toBe(false);
  });
});

describe('signed-out marker', () => {
  function memoryStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return {
      data,
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
      removeItem: (key: string) => { data.delete(key); },
    };
  }
  const session = JSON.stringify({ refresh_token: 'r', user: { id: 'user-1' } });

  it('hides the stored account until a real session clears it', () => {
    const storage = memoryStorage({ [KEY]: session });
    markSignedOut(storage);
    expect(storage.data.get(SIGNED_OUT_MARKER_KEY)).toBe('1');
    expect(readPersistedAuthUser(storage, KEY)).toBeNull();
    clearSignedOutMarker(storage);
    expect(readPersistedAuthUser(storage, KEY)?.id).toBe('user-1');
  });

  it('fails closed when the marker cannot be read', () => {
    const storage = {
      getItem: (key: string) => {
        if (key === SIGNED_OUT_MARKER_KEY) throw new Error('blocked');
        return session;
      },
    };
    expect(readPersistedAuthUser(storage, KEY)).toBeNull();
  });

  it('clearPersistedAuthSession removes the session, its code verifier and split user record only', () => {
    const storage = memoryStorage({
      [KEY]: session,
      [`${KEY}-code-verifier`]: 'v',
      [`${KEY}-user`]: '{}',
      unrelated: 'keep',
    });
    clearPersistedAuthSession(storage, KEY);
    expect([...storage.data.keys()]).toEqual(['unrelated']);
  });
});
