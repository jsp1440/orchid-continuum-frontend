import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  subscribeFavorites,
  getFavoritesSet,
  addFavorites,
  setFavoritesSyncStatus,
} from '@/lib/speciesFeature';


/**
 * FavoritesSync — renderless background bridge between the session-only
 * favorites store and a signed-in user's persisted account favorites.
 *
 * Behaviour:
 *   • Signed-in: on sign-in, hydrate the in-memory store from the user's
 *     `user_favorites` rows (fast local cache stays the source of truth for the
 *     UI), then mirror every subsequent add/remove to the database in the
 *     background.
 *   • Signed-out: do nothing — session-only behaviour is unchanged.
 *
 * All DB calls are best-effort and never throw, so a missing table or transient
 * error degrades gracefully to session-only favorites.
 */
const FavoritesSync = (): null => {
  const { user } = useAuth();
  const prevRef = useRef<Set<string>>(new Set());
  const userIdRef = useRef<string | null>(null);

  // Hydrate from the account when the signed-in user changes.
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
    if (!user) {
      prevRef.current = new Set(getFavoritesSet());
      return;
    }
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('user_favorites')
          .select('species_name')
          .eq('user_id', user.id);
        if (!active || error || !data) return;
        const names = data
          .map((r: { species_name: string | null }) => r.species_name ?? '')
          .filter(Boolean);
        addFavorites(names);
      } catch {
        /* table missing / offline — session-only, non-fatal */
      } finally {
        if (active) prevRef.current = new Set(getFavoritesSet());
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  // Mirror local changes to the database for the signed-in user, surfacing a
  // small sync status (saving → saved / offline) consumed by the FavoritesMenu.
  useEffect(() => {
    let savedTimer: ReturnType<typeof setTimeout> | null = null;

    const unsub = subscribeFavorites(() => {
      const uid = userIdRef.current;
      const next = new Set(getFavoritesSet());
      const prev = prevRef.current;
      prevRef.current = next;
      if (!uid) return;
      const added: string[] = [];
      const removed: string[] = [];
      next.forEach((n) => { if (!prev.has(n)) added.push(n); });
      prev.forEach((n) => { if (!next.has(n)) removed.push(n); });
      if (added.length === 0 && removed.length === 0) return;

      if (savedTimer) { clearTimeout(savedTimer); savedTimer = null; }
      setFavoritesSyncStatus('saving');

      const writes: Promise<boolean>[] = [];

      added.forEach((name) => {
        writes.push(
          (async () => {
            try {
              const { error } = await supabase
                .from('user_favorites')
                .upsert(
                  { user_id: uid, species_name: name },
                  { onConflict: 'user_id,species_name' },
                );
              return !error;
            } catch {
              return false;
            }
          })(),
        );
      });
      removed.forEach((name) => {
        writes.push(
          (async () => {
            try {
              const { error } = await supabase
                .from('user_favorites')
                .delete()
                .eq('user_id', uid)
                .eq('species_name', name);
              return !error;
            } catch {
              return false;
            }
          })(),
        );
      });

      Promise.all(writes).then((results) => {
        const allOk = results.every(Boolean);
        if (allOk) {
          setFavoritesSyncStatus('saved');
          savedTimer = setTimeout(() => setFavoritesSyncStatus('idle'), 2000);
        } else {
          setFavoritesSyncStatus('offline');
        }
      });
    });

    return () => {
      if (savedTimer) clearTimeout(savedTimer);
      unsub();
    };
  }, []);


  return null;
};

export default FavoritesSync;
