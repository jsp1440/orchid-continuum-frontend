import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ArrowRight, Bookmark, LogIn, Trash2, Leaf } from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import FallbackImage from '@/components/orchid/FallbackImage';
import useSpeciesFavorites from '@/hooks/useSpeciesFavorites';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { addFavorites } from '@/lib/speciesFeature';
import {
  fetchGenusImages,
  buildImageMap,
  binomialOf,
  type GenusImage,
} from '@/lib/genusData';

/**
 * SavedOrchids — "My Saved Orchids" page.
 *
 * Lists every species the visitor has bookmarked (the heart on a species
 * plate). For a signed-in user these are persisted to `user_favorites` and
 * synced across devices by <FavoritesSync>; this page additionally hydrates
 * directly from the account on load so a fresh session shows them immediately.
 * Each card resolves a real photograph (trusted library → Wikimedia fallback)
 * by genus, links to the dossier, and can be removed inline.
 */
const SavedOrchids: React.FC = () => {
  const { user } = useAuth();
  const { favorites, toggleFavorite, count } = useSpeciesFavorites();
  // genus(lower) → binomial → GenusImage, lazily fetched per distinct genus.
  const [imagesByGenus, setImagesByGenus] = useState<Record<string, Map<string, GenusImage>>>({});

  // Hydrate persisted account favorites directly on load (FavoritesSync also
  // does this, but loading here guarantees the page is populated immediately).
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('user_favorites')
          .select('species_name')
          .eq('user_id', user.id);
        if (!active || error || !data) return;
        addFavorites(
          data.map((r: { species_name: string | null }) => r.species_name ?? '').filter(Boolean),
        );
      } catch {
        /* offline / table missing — session favorites still render */
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  // Distinct genera among the favorites — fetch each one's images once.
  const genera = useMemo(() => {
    const set = new Set<string>();
    favorites.forEach((f) => {
      const g = (f.split(/\s+/)[0] || '').trim();
      if (g) set.add(g);
    });
    return Array.from(set);
  }, [favorites]);

  useEffect(() => {
    const ctrl = new AbortController();
    genera.forEach((g) => {
      const key = g.toLowerCase();
      if (imagesByGenus[key]) return;
      fetchGenusImages(g, ctrl.signal, 20)
        .then((imgs) => {
          if (ctrl.signal.aborted) return;
          setImagesByGenus((prev) => ({ ...prev, [key]: buildImageMap(imgs) }));
        })
        .catch(() => {
          /* keep placeholder for this genus */
        });
    });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genera.join('|')]);

  return (
    <div
      className="min-h-screen bg-[#1a2e1a] text-[#f5f0e8]"
      style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
    >
      <style>{`
        .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
      `}</style>
      <Navbar />

      <main className="pt-28 pb-24 max-w-[1200px] mx-auto px-6 lg:px-10">
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.36em] uppercase text-[#c9a24a]/85">
          <Bookmark className="h-3.5 w-3.5" /> Your collection
        </div>
        <h1
          className="mt-3 italic leading-[0.95]"
          style={{ fontFamily: '"Playfair Display",Georgia,serif', fontSize: 'clamp(2.4rem,5vw,3.8rem)' }}
        >
          My Saved Orchids
        </h1>
        <p className="mt-4 max-w-2xl text-[#cfc8b8]">
          {count > 0
            ? `${count} species bookmarked.`
            : 'You haven’t saved any orchids yet.'}{' '}
          {user ? (
            <span className="text-[#a9b896]">Synced to your account across devices.</span>
          ) : (
            <span className="text-[#a9b896]">
              Saved for this session — sign in to keep them across devices.
            </span>
          )}
        </p>

        {!user && (
          <Link
            to="/account"
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#c9a24a]/40 hover:border-[#c9a24a] hover:bg-[#c9a24a]/[0.08] font-mono text-[10px] tracking-[0.2em] uppercase text-[#f5f0e8]"
          >
            <LogIn className="h-3.5 w-3.5 text-[#c9a24a]" /> Sign in to sync
          </Link>
        )}

        {/* Empty state */}
        {count === 0 ? (
          <div className="mt-12 rounded-2xl border border-white/10 bg-[#13241a] p-12 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-[#c9a24a]/40 text-[#c9a24a]">
              <Heart className="h-6 w-6" strokeWidth={1.2} />
            </span>
            <p className="mt-4 text-[#cfc8b8]">
              Browse the field guide and tap the heart on any orchid to save it here.
            </p>
            <Link
              to="/species"
              className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#c9a24a] text-[#1a2e1a] font-mono text-[11px] tracking-[0.22em] uppercase hover:bg-[#d8b35a]"
            >
              Explore the flora <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {favorites.map((species) => {
              const genusKey = (species.split(/\s+/)[0] || '').toLowerCase();
              const trusted = imagesByGenus[genusKey]?.get(binomialOf(species));
              const urls = trusted?.image_urls ?? (trusted?.image_url ? [trusted.image_url] : []);
              return (
                <div
                  key={species}
                  className="group rounded-2xl overflow-hidden bg-[#f5f0e8] text-[#2f3b21] border border-[#2f3b21]/12 hover:border-[#c9a24a]/60 transition-colors flex flex-col"
                >
                  <Link to={`/species/${encodeURIComponent(species)}`} className="block">
                    <div className="relative aspect-[4/3] bg-[#eae3d2]">
                      {urls.length > 0 ? (
                        <FallbackImage
                          urls={urls}
                          alt={species}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a2e1a] text-[#C9A84C]">
                          <Leaf className="h-5 w-5" strokeWidth={1.25} />
                          <span className="mt-2 font-mono text-[8px] tracking-[0.18em] uppercase text-[#C9A84C]">
                            Loading photo…
                          </span>
                        </div>
                      )}
                    </div>
                  </Link>
                  <div className="p-5 flex items-start justify-between gap-3">
                    <div>
                      <div
                        className="italic leading-tight text-[18px]"
                        style={{ fontFamily: '"Playfair Display",Georgia,serif' }}
                      >
                        {species}
                      </div>
                      <Link
                        to={`/species/${encodeURIComponent(species)}`}
                        className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] tracking-[0.16em] uppercase text-[#5a6b3f] hover:text-[#b08a1e]"
                      >
                        View dossier <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleFavorite(species)}
                      aria-label={`Remove ${species} from saved`}
                      title="Remove from saved"
                      className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#2f3b21]/15 text-[#a23b4b] hover:bg-[#a23b4b]/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default SavedOrchids;
