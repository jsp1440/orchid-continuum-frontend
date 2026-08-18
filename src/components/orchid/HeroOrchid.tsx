import React, { useEffect, useState } from 'react';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import { fetchCalyxGenusMedia } from '@/lib/genusMediaResolver';
import { binomialOf } from '@/lib/fungalPartner';

/**
 * HeroOrchid — HOMEPAGE-SLICE-1.
 *
 * The first public impression is a living orchid, per
 * docs/architecture/Living_Homepage_Philosophy.md ("The first public
 * impression should be a living orchid, not a logo").
 *
 * Replaces the previous typographic hero, which carried a logo watermark, a
 * second logo image, botanical line art, three competing calls to action, and
 * a fiscal-sponsorship line — none of which showed an orchid.
 *
 * Photograph comes from the approved library only. Credit is rendered from
 * whatever the library actually holds: where the photographer is not recorded
 * (common for the EOL-sourced records) that is stated rather than papered over.
 */

export interface HeroPhotograph {
  imageUrl: string;
  scientificName: string;
  sourceName: string;
  license: string | null;
  attribution: string | null;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; photo: HeroPhotograph }
  | { kind: 'no-media' }
  | { kind: 'unavailable' };

interface Props {
  /** Notifies the page which species the hero settled on, so downstream sections agree. */
  onSpeciesResolved?: (scientificName: string | null) => void;
}

const HeroOrchid: React.FC<Props> = ({ onSpeciesResolved }) => {
  const { genus } = useDailyGenus();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      // Uses the single approved-media path (genusMediaResolver), which already
      // targets the correct Calyx host, rejects non-photograph records, and
      // deduplicates. An earlier revision of this component called a different
      // backend host that does not serve this endpoint, and 404'd.
      const payload = await fetchCalyxGenusMedia(genus);
      if (cancelled) return;

      if (payload.status === 'service_error') {
        setState({ kind: 'unavailable' });
        onSpeciesResolved?.(null);
        return;
      }

      // Prefer a record naming an actual species, so the hero can state a
      // binomial truthfully rather than labelling a photograph with a bare
      // genus. `Vanilla Mill.` is a genus record, not a species.
      const named = payload.items.find((i) => {
        const parts = i.scientific_name.trim().split(/\s+/);
        return parts.length >= 2 && /^[a-z-]+$/.test(parts[1]);
      });
      const chosen = named ?? payload.items[0];

      if (!chosen) {
        setState({ kind: 'no-media' });
        onSpeciesResolved?.(null);
        return;
      }

      setState({
        kind: 'ready',
        photo: {
          imageUrl: chosen.image_url,
          scientificName: chosen.scientific_name,
          sourceName: chosen.source_name || 'unrecorded source',
          license: chosen.license,
          attribution: chosen.attribution,
        },
      });
      // Only a genuine binomial is passed downstream; a genus-only record must
      // not be treated as a species when resolving relationship evidence.
      onSpeciesResolved?.(named ? chosen.scientific_name : null);
    })();

    return () => {
      cancelled = true;
    };
  }, [genus, onSpeciesResolved]);

  const photo = state.kind === 'ready' ? state.photo : null;
  const binomial = photo ? binomialOf(photo.scientificName) : genus;
  const authority = photo ? photo.scientificName.replace(binomial, '').trim() : '';

  return (
    <section
      className="relative isolate overflow-hidden bg-[#0e1611]"
      aria-label={`Featured orchid: ${binomial}`}
    >
      {/* The photograph is the hero. Height stops short of the viewport so the
          next section's edge shows and the scroll is invited, not instructed. */}
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
              {state.kind === 'loading'
                ? 'Finding today’s orchid…'
                : state.kind === 'no-media'
                  ? `No approved photograph is available for ${genus} yet.`
                  : 'The image library could not be reached just now.'}
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
              One orchid, and everything it depends on.
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
                {photo.license ? ` · License: ${photo.license.toUpperCase()}` : ' · License not recorded'}
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
