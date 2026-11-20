import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import { binomialOf } from '@/lib/fungalPartner';
import { isInaturalistPhotographUrl, publicGenusMediaItems } from '@/lib/genusMediaResolver';

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

const HeroOrchid: React.FC<Props> = (props) => {
  const { genus } = useDailyGenus();
  return <HeroPhotographs key={genus} {...props} />;
};

const HeroPhotographs: React.FC<Props> = ({ onSpeciesResolved }) => {
  const { genus, continuum, continuumStatus } = useDailyGenus();
  const media = continuum?.media ?? null;

  // A URL alone is not sufficient evidence for public publication. All mounted
  // homepage media surfaces share this same source+license boundary.
  const eligible = useMemo(() => publicGenusMediaItems(media?.items ?? [])
    // The NYBG herbarium host carries preserved specimens in the current feed.
    // Prefer approved observation photographs for the homepage opening.
    .filter((item) => new URL(item.image_url).hostname !== 'sweetgum.nybg.org')
    .sort((a, b) => Number(isInaturalistPhotographUrl(b.image_url)) - Number(isInaturalistPhotographUrl(a.image_url))), [media]);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const usable = eligible.filter((item) => !failed.has(item.image_url));
  const chosen = usable.find((item) => item.image_url === selectedUrl)
    ?? usable.find((item) => isBinomial(item.scientific_name)) ?? usable[0] ?? null;
  const currentIndex = chosen ? usable.indexOf(chosen) : 0;
  const advance = (offset: number) => {
    if (usable.length > 1) setSelectedUrl(usable[(currentIndex + offset + usable.length) % usable.length].image_url);
  };

  useEffect(() => {
    onSpeciesResolved?.(chosen && loadedUrl === chosen.image_url && isBinomial(chosen.scientific_name)
      ? chosen.scientific_name : null);
  }, [chosen, loadedUrl, onSpeciesResolved]);

  useEffect(() => {
    if (!chosen) return;
    const url = chosen.image_url;
    if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) {
      setLoadedUrl(url);
      return;
    }
    const timeout = window.setTimeout(() => {
      setFailed((old) => new Set(old).add(url));
    }, 9_000);
    if (loadedUrl === url) window.clearTimeout(timeout);
    return () => window.clearTimeout(timeout);
  }, [chosen, loadedUrl]);

  useEffect(() => {
    if (paused || reducedMotion || !chosen || loadedUrl !== chosen.image_url || usable.length < 2) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setSelectedUrl(usable[(currentIndex + 1) % usable.length].image_url);
      }
    }, 45_000);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion, chosen, loadedUrl, currentIndex, usable]);

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
  const licenseUrl = photo?.license.trim().match(/^https?:\/\/creativecommons\.org\/(?:licenses|publicdomain)\/[a-z-]+\/\d+(?:\.\d+)*\/?$/i)?.[0]
    .replace(/^http:/i, 'https:');
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
      <div className={photo ? "relative h-[62vh] min-h-[380px] md:h-[64vh] lg:h-[66vh]" : "relative min-h-[360px]"}>
        {photo ? (
          <img
            key={photo.imageUrl}
            ref={imageRef}
            onLoad={() => setLoadedUrl(photo.imageUrl)}
            onError={() => setFailed((old) => new Set(old).add(photo.imageUrl))}
            src={photo.imageUrl}
            alt={`${binomial} — photograph supplied by ${photo.sourceName}`}
            className="h-full w-full object-cover"
            loading="eager"
            decoding="async"
          />
        ) : (
          <div className="flex min-h-[360px] w-full items-start justify-end px-6 pt-6 text-right">
            <p className="max-w-xs text-[13px] leading-6 text-[#9aa596]">
              {state === 'loading'
                ? 'Finding today’s orchid…'
                : state === 'no-media'
                  ? eligible.length ? 'The approved photographs could not be loaded. Please try again later.' : `No approved, fully attributed photograph is available for ${genus} yet.`
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
            <p className="mb-3 text-xs uppercase tracking-[0.18em] text-[#d4b34a]">Featured genus · {genus}</p>
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

            {usable.length > 1 && (
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[#f6f3ec]" aria-label="Featured orchid photographs">
                <button type="button" className="min-h-11 rounded-full border border-white/30 px-4" onClick={() => { setPaused(true); advance(-1); }} aria-label="Previous orchid photograph">←</button>
                <span>{currentIndex + 1} / {usable.length}</span>
                <button type="button" className="min-h-11 rounded-full border border-white/30 px-4" onClick={() => { setPaused(true); advance(1); }} aria-label="Next orchid photograph">→</button>
                <button type="button" className="min-h-11 rounded-full border border-white/30 px-4" onClick={() => setPaused(!paused)}>{paused ? 'Resume photographs' : reducedMotion ? 'Manual photographs' : 'Pause photographs'}</button>
              </div>
            )}
            {photo && (
              <p className="mt-5 font-mono text-[10px] leading-5 tracking-[0.02em] text-[#9aa596]">
                Source: {photo.sourceName}
                {' · License: '}
                {licenseUrl ? (
                  <a href={licenseUrl} className="underline underline-offset-2">Creative Commons terms</a>
                ) : photo.license.toUpperCase()}
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
