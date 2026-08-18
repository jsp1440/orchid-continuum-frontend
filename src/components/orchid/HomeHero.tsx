import React, { useEffect, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import { useHeroSpecies } from '@/lib/heroSpeciesContext';
import { fetchCalyxGenusMedia } from '@/lib/genusMediaResolver';
import { creditLine, heroStateFromResponse, type HeroMediaState } from '@/lib/heroMedia';
import { FIRST_RELATIONSHIP_ANCHOR } from '@/lib/homepageAnchors';
import ContinuumThread from '@/components/orchid/ContinuumThread';

/**
 * HomeHero — one real orchid, at full size, and one way forward.
 *
 * The homepage no longer opens on the institution. It opens on the organism.
 * There is no logo watermark, no botanical ornament, no description of what
 * the platform is, and no row of competing calls to action: a visitor gets a
 * photograph of a real orchid, the name of what they are looking at, one
 * sentence, and one thread to follow.
 *
 * Every photograph here comes from the approved Orchid Continuum media library
 * and carries its credit. When there is no approved photograph, the hero says
 * so in plain words rather than substituting a stock image, and when the media
 * service fails, it says that instead — an outage and an empty archive are
 * different facts and are never shown as the same one.
 */

const HomeHero: React.FC = () => {
  const { genus } = useDailyGenus();
  const { setHeroSpecies } = useHeroSpecies();
  const [media, setMedia] = useState<HeroMediaState>({ kind: 'loading' });

  useEffect(() => {
    if (!genus) return;

    const controller = new AbortController();
    setMedia({ kind: 'loading' });

    fetchCalyxGenusMedia(genus, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setMedia(heroStateFromResponse(response));
      })
      .catch(() => {
        // fetchCalyxGenusMedia only rethrows on abort.
      });

    return () => controller.abort();
  }, [genus]);

  // Publish the orchid the page opens on, so the sections below follow the
  // same individual rather than each choosing their own.
  useEffect(() => {
    if (media.kind !== 'photograph') {
      setHeroSpecies(null);
      return;
    }
    setHeroSpecies({
      species: media.item.scientific_name,
      genus: media.item.genus || genus,
      image: media.item.image_url,
    });
  }, [media, genus, setHeroSpecies]);

  const followThread = () => {
    const target = document.getElementById(FIRST_RELATIONSHIP_ANCHOR);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const photograph = media.kind === 'photograph' ? media.item : null;
  const credit = photograph ? creditLine(photograph) : null;

  const title = photograph ? photograph.scientific_name : genus;
  const eyebrow = photograph
    ? `Orchidaceae · ${photograph.genus || genus}`
    : 'Orchidaceae';

  return (
    <section
      className="relative isolate flex min-h-[88vh] flex-col justify-end overflow-hidden bg-[#0d1a10] text-[#f5f0e8]"
    >
      {photograph && (
        <img
          key={photograph.image_url}
          src={photograph.image_url}
          alt={`${photograph.scientific_name}, photographed in the Orchid Continuum media library`}
          className="absolute inset-0 -z-10 h-full w-full object-cover"
          loading="eager"
          referrerPolicy="no-referrer"
          onError={() => setMedia({ kind: 'no_approved_media' })}
        />
      )}

      {/* Legibility scrim. Heavier at the bottom, where the words are. */}
      <div
        className="absolute inset-0 -z-10 pointer-events-none"
        aria-hidden="true"
        style={{
          background: photograph
            ? 'linear-gradient(180deg, rgba(8,18,11,0.62) 0%, rgba(8,18,11,0.18) 34%, rgba(8,18,11,0.72) 74%, rgba(8,18,11,0.94) 100%)'
            : 'radial-gradient(ellipse at 18% 8%, rgba(54,102,72,0.34) 0%, transparent 58%),' +
              'linear-gradient(180deg, #16271a 0%, #0b1710 100%)',
        }}
      />

      <div className="relative mx-auto w-full max-w-[1400px] px-6 pb-14 pt-28 lg:px-10 lg:pb-16 lg:pt-32">
        <div className="max-w-2xl">
          <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-[#d4b34a]">
            {eyebrow}
          </div>

          <h1
            className="mt-4 italic leading-[1.02] tracking-[-0.012em] text-[#fffaf0]"
            style={{
              fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
              fontWeight: 500,
              fontSize: 'clamp(2.3rem, 6vw, 4.6rem)',
            }}
          >
            {title}
          </h1>

          <p
            className="mt-5 max-w-xl text-[#e7dfd1] leading-[1.45]"
            style={{
              fontFamily: '"Cormorant Garamond","Playfair Display",Georgia,serif',
              fontSize: 'clamp(1.15rem, 1.9vw, 1.6rem)',
            }}
          >
            This orchid is the visible end of a much longer story.
          </p>

          {media.kind === 'no_approved_media' && (
            <p className="mt-4 max-w-xl text-sm leading-6 text-[#cfc6b4]/85">
              No photograph of {genus} has cleared the Continuum&apos;s image review yet, so
              this page will not show you one. The rest of what we know about it is real.
            </p>
          )}

          {media.kind === 'service_error' && (
            <p className="mt-4 max-w-xl text-sm leading-6 text-[#cfc6b4]/85">
              The Continuum&apos;s image library did not answer just now. This is our
              outage, not an absence of {genus} photographs.
            </p>
          )}

          <button
            type="button"
            onClick={followThread}
            className="group mt-9 inline-flex items-center gap-3 rounded-full bg-[#d4b34a] px-8 py-4 font-mono text-[11px] uppercase tracking-[0.22em] text-[#14281c] transition-colors hover:bg-[#e6c763] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d98a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1a10]"
          >
            Follow it outward
            <ArrowDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
          </button>
        </div>
      </div>

      {credit && (
        <div className="relative mx-auto w-full max-w-[1400px] px-6 lg:px-10">
          <p className="text-right font-mono text-[9px] uppercase tracking-[0.18em] text-[#cfc6b4]/55">
            {photograph?.source_record_url ? (
              <a
                href={photograph.source_record_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-4 transition-colors hover:text-[#d4b34a] hover:underline"
              >
                {credit}
              </a>
            ) : (
              credit
            )}
          </p>
        </div>
      )}

      {/* The thread leaves the hero here and is picked up by the first
          relationship, on the same rail. */}
      <div className="relative mx-auto hidden w-full max-w-[1400px] px-6 lg:block lg:px-10">
        <div className="w-10">
          <ContinuumThread className="h-16" fadeBottom />
        </div>
      </div>
    </section>
  );
};

export default HomeHero;
