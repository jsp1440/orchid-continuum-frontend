/**
 * ocBackend — direct client for the live Orchid Continuum backend.
 *
 * Unlike src/lib/api.ts (which is env-driven and may be unconfigured in a
 * given deployment), this module talks to the known production backend at a
 * fixed base URL so the homepage widgets, Atlas, and Species dossiers work
 * out of the box on beta.orchidcontinuum.org.
 *
 *   BASE: https://api.orchidcontinuum.org
 *
 * Every helper is timeout-safe and never throws into a render tree; callers
 * receive typed values plus an ok flag and render honest empty states.
 */

import { supabase } from '@/lib/supabase';
import {
  BACKEND_BASE_URL,
  ATLAS_OCCURRENCES_URL as CONFIG_ATLAS_OCCURRENCES_URL,
} from '@/lib/backendConfig';

// Canonical Orchid Continuum backend base URL. Re-exported from the single
// source of truth in backendConfig.ts so every API fetch resolves against the
// same host. To re-host the app, edit backendConfig.ts — never here.
export const OC_BACKEND_BASE = BACKEND_BASE_URL;

// Atlas occurrence data endpoint, derived from the central config so it can
// never drift from OC_BACKEND_BASE.
export const ATLAS_OCCURRENCES_URL = CONFIG_ATLAS_OCCURRENCES_URL;

const DEFAULT_TIMEOUT = 12_000;

async function getJson<T>(
  url: string,
  signal?: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT,
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
