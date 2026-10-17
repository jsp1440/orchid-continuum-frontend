import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  browserIsOnline,
  browserLocalStorage,
  readPersistedAuthUser,
  sessionMissingBecauseOffline,
} from '@/lib/offlineAuthSession';

/**
 * Authentication context for the Orchid Continuum.
 *
 * Wraps Supabase Auth and exposes a small, opinionated API:
 *   - signUp / signIn / signOut
 *   - resetPassword (sends email)
 *   - updatePassword (used by /account)
 *
 * Session is persisted by the underlying supabase client (localStorage)
 * and re-hydrated on mount via getSession(). We also subscribe to
 * onAuthStateChange so multi-tab sign-in/out stays consistent.
 */

export interface AuthResult {
  ok: boolean;
  error?: string;
  /** True when sign-up succeeded but the project requires email confirmation. */
  needsConfirmation?: boolean;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  /**
   * The account this device is still signed in as while the network is
   * unavailable and the access token could not be refreshed. Local-only: it
   * carries no token and grants no server access. Only routes that work on
   * device-local data (the Field Journal) should honour it.
   */
  offlineUser: User | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<AuthResult>;
  updatePassword: (newPassword: string) => Promise<AuthResult>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [offlineUser, setOfflineUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Hydrate session on mount + subscribe to auth changes.
  useEffect(() => {
    let mounted = true;
    const persistedUser = () => readPersistedAuthUser(browserLocalStorage(), supabaseAuthStorageKey());

    // Opened with no network (e.g. from the Home Screen in the field): do not
    // wait ~30 s for supabase-js to give up retrying the token refresh before
    // showing the device's local journal.
    if (!browserIsOnline()) {
      const stored = persistedUser();
      if (stored) {
        setOfflineUser(stored);
        setLoading(false);
      }
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      if (data.session) setOfflineUser(null);
      else setOfflineUser(sessionMissingBecauseOffline(error, browserIsOnline()) ? persistedUser() : null);
      setLoading(false);
    }).catch((error: unknown) => {
      if (!mounted) return;
      setOfflineUser(sessionMissingBecauseOffline(error, browserIsOnline()) ? persistedUser() : null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession ?? null);
      setUser(newSession?.user ?? null);
      // A real session replaces the offline identity; an explicit sign-out (or
      // supabase-js discarding a revoked session) ends it. A null
      // INITIAL_SESSION while offline does neither.
      if (newSession || event === 'SIGNED_OUT') setOfflineUser(null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback<AuthContextValue['signUp']>(async (email, password, displayName) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: displayName ? { display_name: displayName } : undefined,
          emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/account` : undefined,
        },
      });
      if (error) return { ok: false, error: error.message };

      // If email confirmation is required, supabase returns a user but no session.
      const needsConfirmation = !!data.user && !data.session;
      return { ok: true, needsConfirmation };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign up failed.';
      return { ok: false, error: message };
    }
  }, []);

  const signIn = useCallback<AuthContextValue['signIn']>(async (email, password) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign in failed.';
      return { ok: false, error: message };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      setSession(null);
      setUser(null);
      setOfflineUser(null);
    }
  }, []);

  const resetPassword = useCallback<AuthContextValue['resetPassword']>(async (email) => {
    try {
      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/account` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not send reset email.';
      return { ok: false, error: message };
    }
  }, []);

  const updatePassword = useCallback<AuthContextValue['updatePassword']>(async (newPassword) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not update password.';
      return { ok: false, error: message };
    }
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session ?? null);
    setUser(data.session?.user ?? null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, session, offlineUser, loading, signUp, signIn, signOut, resetPassword, updatePassword, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
};

function supabaseAuthStorageKey(): string | null {
  const key = (supabase.auth as unknown as { storageKey?: unknown }).storageKey;
  return typeof key === 'string' && key ? key : null;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an <AuthProvider>.');
  return ctx;
}
