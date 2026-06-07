import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Star, X, Loader2, Check, CloudOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  getFavorites,
  toggleFavorite,
  subscribeFavorites,
  getFavoritesSyncStatus,
  subscribeFavoritesSyncStatus,
  type FavoritesSyncStatus,
} from '@/lib/speciesFeature';

/**
 * "My Favorites" indicator for the navigation bar.
 *
 * Shows how many species the user has starred during the CURRENT browser
 * session (session memory only — no localStorage, no database writes). Clicking
 * opens a small dropdown panel listing the favorited species names; each can be
 * opened (Species) or removed. When empty it shows a gentle prompt.
 *
 * For signed-in users a small, non-intrusive account-sync indicator appears
 * (saving… / saved / offline) reflecting the background write to user_favorites.
 */

const useFavorites = (): string[] =>
  useSyncExternalStore(
    subscribeFavorites,
    getFavorites,
    getFavorites,
  );

const useSyncStatus = (): FavoritesSyncStatus =>
  useSyncExternalStore(
    subscribeFavoritesSyncStatus,
    getFavoritesSyncStatus,
    getFavoritesSyncStatus,
  );

/** Small inline sync-status chip — only rendered for signed-in users. */
const SyncIndicator: React.FC<{ status: FavoritesSyncStatus }> = ({ status }) => {
  if (status === 'idle') return null;
  const cfg = {
    saving: { icon: Loader2, label: 'saving…', cls: 'text-charcoal/60', spin: true },
    saved: { icon: Check, label: 'saved', cls: 'text-[#2f9e44]', spin: false },
    offline: { icon: CloudOff, label: 'offline', cls: 'text-[#d64545]', spin: false },
  }[status];
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[9px] tracking-[0.18em] uppercase ${cfg.cls}`}
      aria-live="polite"
    >
      <Icon className={`h-3 w-3 ${cfg.spin ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  );
};



const FavoritesMenu: React.FC = () => {
  const favorites = useFavorites();
  const syncStatus = useSyncStatus();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // The sync indicator is meaningful only for signed-in users.
  const showSync = !!user && syncStatus !== 'idle';


  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="My favorites"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.18em] uppercase text-charcoal/75 hover:text-forest transition-colors"
      >
        <span className="relative inline-flex">
          <Star
            className="h-4 w-4"
            fill={favorites.length ? '#C9A84C' : 'none'}
            stroke={favorites.length ? '#C9A84C' : 'currentColor'}
          />
          {favorites.length > 0 && (
            <span className="absolute -top-2 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#1f3d2b] text-[#faf7f2] text-[9px] leading-4 text-center font-mono">
              {favorites.length}
            </span>
          )}
        </span>
        <span className="hidden xl:inline">Favorites</span>
        {showSync && (
          <span className="ml-1 hidden xl:inline-flex">
            <SyncIndicator status={syncStatus} />
          </span>
        )}
      </button>


      {open && (
        <div className="absolute top-full right-0 mt-3 w-72 rounded-sm border border-quiet bg-warm-white shadow-[0_24px_60px_-24px_rgba(28,26,23,0.25)] py-2 z-50">
          <div className="px-4 py-2 border-b border-quiet flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">
              My Favorites
            </span>
            <span className="font-mono text-[10px] text-charcoal/60 flex items-center gap-2">
              {showSync && <SyncIndicator status={syncStatus} />}
              {favorites.length} this session
            </span>

          </div>

          {favorites.length === 0 ? (
            <div className="px-4 py-4 font-body text-[13px] leading-snug text-charcoal/70">
              No favorites yet — tap the star on any species card.
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {favorites.map((name) => (
                <li
                  key={name}
                  className="group flex items-center justify-between gap-2 px-4 py-2 hover:bg-[#f5f0e8] transition-colors"
                >
                  <button
                    onClick={() => {
                      setOpen(false);
                      navigate('/species');
                    }}
                    className="flex-1 text-left font-display italic text-[14px] text-ink group-hover:text-forest truncate"
                    title={name}
                  >
                    {name}
                  </button>
                  <button
                    onClick={() => toggleFavorite(name)}
                    aria-label={`Remove ${name} from favorites`}
                    className="shrink-0 text-charcoal/40 hover:text-[#7a2a28] transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default FavoritesMenu;
