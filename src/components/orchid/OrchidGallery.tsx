import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ImageOff, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import {
  fetchLivingGalleryRecords,
  isOrchidContinuumLive,
  type LivingGalleryRecord,
} from '@/lib/orchidContinuum';

/**
 * OrchidGallery — the homepage "Living Gallery" / Orchid Continuum Gallery.
 *
 * A slowly-rotating, conservatory-wall display of REAL orchid records
 * sourced from the Orchid Continuum database / approved image library.
 *
 * STRICT CONTENT RULES (enforced here):
 *   - No AI-generated orchid imagery is ever rendered.
 *   - If the live database is not connected, each card shows clearly
 *     labeled placeholder tokens (REAL_ORCHID_IMAGE_FROM_DATABASE,
 *     REAL_SPECIES_NAME, REAL_HABITAT_DESCRIPTION, REAL_SOURCE_CREDIT).
 *   - All data — image, taxon, habitat, credit — flows through
 *     `@/lib/orchidContinuum` so the live backend can be wired in
 *     a single place without touching this component.
 *
 * Visual style: dark botanical conservatory wall, refined gold/green
 * accents, scientific tone, slow elegant rotation, no flashy motion.
 */

const ROTATION_INTERVAL_MS = 9000; // slow, conservatory-wall cadence
const VISIBLE_PER_VIEW = 3;        // desktop: 3 cards side by side

