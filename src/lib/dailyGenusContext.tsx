/**
 * dailyGenusContext — single source of truth for Genus of the Day.
 *
 * Resolves the genus ONCE per 12-hour UTC window and distributes it via
 * React context so DailyGenusFeature, ContinuumWeb, SpeciesInFocus, and
 * HomeAtlas all display the same genus without independent fetches.
 *
 * Resolution order:
 *   1. featuredGenusName() — deterministic, synchronous, always works.
 *   2. Supabase daily_genus_snapshot (optional validation — if the table
 *      exists and returns a row for today's date, that name wins).
 *      If the snapshot is missing or stale, a diagnostic string is set so
 *      any component can surface a curator warning.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { featuredGenusName, msUntilNextRotation } from '@/lib/featuredGenus';
import { supabase } from '@/lib/supabase';

export interface DailyGenusState {
  /** The authoritative Genus of the Day name for this 12-hour window. */
  genus: string;
  /**
   * Non-null when the snapshot is missing, stale, or the Supabase call
   * failed. Curator-facing — surface in a diagnostic banner, not in the
   * public UI.
   */
  diagnostic: string | null;
}

const DailyGenusContext = createContext<DailyGenusState>({
  genus: featuredGenusName(),
  diagnostic: null,
});

/** Consume the shared Genus of the Day state. */
export function useDailyGenus(): DailyGenusState {
  return useContext(DailyGenusContext);
}

/** Wrap the homepage (or any subtree) to share a single resolved genus. */
export const DailyGenusProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<DailyGenusState>(() => ({
    genus: featuredGenusName(),
    diagnostic: null,
  }));

  // ── Snapshot validation (non-blocking) ──────────────────────────────────
  const validateSnapshot = useCallback(async () => {
    const local = featuredGenusName();
    try {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const { data, error } = await supabase
        .from('daily_genus_snapshot')
        .select('genus, snapshot_date')
        .eq('snapshot_date', today)
        .single();

      if (error || !data) {
        setState({
          genus: local,
          diagnostic:
            `[Genus of the Day] Supabase snapshot missing for ${today}. ` +
            `Falling back to deterministic rotation: ${local}. ` +
            `Insert a row into daily_genus_snapshot to override.`,
        });
        return;
      }

      const snapshotGenus = (data.genus as string | null)?.trim();
      if (!snapshotGenus) {
        setState({
          genus: local,
          diagnostic:
            `[Genus of the Day] Snapshot row for ${today} has empty genus. ` +
            `Using deterministic fallback: ${local}.`,
        });
        return;
      }

      // Snapshot present and valid — it wins.
      setState({ genus: snapshotGenus, diagnostic: null });
    } catch (err) {
      // daily_genus_snapshot table may not exist yet — that's fine.
      setState({
        genus: local,
        diagnostic:
          `[Genus of the Day] Could not query daily_genus_snapshot ` +
          `(table may not exist). Using deterministic rotation: ${local}. ` +
          `Error: ${String(err)}`,
      });
    }
  }, []);

  // ── Initial resolution ───────────────────────────────────────────────────
  useEffect(() => {
    validateSnapshot();
  }, [validateSnapshot]);

  // ── Auto-refresh at the 12-hour window boundary ─────────────────────────
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const scheduleRefresh = () => {
      const ms = msUntilNextRotation();
      timerRef.current = setTimeout(() => {
        validateSnapshot();
        scheduleRefresh(); // chain next refresh
      }, ms + 500); // +500ms to be safely past the boundary
    };
    scheduleRefresh();
    return () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
    };
  }, [validateSnapshot]);

  return (
    <DailyGenusContext.Provider value={state}>
      {children}
    </DailyGenusContext.Provider>
  );
};
