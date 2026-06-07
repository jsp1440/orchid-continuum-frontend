import React, { useEffect, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import {
  fetchDailyGenus,
  fetchGenusSpecies,
  genusForToday,
  type GenusEntry,
} from '@/lib/genusData';

/**
 * GenusTeaser — a compact "featured specimen" banner shown directly below
 * the homepage hero. Resolves the daily genus (with full fallback) and a
 * single high-quality landscape photo, and anchors down to the full panel.
 */
const GenusTeaser: React.FC = () => {
  const [entry, setEntry] = useState<GenusEntry>(() => genusForToday());
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchDailyGenus().then((g) => {
      if (!cancelled) setEntry(g);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setImage(null);
    fetchGenusSpecies(entry.genus, ctrl.signal, 5)
      .then((s) => {
        if (s[0]?.image) setImage(s[0].image);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [entry.genus]);

  const scrollToPanel = () => {
    document
      .getElementById('genus-of-the-day')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const region = entry.regions[0]
    ? entry.regions.length > 1
      ? `${entry.regions[0]} & ${entry.regions[1]}`
      : entry.regions[0]
    : '';

  return (
    <section className="relative bg-[#10210f] border-y border-[#d4b34a]/15 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] items-stretch min-h-[200px]">
          {/* Specimen photo */}
          <div className="relative h-[160px] md:h-auto md:min-h-[210px] overflow-hidden">
            {loading ? (
              <div className="absolute inset-0 animate-pulse bg-[#22361f]" />
            ) : image ? (
              <img
                src={image}
                alt={entry.genus}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-[#22361f] to-[#16261d]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#10210f] hidden md:block" />
          </div>

          {/* Text */}
          <div className="flex flex-col justify-center py-7 md:py-8 md:pl-10">
            <div className="font-mono text-[10px] tracking-[0.36em] uppercase text-[#d4b34a]">
              Genus of the Day
            </div>
            {loading ? (
              <div className="mt-3 space-y-3">
                <div className="h-9 w-52 rounded bg-[#22361f] animate-pulse" />
                <div className="h-3 w-80 max-w-full rounded bg-[#22361f] animate-pulse" />
              </div>
            ) : (
              <>
                <h2
                  className="mt-2 italic leading-none text-[#faf7f2]"
                  style={{
                    fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
                    fontSize: 'clamp(2.2rem, 5vw, 3.4rem)',
                    fontWeight: 500,
                  }}
                >
                  {entry.genus}
                </h2>
                <div className="mt-2 font-mono text-[11px] tracking-[0.12em] uppercase text-[#cfc8b8]/80">
                  {entry.family} · {entry.tribe} · {entry.speciesCount} species
                  {region ? ` · ${region}` : ''}
                </div>
              </>
            )}
            <div className="mt-5">
              <button
                type="button"
                onClick={scrollToPanel}
                className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#d4b34a]/50 text-[#d4b34a] hover:bg-[#d4b34a] hover:text-[#10210f] transition-colors font-mono text-[10.5px] tracking-[0.2em] uppercase"
              >
                Explore Today&rsquo;s Genus
                <ArrowDown className="h-4 w-4 group-hover:translate-y-0.5 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default GenusTeaser;
