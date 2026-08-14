import React, { useEffect, useMemo } from 'react';
import { Camera, Leaf } from 'lucide-react';
import { useHomepageFeatured } from '@/lib/homepageFeaturedContext';

const ROTATE_MS = 45_000;

/**
 * Featured Genus visual anchor.
 *
 * The legacy implementation mixed multiple image/data paths, including a
 * direct iNaturalist fallback. The homepage now consumes the single shared
 * approved-media context instead. No external or AI-generated fallback is
 * permitted here.
 */
const DailyGenusFeatureV3: React.FC = () => {
  const {
    genus,
    activeSpecies,
    activeMedia,
    media,
    availability,
    attribution,
    license,
    mediaSource,
    selectSpecies,
  } = useHomepageFeatured();

  const activeIndex = useMemo(() => {
    if (!activeSpecies) return 0;
    const index = media.findIndex((item) => item.scientific_name === activeSpecies);
    return index >= 0 ? index : 0;
  }, [activeSpecies, media]);

  useEffect(() => {
    if (media.length < 2) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const id = window.setInterval(() => {
      const next = media[(activeIndex + 1) % media.length];
      if (next) selectSpecies(next.scientific_name);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [activeIndex, media, selectSpecies]);

  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-[#d9caa8] bg-[#fffaf0] shadow-[0_18px_44px_rgba(30,40,20,0.10)]">
      <div className="grid lg:grid-cols-[1.12fr_0.88fr]">
        <div className="relative min-h-[420px] bg-[#172719] sm:min-h-[520px]">
          {activeMedia ? (
            <>
              <img
                src={activeMedia.image_url}
                alt={activeMedia.scientific_name}
                className="absolute inset-0 h-full w-full object-cover"
                loading="eager"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/5 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
                <p className="font-serif text-3xl italic text-white sm:text-4xl">
                  {activeMedia.scientific_name}
                </p>
                <p className="mt-2 max-w-xl text-xs leading-5 text-white/78 sm:text-sm">
                  {attribution || mediaSource || 'Orchid Continuum approved media'}
                  {license ? ` · ${license}` : ''}
                </p>
              </div>
            </>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center px-8 text-center sm:min-h-[520px]">
              <div>
                {availability === 'loading' ? (
                  <Camera className="mx-auto h-10 w-10 text-[#c9a24a]" />
                ) : (
                  <Leaf className="mx-auto h-10 w-10 text-[#c9a24a]" />
                )}
                <p className="mt-4 font-serif text-3xl italic text-[#f5f0e8]">{genus}</p>
                <p className="mt-3 max-w-md text-sm leading-6 text-[#d8cfbd]/75">
                  {availability === 'loading'
                    ? 'Loading approved Featured Genus media…'
                    : availability === 'error'
                      ? 'The approved media service is temporarily unavailable.'
                      : 'No approved photograph is currently available for this Featured Genus.'}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="p-5 sm:p-7">
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#8a8062]">
            Featured Genus · {genus}
          </p>
          <h2 className="mt-2 font-serif text-3xl leading-tight text-[#24321f]">
            One genus, many species.
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#5d684c]">
            Select a documented species to carry the same context into the homepage map and the other connected views.
          </p>

          {media.length > 0 ? (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {media.slice(0, 9).map((item) => {
                const selected = item.scientific_name === activeSpecies;
                return (
                  <button
                    key={item.media_id}
                    type="button"
                    onClick={() => selectSpecies(item.scientific_name)}
                    aria-pressed={selected}
                    className={`group overflow-hidden rounded-xl border text-left transition ${
                      selected
                        ? 'border-[#9c7b25] ring-2 ring-[#d4b34a]/30'
                        : 'border-[#dfd1ad] hover:border-[#b79a54]'
                    }`}
                  >
                    <img
                      src={item.thumbnail_url || item.image_url}
                      alt={item.scientific_name}
                      className="h-28 w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                    <span className="block bg-[#fffaf0] px-3 py-2 font-serif text-sm italic leading-tight text-[#24321f]">
                      {item.scientific_name}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-[#dfd1ad] bg-[#f6f0df] p-4 text-sm leading-6 text-[#5d684c]">
              Species thumbnails are shown only when the approved media service supplies them. No unrelated species or external image source is substituted.
            </div>
          )}

          <p className="mt-5 text-xs leading-5 text-[#7c806f]">
            Species rotation stays inside <em>{genus}</em>. Automatic rotation pauses for visitors who request reduced motion, and any manual selection becomes the shared active species.
          </p>
        </div>
      </div>
    </section>
  );
};

export default DailyGenusFeatureV3;
