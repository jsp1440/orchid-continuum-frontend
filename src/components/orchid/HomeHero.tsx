import React from 'react';
import { ArrowDown } from 'lucide-react';
import { useDailyGenus } from '@/lib/dailyGenusContext';

/**
 * Public hero driven by the canonical FeaturedTaxonContinuum contract.
 * No decorative/stock image fallback is permitted: if approved media is not
 * available, the hero renders an explicit scientific no-media state.
 */
const HomeHero: React.FC = () => {
  const { genus, continuum, continuumStatus } = useDailyGenus();
  const media = continuum?.media.items[0] ?? null;

  const scrollToStory = () => {
    document.getElementById('species-in-focus')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative min-h-[68vh] overflow-hidden border-b border-white/[0.08] bg-[#142319] text-[#f5f0e8]">
      {media ? (
        <>
          <img
            src={media.image_url}
            alt={media.scientific_name}
            className="absolute inset-0 h-full w-full object-cover"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/10" />
        </>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(65,105,74,0.38),transparent_48%),linear-gradient(180deg,#1f3622_0%,#142319_100%)]" />
      )}

      <div className="relative z-10 mx-auto flex min-h-[68vh] max-w-[1400px] items-end px-6 pb-10 pt-24 lg:px-10 lg:pb-14">
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#d8bd72]">
            Featured orchid · Orchid Continuum
          </p>

          <h1
            className="mt-3 leading-[0.98] tracking-[-0.02em] text-white"
            style={{
              fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
              fontWeight: 500,
              fontSize: 'clamp(2.8rem, 7vw, 6.2rem)',
            }}
          >
            <span className="italic">{media?.scientific_name || genus}</span>
          </h1>

          <p
            className="mt-4 max-w-2xl text-[#f3eee5]/92"
            style={{
              fontFamily: '"Cormorant Garamond","Playfair Display",Georgia,serif',
              fontSize: 'clamp(1.2rem, 2vw, 1.65rem)',
              lineHeight: 1.35,
            }}
          >
            One orchid, followed outward through the evidence and relationships the Continuum actually knows.
          </p>

          {!media && (
            <p className="mt-4 max-w-xl rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-sm text-[#e7dfd1]">
              {continuumStatus === 'loading'
                ? 'Loading approved Orchid Continuum media…'
                : continuumStatus === 'unavailable'
                  ? 'Approved Orchid Continuum media is temporarily unavailable.'
                  : 'No approved Orchid Continuum photograph is available for this featured taxon yet.'}
            </p>
          )}

          {media && (
            <div className="mt-4 max-w-2xl font-mono text-[10px] leading-5 tracking-[0.06em] text-[#e4dccd]/85">
              <span>{media.source_name}</span>
              {media.license && <span> · {media.license}</span>}
              <span> · {media.attribution?.trim() || 'photographer attribution not supplied by source'}</span>
            </div>
          )}

          <button
            type="button"
            onClick={scrollToStory}
            className="mt-7 inline-flex items-center gap-2 rounded-full border border-[#d8bd72]/65 bg-black/20 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-white backdrop-blur-sm transition hover:bg-black/35"
          >
            Follow this orchid <ArrowDown className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default HomeHero;
