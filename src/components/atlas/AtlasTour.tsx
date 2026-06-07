import React, { useEffect, useState } from 'react';
import { X, ArrowRight, ArrowLeft, Compass, MapPin, MousePointerClick, Sparkles } from 'lucide-react';
import { useAtlasFilters } from '@/contexts/AtlasFilterContext';

/**
 * AtlasTour — a four-step dismissible onboarding overlay.
 *
 * Shows on first visit only (localStorage key "oc_atlas_tour_seen").
 * The final step launches an "Ecuador Expedition": it sets the global
 * country filter to Ecuador (filtering the map dots) so the visitor lands
 * in one of the densest orchid hotspots on Earth.
 */

const ECUADOR_BOUNDS = { south: -5.0, west: -81.0, north: 1.5, east: -75.0 };

interface Step {
  title: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STEPS: Step[] = [
  {
    title: 'Welcome to the Atlas',
    body: 'Explore 580,000+ orchid occurrence records drawn from 130+ global sources — a living map of where Orchidaceae has been observed.',
    icon: Compass,
  },
  {
    title: 'Zoom into a hotspot',
    body: 'Zoom into Ecuador or Colombia to watch dense density clusters resolve — the Andes hold some of the richest orchid diversity on the planet.',
    icon: MapPin,
  },
  {
    title: 'Click a dot',
    body: 'Click any point to open a popup with the species name and its collection metadata — country, locality, and source record.',
    icon: MousePointerClick,
  },
  {
    title: 'Start an Ecuador Expedition',
    body: 'Jump straight into the Ecuadorian Andes. We will filter the map to show only Ecuador records so you can begin exploring immediately.',
    icon: Sparkles,
  },
];

const STORAGE_KEY = 'oc_atlas_tour_seen';

const AtlasTour: React.FC<{ onZoomEcuador?: (bounds: typeof ECUADOR_BOUNDS) => void }> = ({
  onZoomEcuador,
}) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const { setFilters } = useAtlasFilters();

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const startEcuadorExpedition = () => {
    setFilters((prev) => ({ ...prev, countries: ['Ecuador'] }));
    onZoomEcuador?.(ECUADOR_BOUNDS);
    dismiss();
  };

  if (!open) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={dismiss}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-[#c9a24a]/30 bg-[#0a1224] shadow-2xl p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Skip tour"
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/40 border border-white/15 flex items-center justify-center text-[#cfc8b8] hover:text-[#faf7f2]"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-[#c9a24a]/15 border border-[#c9a24a]/40 flex items-center justify-center">
            <Icon className="h-5 w-5 text-[#c9a24a]" />
          </div>
          <div className="font-mono text-[10px] tracking-[0.26em] uppercase text-[#c9a24a]">
            Atlas tour · {step + 1} / {STEPS.length}
          </div>
        </div>

        <h3
          className="text-[#faf7f2] text-2xl leading-tight mb-3"
          style={{
            fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
          }}
        >
          {current.title}
        </h3>
        <p className="font-body text-[15px] leading-relaxed text-[#cfc8b8]/85">
          {current.body}
        </p>

        {/* Progress dots */}
        <div className="mt-6 flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={
                'h-1.5 rounded-full transition-all ' +
                (i === step ? 'w-6 bg-[#c9a24a]' : 'w-1.5 bg-white/15')
              }
            />
          ))}
        </div>

        <div className="mt-7 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={dismiss}
            className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#7a7466] hover:text-[#cfc8b8]"
          >
            Skip
          </button>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-white/20 text-[#faf7f2] hover:border-[#c9a24a]/60 font-mono text-[10px] tracking-[0.2em] uppercase"
              >
                <ArrowLeft className="h-3 w-3" /> Back
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                onClick={startEcuadorExpedition}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#c9a24a] text-[#14140a] hover:bg-[#deb866] font-mono text-[10px] tracking-[0.2em] uppercase"
              >
                <Sparkles className="h-3.5 w-3.5" /> Start Ecuador Expedition
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#c9a24a] text-[#14140a] hover:bg-[#deb866] font-mono text-[10px] tracking-[0.2em] uppercase"
              >
                Next <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AtlasTour;
