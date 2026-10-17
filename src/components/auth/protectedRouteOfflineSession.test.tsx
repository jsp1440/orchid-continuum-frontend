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
      signOut: vi.fn(async () => ({ error: null })),
    },
  },
}));

vi.mock('./AuthModal', () => ({ default: () => null }));

import { AuthProvider } from '@/contexts/AuthContext';
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

async function renderGate(allowOfflineSession: boolean) {
  await act(async () => {
    root.render(
      <AuthProvider>
        <ProtectedRoute allowOfflineSession={allowOfflineSession} title="Sign in to use the Field Journal">
          <div data-testid="journal">journal</div>
        </ProtectedRoute>
      </AuthProvider>,
    );
  });
  await act(async () => { await Promise.resolve(); });
}

const journalShown = () => container.querySelector('[data-testid="journal"]') !== null;
const gateShown = () => (container.textContent ?? '').includes('Sign in to use the Field Journal');

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  window.localStorage.clear();
  auth.getSession.mockReset();
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
});
