import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

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
  const [loading, setLoading] = useState(true);

  // Hydrate session on mount + subscribe to auth changes.
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      setLoading(false);
    }).catch(() => {
      if (!mounted) return;
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
      setUser(newSession?.user ?? null);
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
      value={{ user, session, loading, signUp, signIn, signOut, resetPassword, updatePassword, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an <AuthProvider>.');
  return ctx;
}
