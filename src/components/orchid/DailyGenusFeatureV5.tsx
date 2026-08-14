import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, Mountain, Sprout } from 'lucide-react';
import { useHomepageFeatured } from '@/lib/homepageFeaturedContext';

const DailyGenusFeatureV5: React.FC = () => {
  const {
    genus,
    activeSpecies,
    activeMedia,
    media,
    availability,
    attribution,
    license,
    regionSummary,
    habitatSummary,
    elevationSummary,
    selectSpecies,
  } = useHomepageFeatured();

  return (
    <section className="border-b border-[#d8d0bf] bg-[#f4efe3] text-[#203025]">
      <div className="mx-auto max-w-[1280px] px-6 py-12 lg:px-10 lg:py-16">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="overflow-hidden rounded-[1.75rem] border border-[#d1c6ae] bg-[#e8e0cf] shadow-[0_24px_60px_rgba(40,55,40,0.10)]">
            {activeMedia ? (
              <figure>
                <img
                  src={activeMedia.image_url}
                  alt={activeMedia.scientific_name}
                  className="aspect-[4/3] w-full object-cover"
                  loading="eager"
                />
                <figcaption className="flex flex-col gap-1 border-t border-[#d1c6ae] bg-[#fffaf0] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="font-serif text-2xl italic">{activeMedia.scientific_name}</p>
                    <p className="mt-1 text-xs leading-5 text-[#66705f]">{attribution || 'Orchid Continuum approved media'}{license ? ` · ${license}` : ''}</p>
                  </div>
                </figcaption>
              </figure>
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center px-8 text-center">
                <div>
                  <p className="font-serif text-4xl italic">{genus}</p>
                  <p className="mt-3 max-w-md text-sm leading-6 text-[#66705f]">
                    {availability === 'loading'
                      ? 'Loading an approved orchid photograph…'
                      : availability === 'error'
                        ? 'The approved media service is temporarily unavailable.'
                        : 'No approved photograph is currently available for this Featured Genus.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#8a6f2d]">Featured Genus · {genus}</p>
            <h2 className="mt-3 font-serif text-4xl leading-tight md:text-5xl">Follow one orchid into its living context.</h2>
            <p className="mt-4 text-[17px] leading-7 text-[#566253]">
              Start with a documented species, then follow place, habitat, ecological relationships, evidence, and conservation deeper into the Continuum.
            </p>

            <div className="mt-6 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-[#d8d0bf] bg-[#fffaf0] p-4">
                <Sprout className="h-4 w-4 text-[#8a6f2d]" />
                <p className="mt-2 text-xs uppercase tracking-[0.15em] text-[#8a8062]">Habitat</p>
                <p className="mt-1 text-sm leading-5">{habitatSummary || 'Evidence not yet available'}</p>
              </div>
              <div className="rounded-xl border border-[#d8d0bf] bg-[#fffaf0] p-4">
                <MapPin className="h-4 w-4 text-[#8a6f2d]" />
                <p className="mt-2 text-xs uppercase tracking-[0.15em] text-[#8a8062]">Range</p>
                <p className="mt-1 text-sm leading-5">{regionSummary || 'Evidence not yet available'}</p>
              </div>
              <div className="rounded-xl border border-[#d8d0bf] bg-[#fffaf0] p-4">
                <Mountain className="h-4 w-4 text-[#8a6f2d]" />
                <p className="mt-2 text-xs uppercase tracking-[0.15em] text-[#8a8062]">Elevation</p>
                <p className="mt-1 text-sm leading-5">{elevationSummary || 'Evidence not yet available'}</p>
              </div>
            </div>

            {media.length > 1 && (
              <div className="mt-6">
                <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#8a8062]">Choose a species</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {media.slice(0, 6).map((item) => {
                    const active = item.scientific_name === activeSpecies;
                    return (
                      <button
                        type="button"
                        key={item.media_id}
                        onClick={() => selectSpecies(item.scientific_name)}
                        aria-pressed={active}
                        className={`rounded-full border px-3 py-2 text-xs transition-colors ${active ? 'border-[#8a6f2d] bg-[#ead9a5] text-[#263327]' : 'border-[#d8d0bf] bg-[#fffaf0] text-[#5e695b] hover:border-[#b8a66d]'}`}
                      >
                        <em>{item.scientific_name}</em>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <Link to={`/genus/${encodeURIComponent(genus)}`} className="mt-7 inline-flex items-center gap-2 rounded-full border border-[#9e8441] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.20em] text-[#5f4c1e] hover:bg-[#ead9a5]">
              Open research profile <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DailyGenusFeatureV5;
