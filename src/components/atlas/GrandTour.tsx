import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  MapPin,
  Globe2,
  Compass,
} from 'lucide-react';
import {
  ALL_PANELS,
  TOTAL_STOPS,
  TOUR_PROGRESS_KEY,
  GRAND_TOUR_TITLE,
  GRAND_TOUR_SUBTITLE,
  type TourStop,
} from '@/lib/grandTour';

/**
 * GrandTour — the immersive, awe-driven guided expedition overlay.
 *
 * Renders as a floating panel anchored to the right (desktop) / bottom
 * (mobile) so the live Leaflet map remains visible underneath and animates
 * to each stop's coordinates via the `onStop` callback. PREVIOUS / NEXT
 * navigation, a progress indicator, and a SKIP TOUR link are provided.
 * Progress (panel index) is persisted in localStorage.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called whenever the active panel changes — drives the map pan/zoom + filter. */
  onStop: (stop: TourStop) => void;
}

const GrandTour: React.FC<Props> = ({ open, onClose, onStop }) => {
  // index into ALL_PANELS: 0 = introduction, 1..10 = stops
  const [index, setIndex] = useState(0);

  // Restore saved progress when the tour opens.
  useEffect(() => {
    if (!open) return;
    let start = 0;
    try {
      const raw = localStorage.getItem(TOUR_PROGRESS_KEY);
      if (raw != null) {
        const n = parseInt(raw, 10);
        if (!Number.isNaN(n) && n >= 0 && n < ALL_PANELS.length) start = n;
      }
    } catch {
      /* ignore */
    }
    setIndex(start);
  }, [open]);

  // Persist progress + drive the map whenever the active panel changes.
  useEffect(() => {
    if (!open) return;
    try {
      localStorage.setItem(TOUR_PROGRESS_KEY, String(index));
    } catch {
      /* ignore */
    }
    onStop(ALL_PANELS[index]);
  }, [index, open, onStop]);

  const goNext = useCallback(
    () => setIndex((i) => Math.min(i + 1, ALL_PANELS.length - 1)),
    [],
  );
  const goPrev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  // Keyboard navigation.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, goNext, goPrev, onClose]);

  if (!open) return null;

  const panel = ALL_PANELS[index];
  const isIntro = panel.number === 0;
  const isLast = index === ALL_PANELS.length - 1;

  return (
    <div className="fixed inset-0 z-[70] pointer-events-none">
      {/* Soft vignette so the panel reads against the map without hiding it. */}
      <div className="absolute inset-0 bg-gradient-to-l from-black/75 via-black/25 to-transparent md:to-transparent" />

      {/* Floating expedition panel */}
      <div
        className="pointer-events-auto absolute inset-x-0 bottom-0 md:inset-y-0 md:right-0 md:left-auto md:w-[480px] lg:w-[540px]
                   max-h-[88vh] md:max-h-none md:h-full overflow-y-auto
                   bg-[#0a0d1c]/95 backdrop-blur-md border-t md:border-t-0 md:border-l border-[#c9a24a]/25 shadow-2xl"
        style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
      >
        <style>{`
          .gt-display { font-family: 'Playfair Display', 'Cormorant Garamond', Georgia, serif; }
          .gt-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        `}</style>

        {/* Sticky header — title + progress + close */}
        <div className="sticky top-0 z-10 bg-[#0a0d1c]/95 backdrop-blur-md border-b border-white/[0.07] px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="gt-mono text-[9px] tracking-[0.3em] uppercase text-[#c9a24a]/90 flex items-center gap-1.5">
                <Compass className="h-3 w-3" /> Grand Tour
              </div>
              <h2 className="gt-display text-[#faf7f2] text-[19px] leading-tight mt-1">
                {GRAND_TOUR_TITLE}
              </h2>
              <p className="gt-mono text-[8.5px] tracking-[0.22em] uppercase text-[#7a7466] mt-1 truncate">
                {GRAND_TOUR_SUBTITLE}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Skip tour"
              className="flex-shrink-0 w-8 h-8 rounded-full bg-black/40 border border-white/15 flex items-center justify-center text-[#cfc8b8] hover:text-[#faf7f2]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Progress */}
          <div className="mt-4 flex items-center gap-3">
            <div className="gt-mono text-[9px] tracking-[0.26em] uppercase text-[#c9a24a] whitespace-nowrap">
              {isIntro ? 'Introduction' : `Stop ${panel.number} of ${TOTAL_STOPS}`}
            </div>
            <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-[#c9a24a] transition-all duration-500"
                style={{ width: `${(index / (ALL_PANELS.length - 1)) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Scrolling content */}
        <div className="px-6 py-6 space-y-6">
          {/* Title block */}
          <div>
            <div className="gt-mono text-[9px] tracking-[0.28em] uppercase text-[#c9a24a]/80">
              {panel.kicker}
            </div>
            <h3 className="gt-display text-[#faf7f2] leading-[1.05] mt-2"
                style={{ fontSize: 'clamp(1.7rem, 4.5vw, 2.4rem)' }}>
              {panel.title}
            </h3>
            {panel.subtitle && (
              <div className="gt-mono text-[10px] tracking-[0.26em] uppercase text-[#c9a24a] mt-2">
                {panel.subtitle}
              </div>
            )}
          </div>

          {/* Geographic setting */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="gt-mono text-[9px] tracking-[0.26em] uppercase text-[#c9a24a] flex items-center gap-1.5 mb-3">
              <Globe2 className="h-3 w-3" /> Geographic setting
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              {panel.geo.map((g) => (
                <div key={g.label}>
                  <div className="gt-mono text-[8px] tracking-[0.2em] uppercase text-[#7a7466]">
                    {g.label}
                  </div>
                  <div className="text-[12.5px] text-[#e8e2d4] leading-snug mt-0.5">
                    {g.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Narrative */}
          <div className="space-y-3.5">
            {panel.narrative.map((para, i) => (
              <p key={i} className="text-[14.5px] leading-relaxed text-[#cfc8b8]/90">
                {para}
              </p>
            ))}
          </div>

          {/* AWE MOMENT */}
          <div className="relative rounded-xl border-2 border-[#c9a24a]/70 bg-[#06080f] p-5 overflow-hidden">
            <div
              className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-[#c9a24a]/15 blur-2xl pointer-events-none"
            />
            <div className="relative flex items-center gap-2 mb-2.5">
              <Sparkles className="h-4 w-4 text-[#c9a24a]" />
              <div className="gt-mono text-[10px] tracking-[0.32em] uppercase text-[#c9a24a]">
                Awe Moment
              </div>
            </div>
            <p className="relative gt-display italic text-[16px] leading-relaxed text-[#f5ecd6]">
              {panel.aweMoment}
            </p>
          </div>

          {/* Featured genera */}
          {panel.genera.length > 0 && (
            <div>
              <div className="gt-mono text-[9px] tracking-[0.26em] uppercase text-[#7a7466] mb-2.5">
                Featured genera
              </div>
              <div className="flex flex-wrap gap-2">
                {panel.genera.map((g) => (
                  <span
                    key={g}
                    className="px-3 py-1 rounded-full border border-[#c9a24a]/40 bg-[#c9a24a]/[0.08] gt-display italic text-[13px] text-[#faf7f2]"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Detail blocks */}
          {panel.details && panel.details.length > 0 && (
            <div className="space-y-4">
              {panel.details.map((d) => (
                <div key={d.label} className="border-t border-white/[0.07] pt-4">
                  <div className="gt-mono text-[9px] tracking-[0.24em] uppercase text-[#c9a24a] mb-1.5">
                    {d.label}
                  </div>
                  <p className="text-[13.5px] leading-relaxed text-[#cfc8b8]/85">
                    {d.body}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Map-action note */}
          <div className="flex items-center gap-2 gt-mono text-[9px] tracking-[0.2em] uppercase text-[#7a7466]">
            <MapPin className="h-3 w-3 text-[#c9a24a]/70" />
            Map centered at {panel.map.lat.toFixed(1)}, {panel.map.lng.toFixed(1)}
            {panel.map.country ? ` · filtered to ${panel.map.country}` : ''}
          </div>

          {/* Key Scientific Question */}
          <div className="rounded-xl bg-[#c9a24a]/[0.06] border border-[#c9a24a]/25 p-5">
            <div className="gt-mono text-[9px] tracking-[0.3em] uppercase text-[#c9a24a] mb-2">
              Key Scientific Question
            </div>
            <p className="gt-display italic text-[17px] leading-snug text-[#faf7f2]">
              {panel.question}
            </p>
          </div>
        </div>

        {/* Sticky footer — navigation */}
        <div className="sticky bottom-0 z-10 bg-[#0a0d1c]/95 backdrop-blur-md border-t border-white/[0.07] px-6 py-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="gt-mono text-[9px] tracking-[0.22em] uppercase text-[#7a7466] hover:text-[#cfc8b8] transition-colors"
          >
            Skip tour
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={index === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-white/20 text-[#faf7f2] hover:border-[#c9a24a]/60 gt-mono text-[9px] tracking-[0.2em] uppercase disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowLeft className="h-3 w-3" /> Previous
            </button>
            {isLast ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#c9a24a] text-[#14140a] hover:bg-[#deb866] gt-mono text-[9px] tracking-[0.2em] uppercase transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" /> Finish & Explore
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#c9a24a] text-[#14140a] hover:bg-[#deb866] gt-mono text-[9px] tracking-[0.2em] uppercase transition-colors"
              >
                {isIntro ? 'Begin Expedition' : 'Next'}{' '}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GrandTour;