const OrchidGallery: React.FC = () => {
  const [records, setRecords] = useState<LivingGalleryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Load records (placeholder hook today; live API tomorrow).
  useEffect(() => {
    let cancelled = false;
    fetchLivingGalleryRecords()
      .then((data) => {
        if (!cancelled) {
          setRecords(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Slow auto-rotation. One card-step at a time. Paused when the tab is
  // hidden so we don't burn timers while the page is suspended (iOS Safari).
  const [tabVisible, setTabVisible] = useState(true);

  useEffect(() => {
    const onVisibility = () => setTabVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) setTabVisible(true); };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  useEffect(() => {
    if (paused || !tabVisible || records.length <= VISIBLE_PER_VIEW) return;
    const len = records.length; // stable for this effect run
    timerRef.current = window.setInterval(() => {
      setOffset((o) => (len > 0 ? (o + 1) % len : 0));
    }, ROTATION_INTERVAL_MS);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [paused, tabVisible, records.length]);

  const stepBack = () =>
    setOffset((o) => (records.length === 0 ? 0 : (o - 1 + records.length) % records.length));
  const stepForward = () =>
    setOffset((o) => (records.length === 0 ? 0 : (o + 1) % records.length));

  // Build the visible window as a wrapped slice so rotation is endless.
  const visible = useMemo(() => {
    if (records.length === 0) return [];
    const out: LivingGalleryRecord[] = [];
    for (let i = 0; i < VISIBLE_PER_VIEW; i++) {
      out.push(records[(offset + i) % records.length]);
    }
    return out;
  }, [records, offset]);

  const isLive = isOrchidContinuumLive();

  return (
    <section className="relative bg-[#04050d] text-[#f5f0e8] border-t border-white/[0.06]">
      {/* Deep botanical vignette — emerald + gold haze */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(40,86,68,0.22) 0%, rgba(7,9,20,0) 55%),' +
            'radial-gradient(ellipse at 90% 100%, rgba(120,90,40,0.14) 0%, rgba(7,9,20,0) 60%)',
        }}
      />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 py-16 lg:py-24">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10 lg:mb-12">
          <div>
            <div className="font-mono text-[10px] tracking-[0.36em] uppercase text-[#c9a24a] flex items-center gap-3">
              <span className="inline-block w-8 h-px bg-[#c9a24a]/55" />
              Living Gallery
            </div>
            <h2
              className="mt-4 leading-[1.1] text-[#faf7f2] max-w-3xl"
              style={{
                fontFamily: "'Playfair Display', 'Cormorant Garamond', Georgia, serif",
                fontWeight: 500,
                fontSize: 'clamp(1.7rem, 3.4vw, 2.6rem)',
              }}
            >
              Real orchids. Real growers.{' '}
              <span className="italic text-[#d4b34a]">A continuum in motion.</span>
            </h2>
            <p className="mt-4 max-w-2xl text-[14px] md:text-[15px] leading-relaxed text-[#cfc8b8]/85 font-body">
              Records below rotate slowly from the Orchid Continuum approved
              image library. Each plate is a documented, source-credited
              orchid — not a stock photograph and not an illustration.
            </p>
          </div>

          {/* Status pill */}
          <div className="flex items-center gap-2 self-start lg:self-end font-mono text-[10px] tracking-[0.24em] uppercase">
            <span
              className={
                'inline-block w-1.5 h-1.5 rounded-full ' +
                (isLive ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-[#c9a24a] shadow-[0_0_8px_#c9a24a]')
              }
            />
            <span className="text-[#cfc8b8]/75">
              {isLive ? 'Live · Orchid Continuum DB' : 'Database connection pending'}
            </span>
          </div>
        </div>

        {/* Rotation viewport */}
        <div className="relative">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[3/4] rounded-sm border border-white/[0.06] bg-[#0a0d1c] animate-pulse"
                />
              ))}
            </div>
          ) : records.length === 0 ? (
            <div className="rounded-sm border border-white/[0.08] bg-[#0a0d1c] p-10 text-center font-mono text-[11px] tracking-[0.24em] uppercase text-[#cfc8b8]/60">
              No gallery records available
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {visible.map((record, i) => (
                <GalleryCard key={`${record.id}-${offset}-${i}`} record={record} />
              ))}
            </div>
          )}

          {/* Controls — quiet, refined */}
          {records.length > VISIBLE_PER_VIEW && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={stepBack}
                aria-label="Previous record"
                className="w-9 h-9 rounded-full border border-white/10 text-[#cfc8b8] hover:text-[#c9a24a] hover:border-[#c9a24a]/50 transition-colors flex items-center justify-center"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? 'Resume rotation' : 'Pause rotation'}
                className="w-9 h-9 rounded-full border border-white/10 text-[#cfc8b8] hover:text-[#c9a24a] hover:border-[#c9a24a]/50 transition-colors flex items-center justify-center"
              >
                {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={stepForward}
                aria-label="Next record"
                className="w-9 h-9 rounded-full border border-white/10 text-[#cfc8b8] hover:text-[#c9a24a] hover:border-[#c9a24a]/50 transition-colors flex items-center justify-center"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="ml-3 font-mono text-[10px] tracking-[0.22em] uppercase text-[#7a7466]">
                {String((offset % records.length) + 1).padStart(2, '0')}
                {' / '}
                {String(records.length).padStart(2, '0')}
              </span>
            </div>
          )}
        </div>

        {/* Footnote / link to herbarium */}
        <div className="mt-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pt-6 border-t border-white/[0.06]">
          <p className="font-body text-[12px] text-[#7a7466] max-w-xl leading-relaxed">
            Image library records are reviewed by Orchid Continuum stewards
            before publication. Source credit and license travel with every
            photograph back to the contributing grower or institution.
          </p>
          <Link
            to="/species"
            className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.28em] uppercase text-[#cfc8b8]/80 hover:text-[#c9a24a] transition-colors whitespace-nowrap"
          >
            Browse the full herbarium
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// GalleryCard — a single conservatory plate
// ---------------------------------------------------------------------------

interface CardProps {
  record: LivingGalleryRecord;
}

const GalleryCard: React.FC<CardProps> = ({ record }) => {
  const hasRealImage = !!record.imageUrl && !record.isPlaceholder;
  const speciesUrl = record.taxonomyId
    ? `/species/${encodeURIComponent(record.taxonomyId)}`
    : `/species?q=${encodeURIComponent(record.scientificName)}`;
  const atlasUrl = record.atlasOccurrenceId
    ? `/atlas?occurrence=${encodeURIComponent(record.atlasOccurrenceId)}`
    : '/atlas';

  return (
    <figure
      className="group relative overflow-hidden rounded-sm border border-white/[0.08] bg-[#0a0d1c] transition-all duration-700 hover:border-[#c9a24a]/40"
      style={{ animation: 'oc-fade-in 1200ms ease-out both' }}
    >
      {/* Image area */}
      <div className="relative aspect-[3/4] overflow-hidden bg-[#080a16]">
        {hasRealImage ? (
          <img
            src={record.imageUrl}
            alt={record.scientificName}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-[2000ms] ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <PlaceholderImageTile />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#04050d] via-[#04050d]/40 to-transparent" />

        {/* Top-left meta strip */}
        <div className="absolute top-0 left-0 right-0 p-4 flex items-start justify-between gap-2">
          <span className="font-mono text-[9px] tracking-[0.24em] uppercase text-[#c9a24a]/85 bg-black/30 backdrop-blur-sm px-2 py-1 rounded-sm border border-white/5">
            {record.isHybrid ? 'Hybrid · Grex' : 'Species'}
          </span>
          {record.isPlaceholder && (
            <span className="font-mono text-[8.5px] tracking-[0.20em] uppercase text-[#cfc8b8]/70 bg-black/40 backdrop-blur-sm px-2 py-1 rounded-sm border border-white/10">
              Awaiting DB
            </span>
          )}
        </div>
      </div>

      {/* Caption */}
      <figcaption className="relative p-5 lg:p-6 border-t border-white/[0.05]">
        <div
          className={
            'font-display italic text-[17px] lg:text-[19px] leading-tight ' +
            (record.isPlaceholder ? 'text-[#c9a24a]/75 font-mono not-italic tracking-[0.12em] text-[12px]' : 'text-[#faf7f2]')
          }
        >
          {record.scientificName}
          {record.cultivar ? <span className="not-italic text-[#cfc8b8]"> {record.cultivar}</span> : null}
        </div>

        <div className="mt-2 font-mono text-[9px] tracking-[0.26em] uppercase text-[#7d6a3a]">
          {record.nativeRegion ?? 'REAL_NATIVE_REGION'}
        </div>

        <p
          className={
            'mt-3 font-body text-[12.5px] leading-relaxed ' +
            (record.isPlaceholder ? 'text-[#7a7466] font-mono tracking-[0.06em] text-[11px]' : 'text-[#cfc8b8]/85')
          }
        >
          {record.habitatDescription ?? 'REAL_HABITAT_DESCRIPTION'}
        </p>

        <div className="mt-4 font-mono text-[9px] tracking-[0.22em] uppercase text-[#5e5a4e]">
          Source · {record.sourceCredit ?? 'REAL_SOURCE_CREDIT'}
        </div>

        {/* Actions */}
        <div className="mt-5 flex items-center gap-2">
          <Link
            to={speciesUrl}
            className="font-mono text-[10px] tracking-[0.22em] uppercase px-3.5 py-2 rounded-full border border-[#c9a24a]/40 text-[#faf7f2] hover:bg-[#c9a24a]/10 hover:border-[#c9a24a] transition-colors inline-flex items-center gap-1.5"
          >
            Species card
            <ArrowRight className="h-3 w-3" />
          </Link>
          <Link
            to={atlasUrl}
            className="font-mono text-[10px] tracking-[0.22em] uppercase px-3.5 py-2 rounded-full border border-white/10 text-[#cfc8b8] hover:text-[#c9a24a] hover:border-[#c9a24a]/40 transition-colors"
          >
            View in Atlas
          </Link>
        </div>
      </figcaption>
    </figure>
  );
};

// A neutral, non-AI placeholder tile shown while the live image is pending.
const PlaceholderImageTile: React.FC = () => (
  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
    {/* botanical hairline frame */}
    <div className="absolute inset-4 border border-[#c9a24a]/15 rounded-sm" />
    <div className="absolute inset-6 border border-[#c9a24a]/8 rounded-sm" />

    <ImageOff className="h-7 w-7 text-[#c9a24a]/40 mb-3" strokeWidth={1.2} />
    <div className="font-mono text-[10px] tracking-[0.30em] uppercase text-[#c9a24a]/70 leading-relaxed">
      REAL_ORCHID_IMAGE
      <br />
      _FROM_DATABASE
    </div>
    <div className="mt-3 font-mono text-[9px] tracking-[0.18em] uppercase text-[#5e5a4e]">
      pending hydration
    </div>
  </div>
);

export default OrchidGallery;
