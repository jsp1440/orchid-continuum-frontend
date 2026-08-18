import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Globe2, MapPinned } from 'lucide-react';
import { useDailyGenus } from '@/lib/dailyGenusContext';

/**
 * Homepage Atlas window.
 *
 * This intentionally does not recreate the full GIS workspace. The homepage
 * asks one biological/geographic question using the same canonical featured-
 * taxon state as the hero and relationship view. Detailed cartography remains
 * the responsibility of the Atlas workspace / Atlas Next lane.
 */
const HomeAtlasContinuum: React.FC = () => {
  const { genus, continuum, continuumStatus } = useDailyGenus();
  const geography = continuum?.relationships?.geography ?? null;
  const occurrenceDomain = continuum?.domains.find((item) => item.domain === 'occurrences') ?? null;
  const hero = continuum?.media.items[0] ?? null;

  const evidenceAvailable = Boolean(geography?.hasData || occurrenceDomain?.state === 'known');

  return (
    <section id="home-atlas" className="relative overflow-hidden border-y border-white/[0.08] bg-[#07110c] text-[#f5f0e8]">
      {hero?.image_url ? (
        <div className="absolute inset-0" aria-hidden="true">
          <img src={hero.image_url} alt="" className="h-full w-full object-cover opacity-[0.12]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,17,12,0.98)_0%,rgba(7,17,12,0.90)_48%,rgba(7,17,12,0.78)_100%)]" />
        </div>
      ) : null}

      <div className="relative z-10 mx-auto grid max-w-[1300px] gap-8 px-6 py-12 lg:grid-cols-[0.9fr_1.1fr] lg:px-10 lg:py-16">
        <div>
          <div className="inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.28em] text-[#d4b34a]">
            <Globe2 className="h-4 w-4" />
            Living Atlas
          </div>
          <h2 className="mt-4 font-serif text-4xl leading-[1.02] text-[#fffaf0] md:text-5xl">
            Where do we actually know <span className="italic text-[#d4b34a]">{genus}</span> occurs?
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#d8cfbd]/82">
            The homepage now uses the same Continuum evidence state as the featured orchid instead of maintaining a second set of Atlas statistics and fallback counts.
          </p>
          <Link
            to="/atlas"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/45 bg-[#d4b34a]/10 px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#d4b34a] transition-colors hover:bg-[#d4b34a]/18"
          >
            Explore in Atlas <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="rounded-[1.5rem] border border-white/[0.09] bg-black/20 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.2)]">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d4b34a]/35 bg-[#d4b34a]/10 text-[#d4b34a]">
              <MapPinned className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#d4b34a]">Geographic evidence</p>
              <p className="mt-2 text-sm leading-6 text-[#d8cfbd]/82">
                {continuumStatus === 'loading' && 'Loading connected occurrence and geography evidence…'}
                {continuumStatus === 'unavailable' && 'Continuum evidence is temporarily unavailable. No geographic fallback has been substituted.'}
                {continuumStatus === 'ready' && evidenceAvailable && (geography?.summary || 'Occurrence evidence is linked in the Continuum.')}
                {continuumStatus === 'ready' && !evidenceAvailable && 'No geographic evidence is linked in the current Continuum view. This is a knowledge gap, not evidence that the orchid is absent.'}
              </p>
            </div>
          </div>

          {continuumStatus === 'ready' && geography?.items?.length ? (
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {geography.items.slice(0, 6).map((item) => (
                <div key={item} className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-3 text-sm text-[#eee4d1]">
                  {item}
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-5 border-t border-white/[0.08] pt-4 text-xs leading-5 text-[#9e978a]">
            Detailed occurrence points, locality protection, scale transitions, and thematic mapping remain in the Atlas workspace. The homepage does not invent counts when those services are unavailable.
          </div>
        </div>
      </div>
    </section>
  );
};

export default HomeAtlasContinuum;
