import React from 'react';
import { ArrowRight, Globe2, Leaf } from 'lucide-react';
import { useHomepageFeatured } from '@/lib/homepageFeaturedContext';

const HomeHero: React.FC = () => {
  const {
    genus,
    activeMedia,
    availability,
    attribution,
    license,
    mediaSource,
  } = useHomepageFeatured();

  const scrollToFeaturedGenus = () => {
    document.getElementById('species-in-focus')?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToAtlas = () => {
    document.getElementById('homepage-atlas')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative overflow-hidden border-b border-white/[0.06] bg-[#14281c] text-[#f5f0e8]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 14% 0%, rgba(54,102,72,0.35) 0%, transparent 55%),' +
            'linear-gradient(180deg, #1f3622 0%, #14281c 100%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1400px] px-6 pb-12 pt-24 lg:px-10 lg:pb-16 lg:pt-28">
        <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <div className="inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.30em] text-[#c9a24a]">
              <span className="inline-block h-px w-8 bg-[#c9a24a]/60" />
              Featured Genus · {genus}
            </div>

            <h1
              className="mt-6 leading-[1.02] tracking-[-0.012em] text-[#faf7f2]"
              style={{
                fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
                fontWeight: 500,
                fontSize: 'clamp(2.5rem, 5vw, 4.7rem)',
              }}
            >
              Orchids are never just flowers.
            </h1>

            <p
              className="mt-5 max-w-2xl leading-[1.45] text-[#e7dfd1]/90"
              style={{
                fontFamily: '"Cormorant Garamond","Playfair Display",Georgia,serif',
                fontSize: 'clamp(1.15rem, 1.65vw, 1.5rem)',
              }}
            >
              Follow one genus through species, place, pollinators, fungi,
              climate, evidence, and conservation.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={scrollToFeaturedGenus}
                className="group inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-6 py-3.5 font-mono text-[11px] uppercase tracking-[0.20em] text-[#14281c] transition-colors hover:bg-[#e6c763]"
              >
                <Leaf className="h-4 w-4" />
                Explore {genus}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <button
                type="button"
                onClick={scrollToAtlas}
                className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/40 px-6 py-3.5 font-mono text-[11px] uppercase tracking-[0.20em] text-[#faf7f2] transition-colors hover:border-[#d4b34a] hover:bg-[#d4b34a]/10"
              >
                <Globe2 className="h-4 w-4" />
                See it in place
              </button>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="relative min-h-[360px] overflow-hidden rounded-[2rem] border border-white/[0.10] bg-black/20 shadow-[0_30px_80px_rgba(0,0,0,0.35)] sm:min-h-[460px] lg:min-h-[560px]">
              {activeMedia ? (
                <>
                  <img
                    src={activeMedia.image_url}
                    alt={activeMedia.scientific_name}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="eager"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
                    <p className="font-serif text-2xl italic text-white sm:text-3xl">
                      {activeMedia.scientific_name}
                    </p>
                    <p className="mt-2 max-w-2xl text-xs leading-5 text-white/75 sm:text-sm">
                      {attribution || mediaSource || 'Orchid Continuum approved media'}
                      {license ? ` · ${license}` : ''}
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex min-h-[360px] h-full items-center justify-center px-8 text-center sm:min-h-[460px] lg:min-h-[560px]">
                  <div>
                    <p className="font-serif text-3xl italic text-[#f5f0e8]">{genus}</p>
                    <p className="mt-3 text-sm leading-6 text-[#d8cfbd]/75">
                      {availability === 'loading'
                        ? 'Loading an approved Featured Genus photograph…'
                        : availability === 'error'
                          ? 'The approved media service is temporarily unavailable.'
                          : 'No approved Featured Genus photograph is currently available.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HomeHero;
