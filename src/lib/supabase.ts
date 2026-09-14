import { createClient } from '@supabase/supabase-js';

const env = import.meta.env as Record<string, string | undefined>;

/**
 * The identity/database origin the browser bundle talks to.
 *
 * This used to be two string literals with no way to override them, so every
 * build — preview, university deployment, or a browser test run — was pinned to
 * one hosted project. That made the signed-in journeys impossible to exercise
 * anywhere except against production identity, which is the one place an
 * automated journey must not create accounts.
 *
 * The literals stay as the default so existing deployments are unchanged. The
 * key is the project's `anon` key, which is public by design: it is shipped in
 * the client bundle and carries no privileges beyond the project's row-level
 * policies. A service-role key must never appear here.
 */
const DEFAULT_SUPABASE_URL = 'https://cvjuxzkznxzxcjkdvzla.databasepad.com';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjI2NjhmNjM3LWUyZTQtNGFhZi05Mzc4LTY2NDRhNTkyYzhhZSJ9.eyJwcm9qZWN0SWQiOiJjdmp1eHprem54enhjamtkdnpsYSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzc4MDE5NDg2LCJleHAiOjIwOTMzNzk0ODYsImlzcyI6ImZhbW91cy5kYXRhYmFzZXBhZCIsImF1ZCI6ImZhbW91cy5jbGllbnRzIn0.AicoGenHPsQ1yHMmNZYvbzE05sBHyNjJep2FpNvT4Qk';

/** Trailing slashes break `${url}/auth/v1/...` concatenation inside supabase-js. */
function normaliseOrigin(value: string | undefined, fallback: string): string {
  const trimmed = (value || '').trim();
  return (trimmed || fallback).replace(/\/$/, '');
}

export const SUPABASE_URL = normaliseOrigin(env.VITE_SUPABASE_URL, DEFAULT_SUPABASE_URL);

export const SUPABASE_ANON_KEY = (env.VITE_SUPABASE_ANON_KEY || '').trim() || DEFAULT_SUPABASE_ANON_KEY;

/**
 * True when this bundle is pointed somewhere other than the shipped default.
 *
 * Callers that must not touch production identity — a browser journey creating
 * a throwaway account, for one — can assert on this instead of re-deriving the
 * comparison and getting it subtly wrong.
 */
export const SUPABASE_IS_DEFAULT_PROJECT = SUPABASE_URL === DEFAULT_SUPABASE_URL;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export { supabase };
