import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Section launch flags
 * --------------------
 * A tiny feature-flag layer that lets a curator mark any "Coming Soon"
 * section as launched WITHOUT touching code. Flags live in the
 * `section_flags` Postgres table (section_name text, is_launched bool)
 * and are readable by everyone so the nav/footer can resolve routes.
 *
 * When a section's flag is `true`, the matching nav/footer link routes
 * to the real page URL. When `false` (or unknown), it routes to the
 * reusable `/coming-soon/:section` template instead.
 */

export interface SectionDef {
  /** Stable key — matches `section_flags.section_name` + the /coming-soon/:section param. */
  key: string;
  /** Human label for the link health report. */
  label: string;
  /** The real in-app route used once the section is launched. */
  realRoute: string;
}

/** The sections governed by launch flags. */
export const FLAGGED_SECTIONS: Record<string, SectionDef> = {
  conservatory: { key: 'conservatory', label: 'Conservatory',     realRoute: '/collection' },
  observatory:  { key: 'observatory',  label: 'Observatory',       realRoute: '/atlas' },
  university:   { key: 'university',   label: 'Orchid University',  realRoute: '/university' },
  oasis:        { key: 'oasis',        label: 'OASIS',              realRoute: '/oacs' },
  research:     { key: 'research',     label: 'Research Center',    realRoute: '/research' },
};

export type FlagMap = Record<string, boolean>;

let cache: FlagMap | null = null;
let inflight: Promise<FlagMap> | null = null;

async function fetchFlags(): Promise<FlagMap> {
  try {
    const { data, error } = await supabase
      .from('section_flags')
      .select('section_name, is_launched');
    if (error || !data) return {};
    const map: FlagMap = {};
    for (const row of data as { section_name: string; is_launched: boolean }[]) {
      map[row.section_name] = !!row.is_launched;
    }
    return map;
  } catch {
    return {};
  }
}

export function loadSectionFlags(): Promise<FlagMap> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetchFlags().then((m) => {
      cache = m;
      inflight = null;
      return m;
    });
  }
  return inflight;
}

/**
 * Resolve the destination route for a flagged section.
 * Launched  -> the real page route.
 * Otherwise -> the Coming Soon template for that section.
 */
export function resolveSectionRoute(sectionKey: string, flags: FlagMap): string {
  const def = FLAGGED_SECTIONS[sectionKey];
  if (!def) return `/coming-soon/${sectionKey}`;
  return flags[sectionKey] ? def.realRoute : `/coming-soon/${sectionKey}`;
}

/** React hook exposing the current flag map (loads once, cached). */
export function useSectionFlags(): FlagMap {
  const [flags, setFlags] = useState<FlagMap>(cache ?? {});
  useEffect(() => {
    let mounted = true;
    loadSectionFlags().then((m) => {
      if (mounted) setFlags(m);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return flags;
}
