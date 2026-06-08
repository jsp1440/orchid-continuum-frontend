import { supabase } from '@/lib/supabase';
import {
  BACKEND_BASE_URL,
  ATLAS_OCCURRENCES_URL as CONFIG_ATLAS_OCCURRENCES_URL,
} from '@/lib/backendConfig';

export const OC_BACKEND_BASE = BACKEND_BASE_URL;
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
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) return { ok: false, status: res.status, data: null };

    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Genus of the Day
// ---------------------------------------------------------------------------

export interface GenusDaily {
  genus: string;
  species_count: number;
  common_name: string | null;
  conservation_status: string | null;
  image_url: string | null;
  date: string;
  is_demo: boolean;
}

export async function fetchGenusOfDay(
  signal?: AbortSignal,
): Promise<GenusDaily | null> {
  const { data } = await getJson<GenusDaily>(
    `${OC_BACKEND_BASE}/api/genus/daily`,
    signal,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Occurrences
// ---------------------------------------------------------------------------

export interface OccurrencePoint {
  id: string;
  lat: number;
  lng: number;
  species: string;
  country: string | null;
  source: 'continuum';
}

interface BackendOccurrence {
  id?: string | number;
  taxonomy_id?: string;
  decimal_latitude?: number | string;
  decimal_longitude?: number | string;
  latitude?: number | string;
  longitude?: number

