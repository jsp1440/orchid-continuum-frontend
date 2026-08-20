import React, { useEffect } from 'react';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import { binomialOf } from '@/lib/fungalPartner';

/**
 * HeroOrchid — HOMEPAGE-SLICE-1.
 *
 * The hero consumes the same canonical featured-taxon state as the rest of the
 * homepage. It never performs its own scientific/media request and it fails
 * closed when source or license provenance is missing.
 */

export interface HeroPhotograph {
  imageUrl: string;
  scientificName: string;
  sourceName: string;
  license: string;
  attribution: string | null;
}

interface Props {
  /** Notifies the page which species the hero settled on, so downstream sections agree. */
  onSpeciesResolved?: (scientificName: string | null) => void;
}

function isBinomial(scientificName: string): boolean {
  const parts = scientificName.trim().split(/\s+/);
  return parts.length >= 2 && /^[a-z-]+$/.test(parts[1]);
}

const HeroOrchid: React.FC<Props> = ({ onSpeciesResolved }) => {
  const { genus, continuum, continuumStatus } = useDailyGenus();
  const media = continuum?.media ?? null;

  // Public hero media must retain source and license provenance. A URL alone is
  // not sufficient evidence for publication.
  const eligible = media?.items.filter((item) => Boolean(item.source_name?.trim()) && Boolean(item.license?.trim())) ?? [];
  const named = eligible.find((item) => isBinomial(item.scientific_name));
  const chosen = named ?? eligible[0] ?? null;

  useEffect(() => {
    onSpeciesResolved?.(named ? named.scientific_name : null);
  }, [named, onSpeciesResolved]);

  const photo: HeroPhotograph | null = chosen
    ? {
        imageUrl: chosen.image_url,
        scientificName: chosen.scientific_name,
        sourceName: chosen.source_name,
        license: chosen.license as string,
        attribution: chosen.attribution,
      }
    : null;

  const binomial = photo ? binomialOf(photo.scientificName) : genus;
  const authority = photo ? photo.scientificName.replace(binomial, '').trim() : '';
  const state = continuumStatus === 'loading'
    ? 'loading'
    : continuumStatus === 'unavailable' || media?.status === 'service_error'
      ? 'unavailable'
      : 'no-media';

  return (
    <section
      className="relative isolate overflow-hidden bg-[#0e1611]"
      aria-label={`Featured orchid: ${binomial}`}
    >
      <div className="relative h-[62vh] min-h-[380px] md:h-[64vh] lg:h-[66vh]">
        {photo ? (
          <img
            src={photo.imageUrl}
            alt={`${binomial} — photograph supplied by ${photo.sourceName}`}
            className="h-full w-full object-cover"
            loading="eager"
            decoding="async"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-6 text-center">
            <p className="max-w-md text-[15px] leading-7 text-[#9aa596]">
              {state === 'loading'
                ? 'Finding today’s orchid…'
                : state === 'no-media'
                  ? `No approved, fully attributed photograph is available for ${genus} yet.`
                  : 'The canonical featured-taxon record could not be reached just now.'}
            </p>
          </div>
        )}

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,16,12,0.10) 0%, rgba(10,16,12,0.42) 55%, rgba(10,16,12,0.93) 100%)',
          }}
        />

        <div className="absolute inset-x-0 bottom-0 px-6 pb-7 md:px-10 md:pb-9">
          <div className="mx-auto max-w-[1300px]">
            <h1
              className="max-w-[16ch] italic leading-[1.04] tracking-[-0.015em] text-[#f6f3ec]"
              style={{
                fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
                fontWeight: 500,
                fontSize: 'clamp(2rem, 5.2vw, 3.6rem)',
              }}
            >
              {binomial}
              {authority && (
                <span className="ml-2 align-baseline text-[0.36em] not-italic tracking-[0.06em] text-[#b9c0b2]">
                  {authority}
                </span>
              )}
            </h1>

            <p className="mt-3 max-w-[46ch] text-[15px] leading-7 text-[#ddd8cc] md:text-[16px]">
              One orchid, followed through the evidence the Continuum actually holds.
            </p>

            <a
              href="#what-feeds-it"
              className="mt-5 inline-flex min-h-[48px] items-center gap-2 rounded-full border border-[#e8e3d6]/25 px-5 text-[13px] tracking-[0.02em] text-[#f6f3ec] transition-colors hover:border-[#e8e3d6]/60 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4b34a]"
            >
              Follow this orchid ↓
            </a>

            {photo && (
              <p className="mt-5 font-mono text-[10px] leading-5 tracking-[0.02em] text-[#9aa596]">
                Source: {photo.sourceName}
                {` · License: ${photo.license.toUpperCase()}`}
                {' · '}
                {photo.attribution
                  ? `Photographer: ${photo.attribution}`
                  : 'Photographer not recorded in source metadata'}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroOrchid;
