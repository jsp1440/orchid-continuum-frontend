// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

/**
 * The Field Journal must open offline on a device that is still signed in.
 *
 * The regression this guards: supabase-js answers getSession() with
 * `session: null` when the access token has expired and the refresh cannot
 * reach the network (it keeps the stored session). The /field gate treated
 * that as "signed out", so about an hour after last being online the owner
 * was locked out of observations that exist only on the iPad.
 */

const STORAGE_KEY = 'sb-test-auth-token';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  listener: null as null | ((event: string, session: unknown) => void),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      storageKey: 'sb-test-auth-token',
      getSession: auth.getSession,
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        auth.listener = callback;
        return { data: { subscription: { unsubscribe: () => { auth.listener = null; } } } };
      },
      signOut: auth.signOut,
    },
  },
}));

vi.mock('./AuthModal', () => ({ default: () => null }));

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SIGNED_OUT_MARKER_KEY } from '@/lib/offlineAuthSession';
import ProtectedRoute from './ProtectedRoute';

let container: HTMLDivElement;
let root: Root;

function storeSession() {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ access_token: 'expired', refresh_token: 'refresh', expires_at: 1, user: { id: 'owner-1' } }),
  );
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
}

let signOutFromPage: (() => Promise<void>) | null = null;

function Journal() {
  const { user, offlineUser, signOut } = useAuth();
  signOutFromPage = signOut;
  return <div data-testid="journal" data-account={(user ?? offlineUser)?.id ?? ''}>journal</div>;
}

async function renderGate(allowOfflineSession: boolean) {
  await act(async () => {
    root.render(
      <AuthProvider>
        <ProtectedRoute allowOfflineSession={allowOfflineSession} title="Sign in to use the Field Journal">
          <Journal />
        </ProtectedRoute>
      </AuthProvider>,
    );
  });
  await act(async () => { await Promise.resolve(); });
}

/** Close the app and open it again (a fresh AuthProvider over the same storage). */
async function reopen() {
  act(() => root.unmount());
  root = createRoot(container);
  await renderGate(true);
}

const offlineRefreshFailure = () => ({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) });

const journalShown = () => container.querySelector('[data-testid="journal"]') !== null;
const gateShown = () => (container.textContent ?? '').includes('Sign in to use the Field Journal');

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  window.localStorage.clear();
  auth.getSession.mockReset();
  auth.signOut.mockReset();
  signOutFromPage = null;
  setOnline(true);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ProtectedRoute offline session', () => {
  it('opens the Field Journal when the token refresh failed for network reasons', async () => {
    storeSession();
    auth.getSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) });
    await renderGate(true);
    expect(journalShown()).toBe(true);
  });

  it('opens immediately when the device reports itself offline, without waiting for the refresh retries', async () => {
    storeSession();
    setOnline(false);
    auth.getSession.mockReturnValue(new Promise(() => {}));
    await renderGate(true);
    expect(journalShown()).toBe(true);
  });

  it('keeps every other protected route gated in the same situation', async () => {
    storeSession();
    auth.getSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) });
    await renderGate(false);
    expect(journalShown()).toBe(false);
    expect(gateShown()).toBe(true);
  });

  it('stays gated online when the account was rejected rather than unreachable', async () => {
    storeSession();
    auth.getSession.mockResolvedValue({ data: { session: null }, error: new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found') });
    await renderGate(true);
    expect(journalShown()).toBe(false);
    expect(gateShown()).toBe(true);
  });

  it('stays gated offline when the device was never signed in', async () => {
    setOnline(false);
    auth.getSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) });
    await renderGate(true);
    expect(journalShown()).toBe(false);
    expect(gateShown()).toBe(true);
  });

  it('closes the offline journal on sign-out but not on a null INITIAL_SESSION', async () => {
    storeSession();
    auth.getSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) });
    await renderGate(true);
    await act(async () => { auth.listener?.('INITIAL_SESSION', null); });
    expect(journalShown()).toBe(true);
    await act(async () => { auth.listener?.('SIGNED_OUT', null); });
    expect(journalShown()).toBe(false);
    expect(gateShown()).toBe(true);
  });

  it('offline sign-out on a shared iPad: reopening offline shows the sign-in gate, not the previous account', async () => {
    storeSession();
    setOnline(false);
    auth.getSession.mockResolvedValue(offlineRefreshFailure());
    // What supabase-js returns offline: the session load fails before removal.
    auth.signOut.mockResolvedValue({ error: new AuthRetryableFetchError('Failed to fetch', 0) });
    window.localStorage.setItem(`${STORAGE_KEY}-code-verifier`, 'verifier');
    await renderGate(true);
    expect(journalShown()).toBe(true);

    await act(async () => { await signOutFromPage!(); });
    expect(journalShown()).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(`${STORAGE_KEY}-code-verifier`)).toBeNull();

    await reopen();
    expect(journalShown()).toBe(false);
    expect(gateShown()).toBe(true);
  });

  it('a sign-out that throws still removes the session and keeps the gate closed offline', async () => {
    storeSession();
    setOnline(false);
    auth.getSession.mockResolvedValue(offlineRefreshFailure());
    auth.signOut.mockRejectedValue(new TypeError('Load failed'));
    await renderGate(true);
    await act(async () => { await signOutFromPage!(); });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    await reopen();
    expect(gateShown()).toBe(true);
  });

  it('never resurrects a signed-out account even if its stored session could not be removed', async () => {
    storeSession();
    window.localStorage.setItem(SIGNED_OUT_MARKER_KEY, '1');
    setOnline(false);
    auth.getSession.mockResolvedValue(offlineRefreshFailure());
    await renderGate(true);
    expect(journalShown()).toBe(false);
    expect(gateShown()).toBe(true);
  });

  it('online sign-out still works and leaves supabase to remove the session', async () => {
    storeSession();
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'owner-1' } } }, error: null });
    auth.signOut.mockImplementation(async () => {
      window.localStorage.removeItem(STORAGE_KEY);
      auth.listener?.('SIGNED_OUT', null);
      return { error: null };
    });
    await renderGate(true);
    expect(container.querySelector('[data-testid="journal"]')?.getAttribute('data-account')).toBe('owner-1');

    await act(async () => { await signOutFromPage!(); });
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(journalShown()).toBe(false);
    expect(gateShown()).toBe(true);
    expect(window.localStorage.getItem(SIGNED_OUT_MARKER_KEY)).toBe('1');
  });

  it('a new real sign-in lifts the signed-out marker, and only that account is opened offline later', async () => {
    window.localStorage.setItem(SIGNED_OUT_MARKER_KEY, '1');
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await renderGate(true);
    expect(gateShown()).toBe(true);

    // Someone else signs in on the same iPad.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ access_token: 'a', refresh_token: 'r2', expires_at: 1, user: { id: 'member-2' } }),
    );
    await act(async () => { auth.listener?.('SIGNED_IN', { user: { id: 'member-2' } }); });
    expect(window.localStorage.getItem(SIGNED_OUT_MARKER_KEY)).toBeNull();

    setOnline(false);
    auth.getSession.mockResolvedValue(offlineRefreshFailure());
    await reopen();
    expect(container.querySelector('[data-testid="journal"]')?.getAttribute('data-account')).toBe('member-2');
  });
});
