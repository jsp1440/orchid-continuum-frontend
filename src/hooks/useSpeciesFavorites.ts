import { useCallback, useSyncExternalStore } from 'react';
import {
  isFavorite as storeIsFavorite,
  toggleFavorite as storeToggleFavorite,
  getFavorites,
  subscribeFavorites,
} from '@/lib/speciesFeature';

/**
 * useSpeciesFavorites — account-aware favorites store.
 *
 * This hook delegates to the shared `speciesFeature` external store, the SAME
 * store that <FavoritesSync> mirrors to the signed-in user's `user_favorites`
 * rows in Supabase. As a result, toggling a heart anywhere (species cards on
 * the genus page, the homepage carousel, etc.) is:
 *   • instantly reflected everywhere via useSyncExternalStore, and
 *   • persisted to the user's account across sessions / devices when signed in.
 *
 * Signed-out visitors still get an in-session store (favorites live in module
 * memory for the tab), and FavoritesSync hydrates the account favorites the
 * moment they sign in.
 */
export function useSpeciesFavorites() {
  const favorites = useSyncExternalStore(subscribeFavorites, getFavorites, getFavorites);

  const isFavorite = useCallback((species: string) => storeIsFavorite(species), []);
  const toggleFavorite = useCallback((species: string) => storeToggleFavorite(species), []);

  return { favorites, isFavorite, toggleFavorite, count: favorites.length };
}

export default useSpeciesFavorites;
