import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
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

function photographerCredit(attribution: string | null): string | null {
  return typeof attribution === 'string' ? attribution.trim() || null : null;
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
    // Prefer credited photographs, then species names and observation sources.
    .filter((item) => new URL(item.image_url).hostname !== 'sweetgum.nybg.org')
    .sort((a, b) =>
      Number(Boolean(photographerCredit(b.attribution))) - Number(Boolean(photographerCredit(a.attribution)))
      || Number(isBinomial(b.scientific_name)) - Number(isBinomial(a.scientific_name))
      || Number(isInaturalistPhotographUrl(b.image_url)) - Number(isInaturalistPhotographUrl(a.image_url)),
    ), [media]);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const usable = eligible.filter((item) => !failed.has(item.image_url));
  const chosen = usable.find((item) => item.image_url === selectedUrl)
    ?? usable[0] ?? null;
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
        attribution: photographerCredit(chosen.attribution),
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
    <section className="bg-[#0e1c14] text-[#f6f3ec]" aria-labelledby="homepage-heading">
      <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[minmax(0,0.87fr)_minmax(0,1.13fr)]">
        <div className="flex flex-col justify-center px-6 py-9 sm:px-10 sm:py-12 lg:py-14 xl:pl-16 xl:pr-12">
          <p className="text-sm font-semibold text-[#e0bc62]">Orchid Continuum</p>
          <h1 id="homepage-heading" className="mt-3 max-w-[14ch] font-display text-[clamp(2.55rem,5vw,5rem)] leading-[1.04] tracking-[-0.035em]">
            Discover the extraordinary world of orchids
          </h1>
          <p className="mt-5 max-w-[43ch] text-base leading-7 text-[#ded8ca] sm:text-lg sm:leading-8">
            We bring maps, observations, and research together so anyone can explore orchid biodiversity. Follow orchids into the habitats, pollinator partnerships, and fungal networks that sustain them and see what it takes to protect them.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link
              to="/atlas-next?expedition=ecuador"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-[#ebca74] px-5 text-sm font-semibold text-[#192318] transition-colors hover:bg-[#f5dc9b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ebca74]"
            >
              <Compass aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
              Begin Discovery Expedition
            </Link>
            <Link
              to="/atlas-next"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-sm text-sm font-medium text-[#f6f3ec] underline decoration-[#ebca74]/60 underline-offset-4 hover:decoration-[#ebca74] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ebca74]"
            >
              Explore the Atlas
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <section
          className="flex min-w-0 flex-col overflow-hidden border-t border-[#f6f3ec]/15 bg-[#101a14] lg:border-l lg:border-t-0"
          aria-label={`Featured orchid: ${binomial}`}
        >
          <div className="relative min-h-[240px] flex-1 bg-[#16221a] sm:min-h-[320px] lg:min-h-[390px]">
            {photo ? (
              <img
                key={photo.imageUrl}
                ref={imageRef}
                onLoad={() => setLoadedUrl(photo.imageUrl)}
                onError={() => setFailed((old) => new Set(old).add(photo.imageUrl))}
                src={photo.imageUrl}
                alt={`${binomial} — photograph supplied by ${photo.sourceName}`}
                className="absolute inset-0 h-full w-full object-cover"
                loading="eager"
                decoding="async"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,#273c2a,#152218)] px-6 text-center">
                <p className="max-w-xs text-sm leading-6 text-[#c1c9ba]">
                  {state === 'loading'
                    ? 'Finding today’s orchid…'
                    : state === 'no-media'
                      ? eligible.length ? 'The approved photographs could not be loaded. Please try again later.' : `No approved, fully attributed photograph is available for ${genus} yet.`
                      : 'The Featured Genus record is temporarily unavailable.'}
                </p>
              </div>
            )}
          </div>
          <div className="border-t border-[#f6f3ec]/15 px-6 py-5 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#e0bc62]">Featured genus · {genus}</p>
                <h2 className="mt-1 break-words font-display text-[clamp(1.75rem,3vw,2.6rem)] italic leading-tight text-[#f6f3ec]">
                  {binomial}
                  {authority && (
                    <span className="ml-2 align-baseline text-[0.48em] not-italic text-[#c1c9ba]">{authority}</span>
                  )}
                </h2>
              </div>
              <a
                href="#what-feeds-it"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-sm text-sm font-medium text-[#ebca74] underline decoration-[#ebca74]/55 underline-offset-4 hover:decoration-[#ebca74] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ebca74]"
              >
                Follow this orchid
                <ArrowDown aria-hidden="true" className="h-4 w-4" />
              </a>
            </div>

            {usable.length > 1 && (
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[#f6f3ec]" aria-label="Featured orchid photographs">
                <button type="button" className="min-h-11 rounded-full border border-white/30 px-4" onClick={() => { setPaused(true); advance(-1); }} aria-label="Previous orchid photograph">←</button>
                <span>{currentIndex + 1} / {usable.length}</span>
                <button type="button" className="min-h-11 rounded-full border border-white/30 px-4" onClick={() => { setPaused(true); advance(1); }} aria-label="Next orchid photograph">→</button>
                <button type="button" className="min-h-11 rounded-full border border-white/30 px-4" onClick={() => setPaused(!paused)}>{paused ? 'Resume photographs' : reducedMotion ? 'Manual photographs' : 'Pause photographs'}</button>
              </div>
            )}
            {photo && (
              <p className="mt-2 break-words text-xs leading-5 text-[#c1c9ba]">
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
        </section>
      </div>
    </section>
  );
};

export default HeroOrchid;
